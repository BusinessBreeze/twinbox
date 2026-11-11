import { getService } from '#server/services/app/automation_draft';

defineRouteMeta({
  openAPI: {
    tags: ['App Automation'],
    description: 'Drafts from the staged emails with the LLM. target "automation" (default): saves an inactive automation '
      + '(one artifact task delivered to a channel; body: intent, match theme|none, channel_id) and returns it. target "filter_prompt" / "task_prompt": '
      + 'returns { text } for the form (body: current, intent), nothing is saved.',
    responses: {
      200: { description: 'Success response' },
      400: { description: 'No staged emails, or the channel is unknown' },
      502: { description: 'The LLM gave no usable draft' }
    }
  }
});

export default defineEventHandler(async (event) => {
  const service = await getService(event);
  const body = await readBody(event);

  if (body?.target === 'filter_prompt' || body?.target === 'task_prompt') {
    return { data: await service.draftText(body) };
  }
  return {
    data: await service.draftAutomation(body),
    statusMessage: 'success automations.draft.created',
  };
});
