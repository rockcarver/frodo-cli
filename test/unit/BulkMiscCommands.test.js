import { jest } from '@jest/globals';
import { Command } from 'commander';

/**
 * `idm remote-proxy setup`, `idm remote-proxy teardown`, `mapping rename`,
 * `promote`, `journey describe`, `journey prune` and `journey validate` as
 * record 0040 asks of a command that runs several operations: each one adds the
 * shared `--allow-failures` option (`.multiOp()`), hands its value to the ops
 * function, and exits 1 when the ops function reports a failure or when the
 * login fails (a failed login used to leave the exit code at 0 in `promote`
 * and `journey describe`). `esv secret version prune` is covered by
 * EsvSecretVersionPruneFlow.test.js. What the ops functions do is covered by
 * RemoteProxyWorkflowOps.test.js, MappingRenameFailures.test.js,
 * PromoteFailures.test.js, JourneyDescribePruneFailures.test.js and
 * JourneyValidationOps.test.js.
 */

const getTokens = jest.fn();
const confirm = jest.fn();
const checkSetupAllowed = jest.fn();
const checkTeardownAllowed = jest.fn();
const setupRemoteProxy = jest.fn();
const teardownRemoteProxy = jest.fn();
const renameMapping = jest.fn();
const renameMappings = jest.fn();
const compareExportToDirectory = jest.fn();
const describeJourney = jest.fn();
const describeJourneyMd = jest.fn();
const describeJourneys = jest.fn();
const pruneOrphanedNodes = jest.fn();
const validateJourneyExports = jest.fn();
const printMessage = jest.fn();
const verboseMessage = jest.fn();

jest.unstable_mockModule('@inquirer/confirm', () => ({ default: confirm }));
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    utils: {
      constants: {
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
      },
      saveTextToFile: jest.fn(),
    },
    authn: { journey: { createFileParamTreeExportResolver: jest.fn() } },
  },
  state: {
    getHost: () => 'https://openam-matrix.example.com/am',
    getRealm: () => 'alpha',
    setOutputFile: jest.fn(),
    setAmVersion: jest.fn(),
  },
}));
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(...args);
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
    }

    handleDefaultArgsAndOpts() {}
    requireOneOf() {
      return this;
    }
    multiOp() {
      this.multiOpCalled = true;
      return this;
    }
  },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/ops/RemoteProxyWorkflowOps', () => ({
  checkSetupAllowed,
  checkTeardownAllowed,
  setupRemoteProxy,
  teardownRemoteProxy,
  DEFAULT_TIMEOUT_SECONDS: 600,
  DEFAULT_TEARDOWN_TIMEOUT_SECONDS: 300,
}));
jest.unstable_mockModule('../../src/ops/MappingOps', () => ({
  renameMapping,
  renameMappings,
}));
jest.unstable_mockModule('../../src/ops/PromoteOps', () => ({
  compareExportToDirectory,
}));
jest.unstable_mockModule('../../src/ops/JourneyOps', () => ({
  describeJourney,
  describeJourneyMd,
  describeJourneys,
  pruneOrphanedNodes,
}));
jest.unstable_mockModule('../../src/ops/JourneyValidationOps', () => ({
  validateJourneyExports,
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text, positive: (text) => text },
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  printError: jest.fn(),
  verboseMessage,
}));
jest.unstable_mockModule('../../src/utils/Console.js', () => ({
  printMessage,
  printError: jest.fn(),
  verboseMessage,
}));

const { default: setupRemoteProxySetup } =
  await import('../../src/cli/idm/idm-remote-proxy-setup');
const { default: setupRemoteProxyTeardown } =
  await import('../../src/cli/idm/idm-remote-proxy-teardown');
const { default: setupMappingRename } =
  await import('../../src/cli/mapping/mapping-rename');
const { default: setupPromote } = await import('../../src/cli/promote/promote');
const { default: setupJourneyDescribe } =
  await import('../../src/cli/journey/journey-describe');
const { default: setupJourneyPrune } =
  await import('../../src/cli/journey/journey-prune');
const { default: setupJourneyValidate } =
  await import('../../src/cli/journey/journey-validate');

/** Runs the action of the command as commander does, with the given options. */
async function invoke(program, options) {
  process.exitCode = 0;
  for (const [key, value] of Object.entries(options)) {
    program.setOptionValue(key, value);
  }
  return program._actionHandler.call(program, [
    undefined,
    'alpha',
    undefined,
    undefined,
  ]);
}

const allOps = [
  checkSetupAllowed,
  checkTeardownAllowed,
  setupRemoteProxy,
  teardownRemoteProxy,
  renameMapping,
  renameMappings,
  compareExportToDirectory,
  describeJourney,
  describeJourneyMd,
  describeJourneys,
  pruneOrphanedNodes,
  validateJourneyExports,
];

