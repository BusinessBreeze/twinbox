import { InMemoryQueue } from './core';
import { userMetrics } from '#server/utils/telemetry/user';
import { systemMetrics } from '#server/utils/telemetry/system';

export const automationQueue = new InMemoryQueue();
// Dashboard: jobs waiting or running, per user ("In Queue") and in total ("Cron / Tasks")
userMetrics.setQueueCountProvider((userId: string) => automationQueue.jobCountForUser(userId));
systemMetrics.setTasksQtyProvider(() => automationQueue.jobCount);

export * from './core';
