import { jest } from '@jest/globals';

// `journey validate` over many journeys (cli#1378): the journeys are validated in ONE call of the
// library, which reports each journey to a callback as it is done. The findings of a journey are
// printed then, a progress bar on stderr shows how far the run is (only at a terminal), and the run
// ends with one summary by code and one hint for each finding code that has advice. The library
// is a stub here; the words are in JourneyFindingLabels.test.js, the exit codes also in
// JourneyValidationOps.test.js.

const validateJourneys = jest.fn();
const readJourneys = jest.fn();
const printMessage = jest.fn();
const printError = jest.fn();
const createProgressIndicator = jest.fn();
const updateProgressIndicator = jest.fn();
const stopProgressIndicator = jest.fn();
let realm;
let verbose;

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    authn: { journey: { validateJourneys, readJourneys } },
    utils: { constants: { DEFAULT_REALM_KEY: '__default__realm__' } },
  },
  state: {
    getRealm: () => realm,
    getVerbose: () => verbose,
    setRealm: (value) => {
      realm = value;
    },
  },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
}));

const { validateJourneyExports } =
  await import('../../src/ops/JourneyValidationOps');

const finding = (code, severity, journeyId) => ({
  code,
  severity,
  journeyId,
  message: `${code} in ${journeyId}`,
});
const unreachable = (journeyId) =>
  finding('UNREACHABLE_NODE', 'warning', journeyId);
const missingInner = (journeyId) =>
  finding('MISSING_INNER_NODE', 'error', journeyId);

/**
 * The library with a callback: the journeys one after the other, in the order given, each reported
 * to the callback. `outcomeOf(journeyId)` is the findings of the journey, or an Error to fail it.
 * `between(journeyId)` runs before each journey is validated.
 */
const validatesJourneys =
  (outcomeOf, between = () => undefined) =>
  async (journeyIds, _journeysExport, resultCallback) => {
    const all = [];
    for (const journeyId of journeyIds) {
      between(journeyId);
      const outcome = await outcomeOf(journeyId);
      if (outcome instanceof Error) {
        resultCallback?.(outcome);
      } else {
        all.push(...outcome);
        resultCallback?.(undefined, outcome);
      }
    }
    return all;
  };

const messages = () => printMessage.mock.calls.map(([text]) => text);

function withStderrTerminal(isTerminal, test) {
  const original = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
  Object.defineProperty(process.stderr, 'isTTY', {
    value: isTerminal,
    configurable: true,
    writable: true,
  });
  return test().finally(() => {
    if (original) Object.defineProperty(process.stderr, 'isTTY', original);
    else delete process.stderr.isTTY;
  });
}