describe('commands that run several operations', () => {
  let exitCodeBefore;

  beforeEach(() => {
    jest.clearAllMocks();
    exitCodeBefore = process.exitCode;
    getTokens.mockResolvedValue(true);
    for (const op of allOps) op.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  test.each([
    ['idm remote-proxy setup', setupRemoteProxySetup],
    ['idm remote-proxy teardown', setupRemoteProxyTeardown],
    ['mapping rename', setupMappingRename],
    ['promote', setupPromote],
    ['journey describe', setupJourneyDescribe],
    ['journey prune', setupJourneyPrune],
    ['journey validate', setupJourneyValidate],
  ])('%s adds the shared --allow-failures option', (_, setup) => {
    expect(setup().multiOpCalled).toBe(true);
  });

  describe('idm remote-proxy setup', () => {
    const options = { target: 'zion', yes: true, timeout: '600' };

    test.each([true, undefined])(
      'hands the value of --allow-failures (%s) to the ops function',
      async (allowFailures) => {
        await invoke(setupRemoteProxySetup(), { ...options, allowFailures });

        expect(setupRemoteProxy.mock.calls).toHaveLength(1);
        expect(setupRemoteProxy.mock.calls[0][0].allowFailures).toBe(
          allowFailures
        );
        expect(process.exitCode).toBe(0);
      }
    );

    test('exits 1 when the ops function reports a failure', async () => {
      setupRemoteProxy.mockResolvedValue(false);

      await invoke(setupRemoteProxySetup(), options);

      expect(process.exitCode).toBe(1);
    });

    test('exits 1 and does nothing when the login fails', async () => {
      getTokens.mockResolvedValue(false);

      await invoke(setupRemoteProxySetup(), options);

      expect(setupRemoteProxy.mock.calls).toHaveLength(0);
      expect(process.exitCode).toBe(1);
    });
  });

  describe('idm remote-proxy teardown', () => {
    const options = { proxyId: 'zion', yes: true, timeout: '300' };

    test.each([true, undefined])(
      'hands the value of --allow-failures (%s) to the ops function',
      async (allowFailures) => {
        await invoke(setupRemoteProxyTeardown(), { ...options, allowFailures });

        expect(teardownRemoteProxy.mock.calls).toHaveLength(1);
        expect(teardownRemoteProxy.mock.calls[0][0].allowFailures).toBe(
          allowFailures
        );
        expect(process.exitCode).toBe(0);
      }
    );

    test('exits 1 when the ops function reports a failure', async () => {
      teardownRemoteProxy.mockResolvedValue(false);

      await invoke(setupRemoteProxyTeardown(), options);

      expect(process.exitCode).toBe(1);
    });

    test('exits 1 and does nothing when the login fails', async () => {
      getTokens.mockResolvedValue(false);

      await invoke(setupRemoteProxyTeardown(), options);

      expect(teardownRemoteProxy.mock.calls).toHaveLength(0);
      expect(process.exitCode).toBe(1);
    });
  });

  describe('mapping rename', () => {
    test.each([true, undefined])(
      '-a hands the value of --allow-failures (%s) to the ops function',
      async (allowFailures) => {
        await invoke(setupMappingRename(), {
          all: true,
          legacy: true,
          allowFailures,
        });

        expect(renameMappings.mock.calls).toEqual([[true, allowFailures]]);
        expect(process.exitCode).toBe(0);
      }
    );

    test('-i renames one mapping, which is one operation', async () => {
      await invoke(setupMappingRename(), { mappingId: 'sync/a' });

      expect(renameMapping.mock.calls).toEqual([['sync/a', undefined]]);
      expect(renameMappings.mock.calls).toHaveLength(0);
    });

    test.each([
      ['-a', { all: true }, renameMappings],
      ['-i', { mappingId: 'sync/a' }, renameMapping],
    ])(
      'exits 1 when the ops function of %s reports a failure',
      async (_, options, fn) => {
        fn.mockResolvedValue(false);

        await invoke(setupMappingRename(), options);

        expect(process.exitCode).toBe(1);
      }
    );

    test('exits 1 and renames nothing when the login fails', async () => {
      getTokens.mockResolvedValue(false);

      await invoke(setupMappingRename(), { all: true });

      expect(renameMappings.mock.calls).toHaveLength(0);
      expect(process.exitCode).toBe(1);
    });
  });

  describe('promote', () => {
    const options = { masterDir: 'master', frodoExportDir: 'current' };

    test.each([true, undefined])(
      'hands the value of --allow-failures (%s) to the ops function',
      async (allowFailures) => {
        await invoke(setupPromote(), { ...options, allowFailures });

        expect(compareExportToDirectory.mock.calls).toHaveLength(1);
        const args = compareExportToDirectory.mock.calls[0];
        expect(args.slice(0, 2)).toEqual(['master', 'current']);
        expect(args[args.length - 1]).toBe(allowFailures);
        expect(process.exitCode).toBe(0);
      }
    );

    test('exits 1 when the ops function reports a failure', async () => {
      compareExportToDirectory.mockResolvedValue(false);

      await invoke(setupPromote(), options);

      expect(process.exitCode).toBe(1);
    });

    test('exits 1 and compares nothing when the login fails', async () => {
      getTokens.mockResolvedValue(false);

      await invoke(setupPromote(), options);

      expect(compareExportToDirectory.mock.calls).toHaveLength(0);
      expect(process.exitCode).toBe(1);
    });

    test.each([
      ['the master directory', { frodoExportDir: 'current' }],
      ['the export directory', { masterDir: 'master' }],
      ['both directories', {}],
    ])(
      'says what is missing and exits 1 without logging in when %s is not named',
      async (_, named) => {
        await invoke(setupPromote(), named);

        expect(printMessage.mock.calls).toHaveLength(1);
        expect(printMessage.mock.calls[0][0]).toContain('master dir (-M)');
        expect(printMessage.mock.calls[0][1]).toBe('error');
        expect(getTokens.mock.calls).toHaveLength(0);
        expect(compareExportToDirectory.mock.calls).toHaveLength(0);
        expect(process.exitCode).toBe(1);
      }
    );
  });

  describe('journey describe', () => {
    test.each([true, undefined])(
      'hands the value of --allow-failures (%s) and the options to the ops function',
      async (allowFailures) => {
        await invoke(setupJourneyDescribe(), {
          journeyId: 'Login',
          markdown: true,
          outputFile: 'out.md',
          overrideVersion: '7.2.0',
          allowFailures,
        });

        expect(describeJourneys.mock.calls).toEqual([
          [
            {
              journeyId: 'Login',
              markdown: true,
              outputFile: 'out.md',
              overrideVersion: '7.2.0',
            },
            allowFailures,
          ],
        ]);
        expect(process.exitCode).toBe(0);
      }
    );

    test('exits 1 when the ops function reports a failure', async () => {
      describeJourneys.mockResolvedValue(false);

      await invoke(setupJourneyDescribe(), {});

      expect(process.exitCode).toBe(1);
    });

    test('exits 1 and describes nothing when the login fails', async () => {
      getTokens.mockResolvedValue(false);

      await invoke(setupJourneyDescribe(), {});

      expect(describeJourneys.mock.calls).toHaveLength(0);
      expect(process.exitCode).toBe(1);
    });
  });

  describe('journey prune', () => {
    test.each([true, undefined])(
      'hands the value of --allow-failures (%s) to the ops function',
      async (allowFailures) => {
        await invoke(setupJourneyPrune(), { allowFailures });

        expect(pruneOrphanedNodes.mock.calls).toHaveLength(1);
        expect(pruneOrphanedNodes.mock.calls[0][1]).toBe(allowFailures);
        expect(process.exitCode).toBe(0);
      }
    );

    test('the question defaults to no, and the answer is the one of the person', async () => {
      confirm.mockResolvedValue(false);
      await invoke(setupJourneyPrune(), {});

      const ask = pruneOrphanedNodes.mock.calls[0][0];
      expect(await ask()).toBe(false);
      expect(confirm.mock.calls).toHaveLength(1);
      expect(confirm.mock.calls[0][0].default).toBe(false);
      expect(confirm.mock.calls[0][0].message).toContain('permanently delete');
    });

    test('exits 1 when the ops function reports a failure', async () => {
      pruneOrphanedNodes.mockResolvedValue(false);

      await invoke(setupJourneyPrune(), {});

      expect(process.exitCode).toBe(1);
    });

    test('exits 1 and prunes nothing when the login fails', async () => {
      getTokens.mockResolvedValue(false);

      await invoke(setupJourneyPrune(), {});

      expect(pruneOrphanedNodes.mock.calls).toHaveLength(0);
      expect(process.exitCode).toBe(1);
    });
  });

  describe('journey validate', () => {
    test.each([true, undefined])(
      'hands the value of --allow-failures (%s) to the ops function',
      async (allowFailures) => {
        await invoke(setupJourneyValidate(), {
          journeyId: 'Login',
          strict: true,
          allowFailures,
        });

        expect(validateJourneyExports.mock.calls).toEqual([
          [['Login'], undefined, true, undefined, allowFailures],
        ]);
        expect(process.exitCode).toBe(0);
      }
    );

    test('exits 1 when the ops function reports a failure', async () => {
      validateJourneyExports.mockResolvedValue(false);

      await invoke(setupJourneyValidate(), { all: true });

      expect(process.exitCode).toBe(1);
    });

    test('exits 1 and validates nothing when the login fails', async () => {
      getTokens.mockResolvedValue(false);

      await invoke(setupJourneyValidate(), { all: true });

      expect(validateJourneyExports.mock.calls).toHaveLength(0);
      expect(process.exitCode).toBe(1);
    });

    test('validates a file without logging in', async () => {
      await invoke(setupJourneyValidate(), { all: true, file: 'all.json' });

      expect(getTokens.mock.calls).toHaveLength(0);
      expect(validateJourneyExports.mock.calls).toHaveLength(1);
    });
  });
});
