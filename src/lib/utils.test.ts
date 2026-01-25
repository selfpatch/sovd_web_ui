import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn utility', () => {
    it('merges class names', () => {
        expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('handles conditional classes', () => {
        const condition = false;
        expect(cn('foo', condition && 'bar', 'baz')).toBe('foo baz');
    });

    it('merges tailwind classes correctly', () => {
        expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
    });

    it('handles empty input', () => {
        expect(cn()).toBe('');
    });

    it('handles arrays', () => {
        expect(cn(['foo', 'bar'])).toBe('foo bar');
    });
});
