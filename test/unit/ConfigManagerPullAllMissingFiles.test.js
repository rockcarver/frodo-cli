import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * Decision record 0040 for the steps of `config-manager pull all` that read a
 * file from the config folder (authz-policies.json, oauth2-agents.json,
 * saml.json, service-objects.json): a file that is not in the folder means
 * there is nothing for that step to export, so the step is skipped with a
 * warning and does not fail the command. A file that is there and cannot be
 * processed still fails its step, and so does any other step. `pull all-static`
 * reads no config file at all.
 *
 * The real import graph of the exporters pulls in all of frodo-lib, whose
 * bundled ESM cannot load under jest's ESM runtime, so the library is a stub
 * and every relative import of FrConfigAllOps (all the exporters) is a spy. The
 * step wrapper (ConfigFileStep) and the run tracker (OperationRun) stay real.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const allOps = path.resolve(root, 'src/configManagerOps/FrConfigAllOps.ts');

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

// every relative import of FrConfigAllOps becomes spies, except the step
// wrapper and the run tracker
const spies = new Map();
const source = fs.readFileSync(allOps, 'utf8');
for (const [, names, from] of source.matchAll(
  /^import \{([^}]*)\} from '(\.[^']+)';/gms
)) {
  const target = path.resolve(path.dirname(allOps), from);
  if (/\/(ConfigFileStep|OperationRun)$/.test(target)) continue;
  const exports = spies.get(target) ?? {};
  for (const name of names.split(',')) {
    if (name.trim()) exports[name.trim()] = jest.fn(async () => true);
  }
  spies.set(target, exports);
}
// the real step wrapper and run tracker print through these
const consoleTarget = path.resolve(root, 'src/utils/Console');
spies.set(consoleTarget, {
  ...spies.get(consoleTarget),
  printError: jest.fn(),
  printMessage: jest.fn(),
  verboseMessage: jest.fn(),
});
for (const [target, exports] of spies) {
  jest.unstable_mockModule(target, () => exports);
}
const { printError, printMessage, verboseMessage } = spies.get(consoleTarget);
const exporter = (file, name) =>
  spies.get(path.resolve(root, 'src/configManagerOps', file))[name];

const {
  configManagerExportAllWithConfigFolder,
  configManagerExportAllStatic,
  deploymentMapAll,
  deploymentMapAllStatic,
} = await import(allOps);

/** The four steps that read a conventional file, with their exporters. */
const FILE_STEPS = [
  {
    step: 'authz-policies',
    file: 'authz-policies.json',
    label: 'Authz Policy Sets',
    exporter: () =>
      exporter(
        'FrConfigAuthzPoliciesOps',
        'configManagerExportAuthzPolicySets'
      ),
  },
  {
    step: 'oauth2-agents',
    file: 'oauth2-agents.json',
    label: 'OAuth2 agents',
    exporter: () =>
      exporter('FrConfigOauth2AgentOps', 'configManagerExportOAuth2Agents'),
  },
  {
    step: 'saml',
    file: 'saml.json',
    label: 'SAML',
    exporter: () => exporter('FrConfigSamlOps', 'configManagerExportSaml'),
  },
  {
    step: 'service-objects',
    file: 'service-objects.json',
    label: 'service objects',
    exporter: () =>
      exporter(
        'FrConfigServiceObjectsOps',
        'configManagerExportServiceObjectsFromFile'
      ),
  },
];
const scriptsExporter = () =>
  exporter('FrConfigScriptOps', 'configManagerExportScripts');

const warnings = () =>
  printMessage.mock.calls
    .filter(([, level]) => level === 'warn')
    .map(([text]) => text);
const errors = () =>
  printMessage.mock.calls
    .filter(([, level]) => level === 'error')
    .map(([text]) => text);

const configFolder = (...files) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-missing-'));
  for (const file of files) fs.writeFileSync(path.join(folder, file), '[]');
  return folder;
};

beforeEach(() => {
  jest.clearAllMocks();
  deploymentType = 'cloud';
  for (const exports of spies.values()) {
    for (const fn of Object.values(exports)) {
      if (jest.isMockFunction(fn) && fn !== printMessage) {
        fn.mockReset();
        if (fn !== printError && fn !== verboseMessage) {
          fn.mockImplementation(async () => true);
        }
      }
    }
  }
});

