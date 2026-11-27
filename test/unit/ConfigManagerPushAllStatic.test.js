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
 * `config-manager push all-static` runs the import of every step of `deploymentMapAllStatic` that the pull
 * of the same deployment writes, in the order of the table. These tests pin the table and the runner of
 * the push, with the imports as spies:
 *
 * - the table: each deployment type has a push step for every step of `pull all-static` (so that a type
 *   that is added to the pull and not to the push fails here), in the order that the dependencies need;
 * - what each step is called with, and which paths of the tree it reads (the pairing of a step with its
 *   folder is written out in SPEC below, from the standalone push command and the import it calls);
 * - the metadata of the tenant is written only when the run was given some;
 * - a tree is checked before anything is written (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0041-the-config-manager-plain-form-is-what-an-unattended-pipeline-needs.md,
 *   what a command finds by convention may be absent): a folder that is not there is a warning and a skipped
 *   step, a tree that holds none of them is an error, and a working directory that is not a folder is an
 *   error;
 * - a failed step does not stop the others, one summary names it, and `--allow-failures` keeps the result
 *   true (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0040-a-command-that-runs-many-operations-runs-them-all-then-fails-if-any-failed.md,
 *   run them all, then fail if any failed).
 *
 * The real import graph of the imports pulls in all of frodo-lib, whose bundled ESM cannot load under jest's
 * ESM runtime, so the library is a stub and every relative import of FrConfigAllOps (all the imports) is a
 * spy. The step wrapper, the run tracker and the folder names of a realm stay real.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const allOps = path.resolve(root, 'src/configManagerOps/FrConfigAllOps.ts');

let deploymentType = 'cloud';
let workingDirectory = '.';
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: {
      getWorkingDirectory: () => workingDirectory,
      constants: {
        CLASSIC_DEPLOYMENT_TYPE_KEY: 'classic',
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
        DEFAULT_REALM_KEY: '__default__realm__',
      },
    },
  },
  state: { getDeploymentType: () => deploymentType },
}));

// every relative import of FrConfigAllOps becomes spies, except the step wrapper, the run tracker and the
// folder names of a realm
const spies = new Map();
const source = fs.readFileSync(allOps, 'utf8');
for (const [, names, from] of source.matchAll(
  /^import \{([^}]*)\} from '(\.[^']+)';/gms
)) {
  const target = path.resolve(path.dirname(allOps), from);
  if (/\/(ConfigFileStep|OperationRun|ConfigTreePath)$/.test(target)) continue;
  const exports = spies.get(target) ?? {};
  for (const name of names.split(',')) {
    if (name.trim()) exports[name.trim()] = jest.fn(async () => true);
  }
  spies.set(target, exports);
}
// the real run tracker prints through these
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
const { printError, printMessage } = spies.get(consoleTarget);
const spyOf = (file, name) =>
  spies.get(path.resolve(root, 'src/configManagerOps', file))?.[name] ??
  spies.get(path.resolve(root, 'src/ops', file))[name];

const { configManagerImportAllStatic, deploymentMapAllStatic } = await import(
  allOps
);

/**
 * What each step is, written out here and not read from the table, so that the table is checked against it:
 * the import it calls and the arguments (`push <command>` passes the same), and the path of the tree that
 * the import reads. `<realm>` is the folder of the realm.
 */
