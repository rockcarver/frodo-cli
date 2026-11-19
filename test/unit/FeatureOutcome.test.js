import { describe, expect, test } from '@jest/globals';
import { featureOutcome } from '../../src/ops/FeatureOutcome';

/**
 * `featureOutcome` (frodo-cli#1213) reads an install or validate result of the
 * pinned library (the response as the tenant sent it: install has no `success`,
 * validate has a `failures` list the type does not declare) and of a library
 * that states the outcome itself (`{ status, success, message, failures }`).
 * It failed only when `success` is `false` or `failures` is a non-empty array.
 * It is a pure function: no library, no terminal.
 */
describe('featureOutcome', () => {
  const cases = [
    // [name, result, succeeded, message, failures]
    [
      'install body as Ping documents it (no success, no failures)',
      { status: 200, message: 'Install complete.' },
      true,
      'Install complete.',
      [],
    ],
    [
      'install, normalized: success true, no failures',
      {
        status: 200,
        success: true,
        message: 'Install complete.',
        failures: [],
      },
      true,
      'Install complete.',
      [],
    ],
    [
      'success false without failures',
      { status: 200, success: false, message: 'Install failed.' },
      false,
      'Install failed.',
      [],
    ],
    [
      'success false with failures',
      {
        status: 200,
        success: false,
        message: 'Validate complete. 2 failure(s).',
        failures: [
          'config/repo.ds: must not already exist',
          'config/managed: x',
        ],
      },
      false,
      'Validate complete. 2 failure(s).',
      ['config/repo.ds: must not already exist', 'config/managed: x'],
    ],
    [
      'failures but no success',
      { status: 200, message: 'Install complete.', failures: ['a'] },
      false,
      'Install complete.',
      ['a'],
    ],
    [
      'success true but failures listed',
      { status: 200, success: true, message: 'm', failures: ['a', 'b'] },
      false,
      'm',
      ['a', 'b'],
    ],
    [
      'empty failures and no success',
      { status: 200, message: 'Validate complete.', failures: [] },
      true,
      'Validate complete.',
      [],
    ],
    [
      'failures that is a string counts as none',
      { success: true, message: 'm', failures: 'boom' },
      true,
      'm',
      [],
    ],
    [
      'failures that is an object counts as none',
      { message: 'm', failures: { 0: 'a' } },
      true,
      'm',
      [],
    ],
    [
      'failures that is null counts as none',
      { message: 'm', failures: null },
      true,
      'm',
      [],
    ],
    [
      'a non-array failures does not hide success false',
      { success: false, message: 'm', failures: 'boom' },
      false,
      'm',
      [],
    ],
    [
      'a failure that is not a text is shown as JSON, not dropped',
      { message: 'm', failures: [{ path: '/a', reason: 'x' }, 7, null] },
      false,
      'm',
      ['{"path":"/a","reason":"x"}', '7', 'null'],
    ],
    [
      'success 0 is not a boolean false, so not a failure',
      { success: 0, message: 'm' },
      true,
      'm',
      [],
    ],
    [
      'an empty text as success is not a boolean false, so not a failure',
      { success: '', message: 'm' },
      true,
      'm',
      [],
    ],
    [
      'success that is not a boolean is not a failure',
      { success: 'false', message: 'm' },
      true,
      'm',
      [],
    ],
    [
      'no message gives an empty message',
      { status: 200, success: true },
      true,
      '',
      [],
    ],
    [
      'a message that is not a text gives an empty message',
      { success: false, message: 42 },
      false,
      '',
      [],
    ],
    ['an empty result is not a failure', {}, true, '', []],
  ];

  test.each(cases)('%s', (_name, result, succeeded, message, failures) => {
    expect(featureOutcome(result)).toEqual({ succeeded, message, failures });
  });

  test('does not change the result it reads', () => {
    const result = { success: true, message: 'm', failures: ['a'] };
    featureOutcome(result);
    expect(result).toEqual({ success: true, message: 'm', failures: ['a'] });
  });

  test('returns its own failures array, not the one of the result', () => {
    const result = { message: 'm', failures: ['a'] };
    const outcome = featureOutcome(result);
    outcome.failures.push('b');
    expect(result.failures).toEqual(['a']);
  });
});