describe.each(['cloud', 'forgeops', 'classic'])(
  'pull all on a %s deployment',
  (deployment) => {
    // the steps of this deployment that read a conventional file
    const fileSteps = FILE_STEPS.filter(({ step }) =>
      deploymentMapAll[deployment].some(({ name }) => name === step)
    );

    beforeEach(() => {
      deploymentType = deployment;
    });

    test('has file steps to test', () => {
      expect(fileSteps.length).toBeGreaterThanOrEqual(3);
    });

    test('skips each file step with a warning when the config folder has none of the files, and succeeds', async () => {
      const folder = configFolder();

      expect(
        await configManagerExportAllWithConfigFolder({ configFolder: folder })
      ).toBe(true);

      expect(warnings().sort()).toEqual(
        fileSteps
          .map(
            ({ file, label }) => `Skipping ${label}: no ${file} in '${folder}'.`
          )
          .sort()
      );
      for (const { exporter: of } of fileSteps) {
        expect(of()).not.toHaveBeenCalled();
      }
      // everything else still ran, and nothing was reported as failed
      expect(scriptsExporter()).toHaveBeenCalledTimes(1);
      expect(errors()).toEqual([]);
      expect(printError).not.toHaveBeenCalled();
      // raw config stays a quiet skip, as before
      expect(warnings().join('\n')).not.toMatch(/raw/);
    });

    test('runs the steps whose file is there and skips the others', async () => {
      const folder = configFolder('saml.json', 'authz-policies.json');

      expect(
        await configManagerExportAllWithConfigFolder({ configFolder: folder })
      ).toBe(true);

      const [authz, oauth, saml] = FILE_STEPS;
      // on Cloud and ForgeOps the step also hands the exporter the allow-failures default and the layout
      // decision of `pull all` (none here: the decision is faked), see PullAllHandsLayoutToStandaloneKinds.test.js
      expect(saml.exporter()).toHaveBeenCalledWith(
        ...(deployment === 'classic'
          ? [`${folder}/saml.json`]
          : [`${folder}/saml.json`, false, undefined])
      );
      expect(authz.exporter()).toHaveBeenCalledWith(
        `${folder}/authz-policies.json`
      );
      expect(oauth.exporter()).not.toHaveBeenCalled();
      expect(warnings()).toHaveLength(fileSteps.length - 2);
    });
  }
);

describe('pull all, mixed outcomes (cloud)', () => {
  const stepCount = deploymentMapAll.cloud.length;

  test('a file that is there and fails its step fails the command; the skipped steps are not in the summary', async () => {
    const folder = configFolder('saml.json');
    exporter('FrConfigSamlOps', 'configManagerExportSaml').mockImplementation(
      async () => false // an unreadable or unparseable file: the exporter says so
    );

    expect(
      await configManagerExportAllWithConfigFolder({ configFolder: folder })
    ).toBe(false);

    expect(errors()).toEqual([`1 of ${stepCount} steps failed:\n  - saml`]);
    expect(warnings()).toHaveLength(3); // authz-policies, oauth2-agents, service-objects
  });

  test('another step that fails still fails the command while the files are missing', async () => {
    scriptsExporter().mockImplementation(async () => false);

    expect(
      await configManagerExportAllWithConfigFolder({
        configFolder: configFolder(),
      })
    ).toBe(false);

    expect(errors()).toEqual([`1 of ${stepCount} steps failed:\n  - scripts`]);
    expect(warnings()).toHaveLength(4);
  });

  test('--allow-failures keeps the exit successful for that failure and still skips the missing files', async () => {
    scriptsExporter().mockImplementation(async () => false);

    expect(
      await configManagerExportAllWithConfigFolder({
        configFolder: configFolder(),
        allowFailures: true,
      })
    ).toBe(true);

    expect(errors()).toEqual([]);
    expect(
      printMessage.mock.calls.filter(
        ([text, level]) => level === 'warn' && /steps? failed/.test(text)
      )
    ).toHaveLength(1);
    expect(warnings()).toHaveLength(5); // the four skips and the summary
  });
});

describe('pull all-static', () => {
  test('reads no config file: nothing is skipped or warned about when the folder is empty', async () => {
    for (const steps of Object.values(deploymentMapAllStatic)) {
      expect(steps.map(({ name }) => name)).not.toEqual(
        expect.arrayContaining(FILE_STEPS.map(({ step }) => step))
      );
    }

    expect(
      await configManagerExportAllStatic({ configFolder: configFolder() })
    ).toBe(true);

    expect(scriptsExporter()).toHaveBeenCalledTimes(1);
    for (const { exporter: of } of FILE_STEPS)
      expect(of()).not.toHaveBeenCalled();
    expect(printMessage).not.toHaveBeenCalled();
    expect(verboseMessage).not.toHaveBeenCalled();
  });

  test('still fails the command when a step fails, with one summary', async () => {
    scriptsExporter().mockImplementation(async () => false);

    expect(await configManagerExportAllStatic({})).toBe(false);

    expect(errors()).toEqual([
      `1 of ${deploymentMapAllStatic.cloud.length} steps failed:\n  - scripts`,
    ]);
    expect(warnings()).toEqual([]);
  });
});
