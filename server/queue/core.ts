import { limits } from '#shared/limits';
import { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';
import { notifyUser } from '#bs/utils/user_stream';

export type JobTask = () => Promise<void>;

export interface QueueJob {
  id: string;
  ownerId?: string;
  name?: string;
  task: JobTask;
  isEphemeral?: boolean;
}

export class InMemoryQueue {
  private queue: QueueJob[] = [];
  private activeIds = new Set<string>();
  private isProcessing = false;
  private maxDepth: number;
  private concurrency: number;
  private runningJobs = new Set<QueueJob>();

  constructor(
    maxDepth: number = limits.jobs_queue.max_depth,
    concurrency: number = limits.jobs_queue.concurrent_workers
  ) {
    this.maxDepth = maxDepth;
    this.concurrency = concurrency;
  }

  /**
   * Enqueues a job task if not already running/queued and max depth is not reached.
   * Emits user/system telemetry events if rejected.
   */
  public async enqueue(job: QueueJob): Promise<{ enqueued: boolean; reason?: string }> {
    if (this.activeIds.has(job.id)) {
      const reason = `Automation ${job.name || job.id} is already queued or currently running.`;
      await emitTelemetryEvent({
        scope: EventScope.SYSTEM,
        level: EventLevel.WARN,
        category: 'queue',
        message: `Enqueue skipped: ${reason}`,
        metadata: { id: job.id, name: job.name }
      });

      if (job.ownerId) {
        await emitTelemetryEvent({
          scope: EventScope.USER,
          level: EventLevel.WARN,
          category: 'queue',
          message: 'events.user.warn_automation_already_active',
          owner_id: job.ownerId,
          metadata: { id: job.id, name: job.name || job.id, reason }
        });
      }

      return { enqueued: false, reason };
    }

    if (this.queue.length >= this.maxDepth) {
      const reason = `Queue max depth reached (${this.maxDepth}). Task ${job.name || job.id} rejected.`;
      await emitTelemetryEvent({
        scope: EventScope.SYSTEM,
        level: EventLevel.ERROR,
        category: 'queue',
        message: `Enqueue failed: ${reason}`,
        metadata: { id: job.id, maxDepth: this.maxDepth }
      });

      if (job.ownerId) {
        await emitTelemetryEvent({
          scope: EventScope.USER,
          level: EventLevel.ERROR,
          category: 'queue',
          message: 'events.user.error_queue_full',
          owner_id: job.ownerId,
          metadata: { id: job.id, name: job.name || job.id, maxDepth: this.maxDepth }
        });
      }

      return { enqueued: false, reason };
    }

    this.activeIds.add(job.id);
    this.queue.push(job);
    notifyUser(job.ownerId, 'jobs');               // live updates: "My Queue"

    await emitTelemetryEvent({
      scope: EventScope.SYSTEM,
      level: EventLevel.DEBUG,
      category: 'queue',
      message: `Enqueued job: ${job.name || job.id}`,
      metadata: { id: job.id, isEphemeral: !!job.isEphemeral, queueLength: this.queue.length }
    });

    if (!this.isProcessing) {
      void this.startConsumer();
    }

    return { enqueued: true };
  }

  public isBusy(id: string): boolean {
    return this.activeIds.has(id);
  }

  public get pendingCount(): number {
    return this.queue.length;
  }

  public get running(): number {
    return this.runningJobs.size;
  }

  /** Waiting and running jobs (a job leaves the waiting list as soon as a worker is free). */
  public get jobCount(): number {
    return this.queue.length + this.runningJobs.size;
  }

  /** Waiting and running jobs of one user. */
  public jobCountForUser(ownerId?: string): number {
    if (!ownerId) return 0;
    let count = this.queue.filter(j => j.ownerId === ownerId).length;
    for (const job of this.runningJobs) if (job.ownerId === ownerId) count++;
    return count;
  }

  private async startConsumer() {
    this.isProcessing = true;

    while (this.queue.length > 0) {
      if (this.runningJobs.size >= this.concurrency) {
        // Wait briefly before picking up next concurrent job
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }

      const job = this.queue.shift();
      if (!job) break;

      this.runningJobs.add(job);
      notifyUser(job.ownerId, 'jobs');

      // Process job asynchronously with safety wrapper
      (async () => {
        try {
          await job.task();
        } catch (err: any) {
          await emitTelemetryEvent({
            scope: EventScope.SYSTEM,
            level: EventLevel.ERROR,
            category: 'queue',
            message: `Job ${job.name || job.id} failed in queue worker: ${err?.message || String(err)}`,
            metadata: { id: job.id, error: String(err) }
          });
        } finally {
          this.runningJobs.delete(job);
          this.activeIds.delete(job.id);
          notifyUser(job.ownerId, 'jobs');
        }
      })();
    }

    this.isProcessing = false;
  }
}
