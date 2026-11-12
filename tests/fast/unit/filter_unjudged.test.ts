// The LLM filter (server/jobs/automations/filter.ts) fails closed: an item the model gives no usable answer for is
// not processed but handed back as unjudged (the run reports it as an error with a link); an outage still throws.
import { describe, it, expect, vi } from 'vitest';
import { OutputParserException } from '@langchain/core/output_parsers';

// What the mocked model answers per email subject
const answers = new Map<string, () => unknown>();
vi.mock('#server/jobs/automations/deps', () => ({
    limits: { llm: { max_input_chars: 10_000 } },
    llm: {
        withStructuredOutput: () => ({
            invoke: async (messages: Array<{ content: string }>) => {
                const text = messages.map((m) => m.content).join('\n');
                const key = [...answers.keys()].find((subject) => text.includes(subject));
                return answers.get(key!)!();
            },
        }),
    },
}));
vi.mock('#server/jobs/automations/tasks', () => ({
    itemToText: (item: any) => `Subject: ${item.content.subject}\n\n${item.content.text}`,
}));

const { filterItems } = await import('#server/jobs/automations/filter');
const item = (subject: string) => ({ mime: 'message/rfc822', content: { subject, text: 'body' }, label: subject, sourceRefs: [`<${subject}@x>`] }) as any;

describe('filter: unusable answers', () => {
    it('passes matches, drops non-matches and hands back the unjudged ones unprocessed', async () => {
        answers.clear();
        answers.set('Order 1', () => ({ result: true }));
        answers.set('Newsletter', () => ({ result: false }));
        answers.set('Garbled', () => { throw new OutputParserException('Failed to parse. Text: "I think so"'); });
        const res = await filterItems('Only orders', [item('Order 1'), item('Newsletter'), item('Garbled')]);
        expect(res.passed.map((i) => i.label)).toEqual(['Order 1']);
        expect(res.unjudged.map((i) => i.label)).toEqual(['Garbled']);
    });

    it('lets everything through without a prompt (no model call)', async () => {
        const res = await filterItems('  ', [item('A'), item('B')]);
        expect(res).toEqual({ passed: [item('A'), item('B')], unjudged: [] });
    });

    it('throws on an outage, so the automation stops for this run', async () => {
        answers.clear();
        answers.set('Order 2', () => { throw new Error('connect ECONNREFUSED'); });
        await expect(filterItems('Only orders', [item('Order 2')])).rejects.toThrow('ECONNREFUSED');
    });
});
