import { Buffer } from 'node:buffer';
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
 * The ownership that the standalone push kinds read from the application
 * folders of a tree (decision record 0042, slice S4b of frodo-cli#1101), with
 * the real library: the records are written the way `pull applications` writes
 * them (no `_id`, the SAML entity ids encoded), and the library's own functions
 * turn them into the answer. Nothing talks to a tenant, and the per-user settings
 * are a fake, so nothing here can touch the real home.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const src = (file) => path.resolve(root, 'src', file);

jest.unstable_mockModule(src('utils/SettingsStore'), () => ({
  CONFIG_MANAGER_APPLICATION_LAYOUTS: ['folders', 'kind-paths'],
  getConfigManagerApplicationLayout: () => 'folders',
}));

const { OwnedObjects } = await import(src('ops/ApplicationOwnedObjects.ts'));
const { state } = await import('@rockcarver/frodo-lib');

let tmp;

const write = (rel, content) => {
  const target = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(content, null, 2));
};

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-ownership-of-tree-'));
  write('realms/alpha/applications/Zion_SSO/application.json', {
    name: 'Zion SSO',
    ssoEntities: {
      oidcId: 'sso-client',
      idpPrivateId: Buffer.from('https://idp.zion.example.com').toString(
        'base64url'
      ),
      spPrivateId: Buffer.from('https://sp.zion.example.com').toString(
        'base64url'
      ),
    },
  });
  write('realms/bravo/applications/Zion_HR/application.json', {
    name: 'Zion HR',
    connectorId: 'Entra',
    mappingNames: ['systemEntraUser_managedBravo_user'],
  });
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('the ownership of the realms of a tree, with the real library', () => {
  test('a realm names the OAuth2 client and both SAML providers of its application, with the entity ids decoded', () => {
    const owned = new OwnedObjects();
    state.setRealm('alpha');

    owned.loadRealmOfTree(tmp, 'alpha');

    expect(owned.ownersInCurrentRealm('oauth2Client', 'sso-client')).toEqual([
      { realm: 'alpha', applicationName: 'Zion SSO' },
    ]);
    expect(
      owned.ownersInCurrentRealm(
        'saml2Provider',
        'https://idp.zion.example.com'
      )
    ).toHaveLength(1);
    expect(
      owned.ownersInCurrentRealm('saml2Provider', 'https://sp.zion.example.com')
    ).toHaveLength(1);
    expect(owned.ownersInCurrentRealm('oauth2Client', 'other')).toEqual([]);
  });

  test('the connector and the mappings are owned in whichever realm the application is', () => {
    const owned = new OwnedObjects();
    state.setDeploymentType('cloud');

    owned.loadAllRealmsOfTree(tmp);

    expect(owned.ownersInAnyRealm('connector', 'Entra')).toEqual([
      { realm: 'bravo', applicationName: 'Zion HR' },
    ]);
    expect(
      owned.ownersInAnyRealm('mapping', 'systemEntraUser_managedBravo_user')
    ).toEqual([{ realm: 'bravo', applicationName: 'Zion HR' }]);
    expect(owned.ownersInAnyRealm('connector', 'Workday')).toEqual([]);
  });
});
