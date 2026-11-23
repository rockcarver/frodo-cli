import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

/**
 * `frodo config-manager migrate applications` looks for the kind-path files of the objects that an
 * application owns, and removes them once the application has its folder. The tenant names the
 * realm of an owned object: it is the name of a folder of the tree, never a path. Whatever a
 * tenant says, the command looks for nothing and removes nothing outside the config folder, and a
 * realm that is not a folder name has no files in the tree
 * (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0059-a-selector-is-an-id-or-a-name-never-a-path.md).
 *
 * The library is the real one with the tenant replaced: the realms, the applications and who owns
 * what. The files are real, in a temporary folder, and the config folder is deep inside it. Files
 * that look like the objects of a realm that goes up (the sentinels) are put outside the config
 * folder: they must be there afterwards, nothing outside the config folder changes, and the
 * command does not say that it looked at them. The per-user settings are a fake and the home
 * directory is replaced: nothing here may touch the real home.
 */

const realLib = await import('@rockcarver/frodo-lib');
const readRealms = jest.fn();
const readApplications = jest.fn();
const readApplicationOwnership = jest.fn();
const readApplicationReferences = jest.fn();
const printed = [];

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  ...realLib,
  frodo: {
    ...realLib.frodo,
    realm: { ...realLib.frodo.realm, readRealms },
    app: {
      ...realLib.frodo.app,
      readApplications,
      readApplicationOwnership,
      readApplicationReferences,
    },
  },
}));
// the console: what the command prints is kept, everything else the module offers does nothing
const consoleNames = [
  ...fs
    .readFileSync(
      new URL('../../src/utils/Console.ts', import.meta.url),
      'utf8'
    )
    .matchAll(/^export (?:async )?(?:function|const) (\w+)/gm),
].map((match) => match[1]);
jest.unstable_mockModule('../../src/utils/Console', () => ({
  ...Object.fromEntries(consoleNames.map((name) => [name, () => {}])),
  printError: (error, message) =>
    printed.push(`${message ?? ''} ${error?.message ?? error}`.trim()),
  printMessage: (message) => printed.push(String(message)),
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));
// the per-user settings are never read from the real home
jest.unstable_mockModule('../../src/utils/SettingsStore', () => ({
  CONFIG_MANAGER_APPLICATION_LAYOUTS: ['folders', 'kind-paths'],
  getConfigManagerApplicationLayout: () => 'folders',
}));

const { configManagerMigrateApplications } = await import(
  '../../src/ops/ApplicationMigrateOps.ts'
);

const IDP = 'https://idp.zion.example';
const CLIENT = 'zion-portal';

let root;
let configFolder;
let directoryBefore;
let realmBefore;
let fakeHome;
/** The realms of the tenant, and for each the applications and what they own. */
let tenant;

beforeAll(() => {
  // The settings live under os.homedir(). Assigning process.env.HOME does not change it under
  // jest, so it is replaced here, and the tests stop before they can write anywhere if that did
  // not work.
  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-migrate-hostile-home-'));
  jest.spyOn(os, 'homedir').mockReturnValue(fakeHome);
  if (os.homedir() !== fakeHome) {
    throw new Error(
      'The home directory could not be replaced; refusing to run.'
    );
  }
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-migrate-hostile-'));
  configFolder = path.join(root, 'a', 'b', 'config');
  fs.mkdirSync(configFolder, { recursive: true });
  directoryBefore = realLib.state.getDirectory();
  realmBefore = realLib.state.getRealm();
  realLib.state.setDirectory(configFolder);
  printed.length = 0;
  tenant = {};
  readRealms.mockReset().mockImplementation(async () =>
    Object.keys(tenant).map((name) => ({ name }))
  );
  readApplications.mockReset().mockImplementation(async () =>
    structuredClone(tenant[realLib.state.getRealm()]?.apps ?? [])
  );
  readApplicationOwnership.mockReset().mockImplementation(async () => ({
    entries: structuredClone(tenant[realLib.state.getRealm()]?.owned ?? []),
  }));
  readApplicationReferences
    .mockReset()
    .mockImplementation(async (id) => ({
      applicationId: id,
      applicationName: '',
      references: [],
      problems: [],
    }));
});

afterEach(() => {
  realLib.state.setDirectory(directoryBefore);
  realLib.state.setRealm(realmBefore);
  fs.rmSync(root, { recursive: true, force: true });
});

/** An application of a realm, which owns an OAuth2 client and a SAML provider. */
function realmWithApplication(name) {
  return {
    apps: [
      {
        _id: `id-${name}`,
        _rev: '1',
        name,
        templateName: 'web',
        templateVersion: '1.0',
      },
    ],
    owned: [
      {
        kind: 'oauth2Client',
        id: CLIENT,
        owners: [{ applicationId: `id-${name}`, applicationName: name }],
      },
      {
        kind: 'saml2Provider',
        id: IDP,
        owners: [{ applicationId: `id-${name}`, applicationName: name }],
      },
    ],
  };
}

/** The kind-path files that `pull oauth2-agents` and `pull saml` write for the objects of a realm, at the path below `base`. */
function putKindPathFiles(base, realmFolder) {
  const files = [
    [
      `${realmFolder}/realm-config/agents/OAuth2Client/${CLIENT}.json`,
      { _id: CLIENT },
    ],
    [
      `${realmFolder}/realm-config/saml/hosted/idp.json`,
      { config: { entityId: IDP } },
    ],
  ];
  return files.map(([relative, content]) => {
    const file = path.join(base, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(content));
    return file;
  });
}

/** Every file below a folder (path to content) and every folder (path with a trailing slash), sorted, relative to `base`. */
function snapshot(folder, base = folder, skip = undefined) {
  const found = {};
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (full === skip) continue;
      const relative = path.relative(base, full);
      if (entry.isDirectory()) {
        found[`${relative}/`] = '';
        walk(full);
      } else {
        found[relative] = fs.readFileSync(full, 'utf8');
      }
    }
  };
  walk(folder);
  return Object.fromEntries(Object.entries(found).sort());
}
/** Everything in the temporary folder except what is below the config folder. */
const outside = () => snapshot(root, root, configFolder);

