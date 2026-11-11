/**
 * Unit tests for the step `cimd-profiles` of `config-manager pull all` and the
 * absence of it from `pull all-static` (src/configManagerOps/FrConfigAllOps.ts,
 * frodo-cli#1250), without a tenant. CIMD profiles are dynamic configuration for
 * now: they are in `pull all` on every deployment type (the step says nothing where
 * the deployment or the realm does not offer them) and not in `pull all-static`.
 * Every module the lists import is replaced by spies (the real ones pull in all of
 * frodo-lib, whose bundled ESM cannot load under jest's ESM runtime), so what is
 * left to check is which steps each deployment type runs and with what. The run
 * tracker is real.
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
      getWorkingDirectory: () => '/work',
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
// the config folder is usable, and no step reads a file from it
spies.configFolderProblem.mockImplementation(() => undefined);
spies.configFileOf.mockImplementation(() => undefined);

const {
  configManagerExportAllStatic,
  configManagerExportAllWithConfigFolder,
  deploymentMapAll,
  deploymentMapAllStatic,
} = await import('../../src/configManagerOps/FrConfigAllOps.ts');

const DEPLOYMENTS = ['cloud', 'forgeops', 'classic'];

beforeEach(() => {
  for (const spy of Object.values(spies)) spy.mockClear();
  // a config folder that has the file hands its path on, one that has not gives null
  spies.existingConfigFile.mockImplementation((folder, file) =>
    folder && !folder.startsWith('/without') ? `${folder}/${file}` : null
  );
});

describe.each(DEPLOYMENTS)('pull all on a %s deployment', (deployment) => {
  beforeEach(() => {
    deploymentType = deployment;
  });

  test('runs the step cimd-profiles once, quietly, without a name and without the allow-failures flag of the exporter', async () => {
    expect(await configManagerExportAllWithConfigFolder({})).toBe(true);

    expect(spies.configManagerExportCIMDProfiles).toHaveBeenCalledTimes(1);
    expect(spies.configManagerExportCIMDProfiles).toHaveBeenCalledWith(
      undefined,
      undefined,
      true,
      false,
      null
    );
  });

  test('hands the optional overrides file of the config folder to the step when the file is there', async () => {
    expect(
      await configManagerExportAllWithConfigFolder({ configFolder: '/cfg' })
    ).toBe(true);

    expect(spies.configManagerExportCIMDProfiles).toHaveBeenCalledWith(
      undefined,
      undefined,
      true,
      false,
      '/cfg/cimd-profiles.json'
    );
  });

  test('hands null when the config folder has no such file', async () => {
    await configManagerExportAllWithConfigFolder({
      configFolder: '/without-file',
    });

    expect(spies.configManagerExportCIMDProfiles).toHaveBeenCalledWith(
      undefined,
      undefined,
      true,
      false,
      null
    );
  });

  test('hands the realm that was given on', async () => {
    await configManagerExportAllWithConfigFolder({ realm: 'alpha' });

    expect(spies.configManagerExportCIMDProfiles).toHaveBeenCalledWith(
      undefined,
      'alpha',
      true,
      false,
      null
    );
  });

  test('is a step of its own in the list, under the name of the pull command', () => {
    expect(
      deploymentMapAll[deployment].filter(
        ({ name }) => name === 'cimd-profiles'
      )
    ).toHaveLength(1);
  });

  test('a step that answers false is named in the summary, the steps after it still run and --allow-failures keeps the exit code at 0', async () => {
    spies.configManagerExportCIMDProfiles.mockResolvedValueOnce(false);

    expect(await configManagerExportAllWithConfigFolder({})).toBe(false);

    const summaries = spies.printMessage.mock.calls.filter(([text]) =>
      /steps? failed/.test(text)
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0][0]).toMatch(/- cimd-profiles$/m);
    // the steps after it ran (the last step of each list)
    expect(spies.configManagerExportScripts).toHaveBeenCalledTimes(1);

    spies.printMessage.mockClear();
    spies.configManagerExportCIMDProfiles.mockResolvedValueOnce(false);
    expect(
      await configManagerExportAllWithConfigFolder({ allowFailures: true })
    ).toBe(true);
    const [kept] = spies.printMessage.mock.calls
      .map(([text]) => text)
      .filter((text) => /steps? failed/.test(text));
    expect(kept).toContain('- cimd-profiles');
    expect(kept).toContain('The exit code stays 0');
  });

  test('a step that throws is counted as failed and the next steps run', async () => {
    spies.configManagerExportCIMDProfiles.mockRejectedValueOnce(
      new Error('boom')
    );

    expect(await configManagerExportAllWithConfigFolder({})).toBe(false);

    expect(spies.printError).toHaveBeenCalled();
    expect(spies.configManagerExportScripts).toHaveBeenCalledTimes(1);
    expect(
      spies.printMessage.mock.calls.map(([text]) => text).join('\n')
    ).toContain('- cimd-profiles: boom');
  });
});

describe.each(DEPLOYMENTS)(
  'pull all-static on a %s deployment',
  (deployment) => {
    beforeEach(() => {
      deploymentType = deployment;
    });

    test('does not run the step cimd-profiles: CIMD profiles are dynamic configuration', async () => {
      expect(await configManagerExportAllStatic({ realm: 'alpha' })).toBe(true);

      expect(spies.configManagerExportCIMDProfiles).not.toHaveBeenCalled();
      expect(
        deploymentMapAllStatic[deployment].map(({ name }) => name)
      ).not.toContain('cimd-profiles');
    });
  }
);
