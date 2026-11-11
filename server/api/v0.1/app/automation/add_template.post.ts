import { getService as getAutomationService } from '#server/services/app/automation';
import { getService as getSourcesService } from '#server/services/app/sources';
import { getService as getNotificationService } from '#bs/services/core/notification';

import { SOURCE_INPUT, type TaskInstance } from '#server/jobs/automations';
import { randomUUID } from 'node:crypto';

defineRouteMeta({
  openAPI: {
    tags: ['App Automation'],
    description: 'Instantiate an automation template from the library.',
    responses: {
      201: { description: 'Created successfully' },
      400: { description: 'Bad request' }
    }
  }
});

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { title, description, filter, generator, tasks } = body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'error automation.bad_payload'
    });
  }

  // 1. The title is the automation's name; a taken name is refused by the service (the browser picks a free one)
  const autoService = await getAutomationService(event);

  // 2. Resolve local disk notification channel for sending tasks
  let localChannelId: string | null = null;
  try {
    const notifService = await getNotificationService(event);
    const channels = await notifService.read();
    const channelList = Array.isArray(channels) ? channels : (channels ? [channels] : []);
    let localChannel = channelList.find(
      (c: any) => c && (c.provider?.toLowerCase() === 'local' || c.name?.toLowerCase().includes('local'))
    );
    if (!localChannel) {
      localChannel = await notifService.create({
        name: 'Persist Local',
        provider: 'local',
        type: 'disk',
        config: {}
      });
    }
    localChannelId = localChannel?.id || null;
  } catch (notifErr) {
    console.error('Failed to resolve local notification channel:', notifErr);
  }

  // 3. Convert the template's tasks (old format: referenced by output name) to task instances with ids
  const preparedTasks = convertTemplateTasks(tasks || [], generator?.prompt || '', localChannelId);

  // 4. Source: the user's staging source (created on first use); the user picks a real one later
  const sourcesService = await getSourcesService(event);
  const userSources = await sourcesService.read();
  const staging = (Array.isArray(userSources) ? userSources : [userSources]).find((src: any) => src?.type === 'staging');

  // 5. Create automation
  const createdAuto = await autoService.create({
    name: title.trim(),
    active: 1,
    source_key: staging?.id,           // staging's only key is its id
    options: { filter_prompt: filter?.prompt || '' },
    tasks: preparedTasks
  });

  return {
    data: createdAuto,
    statusMessage: 'success automation.template_added'
  };
});

/**
 * Library templates (public/libraries/default_automations.json) describe tasks the old way:
 * { name, arguments: { name?, source } } with sources referenced by output name ('email' = the source).
 * Each becomes a TaskInstance with a generated id; name references are mapped to those ids.
 */
function convertTemplateTasks(templateTasks: any[], generatorPrompt: string, channelId: string | null): TaskInstance[] {
  const idByName = new Map<string, string>([['email', SOURCE_INPUT], ['source', SOURCE_INPUT]]);
  const toInputs = (source: any) => (Array.isArray(source) ? source : [source ?? 'email'])
    .map((name: string) => idByName.get(name))
    .filter((id): id is string => !!id);

  return templateTasks.map((t: any) => {
    const id = `t_${randomUUID().slice(0, 8)}`;
    const args = t.arguments || {};
    const label = args.name || (t.name === 'send_items' ? 'Notification' : t.name);
    if (args.name) idByName.set(args.name, id);

    const instance: TaskInstance = { id, type: t.name, version: 1, label, inputs: toInputs(args.source), args: {} };
    if (t.name === 'create_artifact') instance.args = { prompt: generatorPrompt };
    if (t.name === 'send_items') {
      // Library templates still use the old type name
      instance.type = 'notification';
      instance.args = { destination: channelId, keep_threadid: !!args.keep_threadid };
    }
    return instance;
  });
}
