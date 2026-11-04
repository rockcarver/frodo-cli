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
 *   clients, SAML, service objects, raw, CSP) never aborts the other steps. A
 *   conventional file that is not in the folder is skipped with a warning (there
 *   is nothing to export, decision record 0040); a file that exists and cannot be
 *   processed is a failed step.
 */

const printError = jest.fn();
const printMessage = jest.fn();
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
  printMessage,
  verboseMessage,
}));

const {
  configManagerExportOrgPrivileges,
} = await import('../../src/configManagerOps/FrConfigOrgPrivilegesOps');
const { configFileStep, existingConfigFile } =
  await import('../../src/configManagerOps/ConfigFileStep');

const saved = () => saveJsonToFile.mock.calls.map(([, file]) => file);

describe('configManagerExportOrgPrivileges', () => {
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
    expect(await configManagerExportOrgPrivileges()).toBe(true);
    expect(saved()).toEqual([
      'out/org-privileges/privilegeAssignments.json',
      'out/org-privileges/alphaOrgPrivileges.json',
      'out/org-privileges/bravoOrgPrivileges.json',
    ]);
    expect(readConfigEntity).toHaveBeenCalledWith('privilegeAssignments');
    expect(readConfigEntity).toHaveBeenCalledWith('alphaOrgPrivileges');
    expect(readConfigEntity).toHaveBeenCalledWith('bravoOrgPrivileges');
  });

  it('exports the root realm too when the deployment is not cloud', async () => {
    deploymentType = 'forgeops';
    await configManagerExportOrgPrivileges();
    expect(saved()).toEqual([
      'out/org-privileges/privilegeAssignments.json',
      'out/org-privileges/privileges.json',
      'out/org-privileges/alphaOrgPrivileges.json',
      'out/org-privileges/bravoOrgPrivileges.json',
    ]);
    expect(readConfigEntity).toHaveBeenCalledWith('privilegeAssignments');
    expect(readConfigEntity).toHaveBeenCalledWith('privileges');
    expect(readConfigEntity).toHaveBeenCalledWith('alphaOrgPrivileges');
    expect(readConfigEntity).toHaveBeenCalledWith('bravoOrgPrivileges');
  });

  it('exports only the given realm, plus the global assignments, without listing the realms', async () => {
    const name = 'bravoOrgPrivileges';
    expect(await configManagerExportOrgPrivileges(name)).toBe(true);
    expect(saved()).toEqual([
      `out/org-privileges/${name}.json`,
    ]);
    expect(readConfigEntity).toHaveBeenCalledWith(`${name}`);
  });

  it('reports a failure of the global assignments, and still exports the realms', async () => {
    readConfigEntity.mockImplementation(async (id) => {
      if (id === 'privilegeAssignments') throw new Error('boom');
      return { _id: id };
    });
    expect(await configManagerExportOrgPrivileges()).toBe(false);
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
    await configManagerExportOrgPrivileges();
    expect(saved()[0]).toBe('out/org-privileges/privilegeAssignments.json');
    expect(saved()).toHaveLength(3);
  });

  it('fails an export when unknown org privilege config is request from cloud deployment', async () => {
    expect(await configManagerExportOrgPrivileges('unknown')).toBe(false);
    expect(printMessage).toHaveBeenCalledTimes(1);
    expect(printMessage).toHaveBeenCalledWith(`Error: Unrecognized org config 'unknown'. Recognized org config includes: privilegeAssignments, alphaOrgPrivileges, bravoOrgPrivileges`, 'error');
  });

  it('fails an export when unknown org privilege config is request from forgeops deployment', async () => {
    deploymentType = 'forgeops';
    expect(await configManagerExportOrgPrivileges('unknown')).toBe(false);
    expect(printMessage).toHaveBeenCalledTimes(1);
    expect(printMessage).toHaveBeenCalledWith(`Error: Unrecognized org config 'unknown'. Recognized org config includes: privilegeAssignments, privileges, alphaOrgPrivileges, bravoOrgPrivileges`, 'error');
  });

  it('reports a failure of a realm', async () => {
    readConfigEntity.mockImplementation(async (id) => {
      if (id === 'alphaOrgPrivileges') throw new Error('boom');
      return { _id: id };
    });
    expect(await configManagerExportOrgPrivileges()).toBe(false);
  });
});

