import { getService as getAutomationService } from '#server/services/app/automation';
import { getService as getLlmFilterService } from '#server/services/app/llm_filter';
import { getService as getLlmCreateArtifactService } from '#server/services/app/llm_create_artifact';
import { getService as getConnectionsImapService } from '#server/services/app/connections_imap';
import { getService as getNotificationService } from '#bs/services/core/notification';

import { getUniqueName } from '#server/utils/unique_name';

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

  // 1. Resolve unique name for automation
  const autoService = await getAutomationService(event);
  const existingAutomations = await autoService.read();
  const autoList = Array.isArray(existingAutomations) ? existingAutomations : (existingAutomations ? [existingAutomations] : []);
  const existingAutoNames = autoList.map((a: any) => a?.name);
  const uniqueTitle = getUniqueName(title, existingAutoNames);

  // 2. Resolve or create LLM Filter if specified with unique name
  let filterId: string | null = null;
  if (filter && filter.name && filter.prompt) {
    const filterService = await getLlmFilterService(event);
    const existingFilters = await filterService.read();
    const filterList = Array.isArray(existingFilters) ? existingFilters : (existingFilters ? [existingFilters] : []);
    const existingFilterNames = filterList.map((f: any) => f?.name);
    const uniqueFilterName = getUniqueName(filter.name, existingFilterNames);

    const created = await filterService.create({
      name: uniqueFilterName,
      prompt: filter.prompt,
      description: filter.description || uniqueFilterName
    });
    filterId = created?.id || null;
  }

  // 3. Resolve or create LLM Create Artifact if specified with unique name
  let artifactId: string | null = null;
  if (generator && generator.name && generator.prompt) {
    const artService = await getLlmCreateArtifactService(event);
    const existingArts = await artService.read();
    const artList = Array.isArray(existingArts) ? existingArts : (existingArts ? [existingArts] : []);
    const existingArtNames = artList.map((a: any) => a?.name);
    const uniqueArtName = getUniqueName(generator.name, existingArtNames);

    const created = await artService.create({
      name: uniqueArtName,
      prompt: generator.prompt,
      description: generator.description || uniqueArtName
    });
    artifactId = created?.id || null;
  }

  // 3. Resolve local disk notification channel for sending tasks
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

  // 4. Prepare task list
  const notificationTaskNames = new Set(['send_items', 'send_message', 'send_attachment']);
  const preparedTasks = (tasks || []).map((t: any) => {
    const cloned = { ...t, arguments: { ...t.arguments } };
    if (cloned.name === 'create_artifact' && artifactId) {
      cloned.arguments.task_id = artifactId;
    }
    if (notificationTaskNames.has(cloned.name) && localChannelId) {
      cloned.arguments.destination = localChannelId;
    }
    return cloned;
  });

  // 4. Default connection: user's first connection or 'staging'
  let connectionId = 'staging';
  try {
    const connService = await getConnectionsImapService(event);
    const conns = await connService.read();
    const list = Array.isArray(conns) ? conns : (conns ? [conns] : []);
    if (list.length > 0 && list[0]?.id) {
      connectionId = list[0].id;
    }
  } catch (e) {
    connectionId = 'staging';
  }

  // 5. Create automation
  const createdAuto = await autoService.create({
    name: uniqueTitle,
    active: 1,
    imap_connection_id: connectionId,
    imap_folder: 'INBOX',
    search_id: null,
    llm_filter_id: filterId,
    tasks: {
      multiple: false,
      tasks: preparedTasks
    },
    poll_seconds: 3600
  });

  return {
    data: createdAuto,
    statusMessage: 'success automation.template_added'
  };
});
