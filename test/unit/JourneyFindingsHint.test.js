import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * src/ops/JourneyFindingsHint.ts: the library prints what it found while it
 * exports journeys and never names an option of the command line. The command
 * says where the details are, and checks for findings itself, offline, on the
 * export it holds. A validation that fails never fails the export.
 */

let verbose;
const validateJourneys = jest.fn();
const printMessage = jest.fn();
const debugMessage = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: { authn: { journey: { validateJourneys } } },
  state: { getVerbose: () => verbose },
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  debugMessage,
  printMessage,
}));

const {
  JOURNEY_FINDINGS_HINT,
  printJourneyFindingsHint,
  wantsJourneyFindingsHint,
} = await import('../../src/ops/JourneyFindingsHint');

const EXPORT = { trees: { login: { tree: { _id: 'login' } } } };
const FINDING = {
  journeyId: 'login',
  code: 'UNREACHABLE_NODE',
  severity: 'warning',
  message: 'Tree node x is not reachable from the entry node',
};

beforeEach(() => {
  verbose = false;
  validateJourneys.mockReset().mockResolvedValue([]);
  printMessage.mockReset();
  debugMessage.mockReset();
});

describe('wantsJourneyFindingsHint', () => {
  test('is true when the export has findings and the output is not verbose', async () => {
    validateJourneys.mockResolvedValue([FINDING]);

    expect(await wantsJourneyFindingsHint(EXPORT)).toBe(true);
  });

  test('validates the export it was given, offline: no journey ids, the export, no callback', async () => {
    validateJourneys.mockResolvedValue([FINDING]);

    await wantsJourneyFindingsHint(EXPORT);

    expect(validateJourneys).toHaveBeenCalledTimes(1);
    expect(validateJourneys.mock.calls[0]).toEqual([undefined, EXPORT]);
  });

  test('is false when the export has no findings', async () => {
    expect(await wantsJourneyFindingsHint(EXPORT)).toBe(false);
  });

  test('is false when the output is verbose, which lists the findings already', async () => {
    verbose = true;
    validateJourneys.mockResolvedValue([FINDING]);

    expect(await wantsJourneyFindingsHint(EXPORT)).toBe(false);
    expect(validateJourneys).not.toHaveBeenCalled();
  });

  test('is false, and does not throw, when the validation throws; the debug output says why', async () => {
    validateJourneys.mockRejectedValue(new Error('journeysExport is invalid'));

    expect(await wantsJourneyFindingsHint(EXPORT)).toBe(false);
    expect(debugMessage).toHaveBeenCalledTimes(1);
    expect(debugMessage.mock.calls[0][0]).toContain(
      'journeysExport is invalid'
    );
    expect(printMessage).not.toHaveBeenCalled();
  });

  test('is false when the validation answers nothing', async () => {
    validateJourneys.mockResolvedValue(undefined);

    expect(await wantsJourneyFindingsHint(EXPORT)).toBe(false);
  });
});

describe('printJourneyFindingsHint', () => {
  test('prints one line that names the option of this command line', () => {
    printJourneyFindingsHint();

    expect(printMessage).toHaveBeenCalledTimes(1);
    expect(printMessage).toHaveBeenCalledWith(JOURNEY_FINDINGS_HINT, 'info');
    expect(JOURNEY_FINDINGS_HINT).toBe(
      'Run with --verbose to list the validation findings of each journey.'
    );
  });
});
