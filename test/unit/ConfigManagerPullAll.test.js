import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Two rules of `frodo config-manager pull all` and `pull all-static`:
 *
 * - Org privileges are static configuration (the privileges under /openidm/config),
 *   so a pull exports the global assignments and the file of every realm, or of the
 *   one realm that was asked for. The export is awaited, so a failure is seen.
 * - A step that reads a file from the config folder (authz policy sets, OAuth2
 *   clients, SAML, service objects, raw, CSP) never aborts the other steps.
 */

const printError = jest.fn();
const verboseMessage = jest.fn();
const readConfigEntity = jest.fn();
const saveJsonToFile = jest.fn();
const readRealms = jest.fn();
const setRealm = jest.fn();
let deploymentType = 'cloud';

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    idm: {
      config: { readConfigEntity, importConfigEntities: jest.fn() },
    },
    realm: { readRealms },
    utils: {
      getFilePath: (p) => `out/${p}`,
      saveJsonToFile,
      constants: {
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        DEFAULT_REALM_KEY: '__default__realm__',
      },
    },
  },
  state: {
    getDeploymentType: () => deploymentType,
    setRealm,
  },
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printError,
  verboseMessage,
}));

const {
  configManagerExportOrgPrivilegesAllRealms,
  configManagerExportOrgPrivilegesRealm,
} = await import('../../src/configManagerOps/FrConfigOrgPrivilegesOps');
const { configFileStep, existingConfigFile } =
  await import('../../src/configManagerOps/ConfigFileStep');

const saved = () => saveJsonToFile.mock.calls.map(([, file]) => file);

describe('configManagerExportOrgPrivilegesAllRealms', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    deploymentType = 'cloud';
    readRealms.mockResolvedValue([
      { name: '/' },
      { name: 'alpha' },
      { name: 'bravo' },
    ]);
    readConfigEntity.mockImplementation(async (id) => ({ _id: id }));
  });

  it('exports the global assignments and every realm, except the root realm on cloud', async () => {
    expect(await configManagerExportOrgPrivilegesAllRealms()).toBe(true);
    expect(saved()).toEqual([
      'out/org-privileges/privilegeAssignments.json',
      'out/org-privileges/alphaOrgPrivileges.json',
      'out/org-privileges/bravoOrgPrivileges.json',
    ]);
    expect(setRealm.mock.calls.map(([r]) => r)).toEqual(['alpha', 'bravo']);
  });

  it('exports the root realm too when the deployment is not cloud', async () => {
    deploymentType = 'forgeops';
    await configManagerExportOrgPrivilegesAllRealms();
    expect(saved()).toContain('out/org-privileges/privilegeAssignments.json');
    expect(readConfigEntity).toHaveBeenCalledWith('/OrgPrivileges');
  });

  it('exports only the given realm, plus the global assignments, without listing the realms', async () => {
    expect(await configManagerExportOrgPrivilegesAllRealms('bravo')).toBe(true);
    expect(saved()).toEqual([
      'out/org-privileges/privilegeAssignments.json',
      'out/org-privileges/bravoOrgPrivileges.json',
    ]);
    expect(readRealms).not.toHaveBeenCalled();
  });

  it('treats the default realm key as no realm', async () => {
    await configManagerExportOrgPrivilegesAllRealms('__default__realm__');
    expect(saved()).toHaveLength(3);
  });

  it('reports a failure of the global assignments, and still exports the realms', async () => {
    readConfigEntity.mockImplementation(async (id) => {
      if (id === 'privilegeAssignments') throw new Error('boom');
      return { _id: id };
    });
    expect(await configManagerExportOrgPrivilegesAllRealms()).toBe(false);
    expect(saved()).toEqual([
      'out/org-privileges/alphaOrgPrivileges.json',
      'out/org-privileges/bravoOrgPrivileges.json',
    ]);
  });

  it('waits for the global assignments before it exports the realms', async () => {
    readConfigEntity.mockImplementation(async (id) => {
      if (id === 'privilegeAssignments') {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return { _id: id };
    });
    await configManagerExportOrgPrivilegesAllRealms();
    expect(saved()[0]).toBe('out/org-privileges/privilegeAssignments.json');
    expect(saved()).toHaveLength(3);
  });

  it('treats a realm without org privileges config as nothing to export (ForgeOps has none for its root realm)', async () => {
    deploymentType = 'forgeops';
    readRealms.mockResolvedValue([{ name: '/' }]);
    readConfigEntity.mockImplementation(async (id) => {
      if (id === '/OrgPrivileges') {
        const error = new Error('Not Found');
        error.httpStatus = 404;
        throw error;
      }
      return { _id: id };
    });
    expect(await configManagerExportOrgPrivilegesAllRealms()).toBe(true);
    expect(saved()).toEqual(['out/org-privileges/privilegeAssignments.json']);
    expect(printError).not.toHaveBeenCalled();
  });

  it('still fails a realm export that was asked for by name when its config is missing', async () => {
    readConfigEntity.mockImplementation(async () => {
      const error = new Error('Not Found');
      error.httpStatus = 404;
      throw error;
    });
    expect(await configManagerExportOrgPrivilegesRealm('alpha')).toBe(false);
    expect(printError).toHaveBeenCalledTimes(1);
  });

  it('reports a failure of a realm', async () => {
    readConfigEntity.mockImplementation(async (id) => {
      if (id === 'alphaOrgPrivileges') throw new Error('boom');
      return { _id: id };
    });
    expect(await configManagerExportOrgPrivilegesAllRealms()).toBe(false);
  });
});

