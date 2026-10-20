import { ChatOpenAI } from "@langchain/openai";
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
            const durationSec = startTime ? (Date.now() - startTime) / 1000 : 0;

            const gen = output?.generations?.[0]?.[0];
            const msg = gen?.message;
            const meta = msg?.response_metadata || msg?.responseMetadata || gen?.generationInfo || msg?.additional_kwargs;

            // OpenAI / vLLM token counts
            const completionTokens =
                msg?.usage_metadata?.output_tokens ??
                meta?.usage?.completion_tokens ??
                meta?.tokenUsage?.completionTokens ??
                meta?.eval_count ??
                0;

            const finishReason =
                meta?.finish_reason ??
                meta?.finishReason ??
                '';

            const tokPerSec = durationSec > 0 && completionTokens > 0
                ? completionTokens / durationSec
                : 0;

            systemMetrics.recordRequest({
                success: true,
                durationSec,
                tokPerSec,
                isTruncated: finishReason === 'length',
                isTimeout: false,
                isError: false
            });
        } catch {
            // safe fallback
        }
    },
    handleLLMError(err: any, runId: string) {
        try {
            const startTime = startTimes.get(runId);
            startTimes.delete(runId);
            const durationSec = startTime ? (Date.now() - startTime) / 1000 : 0;

            const errMsg = String(err?.message || '').toLowerCase();
            const isTimeout =
                err?.name === 'TimeoutError' ||
                err?.code === 'ETIMEDOUT' ||
                errMsg.includes('timeout') ||
                errMsg.includes('aborted');

            systemMetrics.recordRequest({
                success: false,
                durationSec,
                tokPerSec: 0,
                isTruncated: false,
                isTimeout,
                isError: !isTimeout
            });
        } catch {
            // safe fallback
        }
    }
};

const rawBaseUrl = process.env.LLM_BASE_URL ?? "http://localhost:11434";
const cleanBaseUrl = rawBaseUrl.replace(/\/+$/, "");

/**
 * Parses LLM_EXTRA_BODY: an optional JSON object merged into every request body
 * (backend-specific extras, e.g. vLLM: {"chat_template_kwargs":{"enable_thinking":false}}).
 * Empty or invalid = nothing extra is sent.
 */
export function parseExtraBody(raw?: string): Record<string, unknown> | undefined {
    if (!raw?.trim()) return undefined;
    try {
        const value = JSON.parse(raw);
        if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {
        // fall through to the warning below
    }
    console.warn("[LLM] LLM_EXTRA_BODY is not a JSON object, ignoring it");
    return undefined;
}

export const llm = new ChatOpenAI({
    model: process.env.LLM_MODEL ?? "qwen3.8-27b",
    configuration: {
        baseURL: `${cleanBaseUrl}/v1`
    },
    apiKey: process.env.LLM_API_KEY || "none",
    temperature: 0,
    maxConcurrency: 1,
    maxRetries: 1,
    timeout: Number(process.env.LLM_TIMEOUT_MS ?? 30000),
    modelKwargs: parseExtraBody(process.env.LLM_EXTRA_BODY),
    callbacks: [metricsCallback]
});