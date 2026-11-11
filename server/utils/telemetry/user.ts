export interface UserMetricsData {
  ingested_mails: number;
  tasks_run: number;
  artifacts_created: number;
  user_tasks_in_queue: number;
}

export class UserMetrics {
  private static instance: UserMetrics;
  private metrics: Record<string, UserMetricsData> = {};
  private queueCountProvider?: (userId: string) => number;

  private constructor() {}

  public static getInstance(): UserMetrics {
    const globalKey = Symbol.for('twinbox.user_metrics_singleton');
    const globalObj = globalThis as any;
    if (!globalObj[globalKey]) {
      globalObj[globalKey] = new UserMetrics();
    }
    return globalObj[globalKey];
  }

  private initUser(userId: string): UserMetricsData {
    if (!this.metrics[userId]) {
      this.metrics[userId] = {
        ingested_mails: 0,
        tasks_run: 0,
        artifacts_created: 0,
        user_tasks_in_queue: 0
      };
    }
    return this.metrics[userId];
  }

  public recordIngestedMail(userId: string, count: number = 1): void {
    if (!userId) return;
    const user = this.initUser(userId);
    user.ingested_mails += count;
  }

  public recordTaskRun(userId: string, count: number = 1): void {
    if (!userId) return;
    const user = this.initUser(userId);
    user.tasks_run += count;
  }

  public recordArtifactCreated(userId: string, count: number = 1): void {
    if (!userId) return;
    const user = this.initUser(userId);
    user.artifacts_created += count;
  }

  public incrementUserTasksInQueue(userId: string, count: number = 1): void {
    if (!userId) return;
    const user = this.initUser(userId);
    user.user_tasks_in_queue = Math.max(0, user.user_tasks_in_queue + count);
  }

  public decrementUserTasksInQueue(userId: string, count: number = 1): void {
    if (!userId) return;
    const user = this.initUser(userId);
    user.user_tasks_in_queue = Math.max(0, user.user_tasks_in_queue - count);
  }

  public setUserTasksInQueue(userId: string, count: number): void {
    if (!userId) return;
    const user = this.initUser(userId);
    user.user_tasks_in_queue = Math.max(0, count);
  }

  // Backwards compatibility aliases
  public incrementTasksInQueue(userId: string, count: number = 1): void {
    this.incrementUserTasksInQueue(userId, count);
  }

  public decrementTasksInQueue(userId: string, count: number = 1): void {
    this.decrementUserTasksInQueue(userId, count);
  }

  public setTasksInQueue(userId: string, count: number): void {
    this.setUserTasksInQueue(userId, count);
  }

  public setQueueCountProvider(provider: (userId: string) => number): void {
    this.queueCountProvider = provider;
  }

  public getMetrics(userId: string): UserMetricsData {
    if (!userId) {
      return {
        ingested_mails: 0,
        tasks_run: 0,
        artifacts_created: 0,
        user_tasks_in_queue: 0
      };
    }
    const user = this.initUser(userId);
    if (this.queueCountProvider) {
      try {
        const dynamicCount = this.queueCountProvider(userId);
        if (typeof dynamicCount === 'number') {
          user.user_tasks_in_queue = dynamicCount;
        }
      } catch {
        // fallback to stored count
      }
    }
    return { ...user };
  }

  public getAllMetrics(): Record<string, UserMetricsData> {
    const result: Record<string, UserMetricsData> = {};
    for (const uid of Object.keys(this.metrics)) {
      result[uid] = this.getMetrics(uid);
    }
    return result;
  }
}

export const userMetrics = UserMetrics.getInstance();
