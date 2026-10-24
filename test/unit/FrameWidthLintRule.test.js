import { describe, expect, it } from '@jest/globals';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import config from '../../eslint.config.mjs';

/**
 * The guardrail behind useTerminalWidth(): a prompt frame must follow the
 * terminal, and the renderers default to 120 columns, so a call that leaves
 * the width out silently draws a fixed-width frame. The rule is
 * `no-restricted-syntax` in eslint.config.mjs; these tests lint snippets
 * with the repository's own configuration, so a selector that stops matching
 * fails here instead of silently disarming the rule.
 *
 * Known limit: a call that passes an options object held in a variable
 * (`renderFramedBox(options)`) cannot be inspected; write the object inline.
 */
const forSrc = config.find(
  (entry) =>
    entry.files?.includes('src/**/*.ts') &&
    entry.rules?.['no-restricted-syntax']
);

/** Lints `code` with the src rule and returns the messages. */
function lint(code) {
  const linter = new Linter();
  return linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tseslint.parser },
        rules: { 'no-restricted-syntax': forSrc.rules['no-restricted-syntax'] },
      },
    ],
    'probe.ts'
  );
}

describe('a frame drawn without a width is rejected', () => {
  it.each([
    [
      'renderNavigationMenu(items)',
      'export const a = renderNavigationMenu(items);',
    ],
    [
      'descriptionPanelLines(text)',
      'export const b = descriptionPanelLines(text);',
    ],
    ['frameInnerWidth()', 'export const c = frameInnerWidth();'],
    [
      'renderFramedBox({ title, lines })',
      'export const d = renderFramedBox({ title, lines });',
    ],
    [
      'renderFramedBox with a spread and no width',
      'export const e = renderFramedBox({ ...base, lines });',
    ],
  ])('%s', (_name, code) => {
    const messages = lint(code);
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe('no-restricted-syntax');
    expect(messages[0].message).toContain('useTerminalWidth()');
  });

  it.each([
    [
      'renderNavigationMenu(items, width)',
      'export const a = renderNavigationMenu(items, width);',
    ],
    [
      'descriptionPanelLines(text, width)',
      'export const b = descriptionPanelLines(text, width);',
    ],
    ['frameInnerWidth(width)', 'export const c = frameInnerWidth(width);'],
    [
      'renderFramedBox({ title, lines, width })',
      'export const d = renderFramedBox({ title, lines, width });',
    ],
    [
      'renderFramedBox with width set explicitly',
      'export const e = renderFramedBox({ title, lines, width: 156 });',
    ],
    [
      'a width key inside a nested object is not the box width',
      'export const f = renderFramedBox({ title, lines, width, extra: { width: 1 } });',
    ],
    ['another function', 'export const g = renderOtherBox({ title, lines });'],
  ])('%s is allowed', (_name, code) => {
    expect(lint(code)).toEqual([]);
  });

  it('a nested width key does not count as the box width', () => {
    const messages = lint(
      'export const a = renderFramedBox({ title, lines: { width: 1 } });'
    );
    expect(messages).toHaveLength(1);
  });

  it('keeps the other syntax restrictions next to the frame ones', () => {
    expect(lint('outer: for (;;) { break outer; }')).toHaveLength(1);
    expect(lint('export const a = process.stdin.fd;')).toHaveLength(1);
  });
});
