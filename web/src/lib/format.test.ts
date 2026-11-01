import { describe, expect, it } from 'vitest';
import { formatInput, parseInput } from './format';

describe('parseInput', () => {
  it('tolkar tal med mellanslag och decimalkomma', () => {
    expect(parseInput('3 400 000')).toBe(3_400_000);
    expect(parseInput('3 400 000')).toBe(3_400_000);
    expect(parseInput('3,5')).toBe(3.5);
    expect(parseInput('3.5')).toBe(3.5);
  });

  it('tolkar negativa tal med båda sorters minustecken', () => {
    expect(parseInput('-350000')).toBe(-350_000);
    expect(parseInput('−5')).toBe(-5);
  });

  it('accepterar tal som håller på att skrivas', () => {
    expect(parseInput('3,')).toBe(3);
    expect(parseInput(',5')).toBe(0.5);
  });

  it('ger 0 för tom text och null för ogiltig text', () => {
    expect(parseInput('')).toBe(0);
    expect(parseInput('-')).toBeNull();
    expect(parseInput('abc')).toBeNull();
    expect(parseInput('1,2,3')).toBeNull();
  });

  it('kan läsa tillbaka det formatInput skriver', () => {
    for (const n of [3_400_000, 3.5, -350_000, 0, 1962]) {
      expect(parseInput(formatInput(n))).toBe(n);
    }
  });
});

describe('formatInput', () => {
  it('kan visa årtal utan mellanslag', () => {
    expect(formatInput(1962, false)).toBe('1962');
  });
});
