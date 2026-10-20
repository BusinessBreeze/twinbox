export interface LLMRequestRecord {
  timestamp: number;
  success: boolean;
  isError: boolean;
  isTimeout: boolean;
  tokPerSec: number;
  isTruncated: boolean;
}

export class SystemMetrics {
  private static instance: SystemMetrics;

  public healthy: boolean = false;
  private requestHistory: LLMRequestRecord[] = [];
  public recentTokPerSec: number[] = [];
  public tasksQty: number = 0;
  private tasksQtyProvider?: () => number;

  private constructor() {}

  public static getInstance(): SystemMetrics {
    const globalKey = Symbol.for('twinbox.system_metrics_singleton');
    const globalObj = globalThis as any;
    if (!globalObj[globalKey]) {
      globalObj[globalKey] = new SystemMetrics();
    }
    return globalObj[globalKey];
  }

  public setHealthy(val: boolean): void {
    this.healthy = Boolean(val);
  }

  public setTasksQty(val: number): void {
    this.tasksQty = typeof val === 'number' && !isNaN(val) ? Math.max(0, val) : 0;
  }

  public setTasksQtyProvider(provider: () => number): void {
    this.tasksQtyProvider = provider;
  }

  public recordRequest(entry: Omit<LLMRequestRecord, 'timestamp'>): void {
    const record: LLMRequestRecord = {
      timestamp: Date.now(),
      ...entry
    };
    this.requestHistory.push(record);
    if (this.requestHistory.length > 50) {
      this.requestHistory.shift();
    }

    if (entry.success && entry.tokPerSec > 0) {
      this.recentTokPerSec.push(Number(entry.tokPerSec.toFixed(1)));
      if (this.recentTokPerSec.length > 10) {
        this.recentTokPerSec.shift();
      }
    }
  }

  public addTokPerSec(val: number): void {
    if (typeof val !== 'number' || isNaN(val) || val <= 0) return;
    this.recentTokPerSec.push(Number(val.toFixed(1)));
    if (this.recentTokPerSec.length > 10) {
      this.recentTokPerSec.shift();
    }
  }

  public getMetrics() {
    let tasksQty = this.tasksQty;
    if (this.tasksQtyProvider) {
      try {
        const dynamicQty = this.tasksQtyProvider();
        if (typeof dynamicQty === 'number') {
          tasksQty = dynamicQty;
        }
      } catch {
        // fallback
      }
    }

    const total = this.requestHistory.length;
    const errorCount = this.requestHistory.filter(r => r.isError).length;
    const timeoutCount = this.requestHistory.filter(r => r.isTimeout).length;
    const truncatedCount = this.requestHistory.filter(r => r.isTruncated).length;
    const successful = this.requestHistory.filter(r => r.success && r.tokPerSec > 0);

    const errorRate = total > 0 ? Number((errorCount / total).toFixed(4)) : 0;
    const timeoutRate = total > 0 ? Number((timeoutCount / total).toFixed(4)) : 0;
    const failedRate = total > 0 ? Number(((errorCount + timeoutCount) / total).toFixed(4)) : 0;
    const truncationRate = total > 0 ? Number((truncatedCount / total).toFixed(4)) : 0;
    const genSpeed = successful.length > 0
      ? Number((successful.reduce((acc, r) => acc + r.tokPerSec, 0) / successful.length).toFixed(1))
      : (this.recentTokPerSec.length > 0 ? this.recentTokPerSec[this.recentTokPerSec.length - 1] : 0);

    return {
      healthy: this.healthy,
      error_rate: errorRate,
      timeout_rate: timeoutRate,
      failed_rate: failedRate,
      generation_speed: genSpeed,
      truncation_rate: truncationRate,
      recent_tok_per_sec: [...this.recentTokPerSec],
      total_requests: total,
      tasks_qty: tasksQty
    };
  }
}

export const systemMetrics = SystemMetrics.getInstance();

let lastPollTime = 0;
let pollTimer: any = null;

/**
 * Polls GET {LLM_BASE_URL}/v1/models every 30 s.
 * healthy = HTTP 200 AND LLM_MODEL is in data[].id.
 */
export async function updateSystemMetrics(force: boolean = false): Promise<void> {
  const now = Date.now();
  if (!force && lastPollTime > 0 && now - lastPollTime < 30000) {
    return;
  }
  lastPollTime = now;

  const baseUrl = (process.env.LLM_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
  const targetModel = (process.env.LLM_MODEL || 'qwen3.8-27b').trim();

  try {
    const res = await fetch(`${baseUrl}/v1/models`, {
      signal: AbortSignal.timeout(5000)
    });

    if (res.ok) {
      const data: any = await res.json();
      const models = Array.isArray(data?.data) ? data.data : [];
      const isAvailable = models.some((m: any) => m.id === targetModel);
      systemMetrics.setHealthy(isAvailable);
    } else {
      systemMetrics.setHealthy(false);
    }
  } catch {
    systemMetrics.setHealthy(false);
  }
}

// Start periodic polling every 30 seconds
if (!pollTimer) {
  updateSystemMetrics(true).catch(() => {});
  pollTimer = setInterval(() => {
    updateSystemMetrics(true).catch(() => {});
  }, 30000);
}
