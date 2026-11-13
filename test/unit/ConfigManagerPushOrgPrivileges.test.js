import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * `frodo config-manager push org-privileges` imports the privilege assignments and the
 * organization privileges of the realms of the tenant, or the one file that is named.
 *
 * - Only the files of the privilege assignments and of the realms of the tenant are imported:
 *   another `.json` file in the folder (a backup, a file of a realm that the tenant does not
 *   have) is left alone, and never becomes a configuration entity called `undefined`.
 * - A file has to hold the id that its name says, or it is a failed file (named in the summary,
 *   and the other files are still imported, decision record 0040).
 * - A file that cannot be parsed fails that file only.
 */

const printError = jest.fn();
const printMessage = jest.fn();
const verboseMessage = jest.fn();
const importConfigEntities = jest.fn();
const readRealms = jest.fn();
let deploymentType = 'cloud';
let folder;

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    idm: { config: { readConfigEntity: jest.fn(), importConfigEntities } },
    realm: { readRealms },
    utils: {
      getFilePath: (p) => path.join(folder, p),
      readJsonFile: (file) => JSON.parse(fs.readFileSync(file, 'utf8')),
      saveJsonToFile: jest.fn(),
      constants: {
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        DEFAULT_REALM_KEY: '__default__realm__',
      },
    },
  },
  state: { getDeploymentType: () => deploymentType },
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printError,
  printMessage,
  verboseMessage,
}));

const { configManagerImportOrgPrivileges } =
  await import('../../src/configManagerOps/FrConfigOrgPrivilegesOps');

const write = (name, content) =>
  fs.writeFileSync(
    path.join(folder, 'org-privileges', `${name}.json`),
    typeof content === 'string' ? content : JSON.stringify(content)
  );
const entity = (id) => ({ _id: id, privileges: [] });
const imported = () =>
  importConfigEntities.mock.calls.map(([data]) => Object.keys(data.idm)[0]);
const summaries = () =>
  printMessage.mock.calls
    .map(([message]) => String(message))
    .filter((message) => /failed:/.test(message));

describe('configManagerImportOrgPrivileges', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    deploymentType = 'cloud';
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'org-privileges-'));
    fs.mkdirSync(path.join(folder, 'org-privileges'));
    readRealms.mockResolvedValue([
      { name: '/' },
      { name: 'alpha' },
      { name: 'bravo' },
    ]);
    importConfigEntities.mockResolvedValue([]);
    write('privilegeAssignments', entity('privilegeAssignments'));
    write('alphaOrgPrivileges', entity('alphaOrgPrivileges'));
    write('bravoOrgPrivileges', entity('bravoOrgPrivileges'));
  });

  it('imports the privilege assignments first, then the realms of the tenant', async () => {
    expect(await configManagerImportOrgPrivileges()).toBe(true);
    expect(imported()).toEqual([
      'privilegeAssignments',
      'alphaOrgPrivileges',
      'bravoOrgPrivileges',
    ]);
    expect(printError).not.toHaveBeenCalled();
  });

  it('leaves alone a file of a realm that the tenant does not have, and files that are no org privileges', async () => {
    write('charlieOrgPrivileges', entity('charlieOrgPrivileges'));
    write('notes', { note: 'not an org privileges file' });
    write('backup', '{ this is not json');
    expect(await configManagerImportOrgPrivileges()).toBe(true);
    expect(imported()).toEqual([
      'privilegeAssignments',
      'alphaOrgPrivileges',
      'bravoOrgPrivileges',
    ]);
    expect(printError).not.toHaveBeenCalled();
  });

  it('does not import the root realm on cloud, and does on a deployment that is not cloud', async () => {
    write('privileges', entity('privileges'));
    await configManagerImportOrgPrivileges();
    expect(imported()).not.toContain('privileges');

    importConfigEntities.mockClear();
    deploymentType = 'forgeops';
    expect(await configManagerImportOrgPrivileges()).toBe(true);
    expect(imported()).toEqual([
      'privilegeAssignments',
      'privileges',
      'alphaOrgPrivileges',
      'bravoOrgPrivileges',
    ]);
  });

  it('says that the privilege assignments are missing, and still imports the realms', async () => {
    fs.rmSync(path.join(folder, 'org-privileges', 'privilegeAssignments.json'));
    expect(await configManagerImportOrgPrivileges()).toBe(true);
    expect(imported()).toEqual(['alphaOrgPrivileges', 'bravoOrgPrivileges']);
    expect(printMessage).toHaveBeenCalledWith(
      expect.stringContaining('no privilegeAssignments.json'),
      'warn'
    );
  });

  it('fails a file that holds another id than its name says, names it, and imports the others', async () => {
    write('alphaOrgPrivileges', entity('bravoOrgPrivileges'));
    expect(await configManagerImportOrgPrivileges()).toBe(false);
    expect(imported()).toEqual(['privilegeAssignments', 'bravoOrgPrivileges']);
    expect(summaries()).toHaveLength(1);
    expect(summaries()[0]).toMatch(/^1 of 3 configurations failed:/);
    expect(summaries()[0]).toContain('alphaOrgPrivileges');
  });

  it('fails a file without an id instead of importing a configuration called undefined', async () => {
    write('bravoOrgPrivileges', { privileges: [] });
    expect(await configManagerImportOrgPrivileges()).toBe(false);
    expect(imported()).toEqual(['privilegeAssignments', 'alphaOrgPrivileges']);
    expect(imported()).not.toContain('undefined');
  });

  it('fails a file that cannot be parsed, and imports the others', async () => {
    write('alphaOrgPrivileges', '{ broken');
    expect(await configManagerImportOrgPrivileges()).toBe(false);
    expect(imported()).toEqual(['privilegeAssignments', 'bravoOrgPrivileges']);
    expect(summaries()[0]).toContain('alphaOrgPrivileges');
  });

  it('with --allow-failures a failed file does not fail the push, and the summary is still printed', async () => {
    write('alphaOrgPrivileges', '{ broken');
    expect(await configManagerImportOrgPrivileges(undefined, true)).toBe(true);
    expect(summaries()).toHaveLength(1);
  });

  it('imports only the file that is named', async () => {
    expect(await configManagerImportOrgPrivileges('alphaOrgPrivileges')).toBe(
      true
    );
    expect(imported()).toEqual(['alphaOrgPrivileges']);
    expect(readRealms).not.toHaveBeenCalled();
  });

  it('fails a named file that holds another id than its name says', async () => {
    write('alphaOrgPrivileges', entity('bravoOrgPrivileges'));
    expect(await configManagerImportOrgPrivileges('alphaOrgPrivileges')).toBe(
      false
    );
    expect(imported()).toEqual([]);
  });

  it('fails plainly when the named file is not there, and imports nothing', async () => {
    expect(await configManagerImportOrgPrivileges('nosuch')).toBe(false);
    expect(printMessage).toHaveBeenCalledWith(
      expect.stringContaining('Organization privileges file not found'),
      'error'
    );
    expect(imported()).toEqual([]);
  });
});
