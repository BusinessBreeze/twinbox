import { InMemoryQueue } from './core';
import { userMetrics } from '#server/utils/telemetry/user';
import { systemMetrics } from '#server/utils/telemetry/system';

export const automationQueue = new InMemoryQueue();
userMetrics.setQueueCountProvider((userId: string) => automationQueue.getPendingForUser(userId));
systemMetrics.setTasksQtyProvider(() => automationQueue.pendingCount);

export * from './core';
