/**
 * Unit tests for the remote proxies step of `config-manager pull all` and
 * `pull all-static` (src/configManagerOps/FrConfigAllOps.ts), without a tenant.
 * Every module the lists import is replaced by spies (the real ones pull in all
 * of frodo-lib, whose bundled ESM cannot load under jest's ESM runtime), so what
 * is left to check is which steps each deployment type runs. The e2e snapshots
 * of the two commands cannot guard this: a step that is removed leaves its
 * snapshots obsolete, which does not fail a run.
 */
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const exports = {};
  for (const name of names.split(',').map((n) => n.trim())) {
    exports[name] = jest.fn(async () => true);
    spies[name] = exports[name];
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

describe.each([
  ['pull all', () => configManagerExportAllWithConfigFolder({})],
  ['pull all-static', () => configManagerExportAllStatic({})],
])('%s', (_name, run) => {
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
