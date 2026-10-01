export class SystemMetrics {
  private static instance: SystemMetrics;

  public healthy: boolean = false;
  public kvCacheAllocation: number = 0;
  public activeHardwareVram: number = 0;
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

  public setKvCacheAllocation(val: number): void {
    this.kvCacheAllocation = typeof val === 'number' && !isNaN(val) ? val : 0;
  }

  public setActiveHardwareVram(val: number): void {
    this.activeHardwareVram = typeof val === 'number' && !isNaN(val) ? val : 0;
  }

  public setTasksQty(val: number): void {
    this.tasksQty = typeof val === 'number' && !isNaN(val) ? Math.max(0, val) : 0;
  }

  public setTasksQtyProvider(provider: () => number): void {
    this.tasksQtyProvider = provider;
  }

  public addTokPerSec(val: number): void {
    if (typeof val !== 'number' || isNaN(val) || val <= 0) return;
    this.recentTokPerSec.push(Number(val.toFixed(2)));
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

    return {
      healthy: this.healthy,
      kv_cache_allocation: this.kvCacheAllocation,
      active_hardware_vram: this.activeHardwareVram,
      recent_tok_per_sec: [...this.recentTokPerSec],
      tasks_qty: tasksQty
    };
  }
}

export const systemMetrics = SystemMetrics.getInstance();

/**
 * Parses LLM_METRICS_TYPE safely, stripping quotes and inline comments.
 */
export function parseMetricsType(raw?: string): 'ollama' | 'vllm' | 'none' {
  if (!raw) return 'none';
  const clean = raw.split('#')[0].replace(/['"]/g, '').toLowerCase().trim();
  if (clean.includes('ollama')) return 'ollama';
  if (clean.includes('vllm')) return 'vllm';
  return 'none';
}

/**
 * Polls LLM endpoint for KV Cache and VRAM metrics based on LLM_METRICS_TYPE.
 */
export async function updateSystemMetrics(): Promise<void> {
  const metricsType = parseMetricsType(process.env.LLM_METRICS_TYPE);
  const baseUrl = (process.env.LLM_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');

  if (metricsType === 'ollama') {
    try {
      const res = await fetch(`${baseUrl}/api/ps`, {
        signal: AbortSignal.timeout(5000)
      });

      systemMetrics.setHealthy(res.ok);

      if (res.ok) {
        const data: any = await res.json();
        const models = Array.isArray(data?.models) ? data.models : [];
        let totalVramBytes = 0;
        for (const m of models) {
          // If size_vram is non-zero, use it; otherwise fallback to model weight size in memory
          const vram = Number(m.size_vram) > 0 ? Number(m.size_vram) : Number(m.size || 0);
          totalVramBytes += vram;
        }
        systemMetrics.setActiveHardwareVram(totalVramBytes);
        // Ollama manages KV cache internally within process VRAM; no standalone dynamic metric
        systemMetrics.setKvCacheAllocation(0);
      } else {
        systemMetrics.setActiveHardwareVram(0);
        systemMetrics.setKvCacheAllocation(0);
      }
    } catch (err: any) {
      console.error('[System Metrics] Failed to fetch Ollama metrics:', err?.message || err);
      systemMetrics.setHealthy(false);
      systemMetrics.setActiveHardwareVram(0);
      systemMetrics.setKvCacheAllocation(0);
    }
  } else if (metricsType === 'vllm') {
    try {
      const res = await fetch(`${baseUrl}/metrics`, {
        signal: AbortSignal.timeout(5000)
      });

      systemMetrics.setHealthy(res.ok);

      if (res.ok) {
        const text = await res.text();

        // Parse vllm:gpu_cache_usage_factor (0.0 to 1.0)
        const kvMatch = text.match(/vllm:gpu_cache_usage_factor(?:\s*\{[^}]*\})?\s+([0-9.eE+-]+)/);
        if (kvMatch && kvMatch[1]) {
          systemMetrics.setKvCacheAllocation(parseFloat(kvMatch[1]));
        } else {
          systemMetrics.setKvCacheAllocation(0);
        }

        // Parse any exported memory / VRAM usage gauge
        const vramMatch = text.match(/vllm:(?:gpu_memory_usage_bytes|model_weights_bytes|gpu_memory_allocated_bytes)(?:\s*\{[^}]*\})?\s+([0-9.eE+-]+)/);
        if (vramMatch && vramMatch[1]) {
          systemMetrics.setActiveHardwareVram(parseFloat(vramMatch[1]));
        } else {
          systemMetrics.setActiveHardwareVram(0);
        }
      } else {
        systemMetrics.setActiveHardwareVram(0);
        systemMetrics.setKvCacheAllocation(0);
      }
    } catch {
      systemMetrics.setHealthy(false);
      systemMetrics.setActiveHardwareVram(0);
      systemMetrics.setKvCacheAllocation(0);
    }
  } else {
    systemMetrics.setHealthy(false);
    systemMetrics.setActiveHardwareVram(0);
    systemMetrics.setKvCacheAllocation(0);
  }
}