const migrate = (dryRun = false) =>
  configManagerMigrateApplications(undefined, dryRun, false);
const said = () => printed.join('\n');

/** The realms that a tenant could name, by what is wrong with them. */
const HOSTILE_REALMS = [
  ['goes up', '../../../escape'],
  ['goes up from a folder', 'x/../../../escape'],
  ['is an absolute path that goes up', '/../../../escape'],
  ['goes up by backslashes', '..\\..\\..\\escape'],
  ['holds a control character', 'x\u0000y'],
];

describe('a realm of the tenant that is a hostile name', () => {
  test.each(HOSTILE_REALMS)(
    'that %s: nothing outside the config folder is looked at or removed, and the other realm is migrated',
    async (_what, realm) => {
      // where the realm would lead (two and three levels up from the realms folder)
      const sentinels = [
        ...putKindPathFiles(path.join(root, 'a'), 'escape'),
        ...putKindPathFiles(path.join(root, 'a', 'b'), 'escape'),
      ];
      const legacy = putKindPathFiles(configFolder, 'realms/alpha');
      tenant.alpha = realmWithApplication('Zion Portal');
      tenant[realm] = realmWithApplication('Evil');
      const before = outside();

      // the application of the hostile realm has no folder, so the command fails (it is a failure of that application)
      expect(await migrate()).toBe(false);

      for (const file of sentinels) {
        expect(fs.existsSync(file)).toBe(true);
      }
      expect(outside()).toEqual(before);
      // the files were not looked for: nothing says that they were kept or removed
      expect(said()).not.toMatch(/^(Kept|Removed) .*escape/m);
      expect(said()).not.toMatch(/Dry run/);
      // the application of the realm that is a name is moved, as it always was
      for (const file of legacy) {
        expect(fs.existsSync(file)).toBe(false);
      }
      expect(
        fs.existsSync(
          path.join(
            configFolder,
            'realms',
            'alpha',
            'applications',
            'Zion Portal',
            'application.json'
          )
        )
      ).toBe(true);
      expect(said()).toMatch(/^Removed realms\/alpha\/realm-config\/agents/m);
      expect(said()).toMatch(/^Removed realms\/alpha\/realm-config\/saml/m);
    }
  );

  test.each(HOSTILE_REALMS)(
    'that %s: a dry run does not look at anything outside the config folder either',
    async (_what, realm) => {
      const sentinels = [
        ...putKindPathFiles(path.join(root, 'a'), 'escape'),
        ...putKindPathFiles(path.join(root, 'a', 'b'), 'escape'),
      ];
      tenant.alpha = realmWithApplication('Zion Portal');
      tenant[realm] = realmWithApplication('Evil');
      const before = outside();

      await migrate(true);

      for (const file of sentinels) {
        expect(fs.existsSync(file)).toBe(true);
      }
      expect(outside()).toEqual(before);
      expect(said()).not.toMatch(/escape\/realm-config/);
    }
  );

  test('the files of a realm that is a name are removed from where they are', async () => {
    const legacy = putKindPathFiles(configFolder, 'realms/parent/child');
    tenant['/parent/child'] = realmWithApplication('Zion Portal');

    expect(await migrate()).toBe(true);

    for (const file of legacy) {
      expect(fs.existsSync(file)).toBe(false);
    }
  });
});
