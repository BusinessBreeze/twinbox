import automationTasks from '#server/services/app/automation_tasks';

defineRouteMeta({
  openAPI: {
    tags: ['App Automation'],
    description: 'Get all available automation tasks without their handlers.',
    responses: {
      200: {
        description: 'Success response'
      }
    }
  }
});
export default defineEventHandler((event) => {
  return automationTasks.map((task) => ({
    name: task.name,
    arguments: task.arguments
  }));
});