describe('journey validate over many journeys', () => {
  beforeEach(() => {
    realm = undefined;
    verbose = false;
    jest.resetAllMocks();
    createProgressIndicator.mockReturnValue('bar');
    readJourneys.mockResolvedValue([{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }]);
    validateJourneys.mockImplementation(validatesJourneys(() => []));
  });

  describe('one call of the library', () => {
    test('the journeys of the tenant are listed once and validated in one call, with a callback', async () => {
      await validateJourneyExports();

      expect(readJourneys).toHaveBeenCalledTimes(1);
      expect(validateJourneys).toHaveBeenCalledTimes(1);
      expect(validateJourneys).toHaveBeenCalledWith(
        ['a', 'b', 'c'],
        undefined,
        expect.any(Function)
      );
    });

    test('a journey that the tenant lists twice is validated once, so that each callback has its journey', async () => {
      readJourneys.mockResolvedValue([
        { _id: 'a' },
        { _id: 'a' },
        { _id: 'b' },
      ]);

      await validateJourneyExports();

      expect(validateJourneys.mock.calls[0][0]).toEqual(['a', 'b']);
    });

    test('a tenant without journeys is not asked to validate anything', async () => {
      readJourneys.mockResolvedValue([]);

      await expect(validateJourneyExports()).resolves.toBe(true);

      expect(validateJourneys).not.toHaveBeenCalled();
      expect(messages()).toEqual(['No journey validation findings.']);
    });
  });

  describe('the findings of a journey are printed as soon as it is validated', () => {
    test('before the next journey is validated', async () => {
      const printedBefore = {};
      validateJourneys.mockImplementation(
        validatesJourneys(
          (journeyId) => (journeyId === 'a' ? [unreachable('a')] : []),
          (journeyId) => {
            printedBefore[journeyId] = messages();
          }
        )
      );

      await validateJourneyExports();

      expect(printedBefore.a).toEqual([]);
      expect(printedBefore.b).toEqual([
        '1 warning in journey a',
        '  [UNREACHABLE_NODE] UNREACHABLE_NODE in a',
      ]);
    });

    test('in the order of the journeys, each with its heading and its lines, in the colour of its severity', async () => {
      validateJourneys.mockImplementation(
        validatesJourneys((journeyId) =>
          journeyId === 'a'
            ? [unreachable('a')]
            : journeyId === 'c'
              ? [missingInner('c'), unreachable('c')]
              : []
        )
      );

      await validateJourneyExports();

      expect(printMessage.mock.calls.slice(0, 5)).toEqual([
        ['1 warning in journey a', 'warn'],
        ['  [UNREACHABLE_NODE] UNREACHABLE_NODE in a', 'warn'],
        ['1 error and 1 warning in journey c', 'error'],
        ['  [MISSING_INNER_NODE] MISSING_INNER_NODE in c', 'error'],
        ['  [UNREACHABLE_NODE] UNREACHABLE_NODE in c', 'warn'],
      ]);
    });

    describe('the lines name the nodes of a finding as the editor shows them (cli#1378)', () => {
      const AGE = '295a70ba-4b4b-4c4c-8d8d-000000000002';
      const named = {
        code: 'UNREACHABLE_NODE',
        severity: 'warning',
        journeyId: 'a',
        message: `Tree node '${AGE}' is not reachable from the entry node`,
        nodeId: AGE,
        node: {
          id: AGE,
          displayName: 'Check Age',
          nodeType: 'ScriptedDecisionNode',
          nodeTypeName: 'Scripted Decision',
        },
      };

      test('by name and type, not by id, and a finding the library does not describe as the library words it', async () => {
        const plain = unreachable('a');
        validateJourneys.mockImplementation(
          validatesJourneys((journeyId) =>
            journeyId === 'a' ? [named, plain] : []
          )
        );

        await validateJourneyExports();

        expect(printMessage.mock.calls.slice(0, 3)).toEqual([
          ['2 warnings in journey a', 'warn'],
          [
            '  [UNREACHABLE_NODE] Tree node "Check Age" (Scripted Decision) is not reachable from the entry node',
            'warn',
          ],
          ['  [UNREACHABLE_NODE] UNREACHABLE_NODE in a', 'warn'],
        ]);
      });

      test('with the verbose option every named node gets its full id', async () => {
        verbose = true;
        validateJourneys.mockImplementation(
          validatesJourneys((journeyId) => (journeyId === 'a' ? [named] : []))
        );

        await validateJourneyExports();

        expect(messages()).toContain(
          `  [UNREACHABLE_NODE] Tree node "Check Age" (Scripted Decision, id ${AGE}) is not reachable from the entry node`
        );
      });
    });

    test('in strict mode a journey that has warnings only says that they fail it, whatever the other journeys have', async () => {
      validateJourneys.mockImplementation(
        validatesJourneys((journeyId) =>
          journeyId === 'a'
            ? [missingInner('a')]
            : journeyId === 'b'
              ? [unreachable('b')]
              : []
        )
      );

      await expect(
        validateJourneyExports(undefined, undefined, true)
      ).resolves.toBe(false);

      expect(messages()).toContain('1 error in journey a');
      expect(messages()).toContain(
        '1 warning in journey b (strict mode treats warnings as errors)'
      );
      // the warnings-only journey fails the run in its own right: the other journey's error does not excuse it
      const failed = messages().find((text) => text.includes('failed'));
      expect(failed).toContain('2 of 3 journeys failed:');
      expect(failed).toContain('- a: 1 error');
      expect(failed).toContain('- b: 1 warning');
    });
  });

  describe('the progress bar', () => {
    test('shows each journey done out of all, with the one being checked, when stderr is a terminal', async () => {
      await withStderrTerminal(true, () => validateJourneyExports());

      expect(createProgressIndicator).toHaveBeenCalledTimes(1);
      expect(createProgressIndicator).toHaveBeenCalledWith(
        'determinate',
        3,
        'Validating a'
      );
      const id = 'bar';
      expect(updateProgressIndicator.mock.calls).toEqual([
        [id, 'Validating b', 1],
        [id, 'Validating c', 2],
        [id, '', 3],
      ]);
      expect(stopProgressIndicator).toHaveBeenCalledTimes(1);
      expect(stopProgressIndicator).toHaveBeenCalledWith(id);
    });

    test('advances for a journey that could not be validated too, so that it reaches the end', async () => {
      validateJourneys.mockImplementation(
        validatesJourneys((journeyId) =>
          journeyId === 'b' ? new Error('cannot export b') : []
        )
      );

      await withStderrTerminal(true, () => validateJourneyExports());

      expect(updateProgressIndicator.mock.calls.map((call) => call[2])).toEqual(
        [1, 2, 3]
      );
    });

    test('is stopped when the library fails altogether', async () => {
      validateJourneys.mockRejectedValue(new Error('invalid arguments'));

      await withStderrTerminal(true, () =>
        expect(validateJourneyExports()).resolves.toBe(false)
      );

      expect(stopProgressIndicator).toHaveBeenCalledWith('bar');
    });

    test('is not shown when stderr is not a terminal, so a pipe or a file never gets one', async () => {
      await withStderrTerminal(false, () => validateJourneyExports());

      expect(createProgressIndicator).not.toHaveBeenCalled();
      expect(updateProgressIndicator).not.toHaveBeenCalled();
      expect(stopProgressIndicator).not.toHaveBeenCalled();
    });

    test('is not shown for no journeys', async () => {
      readJourneys.mockResolvedValue([]);

      await withStderrTerminal(true, () => validateJourneyExports());

      expect(createProgressIndicator).not.toHaveBeenCalled();
    });
  });

  describe('the summary', () => {
    const manyFindings = () =>
      validateJourneys.mockImplementation(
        validatesJourneys((journeyId) =>
          journeyId === 'a'
            ? [unreachable('a'), unreachable('a')]
            : journeyId === 'b'
              ? [missingInner('b'), unreachable('b')]
              : []
        )
      );

    test('says how many journeys were checked, how many have findings and how many findings of each code, after the findings', async () => {
      manyFindings();

      await validateJourneyExports();

      const summary = [
        'Checked 3 journeys, 2 with findings: 1 error and 3 warnings.',
        '  MISSING_INNER_NODE: 1 error',
        '  UNREACHABLE_NODE: 3 warnings',
      ].join('\n');
      expect(messages()).toContain(summary);
      expect(messages().indexOf(summary)).toBeGreaterThan(
        messages().indexOf('  [UNREACHABLE_NODE] UNREACHABLE_NODE in b')
      );
    });

    test('counts the journeys that could be validated out of all: one that could not is named in the failure summary, not counted as checked', async () => {
      validateJourneys.mockImplementation(
        validatesJourneys((journeyId) =>
          journeyId === 'a'
            ? new Error('cannot export a')
            : journeyId === 'b'
              ? [unreachable('b')]
              : []
        )
      );

      await validateJourneyExports();

      expect(messages()).toContain(
        'Checked 2 of 3 journeys, 1 with findings: 1 warning.\n  UNREACHABLE_NODE: 1 warning'
      );
    });

    test('names a journey that could not be validated by its place in the list, whichever place it has', async () => {
      validateJourneys.mockImplementation(
        validatesJourneys((journeyId) =>
          journeyId === 'c' ? new Error('cannot export c') : []
        )
      );

      await validateJourneyExports();

      const failed = messages().find((text) => text.includes('failed'));
      expect(failed).toContain('1 of 3 journeys failed:');
      expect(failed).toContain('- c: cannot export c');
      expect(failed).not.toContain('- a');
      // a run whose only problem is a journey that could not be validated is not a run without findings
      expect(messages()).not.toContain('No journey validation findings.');
    });

    test('is not printed for a clean run, which prints what it always did', async () => {
      await validateJourneyExports();

      expect(messages()).toEqual(['No journey validation findings.']);
    });

    test('comes before the hints, and the hints before the summary of the failed journeys', async () => {
      validateJourneys.mockImplementation(
        validatesJourneys((journeyId) =>
          journeyId === 'a'
            ? new Error('cannot export a')
            : journeyId === 'b'
              ? [missingInner('b')]
              : []
        )
      );

      await validateJourneyExports();

      const order = messages();
      const summaryAt = order.findIndex((text) => text.startsWith('Checked '));
      const hintAt = order.findIndex((text) =>
        text.startsWith('These journeys name nodes')
      );
      const failedAt = order.findIndex((text) => text.includes('failed'));
      expect(summaryAt).toBeGreaterThan(-1);
      expect(hintAt).toBeGreaterThan(summaryAt);
      expect(failedAt).toBeGreaterThan(hintAt);
    });
  });

  describe('the hints', () => {
    const hints = () =>
      printMessage.mock.calls.filter(
        ([text]) =>
          text.startsWith('These journeys name nodes') ||
          text.startsWith('Journeys with UNREACHABLE_NODE')
      );

    test('one for each finding code that has advice, however many journeys have it', async () => {
      validateJourneys.mockImplementation(
        validatesJourneys((journeyId) => [
          unreachable(journeyId),
          missingInner(journeyId),
        ])
      );

      await validateJourneyExports();

      expect(hints()).toHaveLength(2);
      expect(hints().every(([, type]) => type === 'info')).toBe(true);
    });

    test('the one for unreachable nodes names the code, and says to repair the entry node first for a journey that has none', async () => {
      validateJourneys.mockImplementation(
        validatesJourneys((journeyId) =>
          journeyId === 'a'
            ? [unreachable('a'), finding('MISSING_ENTRY_NODE', 'error', 'a')]
            : journeyId === 'b'
              ? [unreachable('b')]
              : []
        )
      );

      await validateJourneyExports();

      expect(hints()).toEqual([
        [
          'Journeys with UNREACHABLE_NODE have nodes that cannot be reached from the entry node. Connect them or delete them in the journey editor. In a journey that also has MISSING_ENTRY_NODE, repair the entry node first: until then every node of it is unreachable.',
          'info',
        ],
      ]);
    });

    test('none for findings that have no advice', async () => {
      validateJourneys.mockImplementation(
        validatesJourneys((journeyId) => [
          finding('UNCONNECTED_OUTCOME', 'warning', journeyId),
        ])
      );

      await validateJourneyExports();

      expect(hints()).toEqual([]);
    });
  });
});