const SPEC = {
  'access-config': {
    call: ['FrConfigAccessConfigOps', 'configManagerImportAccessConfig'],
    reads: 'access-config/access.json',
  },
  audit: {
    call: ['FrConfigAuditOps', 'configManagerImportAudit'],
    reads: 'audit/audit.json',
  },
  'config-metadata': {
    call: ['FrConfigMetadataOps', 'configManagerImportMetadata'],
    args: (_realm, options) => [options.metadata],
  },
  'connectors': {
    call: ['FrConfigConnectorDefinitionsOps', 'configManagerImportConnectors'],
    reads: 'sync/connectors',
  },
  'connector-mappings': {
    call: ['FrConfigConnectorMappingOps', 'configManagerImportMappings'],
    reads: 'sync/mappings',
  },
  'cookie-domains': {
    call: ['FrConfigCookieDomainsOps', 'configManagerImportCookieDomains'],
    reads: 'cookie-domains/cookie-domains.json',
  },
  cors: {
    call: ['FrConfigCorsOps', 'configManagerImportCors'],
    reads: 'cors/cors-config.json',
  },
  csp: {
    call: ['FrConfigCspOps', 'configManagerImportCsp'],
    // no policy name (both are pushed), and no flag: a policy that fails is a failed step in the summary
    reads: 'csp/csp.json',
  },
  'nodes': {
    call: ['FrConfigCustomNodesOps', 'configManagerImportCustomNodes'],
    reads: 'custom-nodes/nodes',
  },
  'email-provider': {
    call: ['FrConfigEmailProviderOps', 'configManagerImportEmailProvider'],
    reads: 'email-provider/external.email.json',
  },
  'email-templates': {
    call: ['FrConfigEmailTemplatesOps', 'configManagerImportEmailTemplates'],
    reads: 'email-templates',
  },
  endpoints: {
    call: ['FrConfigEndpointsOps', 'configManagerImportEndpoints'],
    reads: 'endpoints',
  },
  'idm-authentication': {
    call: [
      'FrConfigIdmAuthenticationOpts',
      'configManagerImportIdmAuthentication',
    ],
    reads: 'idm-authentication-config/authentication.json',
  },
  kba: {
    call: ['FrConfigKbaOps', 'configManagerImportKbaConfig'],
    reads: 'kba/selfservice.kba.json',
  },
  locales: {
    call: ['FrConfigLocalesOps', 'configManagerImportLocales'],
    reads: 'locales',
  },
  'managed-objects': {
    call: ['FrConfigManagedObjectsOps', 'configManagerImportManagedObjects'],
    reads: 'managed-objects',
  },
  'org-privileges': {
    call: ['FrConfigOrgPrivilegesOps', 'configManagerImportOrgPrivileges'],
    reads: 'org-privileges',
  },
  'password-policy': {
    call: ['FrConfigPasswordPolicyOps', 'configManagerImportPasswordPolicy'],
    args: (realm) => [realm],
    reads: 'realms/<realm>/password-policy',
  },
  'remote-proxies': {
    call: ['RemoteProxyOps', 'configManagerImportRemoteProxies'],
    reads: 'remote-proxies',
  },
  'connector-servers': {
    call: ['FrConfigRemoteServersOps', 'configManagerImportRemoteServers'],
    reads: 'sync/rcs/provisioner.openicf.connectorinfoprovider.json',
  },
  schedules: {
    call: ['FrConfigSchedulesOps', 'configManagerImportSchedules'],
    reads: 'schedules',
  },
  'terms-and-conditions': {
    call: [
      'FrConfigTermsAndConditionsOps',
      'configManagerImportTermsAndConditions',
    ],
    reads: 'terms-conditions/terms-conditions.json',
  },
  themes: {
    call: ['FrConfigThemeOps', 'configManagerImportThemes'],
    args: (realm) => [realm],
    reads: 'realms/<realm>/themes',
  },
  'ui-config': {
    call: ['FrConfigUiConfigOps', 'configManagerImportUiConfig'],
    reads: 'ui/ui-configuration.json',
  },
  'secretstore-mappings': {
    call: ['FrConfigSecretMappingsOps', 'configManagerImportSecretMappings'],
    // the name of the mapping (none), then the realm
    args: (realm) => [undefined, realm],
    reads: 'realms/<realm>/secret-mappings',
  },
  scripts: {
    call: ['FrConfigScriptOps', 'configManagerImportScripts'],
    args: (realm) => [realm],
    reads: 'realms/<realm>/scripts/scripts-config',
  },
  authn: {
    call: ['FrConfigAuthenticationOps', 'configManagerImportAuthentication'],
    args: (realm) => [realm],
    reads: 'realms/<realm>/realm-config/authentication.json',
  },
  services: {
    call: ['FrConfigServiceOps', 'configManagerImportServices'],
    // the name of the service (none), then the realm
    args: (realm) => [undefined, realm],
    reads: 'realms/<realm>/services',
  },
  journeys: {
    call: ['FrConfigJourneysOps', 'configManagerImportJourneys'],
    // the name of the journey (none), the realm, and no dependencies (the scripts have their own step)
    args: (realm) => [undefined, realm, false],
    reads: 'realms/<realm>/journeys',
  },
};

