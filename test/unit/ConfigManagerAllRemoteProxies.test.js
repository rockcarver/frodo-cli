/**
 * Unit tests for the remote proxies step of `config-manager pull all` and
 * `pull all-static` (src/configManagerOps/FrConfigAllOps.ts), without a tenant.
 * Every module the lists import is replaced by spies (the real ones pull in all
 * of frodo-lib, whose bundled ESM cannot load under jest's ESM runtime), so what
 * is left to check is which steps each deployment type runs. The e2e snapshots
 * of the two commands cannot guard this: a step that is removed leaves its
 * snapshots obsolete, which does not fail a run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';

const sourceFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/configManagerOps/FrConfigAllOps.ts'
);

let deploymentType = 'cloud';

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: {
      constants: {
        CLASSIC_DEPLOYMENT_TYPE_KEY: 'classic',
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
      },
    },
  },
  state: { getDeploymentType: () => deploymentType },
}));

// every relative import of the module under test becomes a set of spies
const spies = {};
const imports = [
  ...fs
    .readFileSync(sourceFile, 'utf8')
    .matchAll(/import \{([^}]+)\} from '(\.[^']+)';/g),
];
for (const [, names, from] of imports) {
  // the run tracker is real: what the tests below check is how it ends a run
  if (from.endsWith('/utils/OperationRun')) continue;
  const exports = {};
  for (const name of names.split(',').map((n) => n.trim())) {
    exports[name] = jest.fn(async () => true);
    spies[name] = exports[name];
  }
  if (from.endsWith('/utils/Console')) {
    // the real OperationRun prints its summary through the console
    exports.printMessage = jest.fn();
    spies.printMessage = exports.printMessage;
  }
  jest.unstable_mockModule(
    path.resolve(path.dirname(sourceFile), from),
    () => exports
  );
}
// the file steps are built when the lists are, so they have to return a step
spies.configFileStep.mockImplementation(() => async () => true);

const { configManagerExportAllStatic, configManagerExportAllWithConfigFolder } =
  await import('../../src/configManagerOps/FrConfigAllOps.ts');

beforeEach(() => {
  for (const spy of Object.values(spies)) spy.mockClear();
});

const commands = [
  [
    'pull all',
    (options = {}) => configManagerExportAllWithConfigFolder(options),
  ],
  ['pull all-static', (options = {}) => configManagerExportAllStatic(options)],
];

describe.each(commands)('%s', (_name, run) => {
  test('a cloud tenant exports its remote proxies, saying nothing when there are none', async () => {
    deploymentType = 'cloud';

    expect(await run()).toBe(true);

    expect(spies.configManagerExportRemoteProxies).toHaveBeenCalledTimes(1);
    expect(spies.configManagerExportRemoteProxies).toHaveBeenCalledWith(
      undefined,
      true
    );
  });

  test.each(['forgeops', 'classic'])(
    'a %s deployment has no remote proxies to export',
    async (type) => {
      deploymentType = type;

      expect(await run()).toBe(true);

      expect(spies.configManagerExportRemoteProxies).not.toHaveBeenCalled();
    }
  );
});

describe.each(commands)('%s when a step fails', (_name, run) => {
  beforeEach(() => {
    deploymentType = 'cloud';
    spies.printMessage.mockClear();
    spies.printError.mockClear();
  });
  const summary = () =>
    spies.printMessage.mock.calls.map(([text]) => text).join('\n');

  test('runs every other step, names the failed one in one summary and fails the command', async () => {
    spies.configManagerExportJourneys.mockResolvedValueOnce(false);

    expect(await run()).toBe(false);

    // the steps after the failed one still ran
    expect(spies.configManagerExportScripts).toHaveBeenCalledTimes(1);
    expect(spies.configManagerExportThemes).toHaveBeenCalledTimes(1);
    expect(spies.printMessage).toHaveBeenCalledTimes(1);
    expect(spies.printMessage.mock.calls[0][1]).toBe('error');
    expect(summary()).toMatch(/^1 of \d+ steps failed:\n {2}- journeys$/);
  });

  test('counts a step that throws as failed, prints the error and goes on', async () => {
    const error = new Error('boom');
    spies.configManagerExportScripts.mockRejectedValueOnce(error);

    expect(await run()).toBe(false);

    expect(spies.printError).toHaveBeenCalledWith(error);
    expect(spies.configManagerExportThemes).toHaveBeenCalledTimes(1);
    expect(summary()).toContain('- scripts: boom');
  });

  test('names every failed step', async () => {
    spies.configManagerExportJourneys.mockResolvedValueOnce(false);
    spies.configManagerExportThemes.mockResolvedValueOnce(false);

    expect(await run()).toBe(false);

    expect(summary()).toMatch(/^2 of \d+ steps failed:/);
    expect(summary()).toContain('- journeys');
    expect(summary()).toContain('- themes');
  });

  test('--allow-failures keeps the exit code at 0, still printing the summary as a warning', async () => {
    spies.configManagerExportJourneys.mockResolvedValueOnce(false);

    expect(await run({ allowFailures: true })).toBe(true);

    expect(spies.printMessage.mock.calls[0][1]).toBe('warn');
    expect(summary()).toContain('- journeys');
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints nothing extra when every step succeeds', async () => {
    expect(await run()).toBe(true);
    expect(spies.printMessage).not.toHaveBeenCalled();
  });
});