describe('configFileStep', () => {
  let folder;

  /** A config folder holding the given files, each with an empty JSON array. */
  const configFolder = (...files) => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-step-'));
    for (const file of files) fs.writeFileSync(path.join(folder, file), '[]');
    return folder;
  };

  beforeEach(() => jest.resetAllMocks());

  it('calls the exporter with the file in the config folder', async () => {
    const exporter = jest.fn(async () => true);
    const outcome = await configFileStep(
      'SAML',
      'saml.json',
      exporter
    )({ configFolder: configFolder('saml.json') });
    expect(exporter).toHaveBeenCalledWith(`${folder}/saml.json`);
    expect(outcome).toBe(true);
    expect(printError).not.toHaveBeenCalled();
    expect(printMessage).not.toHaveBeenCalled();
  });

  it('fails the step when the exporter says it failed', async () => {
    const exporter = jest.fn(async () => false);
    await expect(
      configFileStep(
        'SAML',
        'saml.json',
        exporter
      )({ configFolder: configFolder('saml.json') })
    ).resolves.toBe(false);
  });

  it('a file that exists but is not valid JSON is a failed step, not a skip', async () => {
    // what the four exporters do: they read the file inside a try, print their
    // own error and answer false
    const exporter = jest.fn(async (file) => {
      try {
        JSON.parse(fs.readFileSync(file, 'utf8'));
        return true;
      } catch {
        return false;
      }
    });
    configFolder();
    fs.writeFileSync(path.join(folder, 'saml.json'), '{ not json');
    await expect(
      configFileStep('SAML', 'saml.json', exporter)({ configFolder: folder })
    ).resolves.toBe(false);
    expect(exporter).toHaveBeenCalledTimes(1);
    expect(printMessage).not.toHaveBeenCalled();
  });

  it('does not throw when the exporter throws, and says which file to check', async () => {
    const error = new Error('unexpected');
    const exporter = jest.fn(async () => {
      throw error;
    });
    await expect(
      configFileStep(
        'Authz Policy Sets',
        'authz-policies.json',
        exporter
      )({
        configFolder: configFolder('authz-policies.json'),
      })
    ).resolves.toBe(false);
    expect(printError).toHaveBeenCalledWith(
      error,
      'Error exporting Authz Policy Sets, please make sure authz-policies.json in the config folder can be read and has the expected content.'
    );
  });

  it('skips with a warning that names the file and the folder when the file is missing', async () => {
    const exporter = jest.fn(async () => {
      throw new Error('ENOENT');
    });
    const outcome = await configFileStep(
      'SAML',
      'saml.json',
      exporter
    )({ configFolder: configFolder('other.json') });
    expect(outcome).toBe(true);
    expect(exporter).not.toHaveBeenCalled();
    expect(printError).not.toHaveBeenCalled();
    expect(printMessage).toHaveBeenCalledTimes(1);
    expect(printMessage).toHaveBeenCalledWith(
      `Skipping SAML: no saml.json in '${folder}'.`,
      'warn'
    );
  });

  it('skips with a warning when no config folder was given', async () => {
    const exporter = jest.fn(async () => true);
    const outcome = await configFileStep('SAML', 'saml.json', exporter)({});
    expect(outcome).toBe(true);
    expect(exporter).not.toHaveBeenCalled();
    expect(printMessage).toHaveBeenCalledWith(
      'Skipping SAML: no saml.json in the config folder.',
      'warn'
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
    const config = configFolder('a.json', 'b.json');
    for (const step of steps) await step({ configFolder: config });
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
    const outcome = await configFileStep('raw config', 'raw.json', exporter, {
      optional: true,
    })({ configFolder: folder });
    expect(outcome).toBe(true);
    expect(exporter).not.toHaveBeenCalled();
    expect(printError).not.toHaveBeenCalled();
    expect(verboseMessage).toHaveBeenCalledWith(
      'Skipping raw config: no raw.json in the config folder.'
    );
    expect(printMessage).not.toHaveBeenCalled();
  });

  it('an optional step runs when its file exists', async () => {
    fs.writeFileSync(path.join(folder, 'raw.json'), '[]');
    const exporter = jest.fn(async () => true);
    await configFileStep('raw config', 'raw.json', exporter, {
      optional: true,
    })({ configFolder: folder });
    expect(exporter).toHaveBeenCalledWith(`${folder}/raw.json`);
  });

  it('a step that is not optional skips with a warning, not quietly, when its file is missing', async () => {
    const exporter = jest.fn(async () => true);
    const outcome = await configFileStep(
      'SAML',
      'saml.json',
      exporter
    )({
      configFolder: folder,
    });
    expect(outcome).toBe(true);
    expect(exporter).not.toHaveBeenCalled();
    expect(printMessage).toHaveBeenCalledWith(
      `Skipping SAML: no saml.json in '${folder}'.`,
      'warn'
    );
    expect(verboseMessage).not.toHaveBeenCalled();
    expect(printError).not.toHaveBeenCalled();
  });
});
