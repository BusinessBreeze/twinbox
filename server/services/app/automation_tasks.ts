import { getService as getNotificationService } from '#bs/services/core/notification';
import create_artifact from "./llm/tasks/create_artifact";
import { generateTTS } from './llm/TTS';
import { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';

export const send_notification_items = async (taskRequest: any, text: string, context?: any): Promise<void> => {
    const ownerId = context?.owner_id;
    const destination = taskRequest.arguments?.destination;
    if (!ownerId || !destination) {
        await emitTelemetryEvent({
            scope: EventScope.SYSTEM,
            level: EventLevel.DEBUG,
            category: 'automation',
            message: `Missing ownerId (${ownerId}) or destination (${destination}). Skipping send_notification_items.`
        });
        return;
    }

    try {
        const notificationService = await getNotificationService(ownerId);
        const items: Array<{ content: string; mime_type?: string; metadata?: any }> = [];

        const keepThreadId = !!(taskRequest.arguments?.keep_threadid ?? taskRequest.arguments?.keep_thread_id ?? taskRequest.keep_threadid);

        // Get selected sources from taskRequest arguments
        const sourceArg = taskRequest.arguments?.source || taskRequest.source;
        let selectedSources: any[] = [];
        if (Array.isArray(sourceArg)) {
            selectedSources = sourceArg;
        } else if (sourceArg) {
            selectedSources = [sourceArg];
        }

        if (selectedSources.length > 0 && context) {
            for (const srcItem of selectedSources) {
                const rawName = typeof srcItem === 'object' && srcItem !== null ? srcItem.name : String(srcItem).trim();
                const srcMime = typeof srcItem === 'object' && srcItem !== null ? srcItem.mime_type : undefined;
                const searchNames = (rawName === 'Message' || rawName === 'source') ? [rawName, 'email'] : [rawName, 'email'];

                let artifactVal: any = undefined;

                // 1. Search context.source[*][sName]
                if (context.source && typeof context.source === 'object') {
                    for (const sName of searchNames) {
                        for (const group of Object.values(context.source as Record<string, any>)) {
                            if (group && typeof group === 'object' && sName in group) {
                                artifactVal = group[sName];
                                break;
                            }
                        }
                        if (artifactVal !== undefined) break;
                    }
                }

                // 2. Search top-level context[taskName][sName]
                if (artifactVal === undefined) {
                    for (const sName of searchNames) {
                        for (const [taskName, taskObj] of Object.entries(context)) {
                            if (taskName !== 'source' && taskObj && typeof taskObj === 'object' && sName in taskObj) {
                                artifactVal = (taskObj as Record<string, any>)[sName];
                                break;
                            }
                        }
                        if (artifactVal !== undefined) break;
                    }
                }

                if (artifactVal !== undefined && artifactVal !== null) {
                    const artifactList = Array.isArray(artifactVal) ? artifactVal : [artifactVal];
                    for (const itemObj of artifactList) {
                        let contentStr = typeof itemObj === 'object' && 'content' in itemObj ? itemObj.content : String(itemObj);
                        let mimeTypeStr = (typeof itemObj === 'object' && itemObj.mime_type) || srcMime || 'text/plain';

                        const footer = itemObj?.metadata?.imap?.footer;
                        if (footer && footer.length > 0) {
                            contentStr += '\n\n' + footer;
                        }

                        items.push({
                            content: contentStr,
                            mime_type: mimeTypeStr,
                            metadata: itemObj?.metadata
                        });
                    }
                } else if (text) {
                    items.push({ content: text, mime_type: srcMime || 'text/plain' });
                }
            }
        } else if (context) {
            // Fallback: collect all generated artifacts from context.source or context
            const root = context.source || context;
            const ignoredKeys = new Set(['owner_id', 'automationName']);
            for (const [key, value] of Object.entries(root)) {
                if (!ignoredKeys.has(key) && value && typeof value === 'object') {
                    for (const artVal of Object.values(value as Record<string, any>)) {
                        const artifactList = Array.isArray(artVal) ? artVal : [artVal];
                        for (const itemObj of artifactList) {
                            if (itemObj && typeof itemObj === 'object' && 'content' in itemObj) {
                                let contentStr = itemObj.content;
                                const footer = itemObj?.metadata?.imap?.footer;
                                if (footer && footer.length > 0) {
                                    contentStr += '\n\n' + footer;
                                }
                                items.push({
                                    content: contentStr,
                                    mime_type: itemObj.mime_type || 'text/plain',
                                    metadata: itemObj?.metadata
                                });
                            }
                        }
                    }
                }
            }
        }

        if (items.length === 0) {
            await emitTelemetryEvent({
                scope: EventScope.SYSTEM,
                level: EventLevel.DEBUG,
                category: 'automation',
                message: 'No items to send for notification task'
            });
            return;
        }

        const title = context?.automationName || 'Email Reporter';
        await notificationService.sendItems(destination, title, items, { keep_threadid: keepThreadId });
        await emitTelemetryEvent({
            scope: EventScope.SYSTEM,
            level: EventLevel.DEBUG,
            category: 'automation',
            message: `Sent ${items.length} item(s) to notification channel ${destination}`
        });
    } catch (error: any) {
        await emitTelemetryEvent({
            scope: EventScope.SYSTEM,
            level: EventLevel.ERROR,
            category: 'automation',
            message: `Failed to send items to channel ${destination}: ${error?.message || error}`
        });
    }
};

export const tts = async (taskRequest: any, text: string): Promise<string> => {
    if (!text?.trim()) {
        return '';
    }
    try {
        const arrayBuffer = await generateTTS(text);
        return Buffer.from(arrayBuffer).toString('base64');
    } catch (error: any) {
        await emitTelemetryEvent({
            scope: EventScope.SYSTEM,
            level: EventLevel.ERROR,
            category: 'automation',
            message: `TTS generation failed: ${error?.message || error}`
        });
        return '';
    }
};

const automationTasks = [
    { name: "create_artifact", mime_type: "text/markdown", handler: create_artifact, arguments: { name: "string", source: "artifact_name", task_id: "task_id" } },
    { name: "send_items", handler: send_notification_items, arguments: { source: "artifact_names", destination: "notification_channel_id", keep_threadid: "boolean" } },
    { name: "tts", mime_type: "audio/mpeg", handler: tts, arguments: { name: "string", source: "artifact_name" } },
];

export default automationTasks;

