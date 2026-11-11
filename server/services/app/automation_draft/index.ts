// Automation drafts: new automations drafted by the LLM from the staged emails (the user's examples), and test runs of
// an automation over them. A drafted automation is saved inactive ("Draft: ...") on the staging source and edited like
// any other; a test run delivers to the local artifacts.
// Not a table service (no genericService): it uses the automation and sources services, the LLM (./draft.ts) and the
// engine's test run. Same entry point as the other services: getService(ctx) with the owner from the session.
import { db } from "hub:db";
import { and, eq } from "drizzle-orm";
import type { ZodTypeAny } from "zod";
import { emails, sources, automations } from "#server/db/schema";
import { accounts, notificationChannels } from "hub:db:schema";
import { testRun, SOURCE_INPUT, type TaskInstance } from "#server/jobs/automations";
import { createSourceInstance } from "#server/jobs/sources";
import { getService as getAutomationService } from "#server/services/app/automation";
import { getService as getSourcesService } from "#server/services/app/sources";
import { automationDraftSchema, textDraftSchema } from "#shared/rules/app/automation_draft";
import { getUniqueName } from "#shared/utils/unique_name";
import { draftTexts, type DraftRequest } from "./draft";
import { artifactService } from "../artifacts";

// At most this many staged emails serve as examples, each shortened, so a draft stays one cheap LLM call
const MAX_EXAMPLES = 10;
const EXAMPLE_CHARS = 1500;

const fail = (status: number, key: string, data?: Record<string, unknown>) => createError({ status, statusMessage: `error ${key}`, data });

/** The request checked by its shared rules: the first problem as the message (an i18n key) and the field. */
const parse = <T>(schema: ZodTypeAny, body: unknown): T => {
    const res = schema.safeParse(body ?? {});
    if (!res.success) {
        const issue = res.error.issues[0];
        throw fail(422, issue?.message && /^[\w.]+$/.test(issue.message) ? issue.message : 'automation_draft.rules.invalid', { field: issue?.path.join('.') });
    }
    return res.data as T;
};

class AutomationDraftService {
    constructor(private readonly userId: string) {}

    /**
     * Drafts and saves an inactive automation on the staging source: name, filter prompt and the instruction of one
     * artifact task by the LLM, its result delivered to the chosen channel. More tasks (speech, a second channel) are
     * added in the automation form.
     */
    async draftAutomation(body: unknown) {
        const req = parse<{ intent: string; match: 'theme' | 'none'; channel_id: string }>(automationDraftSchema, body);
        const filtered = req.match === 'theme';    // no AI filter: every email of the source passes
        const channel = await db.select({ id: notificationChannels.id }).from(notificationChannels)
            .where(and(eq(notificationChannels.id, req.channel_id), eq(notificationChannels.owner_id, this.userId))).get();
        if (!channel) throw fail(400, 'automations.draft.channel', { field: 'channel_id' });

        const texts = await this.#draft({
            intent: req.intent, examples: await this.#examples(), want: { name: true, filterPrompt: filtered, taskPrompt: true },
        });

        // One artifact per email (the drafted instruction), delivered to the channel
        const tasks: TaskInstance[] = [
            { id: 't_artifact', type: 'create_artifact', version: 1, label: 'Artifact', inputs: [SOURCE_INPUT], aggregate: false, args: { prompt: texts.task_prompt || req.intent || 'Summarize the email.' } },
            { id: 't_notification', type: 'notification', version: 1, label: 'Notification', inputs: ['t_artifact'], aggregate: false, args: { destination: req.channel_id, keep_threadid: false } },
        ];

        const taken = (await db.select({ name: automations.name }).from(automations).where(eq(automations.owner_id, this.userId))).map((a: any) => a.name);
        const staging = await this.#stagingSource();
        return await (await getAutomationService(this.userId)).create({
            name: getUniqueName(`Draft: ${texts.name || 'automation'}`.slice(0, 100), taken),
            active: 0,
            source_key: staging.id,
            filter_prompt: filtered ? texts.filter_prompt || '' : '',
            options: {},
            tasks,
        });
    }

    /** A drafted filter prompt or task prompt for the form (not saved). */
    async draftText(body: unknown) {
        const req = parse<{ target: 'filter_prompt' | 'task_prompt'; intent: string; current: string }>(textDraftSchema, body);
        const texts = await this.#draft({
            intent: req.intent,
            examples: await this.#examples(),
            want: req.target === 'task_prompt' ? { taskPrompt: true } : { filterPrompt: true },
            current: req.current,
        });
        return { text: (req.target === 'task_prompt' ? texts.task_prompt : texts.filter_prompt) ?? '' };
    }

    /** Runs the automation once over the staged emails, delivering to the local artifacts; returns the counts and new files. */
    async test(id: string) {
        const automation = await db.select().from(automations).where(and(eq(automations.id, id), eq(automations.owner_id, this.userId))).get();
        if (!automation) throw fail(404, 'automations.not_found');

        const staging = await this.#stagingSource();
        const row = await db.select().from(sources).where(eq(sources.id, staging.id)).get();
        const instance = createSourceInstance(row);
        const items = instance ? (await instance.fetch([staging.id])).get(staging.id) ?? [] : [];
        if (items.length === 0) throw fail(400, 'automations.draft.no_staged');

        const lang = (await db.select({ lang: accounts.lang }).from(accounts).where(eq(accounts.id, this.userId)).get())?.lang || 'en';
        // The run's artifacts: stored since it started (timestamps are whole seconds, so not those already there)
        const started = new Date(Math.floor(Date.now() / 1000) * 1000);
        const before = new Set((await artifactService.list(this.userId, started)).map((a) => a.id));
        const result = await testRun(automation, items, lang);
        const files = (await artifactService.list(this.userId, started)).reverse().filter((a) => !before.has(a.id))
            .map((a) => ({ id: a.id, file_id: a.file_id, filename: a.filename, mime: a.mime }));
        return { ...result, files };
    }

    /** The staged emails as example texts (subject, sender, body), shortened. */
    async #examples() {
        const staged = await db.select().from(emails)
            .where(and(eq(emails.owner_id, this.userId), eq(emails.staging_item, 1))).limit(MAX_EXAMPLES);
        if (staged.length === 0) throw fail(400, 'automations.draft.no_staged');
        return staged.map((e: any) => `Subject: ${e.subject || ''}\nFrom: ${e.from || ''}\n\n${e.text || ''}`.slice(0, EXAMPLE_CHARS));
    }

    async #draft(req: DraftRequest) {
        try {
            return await draftTexts(req);
        } catch (err: any) {
            throw fail(502, 'automations.draft.failed', { reason: String(err?.message || err).slice(0, 300) });
        }
    }

    /** The user's staging source (created on the first listing of their sources). */
    async #stagingSource() {
        const list = await (await getSourcesService(this.userId)).read();
        const staging = (Array.isArray(list) ? list : []).find((s: any) => s.type === 'staging');
        if (!staging) throw fail(500, 'automations.draft.no_staging_source');
        return staging;
    }
}

/** The service for the logged-in user (or the given owner id); 403 without one. */
export const getService = async (ctx?: any) => {
    const userId = await resolveServiceContext(ctx);
    if (!userId) throw fail(403, 'auth.not_authenticated');
    return new AutomationDraftService(userId);
};