/** The steps of each deployment type, in the order of the push. */
const GLOBAL_STEPS = {
  cloud: [
    'access-config',
    'audit',
    'config-metadata',
    'connectors',
    'connector-mappings',
    'cookie-domains',
    'cors',
    'csp',
    'nodes',
    'email-provider',
    'email-templates',
    'endpoints',
    'kba',
    'locales',
    'managed-objects',
    'org-privileges',
    'password-policy',
    'remote-proxies',
    'connector-servers',
    'schedules',
    'terms-and-conditions',
    'themes',
    'ui-config',
  ],
  forgeops: [
    'access-config',
    'audit',
    'config-metadata',
    'connectors',
    'connector-mappings',
    'cors',
    'nodes',
    'email-provider',
    'email-templates',
    'endpoints',
    'idm-authentication',
    'kba',
    'locales',
    'managed-objects',
    'org-privileges',
    'password-policy',
    'connector-servers',
    'schedules',
    'terms-and-conditions',
    'themes',
    'ui-config',
  ],
  classic: ['cors', 'nodes'],
};
const REALM_STEPS = {
  cloud: [
    'secretstore-mappings',
    'scripts',
    'authn',
    'services',
    'journeys',
  ],
  forgeops: ['scripts', 'authn', 'services', 'journeys'],
  classic: ['scripts', 'authn', 'services', 'journeys'],
};
const STEPS = Object.fromEntries(
  Object.keys(GLOBAL_STEPS).map((type) => [
    type,
    [...GLOBAL_STEPS[type], ...REALM_STEPS[type]],
  ])
);

/** What only a push has, and what only a pull has: the two lists of the mirror test. */
const PUSH_ONLY = ['config-metadata'];
const PULL_ONLY = [];

const specOf = (name) => SPEC[name];
const importOf = (name) => spyOf(...specOf(name).call);
const pathOf = (name, realm = 'alpha') =>
  specOf(name).reads?.replace('<realm>', realm);

const tmpDirs = [];
/** A working directory that holds the given paths (a path with an extension is a file, any other a folder). */
const treeWith = (...paths) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-push-all-'));
  tmpDirs.push(dir);
  for (const relative of paths) {
    const target = path.join(dir, relative);
    if (path.extname(relative)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, '{}');
    } else {
      fs.mkdirSync(target, { recursive: true });
    }
  }
  return dir;
};
/** A tree with the folders of every step that reads one, for a realm. */
const fullTree = (type, realm = 'alpha') =>
  treeWith(...STEPS[type].map((name) => pathOf(name, realm)).filter(Boolean));

const messages = (level) =>
  printMessage.mock.calls
    .filter(([, kind]) => kind === level)
    .map(([text]) => text);
const warnings = () => messages('warn');
const errors = () => messages('error');
const namesCalled = (type) =>
  STEPS[type].filter((name) => importOf(name).mock.calls.length > 0);

