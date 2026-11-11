// The slow tests rely on the stub's filter verdicts; this keeps its parsing in line with the real filter prompt
// (the messages joined as the stub reads them).
import { describe, it, expect } from 'vitest';
import { judge } from '../../helpers/stub_services';
import { filterPrompt } from '#server/jobs/automations/prompts';

const prompt = (criteria: string, text: string) => filterPrompt(criteria, text).map((m) => m.content).join('\n');

describe('stub LLM filter', () => {
    it('matches the quoted phrase of the criteria, case-insensitively', () => {
        expect(judge(prompt('Only emails that mention "AI Act"', 'The ai act applies now.'))).toBe(true);
        expect(judge(prompt('Only emails that mention "AI Act"', 'Breach costs rose.'))).toBe(false);
    });

    it('uses the whole criteria when nothing is quoted', () => {
        expect(judge(prompt('invoice', 'Your Invoice 42'))).toBe(true);
    });
});
