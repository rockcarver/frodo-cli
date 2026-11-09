import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

/**
 * `config-manager pull all` decides the layout of the tree once, before its first
 * step, and hands the decision to the four standalone kinds that it concerns
 * (decision record 0042, slice S3 of frodo-cli#1101): in a new tree the marker is
 * written only by the last step, `applications`, so the earlier steps cannot read
 * it. `pull all-static` has no `applications` step and decides nothing: its steps
 * read the marker of the tree.
 *
 * The four exporters are fakes that record how they are called; everything else a
 * step touches is a deep fake.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const src = (file) => path.resolve(root, 'src', file);

let tmp;

const deep = () =>
  new Proxy(function () {}, {
    get: (_target, prop) => {
      if (prop === 'then') return undefined;
      if (prop === Symbol.toPrimitive) return () => '';
      return deep();
    },
    apply: () => deep(),
  });

jest.unstable_mockModule('@rockcarver/frodo-lib', () => {
  const frodo = deep();
  const constants = {
    CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
    FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
    CLASSIC_DEPLOYMENT_TYPE_KEY: 'classic',
    DEFAULT_REALM_KEY: '__default__realm__',
  };
  return {
    FrodoError: class FrodoError extends Error {},
    state: {
      getDeploymentType: () => 'cloud',
      getRealm: () => 'alpha',
      setRealm: () => undefined,
    },
    frodo: new Proxy(frodo, {
      get: (target, prop) => {
        if (prop === 'utils') {
          return new Proxy(target.utils, {
            get: (utils, key) =>
              key === 'constants'
                ? constants
                : key === 'getWorkingDirectory'
                  ? () => tmp
                  : utils[key],
          });
        }
        return target[prop];
      },
    }),
  };
});

jest.unstable_mockModule(src('utils/SettingsStore'), () => ({
  CONFIG_MANAGER_APPLICATION_LAYOUTS: ['folders', 'kind-paths'],
  getConfigManagerApplicationLayout: () => 'folders',
}));

const calls = {
  oauth2: jest.fn(async () => true),
  saml: jest.fn(async () => true),
  connectors: jest.fn(async () => true),
  mappings: jest.fn(async () => true),
  applications: jest.fn(async () => true),
};
jest.unstable_mockModule(
  src('configManagerOps/FrConfigOauth2AgentOps'),
  () => ({
    configManagerExportOAuth2Agents: calls.oauth2,
  })
);
jest.unstable_mockModule(src('configManagerOps/FrConfigSamlOps'), () => ({
  configManagerExportSaml: calls.saml,
}));
jest.unstable_mockModule(
  src('configManagerOps/FrConfigConnectorDefinitionsOps'),
  () => ({ configManagerExportConnectorDefinitions: calls.connectors })
);
jest.unstable_mockModule(
  src('configManagerOps/FrConfigConnectorMappingOps'),
  () => ({ configManagerExportMappings: calls.mappings })
);
jest.unstable_mockModule(src('ops/ApplicationConfigOps'), () => ({
  configManagerExportApplications: calls.applications,
}));

const { deploymentMapAll, deploymentMapAllStatic } = await import(
  src('configManagerOps/FrConfigAllOps.ts')
);

let deployment = 'cloud';
const stepNamed = (map, name) =>
  map[deployment].find((step) => step.name === name);
const FOLDERS_NEW = { tree: 'new', layout: 'folders', createMarker: true };

beforeEach(() => {
  jest.clearAllMocks();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-pull-all-layout-'));
  fs.writeFileSync(path.join(tmp, 'oauth2-agents.json'), '{}');
  fs.writeFileSync(path.join(tmp, 'saml.json'), '{}');
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe.each(['cloud', 'forgeops'])('the steps of `pull all` (%s)', (type) => {
  beforeEach(() => {
    deployment = type;
  });

  const options = (extra = {}) => ({ configFolder: tmp, ...extra });

  test('oauth2-agents and saml get the file and the layout decision', async () => {
    await stepNamed(deploymentMapAll, 'oauth2-agents').run(
      options({ applicationLayout: FOLDERS_NEW })
    );
    await stepNamed(deploymentMapAll, 'saml').run(
      options({ applicationLayout: FOLDERS_NEW })
    );

    expect(calls.oauth2).toHaveBeenCalledWith(
      `${tmp}/oauth2-agents.json`,
      false,
      FOLDERS_NEW
    );
    expect(calls.saml).toHaveBeenCalledWith(
      `${tmp}/saml.json`,
      false,
      FOLDERS_NEW
    );
  });

  test('connector-definitions and connector-mappings get the layout decision', async () => {
    await stepNamed(deploymentMapAll, 'connector-definitions').run(
      options({ applicationLayout: FOLDERS_NEW })
    );
    await stepNamed(deploymentMapAll, 'connector-mappings').run(
      options({ applicationLayout: FOLDERS_NEW })
    );

    expect(calls.connectors).toHaveBeenCalledWith(
      undefined,
      false,
      FOLDERS_NEW
    );
    expect(calls.mappings).toHaveBeenCalledWith(undefined, false, FOLDERS_NEW);
  });

  test('without a decision the exporters get none, and read the marker themselves', async () => {
    await stepNamed(deploymentMapAll, 'oauth2-agents').run(options());
    await stepNamed(deploymentMapAll, 'connector-mappings').run(options());

    expect(calls.oauth2).toHaveBeenCalledWith(
      `${tmp}/oauth2-agents.json`,
      false,
      undefined
    );
    expect(calls.mappings).toHaveBeenCalledWith(undefined, false, undefined);
  });

  test('a config folder without the file still skips the step with a warning, as before', async () => {
    fs.rmSync(path.join(tmp, 'saml.json'));

    const outcome = await stepNamed(deploymentMapAll, 'saml').run(
      options({ applicationLayout: FOLDERS_NEW })
    );

    expect(outcome).toBe(true);
    expect(calls.saml).not.toHaveBeenCalled();
  });

  test('the steps of `pull all-static` are unchanged: they read the marker themselves', async () => {
    await stepNamed(deploymentMapAllStatic, 'connector-definitions').run(
      options({ applicationLayout: FOLDERS_NEW })
    );
    await stepNamed(deploymentMapAllStatic, 'connector-mappings').run(
      options({ applicationLayout: FOLDERS_NEW })
    );

    expect(calls.connectors).toHaveBeenCalledWith();
    expect(calls.mappings).toHaveBeenCalledWith();
  });
});

describe.each(['cloud', 'forgeops'])(
  'the order of the steps of `pull all` (%s)',
  (type) => {
    test('the four standalone kinds come last, just before applications: the recorded replays hand out their recordings in order', () => {
      const names = deploymentMapAll[type].map((step) => step.name);

      expect(names.slice(-5)).toEqual([
        'connector-definitions',
        'oauth2-agents',
        'connector-mappings',
        'saml',
        'applications',
      ]);
    });
  }
);
