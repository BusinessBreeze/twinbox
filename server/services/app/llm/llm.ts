import { ChatOllama } from "@langchain/ollama";

export const llm = new ChatOllama({
    model: process.env.OLLAMA_MODEL ?? "llama3.2",
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    temperature: 0,
    // format: "json",
    maxConcurrency: 1,
    timeout: Number(process.env.OLLAMA_TIMEOUT_MS ?? 30000)
});