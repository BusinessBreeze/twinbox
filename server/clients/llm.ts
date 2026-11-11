import { ChatOpenAI } from "@langchain/openai";
import { systemMetrics } from "#server/utils/telemetry/system";
import { limits } from "#shared/limits";

const isChatCompletion = (input: any) => String(input?.url ?? input).includes('/chat/completions');
const isTimeout = (err: any) => {
    const msg = String(err?.message || '').toLowerCase();
    return err?.name === 'AbortError' || err?.name === 'TimeoutError' || err?.code === 'ETIMEDOUT'
        || msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted');
};

/**
 * The client's fetch, metered: every HTTP attempt to the LLM server (retries included) with its own duration, the
 * usage the server reports (any OpenAI-compatible server: prompt/completion tokens, cached prompt tokens) and the
 * finish reason. Waiting for a free slot (maxConcurrency) happens before this, so it isn't part of the duration.
 */
export const meteredFetch: typeof fetch = async (input, init) => {
    if (!isChatCompletion(input)) return fetch(input, init);
    const start = Date.now();
    systemMetrics.requestStarted();
    try {
        const res = await fetch(input, init);
        if (!res.ok) {
            systemMetrics.recordRequest({ success: false, isError: true, isTimeout: false, isTruncated: false, durationSec: (Date.now() - start) / 1000 });
            return res;
        }
        // The answer is one JSON body (no streaming): read a copy for the usage, hand the original on
        const body: any = await res.clone().json().catch(() => null);
        const durationSec = (Date.now() - start) / 1000;
        const usage = body?.usage ?? {};
        const completionTokens = Number(usage.completion_tokens) || 0;
        const cached = usage.prompt_tokens_details?.cached_tokens;
        systemMetrics.recordRequest({
            success: true,
            isError: false,
            isTimeout: false,
            isTruncated: body?.choices?.[0]?.finish_reason === 'length',
            durationSec,
            tokPerSec: durationSec > 0 ? completionTokens / durationSec : 0,
            promptTokens: Number(usage.prompt_tokens) || 0,
            completionTokens,
            cachedTokens: typeof cached === 'number' ? cached : null,
        });
        return res;
    } catch (err) {
        const timeout = isTimeout(err);
        systemMetrics.recordRequest({ success: false, isError: !timeout, isTimeout: timeout, isTruncated: false, durationSec: (Date.now() - start) / 1000 });
        throw err;
    } finally {
        systemMetrics.requestEnded();
    }
};

/** Counts LLM calls from start to end: those not on the wire (meteredFetch) are waiting for a free slot or a retry. */
export const metricsCallback = {
    handleChatModelStart(_llm: any, _messages: any[], runId: string) {
        systemMetrics.callStarted(runId);
    },
    handleLLMStart(_llm: any, _prompts: any[], runId: string) {
        systemMetrics.callStarted(runId);
    },
    handleLLMEnd(_output: any, runId: string) {
        systemMetrics.callEnded(runId);
    },
    handleLLMError(_err: any, runId: string) {
        systemMetrics.callEnded(runId);
    }
};

// Required, checked at startup (server/plugins/app_env_check.ts).
const rawBaseUrl = process.env.LLM_BASE_URL ?? "";
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
    model: process.env.LLM_MODEL,
    configuration: {
        baseURL: `${cleanBaseUrl}/v1`,
        fetch: meteredFetch
    },
    apiKey: process.env.LLM_API_KEY || "none",
    temperature: 0,
    maxConcurrency: limits.llm.max_concurrency,
    maxRetries: limits.llm.max_retries,
    timeout: limits.llm.timeout_ms,
    modelKwargs: parseExtraBody(process.env.LLM_EXTRA_BODY),
    callbacks: [metricsCallback]
});