beforeEach(() => {
  jest.clearAllMocks();
  deploymentType = 'cloud';
  workingDirectory = '.';
  for (const [target, exports] of spies) {
    for (const fn of Object.values(exports)) {
      fn.mockReset();
      // the imports succeed unless a test says otherwise; the console spies print nothing
      if (target !== consoleTarget) fn.mockImplementation(async () => true);
    }
  }
});
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('the table of `push all-static`', () => {
  test.each(Object.keys(STEPS))(
    'the steps of %s that pull and push write are the same (apart from what only one of them has)',
    (type) => {
      const steps = deploymentMapAllStatic[type];
      const pulled = steps.filter((s) => s.export).map((s) => s.name);
      const pushed = steps.filter((s) => s.import).map((s) => s.name);

      expect(pushed.filter((n) => !PUSH_ONLY.includes(n)).sort()).toEqual(
        pulled.filter((n) => !PULL_ONLY.includes(n)).sort()
      );
      expect(pushed.filter((n) => PUSH_ONLY.includes(n))).toEqual(
        PUSH_ONLY.filter((n) => STEPS[type].includes(n))
      );
      // the pull of main writes 27, 24 and 6 types
      expect(pulled).toHaveLength(
        { cloud: 27, forgeops: 24, classic: 6 }[type]
      );
    }
  );

  test.each(Object.keys(STEPS))(
    'the steps of %s run in the order that the dependencies need',
    (type) => {
      const pushed = deploymentMapAllStatic[type]
        .filter((s) => s.import)
        .map((s) => s.name);

      expect(pushed).toEqual(STEPS[type]);
      // the configuration of the tenant first, then the configuration of the realm, scripts before the
      // steps that use them
      const index = (name) => pushed.indexOf(name);
      const first = index(REALM_STEPS[type][0]);
      for (const name of GLOBAL_STEPS[type]) {
        expect(index(name)).toBeLessThan(first);
      }
      expect(index('scripts')).toBeLessThan(index('authn'));
      expect(index('authn')).toBeLessThan(index('services'));
      expect(index('services')).toBeLessThan(index('journeys'));
    }
  );

  test('ui-config, cookie-domains and csp are pushed, the last two on Cloud only and ui-config not on classic', () => {
    const pushed = (type) =>
      deploymentMapAllStatic[type].filter((s) => s.import).map((s) => s.name);

    expect(pushed('cloud')).toEqual(
      expect.arrayContaining(['ui-config', 'cookie-domains', 'csp'])
    );
    expect(pushed('forgeops')).toContain('ui-config');
    expect(pushed('forgeops')).not.toContain('cookie-domains');
    expect(pushed('forgeops')).not.toContain('csp');
    expect(pushed('classic')).toEqual([
      'cors',
      'nodes',
      ...REALM_STEPS.classic,
    ]);
  });

  test.each(Object.keys(STEPS))(
    'every step of %s that reads the tree says which path, and the metadata step reads none',
    (type) => {
      for (const step of deploymentMapAllStatic[type].filter((s) => s.import)) {
        expect(typeof step.reads).toBe(
          step.name === 'config-metadata' ? 'undefined' : 'function'
        );
      }
    }
  );
});

