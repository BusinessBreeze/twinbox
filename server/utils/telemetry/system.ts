export interface LLMRequestRecord {
  timestamp: number;
  success: boolean;
  isError: boolean;
  isTimeout: boolean;
  isTruncated: boolean;
  durationSec: number;            // one HTTP attempt, without waiting for a free slot
  tokPerSec?: number;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number | null;   // null: the server doesn't report cached prompt tokens
}

const avg = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const round = (value: number, digits: number) => Number(value.toFixed(digits));

export class SystemMetrics {
  private static instance: SystemMetrics;

  public healthy: boolean = false;
  // Reachability of the other services (null = no URL configured)
  public ttsReachable: boolean | null = null;
  public appriseReachable: boolean | null = null;
  // Rates and averages cover the last 50 LLM requests; the token totals everything since the start
  private requestHistory: LLMRequestRecord[] = [];
  public recentTokPerSec: number[] = [];
  private tokensIn = 0;
  private tokensOut = 0;
  // LLM calls from start to end, and HTTP requests on the wire: the difference waits for a slot (or a retry)
  private activeCalls = new Set<string>();
  private inFlight = 0;
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

  public setReachable(ttsReachable: boolean | null, appriseReachable: boolean | null): void {
    this.ttsReachable = ttsReachable;
    this.appriseReachable = appriseReachable;
  }

  public setTasksQty(val: number): void {
    this.tasksQty = typeof val === 'number' && !isNaN(val) ? Math.max(0, val) : 0;
  }

  public setTasksQtyProvider(provider: () => number): void {
    this.tasksQtyProvider = provider;
  }

  public callStarted(id: string): void { this.activeCalls.add(id); }
  public callEnded(id: string): void { this.activeCalls.delete(id); }
  public requestStarted(): void { this.inFlight++; }
  public requestEnded(): void { this.inFlight = Math.max(0, this.inFlight - 1); }

  public recordRequest(entry: Omit<LLMRequestRecord, 'timestamp'>): void {
    this.requestHistory.push({ timestamp: Date.now(), ...entry });
    if (this.requestHistory.length > 50) {
      this.requestHistory.shift();
    }
    this.tokensIn += entry.promptTokens ?? 0;
    this.tokensOut += entry.completionTokens ?? 0;

    if (entry.success && (entry.tokPerSec ?? 0) > 0) {
      this.recentTokPerSec.push(round(entry.tokPerSec!, 1));
      if (this.recentTokPerSec.length > 10) {
        this.recentTokPerSec.shift();
      }
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

    const history = this.requestHistory;
    const total = history.length;
    const rate = (count: number) => total > 0 ? round(count / total, 4) : 0;
    const errorCount = history.filter(r => r.isError).length;
    const timeoutCount = history.filter(r => r.isTimeout).length;
    const succeeded = history.filter(r => r.success);
    const withSpeed = succeeded.filter(r => (r.tokPerSec ?? 0) > 0);
    // Cache hits: share of the prompt tokens the server didn't process again, of the answers that report it
    const reportsCache = succeeded.filter(r => typeof r.cachedTokens === 'number');
    const cachePrompt = reportsCache.reduce((sum, r) => sum + (r.promptTokens ?? 0), 0);
    const cacheHit = reportsCache.length === 0 ? null
      : cachePrompt > 0 ? round(reportsCache.reduce((sum, r) => sum + (r.cachedTokens ?? 0), 0) / cachePrompt, 4) : 0;

    return {
      healthy: this.healthy,
      tts_reachable: this.ttsReachable,
      apprise_reachable: this.appriseReachable,
      error_rate: rate(errorCount),
      timeout_rate: rate(timeoutCount),
      failed_rate: rate(errorCount + timeoutCount),
      truncation_rate: rate(history.filter(r => r.isTruncated).length),
      // Any of the three: an error, a timeout or a cut-off answer
      problem_rate: rate(history.filter(r => r.isError || r.isTimeout || r.isTruncated).length),
      generation_speed: round(avg(withSpeed.map(r => r.tokPerSec!)), 1),
      recent_tok_per_sec: [...this.recentTokPerSec],
      avg_response_sec: round(avg(succeeded.map(r => r.durationSec)), 3),
      avg_prompt_tokens: Math.round(avg(succeeded.map(r => r.promptTokens ?? 0))),
      tokens_in: this.tokensIn,
      tokens_out: this.tokensOut,
      cache_hit_rate: cacheHit,
      llm_waiting: Math.max(0, this.activeCalls.size - this.inFlight),
      total_requests: total,
      tasks_qty: tasksQty
    };
  }
}

export const systemMetrics = SystemMetrics.getInstance();

let lastPollTime = 0;
let pollTimer: any = null;

/** null without a URL; otherwise whether `ok` accepts the answer of GET <url> (5 s, any network error = false). */
async function probe(url: string, ok: (res: Response) => boolean): Promise<boolean | null> {
  if (!url) return null;
  try {
    return ok(await fetch(url, { signal: AbortSignal.timeout(5000) }));
  } catch {
    return false;
  }
}

/**
 * Polls the services every 30 s:
 * - healthy (LLM): GET {LLM_BASE_URL}/v1/models answers 200 AND lists LLM_MODEL in data[].id
 * - TTS: GET {TTS_BASE_URL} gets any HTTP answer (the server has no health route; a 404 still means it is up)
 * - Apprise: GET {APPRISE_URL}/details answers 200
 */
export async function updateSystemMetrics(force: boolean = false): Promise<void> {
  const now = Date.now();
  if (!force && lastPollTime > 0 && now - lastPollTime < 30000) {
    return;
  }
  lastPollTime = now;

  const baseUrl = (process.env.LLM_BASE_URL ?? '').replace(/\/+$/, '');
  const targetModel = (process.env.LLM_MODEL ?? '').trim();

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

  const base = (url?: string) => (url ?? '').trim().replace(/\/+$/, '');
  const tts = base(process.env.TTS_BASE_URL);
  const apprise = base(process.env.APPRISE_URL);
  const [ttsReachable, appriseReachable] = await Promise.all([
    probe(tts, () => true),
    probe(apprise && `${apprise}/details`, (res) => res.ok),
  ]);
  systemMetrics.setReachable(ttsReachable, appriseReachable);
}

// Start periodic polling every 30 seconds
if (!pollTimer) {
  updateSystemMetrics(true).catch(() => {});
  pollTimer = setInterval(() => {
    updateSystemMetrics(true).catch(() => {});
  }, 30000);
}
