import { describe, expect, it } from '@jest/globals';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import config from '../../eslint.config.mjs';

/**
 * The guardrail behind src/utils/StdinSync.ts: no other module may read fd 0
 * directly, because once anything touches `process.stdin` a direct
 * synchronous read throws EAGAIN whenever no data has arrived yet. The rule
 * is `no-restricted-syntax` in eslint.config.mjs; these tests lint snippets
 * with the repository's own configuration, so a selector that stops matching
 * (or an override that stops exempting the helper) fails here instead of
 * silently disarming the rule.
 */
const forSrc = config.find(
  (entry) =>
    entry.files?.includes('src/**/*.ts') &&
    entry.rules?.['no-restricted-syntax']
);
const forHelper = config.find((entry) =>
  entry.files?.includes('src/utils/StdinSync.ts')
);

/** Lints `code` with the src rule (or the helper's override) and returns the messages. */
function lint(code, rule = forSrc.rules['no-restricted-syntax']) {
  const linter = new Linter();
  return linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tseslint.parser },
        rules: { 'no-restricted-syntax': rule },
      },
    ],
    'probe.ts'
  );
}

describe('direct reads of fd 0 are rejected outside the helper', () => {
  it.each([
    ['process.stdin.fd', 'export const a = readJson(process.stdin.fd);'],
    ['readSync(0, ...)', 'export const b = readSync(0, buf, 0, 1, null);'],
    [
      'fs.readSync(0, ...)',
      'export const c = fs.readSync(0, buf, 0, 1, null);',
    ],
    ['readFileSync(0, ...)', "export const d = readFileSync(0, 'utf8');"],
    ['fs.readFileSync(0, ...)', "export const e = fs.readFileSync(0, 'utf8');"],
    ['/dev/stdin', "export const f = fs.readFileSync('/dev/stdin', 'utf8');"],
  ])('%s', (_name, code) => {
    const messages = lint(code);
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe('no-restricted-syntax');
    expect(messages[0].message).toContain('src/utils/StdinSync.ts');
  });

  it.each([
    [
      'reading a file by path',
      "export const a = fs.readFileSync('file.json', 'utf8');",
    ],
    [
      'reading another descriptor',
      'export const b = fs.readSync(3, buf, 0, 1, null);',
    ],
    ['checking isTTY', 'export const c = process.stdin.isTTY;'],
    [
      'a listener on stdin',
      "export const d = process.stdin.on('keypress', () => {});",
    ],
  ])('%s is allowed', (_name, code) => {
    expect(lint(code)).toEqual([]);
  });

  it('keeps the other syntax restrictions next to the stdin ones', () => {
    expect(lint('outer: for (;;) { break outer; }')).toHaveLength(1);
  });

  it('exempts the helper itself, and only the stdin restrictions', () => {
    expect(forHelper).toBeDefined();
    const rule = forHelper.rules['no-restricted-syntax'];
    expect(
      lint('export const b = readSync(0, buf, 0, 1, null);', rule)
    ).toEqual([]);
    expect(lint('export const a = process.stdin.fd;', rule)).toEqual([]);
    expect(lint('outer: for (;;) { break outer; }', rule)).toHaveLength(1);
  });
});