describe.each(Object.keys(STEPS))(
  'push all-static on a %s deployment',
  (type) => {
    beforeEach(() => {
      deploymentType = type;
    });

    const withoutMetadata = STEPS[type].filter((n) => n !== 'config-metadata');

    test('with every folder in the tree, it runs every step but the metadata, once, in order, and succeeds', async () => {
      workingDirectory = fullTree(type);
      const order = [];
      for (const name of STEPS[type]) {
        importOf(name).mockImplementation(async () => {
          order.push(name);
          return true;
        });
      }

      expect(await configManagerImportAllStatic({ realm: 'alpha' })).toBe(true);

      expect(order).toEqual(withoutMetadata);
      for (const name of withoutMetadata) {
        expect(importOf(name)).toHaveBeenCalledTimes(1);
      }
      expect(importOf('config-metadata')).not.toHaveBeenCalled();
      expect(warnings()).toEqual([]);
      expect(errors()).toEqual([]);
    });

    test('each step is called with what the standalone push command passes, the realm to the steps of a realm', async () => {
      workingDirectory = fullTree(type);

      await configManagerImportAllStatic({ realm: 'alpha' });

      for (const name of withoutMetadata) {
        const args = specOf(name).args?.('alpha', {}) ?? [];
        expect(importOf(name).mock.calls).toEqual([args]);
      }
    });

    test('without a realm the steps of a realm get none, and the others never get one', async () => {
      workingDirectory = fullTree(type);

      await configManagerImportAllStatic({});

      for (const name of withoutMetadata) {
        const args = specOf(name).args?.(undefined, {}) ?? [];
        expect(importOf(name).mock.calls).toEqual([args]);
        expect(importOf(name).mock.calls[0]).not.toContain('alpha');
      }
    });

    test('the flag of the run reaches the steps that take it', async () => {
      workingDirectory = fullTree(type);

      await configManagerImportAllStatic({
        realm: 'alpha',
        allowFailures: true,
      });

      for (const name of withoutMetadata) {
        const args =
          specOf(name).args?.('alpha', { allowFailures: true }) ?? [];
        expect(importOf(name).mock.calls).toEqual([args]);
      }
    });

    test('a step is pushed when its path, and only its path, is in the tree: the others are skipped, each with one warning', async () => {
      for (const name of withoutMetadata) {
        jest.clearAllMocks();
        workingDirectory = treeWith(pathOf(name));

        const outcome = await configManagerImportAllStatic({ realm: 'alpha' });

        expect(namesCalled(type)).toEqual([name]);
        // a skipped step is neither a success nor a failure
        expect(outcome).toBe(true);
        expect(warnings()).toHaveLength(withoutMetadata.length - 1);
        expect(errors()).toEqual([]);
      }
    });

    test('a step with a path that is not the one it reads is skipped, whatever else the folder holds', async () => {
      const lookalike = (relative) =>
        path.posix.dirname(relative) === '.'
          ? `${relative}-other`
          : path.posix.join(path.posix.dirname(relative), 'other');
      for (const name of withoutMetadata) {
        jest.clearAllMocks();
        workingDirectory = treeWith(lookalike(pathOf(name)));

        const outcome = await configManagerImportAllStatic({ realm: 'alpha' });

        // no step finds its path: nothing is pushed at all
        expect(namesCalled(type)).toEqual([]);
        expect(outcome).toBe(false);
      }
    });

    test('the metadata is written when the run was given some, and only then', async () => {
      workingDirectory = fullTree(type);
      const metadata = {
        pushedAt: '2026-11-26T00:00:00Z',
        versionInfo: { version: '1.0' },
      };

      expect(await configManagerImportAllStatic({ metadata: {} })).toBe(true);
      expect(importOf('config-metadata')).not.toHaveBeenCalled();
      expect(await configManagerImportAllStatic({ metadata: undefined })).toBe(
        true
      );
      expect(importOf('config-metadata')).not.toHaveBeenCalled();

      expect(await configManagerImportAllStatic({ metadata })).toBe(true);
      if (STEPS[type].includes('config-metadata')) {
        // the step gets the object that the run was given
        expect(importOf('config-metadata').mock.calls).toEqual([[metadata]]);
      } else {
        // a classic deployment has no IDM, so it has no metadata step
        expect(importOf('config-metadata')).not.toHaveBeenCalled();
      }
    });

    test('metadata that was given to a deployment without the metadata step is said to be left out, once, as a warning; a deployment with the step says nothing', async () => {
      workingDirectory = fullTree(type);
      const metadata = { pushedAt: '2026-11-26T00:00:00Z' };
      const said = () =>
        warnings().filter((message) => message.includes('--metadata'));

      expect(await configManagerImportAllStatic({ metadata })).toBe(true);

      if (STEPS[type].includes('config-metadata')) {
        expect(said()).toEqual([]);
      } else {
        expect(said()).toHaveLength(1);
        expect(said()[0]).toContain('-M, --metadata');
        expect(said()[0]).toContain(`${type} deployment`);
        expect(said()[0]).toContain('not written');
        // a warning and nothing more: the run goes on and succeeds
        expect(errors()).toEqual([]);
      }

      // nothing given, nothing to say
      jest.clearAllMocks();
      expect(await configManagerImportAllStatic({ metadata: {} })).toBe(true);
      expect(await configManagerImportAllStatic({})).toBe(true);
      expect(said()).toEqual([]);
    });
  }
);

describe('a working directory that cannot hold a tree', () => {
  test('one that does not exist is one error, and no step runs (the metadata included)', async () => {
    workingDirectory = path.join(os.tmpdir(), 'cm-push-all-does-not-exist');

    const outcome = await configManagerImportAllStatic({
      realm: 'alpha',
      metadata: { pushedAt: 'x' },
    });

    expect(outcome).toBe(false);
    expect(errors()).toEqual([
      `The folder '${workingDirectory}' does not exist, so there is nothing to push.`,
    ]);
    expect(warnings()).toEqual([]);
    expect(namesCalled('cloud')).toEqual([]);
  });

  test('a file is one error too, and no step runs', async () => {
    const dir = treeWith('a-file.json');
    workingDirectory = path.join(dir, 'a-file.json');

    const outcome = await configManagerImportAllStatic({ metadata: { a: 1 } });

    expect(outcome).toBe(false);
    expect(errors()).toEqual([
      `The folder '${workingDirectory}' is not a folder, so there is nothing to push.`,
    ]);
    expect(namesCalled('cloud')).toEqual([]);
  });

  test('an empty folder is one error and no warning per step, and no step runs (the metadata included)', async () => {
    workingDirectory = treeWith();

    const outcome = await configManagerImportAllStatic({
      metadata: { pushedAt: 'x' },
    });

    expect(outcome).toBe(false);
    expect(errors()).toEqual([
      `Nothing to push: none of the static configuration folders was found in '${workingDirectory}'.`,
    ]);
    expect(warnings()).toEqual([]);
    expect(namesCalled('cloud')).toEqual([]);
  });

  test('a folder with other things in it is an empty tree', async () => {
    workingDirectory = treeWith('docs/readme.md', 'realms');

    expect(await configManagerImportAllStatic({})).toBe(false);

    expect(errors()).toHaveLength(1);
    expect(namesCalled('cloud')).toEqual([]);
  });
});

