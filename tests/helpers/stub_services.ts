// Stand-ins for the LLM and TTS servers (OpenAI-compatible), so slow tests are repeatable and need no GPU or LAN.
//
// LLM  GET  /v1/models            one model, "stub"
//      POST /v1/chat/completions  filter prompts (JSON schema answer): {"result": true} when the email text contains
//                                 the criteria's quoted phrase (or the whole criteria), case-insensitive.
//                                 Automation drafts: name "AI Act digest", filter for "AI Act", a summary instruction.
//                                 Anything else: "STUB SUMMARY: " + the first 80 characters of the last line of the
//                                 email in the prompt (between its <email_…> tags), else of the prompt's last line.
//                                 A prompt with FAIL_LLM gets a 400, with CUT_LLM a cut-off answer (finish_reason
//                                 "length"), with SLOW_LLM an answer after SLOW_LLM_MS (longer than the test timeout).
//                                 Usage: 10 prompt tokens (4 of them cached) and 5 completion tokens per answer,
//                                 after 20 ms.
// TTS  POST /v1/audio/speech      a few bytes of "audio"; 500 when the text contains FAIL_TTS (TTSFAILMARKER)
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export const FAIL_TTS = 'TTSFAILMARKER';
export const FAIL_LLM = 'LLMFAILMARKER';
export const CUT_LLM = 'LLMCUTMARKER';
export const SLOW_LLM = 'LLMSLOWMARKER';
export const SLOW_LLM_MS = 3000;   // global_setup sets LIMITS_LLM_TIMEOUT_MS below it

const between = (text: string, start: string, end: string) => {
    const i = text.indexOf(start);
    if (i < 0) return null;
    const j = text.indexOf(end, i + start.length);
    return j < 0 ? null : text.slice(i + start.length, j);
};

/** The untrusted text of a prompt: what is between its <email_…> tags (server/jobs/automations/prompts.ts). */
const fenced = (prompt: string) => prompt.match(/<(email_[0-9a-f]+)>\n([\s\S]*?)\n<\/\1>/)?.[2] ?? null;

/** The filter's verdict for one prompt (see server/jobs/automations/prompts.ts for the prompt layout). */
export const judge = (prompt: string): boolean => {
    const criteria = between(prompt, 'Filter criteria:\n', '\n\nThe text is between') ?? '';
    const text = fenced(prompt) ?? '';
    const phrase = criteria.match(/"([^"]+)"/)?.[1] ?? criteria;
    return !!phrase && text.toLowerCase().includes(phrase.toLowerCase());
};

const completion = (content: string, finish_reason = 'stop') => ({
    id: 'stub', object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: 'stub',
    choices: [{ index: 0, finish_reason, message: { role: 'assistant', content } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, prompt_tokens_details: { cached_tokens: 4 } },
});

const readBody = async (req: any): Promise<any> => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
};

const messageText = (body: any) => (body.messages || [])
    .map((m: any) => (typeof m.content === 'string' ? m.content : (m.content || []).map((c: any) => c.text || '').join('')))
    .join('\n');

export interface StubServices {
    url: string;
    calls: { path: string; body: any }[];
    close: () => Promise<void>;
}

export const startStubServices = async (): Promise<StubServices> => {
    const calls: { path: string; body: any }[] = [];
    const server: Server = createServer(async (req, res) => {
        const body = req.method === 'POST' ? await readBody(req) : {};
        calls.push({ path: req.url || '', body });
        const json = (status: number, data: unknown) => {
            res.writeHead(status, { 'content-type': 'application/json' });
            res.end(JSON.stringify(data));
        };

        if (req.url?.startsWith('/v1/models')) return json(200, { object: 'list', data: [{ id: 'stub', object: 'model' }] });

        if (req.url?.startsWith('/v1/chat/completions')) {
            const prompt = messageText(body);
            if (prompt.includes(FAIL_LLM)) return json(400, { error: { message: 'stub LLM failure' } });
            await new Promise((r) => setTimeout(r, prompt.includes(SLOW_LLM) ? SLOW_LLM_MS : 20));   // a measurable answer time
            if (res.destroyed) return;   // the client gave up (timeout)
            if (prompt.includes(CUT_LLM)) return json(200, completion('STUB CUT', 'length'));
            // Automation drafts (server/jobs/automations/prompts.ts draftPrompt): a fixed draft for the AI Act newsletters
            if ((body.response_format?.type === 'json_schema' || body.tools) && prompt.includes('You set up an email automation')) {
                return json(200, completion(JSON.stringify({
                    name: 'AI Act digest', filter_prompt: 'Only emails that mention "AI Act"', task_prompt: 'Summarize in 3 bullet points.',
                })));
            }
            if (body.response_format?.type === 'json_schema' || body.tools) {
                return json(200, completion(JSON.stringify({ result: judge(prompt) })));
            }
            const lastLine = (fenced(prompt) ?? prompt).trim().split('\n').pop() || '';
            return json(200, completion(`STUB SUMMARY: ${lastLine.slice(0, 80)}`));
        }

        if (req.url?.startsWith('/v1/audio/speech')) {
            if (String(body.input || '').includes(FAIL_TTS)) return json(500, { error: 'stub TTS failure' });
            res.writeHead(200, { 'content-type': 'audio/mpeg' });
            return res.end(Buffer.from('ID3stub-audio'));
        }

        json(404, { error: 'not stubbed' });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return {
        url: `http://127.0.0.1:${port}`,
        calls,
        close: () => new Promise((resolve) => server.close(() => resolve())),
    };
};
