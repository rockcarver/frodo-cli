import { describe, expect, test } from '@jest/globals';
import {
  CONFIGURATION_ALREADY_IN_TENANT_ADVICE,
  featureAdvice,
} from '../../src/ops/FeatureAdvice';

/**
 * `featureAdvice` (frodo-cli#1213) gives one line of advice for the failures of
 * a validation, and only when every failure says that the configuration is in
 * the tenant already, in one of the wordings a real tenant uses: `is already
 * present`, `must not already exist` or `value already present`. Anything else
 * (one other failure, an entry that is not a text, no failures) gives none. It
 * is a pure function: no library, no terminal.
 */
describe('featureAdvice', () => {
  const ADVICE =
    'All failures say that the configuration is already in the tenant: the feature is installed, or its content came with the tenant. Installing it again cannot work.';
  const PRESENT = 'config/managed: /objects/3/schema: is already present';
  const MUST_NOT_EXIST =
    'config/repo.ds: /resourceMapping/explicitMapping/managed/alpha_aiagent: must not already exist';
  const VALUE_PRESENT =
    'config/managed: /objects/-: value already present at /objects/14';
  const OTHER = 'config/managed: /objects/-: value does not match the schema';

  test('the text of the advice', () => {
    expect(CONFIGURATION_ALREADY_IN_TENANT_ADVICE).toBe(ADVICE);
  });

  const cases = [
    // [name, result, advice?]
    ['one failure: is already present', { failures: [PRESENT] }, true],
    [
      'one failure: must not already exist',
      { failures: [MUST_NOT_EXIST] },
      true,
    ],
    ['one failure: value already present', { failures: [VALUE_PRESENT] }, true],
    [
      'the three wordings together',
      { failures: [PRESENT, MUST_NOT_EXIST, VALUE_PRESENT] },
      true,
    ],
    [
      'a result of the pinned library or of a normalized one: other fields do not matter',
      { success: false, message: 'm', failures: [MUST_NOT_EXIST, PRESENT] },
      true,
    ],
    [
      'the wording in the middle of a longer failure',
      { failures: ['x: y is already present in z'] },
      true,
    ],
    ['one failure that says something else', { failures: [OTHER] }, false],
    [
      'one other failure among matching ones (first)',
      { failures: [OTHER, PRESENT, MUST_NOT_EXIST] },
      false,
    ],
    [
      'one other failure among matching ones (middle)',
      { failures: [PRESENT, OTHER, MUST_NOT_EXIST] },
      false,
    ],
    [
      'one other failure among matching ones (last)',
      { failures: [PRESENT, MUST_NOT_EXIST, OTHER] },
      false,
    ],
    ['no failures', { failures: [] }, false],
    ['no failures field', { success: false, message: 'm' }, false],
    ['an empty result', {}, false],
    ['failures that is a text', { failures: PRESENT }, false],
    ['failures that is an object', { failures: { 0: PRESENT } }, false],
    ['failures that is null', { failures: null }, false],
    [
      'an entry that is not a text among matching ones',
      { failures: [PRESENT, { reason: 'is already present' }] },
      false,
    ],
    [
      'only entries that are not a text',
      { failures: [{ reason: 'must not already exist' }, 7, null] },
      false,
    ],
    [
      'a wording in another case',
      { failures: ['config/managed: Is Already Present'] },
      false,
    ],
    [
      'a similar wording that is not one of the three',
      { failures: ['config/managed: /objects/3: already exists'] },
      false,
    ],
    [
      'the wording in the message, not in a failure',
      { message: 'Validate complete. is already present', failures: [OTHER] },
      false,
    ],
  ];

  test.each(cases)('%s', (_name, result, advised) => {
    expect(featureAdvice(result)).toBe(advised ? ADVICE : undefined);
  });

  test('does not change the result it reads', () => {
    const result = { failures: [PRESENT] };
    featureAdvice(result);
    expect(result).toEqual({ failures: [PRESENT] });
  });
});