describe('a tree that holds some of the folders', () => {
  test('the steps whose folder is not there are skipped with one warning each, that names the path and the folder', async () => {
    workingDirectory = treeWith(
      'cors/cors-config.json',
      'kba/selfservice.kba.json'
    );

    const outcome = await configManagerImportAllStatic({ realm: 'alpha' });

    expect(outcome).toBe(true);
    expect(namesCalled('cloud')).toEqual(['cors', 'kba']);
    const skipped = STEPS.cloud.filter(
      (n) => !['config-metadata', 'cors', 'kba'].includes(n)
    );
    expect(warnings()).toEqual(
      skipped.map(
        (name) =>
          `Skipping ${name}: '${pathOf(name)}' not found in '${workingDirectory}'.`
      )
    );
    expect(errors()).toEqual([]);
  });

  test('without a realm, a step of a realm names the path of any realm, and is pushed when any realm folder has it', async () => {
    workingDirectory = treeWith('realms/bravo/themes');

    expect(await configManagerImportAllStatic({})).toBe(true);

    expect(namesCalled('cloud')).toEqual(['themes']);
    expect(warnings()).toContain(
      `Skipping scripts: 'realms/*/scripts/scripts-config' not found in '${workingDirectory}'.`
    );
    // `toContain` compares whole elements, so look at the text of each warning
    expect(warnings().filter((w) => w.startsWith('Skipping themes'))).toEqual(
      []
    );
  });

  /**
   * Without a realm every realm folder of the tree counts, one after the other: a step is pushed when ANY of them
   * holds its path, also when the first one does not, and it is skipped, with the warning that names every realm as
   * `*`, only when none does. Each row: the step, the path it reads inside a realm folder, and what the first realm
   * folder holds instead (the path itself would make the first folder enough).
   */
  describe.each([
    ['themes', 'themes', 'other'],
    ['scripts', 'scripts/scripts-config', 'scripts/scripts-content'],
    [
      'authn',
      'realm-config/authentication.json',
      'realm-config/other.json',
    ],
    ['journeys', 'journeys', 'services'],
  ])(
    'without a realm, the step %s looks at every realm folder',
    (step, inRealm, instead) => {
      test('is pushed when only the second realm folder holds its path', async () => {
        workingDirectory = treeWith(
          `realms/alpha/${instead}`,
          `realms/bravo/${inRealm}`
        );

        expect(await configManagerImportAllStatic({})).toBe(true);

        expect(namesCalled('cloud')).toContain(step);
        expect(importOf(step)).toHaveBeenCalledTimes(1);
        expect(
          warnings().filter((w) => w.startsWith(`Skipping ${step}:`))
        ).toEqual([]);
        expect(errors()).toEqual([]);
      });

      test('is skipped, with the warning, when neither realm folder holds its path', async () => {
        workingDirectory = treeWith(
          `realms/alpha/${instead}`,
          `realms/bravo/${instead}`,
          // another step finds its folder, so the tree is not an empty one
          'cors/cors-config.json'
        );

        expect(await configManagerImportAllStatic({})).toBe(true);

        expect(importOf(step)).not.toHaveBeenCalled();
        expect(warnings()).toContain(
          `Skipping ${step}: 'realms/*/${inRealm}' not found in '${workingDirectory}'.`
        );
        expect(importOf('cors')).toHaveBeenCalledTimes(1);
      });
    }
  );

  test('with a realm, only the folder of that realm counts', async () => {
    workingDirectory = treeWith('realms/bravo/themes', 'cors/cors-config.json');

    expect(await configManagerImportAllStatic({ realm: 'alpha' })).toBe(true);

    expect(namesCalled('cloud')).toEqual(['cors']);
    expect(warnings()).toContain(
      `Skipping themes: 'realms/alpha/themes' not found in '${workingDirectory}'.`
    );
  });

  test('the sentinel of "no realm" is no realm', async () => {
    workingDirectory = treeWith('realms/bravo/themes');

    await configManagerImportAllStatic({ realm: '__default__realm__' });

    expect(namesCalled('cloud')).toEqual(['themes']);
    expect(importOf('themes').mock.calls).toEqual([['__default__realm__']]);
  });

  test.each([
    ['/', 'realms/root/themes'],
    ['/parent/child', 'realms/parent/child/themes'],
    ['parent/child', 'realms/parent/child/themes'],
  ])('the realm %s is the folder of its path', async (realm, folder) => {
    workingDirectory = treeWith(folder);

    await configManagerImportAllStatic({ realm });

    expect(namesCalled('cloud')).toEqual(['themes']);
  });

  test('a realm that is not a name or a path of names fails before any step runs', async () => {
    workingDirectory = fullTree('cloud');

    expect(await configManagerImportAllStatic({ realm: '..' })).toBe(false);

    expect(namesCalled('cloud')).toEqual([]);
    expect(printError).toHaveBeenCalledTimes(1);
  });

  test('the count of the summary is the count of the steps that ran', async () => {
    workingDirectory = treeWith(
      'cors/cors-config.json',
      'kba/selfservice.kba.json'
    );
    importOf('kba').mockImplementation(async () => false);

    expect(await configManagerImportAllStatic({})).toBe(false);

    expect(errors()).toEqual(['1 of 2 steps failed:\n  - kba']);
  });

  test('a run in which every step that ran succeeded and the others were skipped succeeds', async () => {
    workingDirectory = treeWith('realms/alpha/journeys');

    expect(await configManagerImportAllStatic({ realm: 'alpha' })).toBe(true);

    expect(namesCalled('cloud')).toEqual(['journeys']);
    expect(errors()).toEqual([]);
  });

  test('the metadata is written with the steps that ran, in a tree that holds one folder', async () => {
    workingDirectory = treeWith('cors/cors-config.json');
    const metadata = { pushedAt: 'x' };

    expect(await configManagerImportAllStatic({ metadata })).toBe(true);

    expect(namesCalled('cloud')).toEqual(['config-metadata', 'cors']);
    expect(importOf('config-metadata').mock.calls).toEqual([[metadata]]);
  });
});

