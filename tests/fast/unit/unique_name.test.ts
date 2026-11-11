import { describe, it, expect } from 'vitest';
import { getUniqueName } from '#shared/utils/unique_name';

describe('getUniqueName (task labels, saved search names)', () => {
    it('keeps a free name, trimmed', () => {
        expect(getUniqueName('  Summary ', ['Speech'])).toBe('Summary');
    });

    it('numbers a taken name', () => {
        expect(getUniqueName('Summary', ['Summary'])).toBe('Summary (1)');
        expect(getUniqueName('Summary', ['Summary', 'Summary (1)'])).toBe('Summary (2)');
    });

    it('compares case-insensitively and ignores empty entries', () => {
        expect(getUniqueName('summary', ['SUMMARY', '', null, undefined])).toBe('summary (1)');
    });
});
