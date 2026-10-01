import automationTasks from '../../services/app/automation_tasks';
import { printTaskContext } from '#server/utils/telemetry/print_task_context';
import { userMetrics } from '#server/utils/telemetry/user';

export interface TaskContext {
  source?: Record<string, Record<string, any>>;
  [key: string]: any;
}

export interface TaskRequest {
  name: string;
  [key: string]: any;
}

/**
 * Assembles arguments and executes the requested tasks based on the provided context.
 * Stores output in context.source[taskName][artifactName] and copies consumed source metadata forward.
 */
export const runTasks = async (automationName: string, context: TaskContext, tasksToRun: TaskRequest[]) => {
  console.log(`[Task Runner] Starting execution of ${tasksToRun.length} tasks...`);

  context.automationName = automationName;

  console.log(`[Task Runner] tasksToRun: ${JSON.stringify(tasksToRun)}`);
  for (const taskRequest of tasksToRun) {
    const taskDef = automationTasks.find(t => t.name === taskRequest.name);

    if (!taskDef) {
      console.warn(`[Task Runner] Unknown task name: "${taskRequest.name}". Skipping.`);
      continue;
    }

    const args: any[] = [taskRequest];
    let foundVal: any = undefined;
    let consumedMetadata: any = undefined;

    if (taskDef.arguments && 'source' in taskDef.arguments) {
      const rawSourceName = taskRequest.arguments?.source || taskRequest.source || 'email';
      const searchNames = (rawSourceName === 'Message' || rawSourceName === 'source') ? [rawSourceName, 'email'] : [rawSourceName, 'email'];
      let resolvedText = '';

      // 1. Search in context.source[*][name]
      if (context.source && typeof context.source === 'object') {
        for (const sName of searchNames) {
          for (const group of Object.values(context.source as Record<string, any>)) {
            if (group && typeof group === 'object' && sName in group) {
              foundVal = group[sName];
              break;
            }
          }
          if (foundVal !== undefined) break;
        }
      }

      // 2. Fallback: search top-level context[key][name]
      if (foundVal === undefined) {
        for (const sName of searchNames) {
          for (const [key, value] of Object.entries(context)) {
            if (key !== 'source' && value && typeof value === 'object' && sName in value) {
              foundVal = (value as Record<string, any>)[sName];
              break;
            }
          }
          if (foundVal !== undefined) break;
        }
      }

      if (foundVal !== undefined && foundVal !== null) {
        if (Array.isArray(foundVal)) {
          if (foundVal.length === 1) {
            const single = foundVal[0];
            resolvedText = typeof single === 'object' && single !== null && 'content' in single ? single.content : String(single);
            consumedMetadata = single?.metadata;
          } else if (foundVal.length > 1) {
            resolvedText = foundVal.map((item: any, idx: number) => {
              const body = typeof item === 'object' && item !== null && 'content' in item ? item.content : String(item);
              return `--- Email ${idx + 1} ---\n${body}`;
            }).join('\n\n');

            const headers = foundVal.flatMap((item: any) => item?.metadata?.imap?.headers || []);
            const footers = foundVal.map((item: any) => item?.metadata?.imap?.footer).filter(Boolean).join('\n');
            consumedMetadata = {
              imap: {
                headers,
                footer: footers
              }
            };
          }
        } else {
          resolvedText = typeof foundVal === 'object' && 'content' in foundVal ? foundVal.content : String(foundVal);
          consumedMetadata = foundVal.metadata;
        }
      }

      args.push(resolvedText);
    }

    try {
      console.log(`[Task Runner] Executing task "${taskRequest.name}"...`);
      const result = await taskDef.handler(...args, context);

      const userId = context.owner_id || context.user_id || context.userId;
      if (userId) {
        userMetrics.recordTaskRun(userId);
      }

      if (result) {
        const taskName = taskRequest.name;
        const artName = taskRequest.arguments?.name || taskRequest.name || 'default';
        const mimeType = (typeof result === 'object' && result !== null && result.mime_type) || taskDef.mime_type || 'text/plain';
        const content = (typeof result === 'object' && result !== null && 'content' in result) ? result.content : result;

        const artifactObj: any = {
          mime_type: mimeType,
          content: content
        };

        if (consumedMetadata) {
          artifactObj.metadata = structuredClone(consumedMetadata);
        }

        context.source = context.source || {};
        context.source[taskName] = context.source[taskName] || {};
        context.source[taskName][artName] = artifactObj;

        if (userId && (taskRequest.name === 'create_artifact' || taskRequest.name?.includes('artifact'))) {
          userMetrics.recordArtifactCreated(userId);
        }
      }

    } catch (error) {
      console.error(`[Task Runner] Error executing task "${taskRequest.name}":`, error);
    }
  }

  await printTaskContext(automationName, context);
};