describe('a step that fails', () => {
  beforeEach(() => {
    workingDirectory = fullTree('cloud');
  });

  test('does not stop the others: every step runs, one summary names the failed ones, and the result is false', async () => {
    importOf('audit').mockImplementation(async () => false);
    importOf('journeys').mockImplementation(async () => {
      throw new Error('boom');
    });

    expect(await configManagerImportAllStatic({ realm: 'alpha' })).toBe(false);

    for (const name of STEPS.cloud.filter((n) => n !== 'config-metadata')) {
      expect(importOf(name)).toHaveBeenCalledTimes(1);
    }
    expect(errors()).toEqual([
      '2 of 27 steps failed:\n  - audit\n  - journeys: boom',
    ]);
  });

  test('is only a report with `allowFailures`: the result is true and the summary says why', async () => {
    importOf('audit').mockImplementation(async () => false);

    expect(
      await configManagerImportAllStatic({
        realm: 'alpha',
        allowFailures: true,
      })
    ).toBe(true);

    expect(importOf('journeys')).toHaveBeenCalledTimes(1);
    expect(errors()).toEqual([]);
    expect(warnings()).toEqual([
      '1 of 27 steps failed:\n  - audit\nThe exit code stays 0 because --allow-failures was given.',
    ]);
  });

  test('every step failing is still the summary of all of them', async () => {
    for (const name of STEPS.cloud) {
      importOf(name).mockImplementation(async () => false);
    }

    expect(await configManagerImportAllStatic({})).toBe(false);

    expect(errors()).toHaveLength(1);
    expect(errors()[0]).toMatch(/^27 of 27 steps failed:/);
  });
});
