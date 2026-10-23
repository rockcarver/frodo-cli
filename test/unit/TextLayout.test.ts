import fs from 'fs';
import { describe, expect, it } from '@jest/globals';
import {
  firstLine,
  padCell,
  singleLine,
  truncate,
} from '../../src/utils/TextLayout';

describe('truncate', () => {
  it('keeps text that fits, up to exactly max', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('exactly10!', 10)).toBe('exactly10!');
  });

  it('cuts longer text to max characters with a trailing ellipsis', () => {
    expect(truncate('this is too long', 10)).toBe('this is t…');
    expect(truncate('this is too long', 10)).toHaveLength(10);
  });

  it('still marks the cut at the smallest widths', () => {
    expect(truncate('abc', 1)).toBe('…');
    expect(truncate('', 5)).toBe('');
  });
});

describe('padCell', () => {
  it('pads shorter text with spaces up to width', () => {
    expect(padCell('ab', 5)).toBe('ab   ');
  });

  it('leaves text that already fills or exceeds the width untouched', () => {
    expect(padCell('abcde', 5)).toBe('abcde');
    expect(padCell('abcdefgh', 5)).toBe('abcdefgh');
  });
});

describe('singleLine', () => {
  it('collapses line breaks, tabs and runs of spaces to single spaces', () => {
    expect(singleLine('a\nb\r\nc\td    e')).toBe('a b c d e');
  });

  it('trims both ends and turns blank text into an empty string', () => {
    expect(singleLine('  \n padded \t')).toBe('padded');
    expect(singleLine(' \n\t ')).toBe('');
  });
});

describe('firstLine', () => {
  it('is the first line of a multi-line text (a stack trace headline)', () => {
    expect(firstLine('TypeError: boom\n\tat a.b.C(D.java:1)\n\tat e.f.G')).toBe(
      'TypeError: boom'
    );
  });

  it('skips leading blank and whitespace-only lines', () => {
    expect(firstLine('\r\n  \n\t\nReal: x\nmore')).toBe('Real: x');
  });

  it('returns the line as one line: inner runs of whitespace collapse', () => {
    expect(firstLine('a   b\tc\nd')).toBe('a b c');
  });

  it('is empty for empty or blank text', () => {
    expect(firstLine('')).toBe('');
    expect(firstLine('\n \n')).toBe('');
  });
});

describe('layering', () => {
  it('has no imports: the ops layer and the interactive layer both depend on it', () => {
    const source = fs.readFileSync('src/utils/TextLayout.ts', 'utf8');
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(/);
  });
});