describe('configFileStep', () => {
  beforeEach(() => jest.resetAllMocks());

  it('calls the exporter with the file in the config folder', async () => {
    const exporter = jest.fn(async () => true);
    await configFileStep(
      'SAML',
      'saml.json',
      exporter
    )({ configFolder: 'cfg' });
    expect(exporter).toHaveBeenCalledWith('cfg/saml.json');
    expect(printError).not.toHaveBeenCalled();
  });

  it('does not throw when the file is missing, and says which file to provide', async () => {
    const error = new Error('ENOENT');
    const exporter = jest.fn(async () => {
      throw error;
    });
    await expect(
      configFileStep(
        'Authz Policy Sets',
        'authz-policies.json',
        exporter
      )({
        configFolder: 'cfg',
      })
    ).resolves.toBeUndefined();
    expect(printError).toHaveBeenCalledWith(
      error,
      'Error exporting Authz Policy Sets, Please make sure the config file name is authz-policies.json in the config folder.'
    );
  });

  it('lets the next step run after a failing one', async () => {
    const order = [];
    const steps = [
      configFileStep('A', 'a.json', async () => {
        order.push('a');
        throw new Error('boom');
      }),
      configFileStep('B', 'b.json', async () => {
        order.push('b');
        return true;
      }),
    ];
    for (const step of steps) await step({ configFolder: 'cfg' });
    expect(order).toEqual(['a', 'b']);
  });
});

describe('optional config files', () => {
  let folder;

  beforeEach(() => {
    jest.resetAllMocks();
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-all-'));
  });

  it('existingConfigFile gives the path only when the file exists', () => {
    expect(existingConfigFile(undefined, 'raw.json')).toBeNull();
    expect(existingConfigFile(folder, 'raw.json')).toBeNull();
    fs.writeFileSync(path.join(folder, 'raw.json'), '[]');
    expect(existingConfigFile(folder, 'raw.json')).toBe(`${folder}/raw.json`);
  });

  it('an optional step skips quietly when its file is missing', async () => {
    const exporter = jest.fn(async () => true);
    await configFileStep('raw config', 'raw.json', exporter, {
      optional: true,
    })({ configFolder: folder });
    expect(exporter).not.toHaveBeenCalled();
    expect(printError).not.toHaveBeenCalled();
    expect(verboseMessage).toHaveBeenCalledWith(
      'Skipping raw config: no raw.json in the config folder.'
    );
  });

  it('an optional step runs when its file exists', async () => {
    fs.writeFileSync(path.join(folder, 'raw.json'), '[]');
    const exporter = jest.fn(async () => true);
    await configFileStep('raw config', 'raw.json', exporter, {
      optional: true,
    })({ configFolder: folder });
    expect(exporter).toHaveBeenCalledWith(`${folder}/raw.json`);
  });

  it('a step that is not optional still reports a missing file', async () => {
    const exporter = jest.fn(async () => {
      throw new Error('ENOENT');
    });
    await configFileStep(
      'SAML',
      'saml.json',
      exporter
    )({
      configFolder: folder,
    });
    expect(exporter).toHaveBeenCalled();
    expect(printError).toHaveBeenCalledTimes(1);
  });
});
