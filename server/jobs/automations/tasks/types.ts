// Engine-side types. The parts the app shares (TaskInstance, the definition shape the chooser gets,
// SOURCE_INPUT) live in shared/ and are re-exported here.
import type { ZodTypeAny } from 'zod';
import type { TaskArgInfo, TaskDefinitionInfo, TaskInstance } from '#shared/types/automation_tasks';

export { SOURCE_INPUT } from '#shared/utils/automation_tasks';
export type { TaskInstance };

/**
 * One unit of data flowing between tasks. Tasks always receive and produce lists of these.
 * content is a string for text, base64 for binary (audio), or an EmailContent for message/rfc822.
 */
export interface TaskItem {
    mime: string;
    content: any;
    label?: string;
    filename?: string;
    sourceRefs: string[];                           // ids of the source items this was derived from
    itemUrl?: string;                               // link to the original (source items only); others reach it via sourceRefs
    error?: { taskId: string; reason: string };     // set on error notices; transforms pass these through untouched
}

/** Content of a message/rfc822 item, prepared by the source. */
export interface EmailContent {
    messageId: string;
    subject: string;
    from: string;
    to: string;
    date: string;
    text: string;
    inReplyTo?: string;
    references?: string;
}

/** One task argument on the server: the shared shape plus its validation rules (one per widget). */
export type TaskArg = Omit<TaskArgInfo, 'required'> & { rules?: Array<(v: any) => true | string> };

/** Static description of a task type on the server. The chooser gets it as TaskDefinitionInfo (rules stripped). */
export type TaskDefinition = Omit<TaskDefinitionInfo, 'args'> & { args: TaskArg[] };

export interface TaskContext {
    ownerId: string;
    automationId?: string;
    automationName: string;
    lang: string;                                   // account language, e.g. for localized file names
    deliverLocally?: boolean;                       // test run: deliveries go to the owner's local artifacts
}

/**
 * Thrown from execute() when only these inputs are the problem (too long, refused, unparseable).
 * Any other error is treated as an outage and aborts the whole run for a later retry.
 */
export class ItemError extends Error {}

/**
 * What execute() returns. Only content is required; BaseTask fills in the rest:
 * mime from the definition's output, label from the task, filename from label + extension,
 * sourceRefs from the inputs it was made from. Set a field only to override that default.
 */
export type TaskOutput = Partial<Omit<TaskItem, 'error' | 'itemUrl'>> & { content: any };

/** Wraps a zod schema as a Form rule returning true or an i18n message key. */
export const zodRule = (schema: ZodTypeAny) => (v: any): true | string => {
    const res = schema.safeParse(v);
    return res.success || res.error?.issues?.[0]?.message || 'Invalid input';
};
