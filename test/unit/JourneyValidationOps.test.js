import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

let workingDirectory;
let realm;
let verbose;
const validateJourneys = jest.fn();
const readJourneys = jest.fn();
const printMessage = jest.fn();
const printError = jest.fn();
const createProgressIndicator = jest.fn();
const updateProgressIndicator = jest.fn();
const stopProgressIndicator = jest.fn();

/**
 * What the library does with a result callback: it validates the journeys it is given one after the
 * other and hands the outcome of each to the callback, the findings of the journey (none when it is
 * clean) or the error that says why it could not be validated. `outcomeOf(journeyId)` is that
 * outcome: findings, or an Error to fail the journey.
 */
const validatesJourneys =
  (outcomeOf) => async (journeyIds, _journeysExport, resultCallback) => {
    const all = [];
    for (const journeyId of journeyIds) {
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

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    authn: { journey: { validateJourneys, readJourneys } },
    utils: {
      constants: { DEFAULT_REALM_KEY: '__default__realm__' },
      getFilePath: (file) => path.join(workingDirectory, file),
      getWorkingDirectory: () => workingDirectory,
    },
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

const { missingNodesHint, validateJourneyExports } =
  await import('../../src/ops/JourneyValidationOps');

describe('validateJourneyExports', () => {
  beforeEach(() => {
    realm = undefined;
    verbose = false;
    workingDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'frodo-journey-validation-')
    );
    jest.resetAllMocks();
    validateJourneys.mockImplementation(validatesJourneys(() => []));
    readJourneys.mockResolvedValue([{ _id: 'login' }]);
  });

  afterEach(() => {
    fs.rmSync(workingDirectory, { recursive: true, force: true });
  });

  test('validates tenant journeys and lets warnings pass by default', async () => {
    validateJourneys.mockImplementation(
      validatesJourneys(() => [
        {
          code: 'UNREACHABLE_NODE',
          severity: 'warning',
          journeyId: 'login',
          message: 'Node debug is unreachable',
        },
      ])
    );

    await expect(validateJourneyExports(['login'])).resolves.toBe(true);

    expect(validateJourneys).toHaveBeenCalledWith(
      ['login'],
      undefined,
      expect.any(Function)
    );
    expect(realm).toBe('__default__realm__');
    expect(printMessage).toHaveBeenCalledWith(
      '1 warning in journey login',
      'warn'
    );
    expect(printMessage).toHaveBeenCalledWith(
      '  [UNREACHABLE_NODE] Node debug is unreachable',
      'warn'
    );
  });

  test('fails on warnings in strict mode and on errors in every mode', async () => {
    validateJourneys.mockImplementation(
      validatesJourneys(() => [
        {
          code: 'UNREACHABLE_NODE',
          severity: 'warning',
          journeyId: 'login',
          message: 'Node debug is unreachable',
        },
      ])
    );
    await expect(
      validateJourneyExports(undefined, undefined, true)
    ).resolves.toBe(false);
    expect(printMessage).toHaveBeenCalledWith(
      '1 warning in journey login (strict mode treats warnings as errors)',
      'warn'
    );

    printMessage.mockClear();
    validateJourneys.mockImplementation(
      validatesJourneys(() => [
        {
          code: 'MISSING_ENTRY_NODE',
          severity: 'error',
          journeyId: 'broken',
          message: 'Entry node is missing',
        },
        {
          code: 'UNREACHABLE_NODE',
          severity: 'warning',
          journeyId: 'broken',
          message: 'Debug node is unreachable',
        },
      ])
    );
    await expect(
      validateJourneyExports(undefined, undefined, true)
    ).resolves.toBe(false);
    expect(printMessage).toHaveBeenCalledWith(
      '1 error and 1 warning in journey broken',
      'error'
    );
    expect(printMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('strict mode treats warnings as errors'),
      'error'
    );
  });

  test.each([
    [
      'classic',
      {
        tree: { _id: 'classic', entryNodeId: 'start', nodes: {} },
        nodes: {},
      },
    ],
    [
      'cloud',
      {
        tree: {
          _id: 'cloud',
          entryNodeId: 'page',
          nodes: { page: { connections: { 'inner-outcome': 'inner' } } },
          staticNodes: {},
        },
        nodes: {},
        innerNodes: { inner: { _id: 'inner' } },
      },
    ],
  ])(
    'wraps a single %s journey export for offline validation',
    async (name, journey) => {
      fs.writeFileSync(
        path.join(workingDirectory, `${name}.json`),
        JSON.stringify(journey)
      );

      await expect(
        validateJourneyExports(undefined, `${name}.json`)
      ).resolves.toBe(true);

      expect(validateJourneys).toHaveBeenCalledWith(
        [name],
        {
          trees: { [name]: journey },
        },
        expect.any(Function)
      );
    }
  );

  describe('journeys that name nodes that are not there', () => {
    const missingInner = {
      code: 'MISSING_INNER_NODE',
      severity: 'error',
      journeyId: 'broken',
      message:
        "Page Node 'page' references missing inner node 'inner' (MessageNode)",
    };
    const hints = () =>
      printMessage.mock.calls.filter(([message]) =>
        message.startsWith('These journeys name nodes')
      );

    test('the findings come first, then one line of advice for the tenant, in the words of this command line', async () => {
      validateJourneys.mockImplementation(
        validatesJourneys(() => [
          missingInner,
          {
            ...missingInner,
            message:
              "Page Node 'page' references missing inner node 'other' (MessageNode)",
          },
        ])
      );

      await expect(validateJourneyExports(['broken'])).resolves.toBe(false);

      expect(hints()).toEqual([[missingNodesHint(true), 'info']]);
      expect(hints()[0][0]).toContain("'frodo journey export'");
      expect(hints()[0][0]).toContain("'frodo journey import'");
      const order = printMessage.mock.calls.map(([message]) => message);
      expect(order.indexOf('2 errors in journey broken')).toBeLessThan(
        order.indexOf(missingNodesHint(true))
      );
    });

    test('a node of the tree that is not there gets the same advice', async () => {
      validateJourneys.mockImplementation(
        validatesJourneys(() => [
          {
            ...missingInner,
            code: 'MISSING_NODE_DEFINITION',
            message: "Tree node 'page' has no node definition (PageNode)",
          },
        ])
      );

      await validateJourneyExports(['broken']);

      expect(hints()).toHaveLength(1);
    });

    test('journeys read from an export file are told to export them again', async () => {
      fs.writeFileSync(
        path.join(workingDirectory, 'journeys.json'),
        JSON.stringify({
          trees: { broken: { tree: { _id: 'broken', nodes: {} } } },
        })
      );
      validateJourneys.mockImplementation(
        validatesJourneys(() => [missingInner])
      );

      await validateJourneyExports(['broken'], 'journeys.json');

      expect(hints()).toEqual([[missingNodesHint(false), 'info']]);
      expect(missingNodesHint(false)).not.toContain('frodo ');
    });

    test('other findings get no such advice', async () => {
      validateJourneys.mockImplementation(
        validatesJourneys(() => [
          {
            code: 'MISSING_ENTRY_NODE',
            severity: 'error',
            journeyId: 'broken',
            message: 'Entry node is missing',
          },
          {
            code: 'UNREACHABLE_NODE',
            severity: 'warning',
            journeyId: 'broken',
            message: 'Node is unreachable',
          },
        ])
      );

      await validateJourneyExports(['broken']);

      expect(hints()).toEqual([]);
    });

    test('a journey without findings gets none either', async () => {
      await validateJourneyExports(['login']);

      expect(hints()).toEqual([]);
    });
  });

  test('passes multi-journey export files to the library unchanged', async () => {
    const journeys = {
      trees: {
        classic: { tree: { _id: 'classic', nodes: {} } },
        cloud: { tree: { _id: 'cloud', nodes: {}, staticNodes: {} } },
      },
    };
    fs.writeFileSync(
      path.join(workingDirectory, 'journeys.json'),
      JSON.stringify(journeys)
    );

    await expect(
      validateJourneyExports(['cloud'], 'journeys.json')
    ).resolves.toBe(true);

    expect(validateJourneys).toHaveBeenCalledWith(
      ['cloud'],
      journeys,
      expect.any(Function)
    );
  });

  test('combines journeys from separate export files', async () => {
    const journeys = {
      first: { tree: { _id: 'first' } },
      second: { tree: { _id: 'second' } },
    };
    fs.writeFileSync(
      path.join(workingDirectory, 'first.journey.json'),
      JSON.stringify(journeys.first)
    );
    fs.writeFileSync(
      path.join(workingDirectory, 'second.journey.json'),
      JSON.stringify(journeys.second)
    );

    await expect(
      validateJourneyExports(undefined, undefined, false, '.')
    ).resolves.toBe(true);

    // one call for all journeys: the library reports each journey to the callback, so one that cannot be read drops no finding
    expect(validateJourneys).toHaveBeenCalledTimes(1);
    expect(validateJourneys).toHaveBeenCalledWith(
      ['first', 'second'],
      { trees: journeys },
      expect.any(Function)
    );
  });

  describe('when a journey fails (decision record 0040)', () => {
    const finding = (journeyId, severity = 'error') => ({
      code: severity === 'error' ? 'MISSING_ENTRY_NODE' : 'UNREACHABLE_NODE',
      severity,
      journeyId,
      message: `${severity} of ${journeyId}`,
    });
    const messages = () => printMessage.mock.calls.map(([text]) => text);

    beforeEach(() => {
      readJourneys.mockResolvedValue([
        { _id: 'a' },
        { _id: 'b' },
        { _id: 'c' },
      ]);
    });

    test('a journey that cannot be validated does not drop the findings of the others', async () => {
      validateJourneys.mockImplementation(
        validatesJourneys((journeyId) => {
          if (journeyId === 'a') return new Error('cannot export a');
          return journeyId === 'b' ? [finding('b')] : [];
        })
      );

      await expect(validateJourneyExports()).resolves.toBe(false);

      expect(validateJourneys).toHaveBeenCalledTimes(1);
      expect(validateJourneys.mock.calls[0][0]).toEqual(['a', 'b', 'c']);
      expect(messages()).toContain('  [MISSING_ENTRY_NODE] error of b');
      expect(printError).toHaveBeenCalledTimes(1);
      const summary = messages().find((text) => text.includes('failed'));
      expect(summary).toContain('2 of 3 journeys failed:');
      expect(summary).toContain('- a: cannot export a');
      expect(summary).toContain('- b: 1 error');
      expect(summary).not.toContain('- c');
      expect(messages()).not.toContain('No journey validation findings.');
    });

    test('--allow-failures reports the failed journeys but succeeds', async () => {
      validateJourneys.mockImplementation(
        validatesJourneys((journeyId) => {
          if (journeyId === 'a') return new Error('cannot export a');
          return journeyId === 'b' ? [finding('b')] : [];
        })
      );

      await expect(
        validateJourneyExports(undefined, undefined, false, undefined, true)
      ).resolves.toBe(true);

      const summary = messages().find((text) => text.includes('failed'));
      expect(summary).toContain('2 of 3 journeys failed:');
      expect(summary).toContain('--allow-failures');
    });

    test('a warning fails a journey only in strict mode', async () => {
      validateJourneys.mockImplementation(
        validatesJourneys((journeyId) =>
          journeyId === 'b' ? [finding('b', 'warning')] : []
        )
      );

      await expect(validateJourneyExports()).resolves.toBe(true);
      expect(messages().some((text) => text.includes('failed'))).toBe(false);

      printMessage.mockClear();
      await expect(
        validateJourneyExports(undefined, undefined, true)
      ).resolves.toBe(false);
      const summary = messages().find((text) => text.includes('failed'));
      expect(summary).toContain('1 of 3 journeys failed:');
      expect(summary).toContain('- b: 1 warning');
    });

    test('a clean run prints no summary', async () => {
      await expect(validateJourneyExports()).resolves.toBe(true);
      expect(messages()).toEqual(['No journey validation findings.']);
    });

    test('a failed read of the journeys ends the command, whatever --allow-failures says', async () => {
      readJourneys.mockRejectedValue(new Error('cannot read journeys'));

      await expect(
        validateJourneyExports(undefined, undefined, false, undefined, true)
      ).resolves.toBe(false);

      expect(validateJourneys).not.toHaveBeenCalled();
      expect(printError).toHaveBeenCalledWith(
        expect.any(Error),
        'Error validating journeys'
      );
    });
  });

  test('reports duplicate journey IDs across separate files', async () => {
    const journey = { tree: { _id: 'duplicate' } };
    fs.writeFileSync(
      path.join(workingDirectory, 'first.journey.json'),
      JSON.stringify(journey)
    );
    fs.writeFileSync(
      path.join(workingDirectory, 'second.journey.json'),
      JSON.stringify(journey)
    );

    await expect(
      validateJourneyExports(undefined, undefined, false, '.')
    ).resolves.toBe(false);

    expect(printMessage).toHaveBeenCalledWith(
      expect.stringContaining('Duplicate journey ID "duplicate"'),
      'error'
    );
    expect(printMessage).toHaveBeenCalledWith(
      expect.stringContaining('first.journey.json'),
      'error'
    );
    expect(printMessage).toHaveBeenCalledWith(
      expect.stringContaining('second.journey.json'),
      'error'
    );
    expect(validateJourneys).not.toHaveBeenCalled();
  });
});
