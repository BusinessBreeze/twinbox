import { listTaskDefinitions } from '#server/jobs/automations';
import type { TaskDefinitionInfo } from '#shared/types/automation_tasks';

defineRouteMeta({
  openAPI: {
    tags: ['App Automation'],
    description: 'Get the task types available for automations (definitions for the task chooser).',
    responses: {
      200: {
        description: 'Success response'
      }
    }
  }
});

// Rule functions don't serialize; the chooser gets `required` instead and the server validates on save.
export default defineEventHandler((): TaskDefinitionInfo[] => {
  return listTaskDefinitions().map((def) => ({
    ...def,
    args: def.args.map(({ rules, ...arg }) => ({
      ...arg,
      required: (rules || []).some((rule) => rule(arg.default ?? '') !== true),
    })),
  }));
});
