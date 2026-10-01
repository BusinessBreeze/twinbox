import { ChatOllama } from "@langchain/ollama";
import { systemMetrics } from "#server/utils/telemetry/system";

const startTimes = new Map<string, number>();

export const metricsCallback = {
    handleChatModelStart(_llm: any, _messages: any[], runId: string) {
        startTimes.set(runId, Date.now());
    },
    handleLLMStart(_llm: any, _prompts: any[], runId: string) {
        startTimes.set(runId, Date.now());
    },
    handleLLMEnd(output: any, runId: string) {
        try {
            const startTime = startTimes.get(runId);
            startTimes.delete(runId);

            const gen = output?.generations?.[0]?.[0];
            const msg = gen?.message;
            const meta = msg?.response_metadata || msg?.responseMetadata || gen?.generationInfo || msg?.additional_kwargs;

            // 1. Ollama native eval metrics
            const evalCount = meta?.eval_count ?? meta?.evalCount;
            const evalDuration = meta?.eval_duration ?? meta?.evalDuration;
            if (evalCount && evalDuration) {
                const durationSec = evalDuration / 1e9;
                if (durationSec > 0) {
                    systemMetrics.addTokPerSec(evalCount / durationSec);
                    return;
                }
            }

            // 2. Fallback: output tokens / measured elapsed time
            const outTokens = msg?.usage_metadata?.output_tokens ?? msg?.usageMetadata?.outputTokens ?? evalCount;
            if (outTokens && startTime) {
                const durationSec = (Date.now() - startTime) / 1000;
                if (durationSec > 0) {
                    systemMetrics.addTokPerSec(outTokens / durationSec);
                }
            }
        } catch {
            // safe fallback
        }
    },
    handleLLMError(_err: any, runId: string) {
        startTimes.delete(runId);
    }
};

export const llm = new ChatOllama({
    model: process.env.LLM_MODEL ?? "llama3.2",
    baseUrl: process.env.LLM_BASE_URL ?? "http://localhost:11434",
    temperature: 0,
    // format: "json",
    maxConcurrency: 1,
    timeout: Number(process.env.LLM_TIMEOUT_MS ?? 30000),
    callbacks: [metricsCallback]
});