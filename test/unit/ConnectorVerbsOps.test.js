/**
 * Unit tests for the connector verbs list, describe, export, import and delete
 * (src/ops/ConnectorOps.ts, frodo-cli#374), without a tenant. The real import
 * graph pulls in all of frodo-lib, whose bundled ESM cannot load under jest's
 * ESM runtime, so the facade and the console are mocked before the module under
 * test is imported. What these tests guard is what the commands add to the
 * library: the connector info provider that the library's read returns with the
 * connectors is never listed, exported or deleted, a secret in the configuration
 * is not in the table, every connector of a bulk command is its own operation
 * (record 0040), and a file that cannot be used is an error, not a quiet success.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

const HOST = 'https://openam-alpha.example.com/am';

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);
const everythingPrinted = () => printed.map((entry) => entry.msg).join('\n');

const connector = (name, more = {}) => ({
  _id: `provisioner.openicf/${name}`,
  enabled: true,
  connectorRef: {
    bundleName: 'org.forgerock.openicf.connectors.ldap-connector',
    bundleVersion: '[1.5.0.0,1.6.0.0)',
    connectorHostRef: 'rcs',
    connectorName: 'org.identityconnectors.ldap.LdapConnector',
    displayName: `${name} directory`,
    systemType: 'provisioner.openicf',
  },
  configurationProperties: {
    host: 'ldap.zion.example',
    credentials: {
      $crypto: { type: 'x-simple-encryption', value: { data: 'SECRETBLOB' } },
    },
  },
  objectTypes: { __ACCOUNT__: {}, __GROUP__: {} },
  ...more,
});

/** What the library's read of the connectors returns: the info provider is among them. */
const INFO_PROVIDER = {
  _id: 'provisioner.openicf.connectorinfoprovider',
  connectorsLocation: { directory: 'connectors' },
};

let stored = [];
let exportedAll = {};
let readFailure;
const calls = [];
const saved = [];
let failingSave;
let failingDelete = new Set();
let importFailure;
let baseDirectory = '';

const lib = {
  createConnectorExportTemplate: () => ({
    meta: { origin: HOST },
    connector: {},
    mapping: {},
  }),
  readConnectors: async () => {
    if (readFailure) throw readFailure;
    return structuredClone(stored);
  },
  readConnector: async (id) => {
    const found = stored.find(
      (entry) => entry._id === `provisioner.openicf/${id}`
    );
    if (!found) throw new Error(`no such connector ${id}`);
    return structuredClone(found);
  },
  exportConnector: async (id, options) => {
    calls.push(['exportConnector', id, options]);
    return {
      meta: { origin: HOST },
      connector: { [id]: connector(id) },
      mapping: options.deps
        ? { [`${id}Mapping`]: { _id: `mapping/${id}Mapping` } }
        : {},
    };
  },
  exportConnectors: async () => ({
    meta: { origin: HOST },
    connector: structuredClone(exportedAll),
    mapping: {},
  }),
  importConnector: async (id, data, options) => {
    calls.push(['importConnector', id, data, options]);
    if (importFailure) throw importFailure;
    return data.connector[id];
  },
  importConnectors: async (data) => {
    calls.push(['importConnectors', data]);
    if (importFailure) throw importFailure;
    return Object.values(data.connector);
  },
  deleteConnector: async (id, deep) => {
    calls.push(['deleteConnector', id, deep]);
    if (failingDelete.has(id)) throw new Error(`could not delete ${id}`);
    return { _id: `provisioner.openicf/${id}` };
  },
  deleteConnectors: async () => {
    calls.push(['deleteConnectors']);
    return [];
  },
  enableConnector: async () => ({}),
  disableConnector: async () => ({}),
};

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  state: {},
  frodo: {
    utils: {
      getTypedFilename: (name, type) => `${name}.${type}.json`,
      saveJsonToFile: (data, file, includeMeta) => {
        if (failingSave && file.includes(failingSave)) {
          throw new Error('could not write the file');
        }
        saved.push({ data, file, includeMeta });
      },
      getFilePath: (file) =>
        baseDirectory ? path.join(baseDirectory, file) : file,
      getWorkingDirectory: () => baseDirectory || '.',
    },
    idm: { connector: lib },
  },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: (msg, type) => printed.push({ msg: String(msg), type }),
  printError: (error, message) =>
    printed.push({
      msg: [message, error?.message ?? String(error)]
        .filter(Boolean)
        .join(': '),
      type: 'error',
    }),
  createTable: () => {
    const rows = [];
    return {
      push: (row) => rows.push(row),
      toString: () => rows.map((row) => row.join(' | ')).join('\n'),
    };
  },
  createProgressIndicator: () => 'indicator',
  updateProgressIndicator: () => {},
  stopProgressIndicator: () => {},
  showSpinner: () => {},
  succeedSpinner: (msg) => printed.push({ msg: String(msg), type: 'spinner' }),
  failSpinner: (msg) =>
    printed.push({ msg: String(msg), type: 'spinner-failed' }),
  debugMessage: () => {},
}));

// the theme reads the terminal helpers of the library; the colours do not matter here
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: {
    heading: (text) => text,
    positive: (text) => text,
    negative: (text) => text,
  },
}));

const {
  deleteConnector,
  deleteConnectors,
  describeConnector,
  exportConnectorToFile,
  exportConnectorsToFile,
  exportConnectorsToFiles,
  importConnectorFromFile,
  importConnectorsFromFile,
  importConnectorsFromFiles,
  importFirstConnectorFromFile,
  listConnectors,
} = await import('../../src/ops/ConnectorOps.ts');

const savedFile = (entry) => path.relative(baseDirectory, entry.file);

const writeFile = (name, data) =>
  fs.writeFileSync(path.join(baseDirectory, name), JSON.stringify(data));

beforeEach(() => {
  printed.length = 0;
  calls.length = 0;
  saved.length = 0;
  stored = [];
  exportedAll = {};
  readFailure = undefined;
  failingSave = undefined;
  failingDelete = new Set();
  importFailure = undefined;
  baseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-connector-'));
});

afterEach(() => {
  fs.rmSync(baseDirectory, { recursive: true, force: true });
});

describe('listConnectors', () => {
  beforeEach(() => {
    stored = [
      connector('Zion'),
      INFO_PROVIDER,
      connector('Alpha', { enabled: false }),
    ];
  });

  test('lists the id of every connector, sorted, without the info provider', async () => {
    await expect(listConnectors()).resolves.toBe(true);

    expect(messages('data')).toEqual(['Alpha', 'Zion']);
  });

  test('--long shows the status, the connector type, the version and the host', async () => {
    await expect(listConnectors(true)).resolves.toBe(true);

    const [table] = messages('data');
    expect(table.split('\n')).toEqual([
      'Alpha | disabled | Alpha directory | org.identityconnectors.ldap.LdapConnector | [1.5.0.0,1.6.0.0) | rcs',
      'Zion | enabled | Zion directory | org.identityconnectors.ldap.LdapConnector | [1.5.0.0,1.6.0.0) | rcs',
    ]);
  });

  test('a connector with no enabled flag is enabled, as IDM treats it', async () => {
    const noFlag = connector('Flagless');
    delete noFlag.enabled;
    stored = [noFlag];

    await listConnectors(true);

    expect(messages('data')[0]).toContain('Flagless | enabled');
  });

  test('no connector is not a failure', async () => {
    stored = [INFO_PROVIDER];

    await expect(listConnectors()).resolves.toBe(true);

    expect(messages('data')).toEqual([]);
  });

  test('a failing read prints the error and fails', async () => {
    readFailure = new Error('Error reading connectors');

    await expect(listConnectors()).resolves.toBe(false);

    expect(messages('error')[0]).toContain('Error reading connectors');
  });
});

describe('describeConnector', () => {
  beforeEach(() => {
    stored = [connector('Zion')];
  });

  test('the table names the connector and leaves the configuration properties out', async () => {
    await expect(describeConnector('Zion')).resolves.toBe(true);

    const [table] = messages('data');
    expect(table).toContain('Id | Zion');
    expect(table).toContain('Status | enabled');
    expect(table).toContain('Display name | Zion directory');
    expect(table).toContain(
      'Connector | org.identityconnectors.ldap.LdapConnector'
    );
    expect(table).toContain('Host | rcs');
    expect(table).toContain('Object types | __ACCOUNT__, __GROUP__');
    expect(table).not.toContain('SECRETBLOB');
    expect(table).not.toContain('ldap.zion.example');
  });

  test('--json prints the configuration as IDM keeps it, secrets still encrypted', async () => {
    await expect(describeConnector('Zion', true)).resolves.toBe(true);

    const printedJson = JSON.parse(messages('data')[0]);
    expect(printedJson).toEqual(stored[0]);
    expect(messages('data')[0]).toContain('$crypto');
  });

  test('a connector that does not exist fails and names it', async () => {
    await expect(describeConnector('Missing')).resolves.toBe(false);

    expect(messages('error')[0]).toContain('Missing');
  });
});

describe('exportConnectorToFile', () => {
  test('exports the connector with its mappings to <id>.connector.idm.json', async () => {
    await expect(
      exportConnectorToFile('Zion', undefined, true, true)
    ).resolves.toBe(true);

    expect(calls).toEqual([
      ['exportConnector', 'Zion', { deps: true, useStringArrays: true }],
    ]);
    expect(saved).toHaveLength(1);
    expect(savedFile(saved[0])).toBe('Zion.connector.idm.json');
    expect(saved[0].includeMeta).toBe(true);
    expect(Object.keys(saved[0].data.mapping)).toEqual(['ZionMapping']);
  });

  test('--no-deps leaves the mappings out, -f names the file, -N leaves the metadata out', async () => {
    await expect(
      exportConnectorToFile('Zion', 'mine.json', false, false)
    ).resolves.toBe(true);

    expect(calls[0][2].deps).toBe(false);
    expect(savedFile(saved[0])).toBe('mine.json');
    expect(saved[0].includeMeta).toBe(false);
    expect(saved[0].data.mapping).toEqual({});
  });

  test('a file that cannot be written fails', async () => {
    failingSave = 'Zion';

    await expect(exportConnectorToFile('Zion', undefined)).resolves.toBe(false);

    expect(messages('error')).not.toEqual([]);
  });
});

describe('exportConnectorsToFile', () => {
  test('writes all connectors to allConnectors.connector.idm.json and leaves the info provider out', async () => {
    exportedAll = {
      Zion: connector('Zion'),
      // the library keys a configuration without an id after the prefix as "undefined"
      undefined: INFO_PROVIDER,
    };

    await expect(exportConnectorsToFile(undefined, true)).resolves.toBe(true);

    expect(saved).toHaveLength(1);
    expect(savedFile(saved[0])).toBe('allConnectors.connector.idm.json');
    expect(Object.keys(saved[0].data.connector)).toEqual(['Zion']);
    expect(messages('info')[0]).toContain('Exported 1 connector to');
  });

  test('-f names the file', async () => {
    exportedAll = { Zion: connector('Zion') };

    await exportConnectorsToFile('all.json', false);

    expect(savedFile(saved[0])).toBe('all.json');
    expect(saved[0].includeMeta).toBe(false);
  });
});

describe('exportConnectorsToFiles', () => {
  beforeEach(() => {
    exportedAll = {
      Alpha: connector('Alpha'),
      Zion: connector('Zion'),
      undefined: INFO_PROVIDER,
    };
  });

  test('writes one file per connector and none for the info provider', async () => {
    await expect(exportConnectorsToFiles(true)).resolves.toBe(true);

    expect(saved.map(savedFile)).toEqual([
      'Alpha.connector.idm.json',
      'Zion.connector.idm.json',
    ]);
    expect(Object.keys(saved[1].data.connector)).toEqual(['Zion']);
  });

  test('a connector whose file cannot be written is named, the others are still written, and the run fails', async () => {
    failingSave = 'Alpha';

    await expect(exportConnectorsToFiles(true)).resolves.toBe(false);

    expect(saved.map(savedFile)).toEqual(['Zion.connector.idm.json']);
    expect(messages('error').join('\n')).toContain('1 of 2 connectors failed');
    expect(messages('error').join('\n')).toContain('Alpha');
  });

  test('--allow-failures reports the failure but succeeds', async () => {
    failingSave = 'Alpha';

    await expect(exportConnectorsToFiles(true, true)).resolves.toBe(true);

    expect(messages('warn').join('\n')).toContain('1 of 2 connectors failed');
  });
});

describe('importing', () => {
  const file = (name = 'in.json') => name;

  beforeEach(() => {
    writeFile('in.json', {
      meta: { origin: HOST },
      connector: { Alpha: connector('Alpha'), Zion: connector('Zion') },
      mapping: { zm: { _id: 'mapping/zm' } },
    });
  });

  test('-i imports that connector with the mappings of the file', async () => {
    await expect(importConnectorFromFile('Zion', file(), true)).resolves.toBe(
      true
    );

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('importConnector');
    expect(calls[0][1]).toBe('Zion');
    expect(calls[0][3]).toEqual({ deps: true });
  });

  test('--no-deps passes deps false', async () => {
    await importConnectorFromFile('Zion', file(), false);

    expect(calls[0][3]).toEqual({ deps: false });
  });

  test('a file without a mapping section gets an empty one, because the library walks it', async () => {
    writeFile('bare.json', { connector: { Zion: connector('Zion') } });

    await expect(
      importConnectorFromFile('Zion', 'bare.json', true)
    ).resolves.toBe(true);

    expect(calls[0][2].mapping).toEqual({});
  });

  test('a connector that is not in the file is an error and nothing is sent', async () => {
    await expect(
      importConnectorFromFile('Missing', file(), true)
    ).resolves.toBe(false);

    expect(calls).toEqual([]);
    expect(messages('error')[0]).toContain('Connector Missing not found in');
  });

  test('a file without connectors is an error', async () => {
    writeFile('empty.json', { meta: {} });

    await expect(
      importConnectorFromFile('Zion', 'empty.json', true)
    ).resolves.toBe(false);
    await expect(
      importFirstConnectorFromFile('empty.json', true)
    ).resolves.toBe(false);

    expect(calls).toEqual([]);
    expect(messages('error')[0]).toContain('No connectors found in');
  });

  test('a file that is not JSON is an error', async () => {
    fs.writeFileSync(path.join(baseDirectory, 'bad.json'), '{ nope');

    await expect(
      importConnectorFromFile('Zion', 'bad.json', true)
    ).resolves.toBe(false);
    await expect(importConnectorsFromFile('bad.json')).resolves.toBe(false);
  });

  test('a library failure fails', async () => {
    importFailure = new Error('Error importing connector Zion');

    await expect(importConnectorFromFile('Zion', file(), true)).resolves.toBe(
      false
    );

    expect(messages('error').join('\n')).toContain(
      'Error importing connector Zion'
    );
  });

  test('without -i or -a the first connector of the file is imported', async () => {
    await expect(importFirstConnectorFromFile(file(), true)).resolves.toBe(
      true
    );

    expect(calls.map((call) => call.slice(0, 2))).toEqual([
      ['importConnector', 'Alpha'],
    ]);
  });

  test('-a imports all the connectors of the file', async () => {
    await expect(importConnectorsFromFile(file())).resolves.toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('importConnectors');
    expect(Object.keys(calls[0][1].connector)).toEqual(['Alpha', 'Zion']);
  });

  test('-a: the connectors the library could not import are named, the run fails, --allow-failures succeeds', async () => {
    const nested = new Error('Error updating connector Zion');
    importFailure = Object.assign(new Error('Error importing connectors'), {
      originalErrors: [nested],
    });

    await expect(importConnectorsFromFile(file())).resolves.toBe(false);

    expect(messages('error').join('\n')).toContain('1 of 2 connectors failed');
    expect(messages('error').join('\n')).toContain('Zion');

    printed.length = 0;
    await expect(importConnectorsFromFile(file(), true)).resolves.toBe(true);
    expect(messages('warn').join('\n')).toContain('1 of 2 connectors failed');
  });

  test('-A imports the *.connector.idm.json files of the working directory together', async () => {
    writeFile('Alpha.connector.idm.json', {
      meta: { origin: HOST },
      connector: { Alpha: connector('Alpha') },
      mapping: {},
    });
    writeFile('Zion.connector.idm.json', {
      meta: { origin: HOST },
      connector: { Zion: connector('Zion') },
      mapping: {},
    });

    await expect(importConnectorsFromFiles()).resolves.toBe(true);

    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0][1].connector)).toEqual(['Alpha', 'Zion']);
  });

  test('-A with no matching file warns and is not a failure', async () => {
    await expect(importConnectorsFromFiles()).resolves.toBe(true);

    expect(calls).toEqual([]);
    expect(messages('warn')[0]).toContain(
      'No connector files (*.connector.idm.json) found in'
    );
  });

  test('-A: a file that cannot be read is a failed item, the others are still imported', async () => {
    fs.writeFileSync(
      path.join(baseDirectory, 'Bad.connector.idm.json'),
      '{ nope'
    );
    writeFile('Zion.connector.idm.json', {
      connector: { Zion: connector('Zion') },
    });

    await expect(importConnectorsFromFiles()).resolves.toBe(false);

    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0][1].connector)).toEqual(['Zion']);
    expect(messages('error').join('\n')).toContain('Bad.connector.idm.json');

    printed.length = 0;
    calls.length = 0;
    await expect(importConnectorsFromFiles(true)).resolves.toBe(true);
    expect(calls).toHaveLength(1);
  });
});

describe('deleteConnector', () => {
  test('deletes the connector and passes --deep on', async () => {
    await expect(deleteConnector('Zion', true)).resolves.toBe(true);
    await expect(deleteConnector('Alpha')).resolves.toBe(true);

    expect(calls).toEqual([
      ['deleteConnector', 'Zion', true],
      ['deleteConnector', 'Alpha', false],
    ]);
  });

  test('a failing delete fails', async () => {
    failingDelete = new Set(['Zion']);

    await expect(deleteConnector('Zion')).resolves.toBe(false);

    expect(messages('spinner-failed')[0]).toContain(
      'Error deleting connector Zion'
    );
  });
});

describe('deleteConnectors', () => {
  beforeEach(() => {
    stored = [connector('Zion'), INFO_PROVIDER, connector('Alpha')];
  });

  test('deletes every connector on its own, and not the info provider or through the library delete-all', async () => {
    await expect(deleteConnectors(false)).resolves.toBe(true);

    expect(calls).toEqual([
      ['deleteConnector', 'Alpha', false],
      ['deleteConnector', 'Zion', false],
    ]);
    expect(messages('spinner')[0]).toBe('Deleted 2 connectors.');
  });

  test('--deep is passed on for every connector', async () => {
    await deleteConnectors(true);

    expect(calls.map((call) => call[2])).toEqual([true, true]);
  });

  test('one that cannot be deleted is named, the others are still deleted, and the run fails', async () => {
    failingDelete = new Set(['Alpha']);

    await expect(deleteConnectors(false)).resolves.toBe(false);

    expect(calls.map((call) => call[1])).toEqual(['Alpha', 'Zion']);
    expect(messages('error').join('\n')).toContain('1 of 2 connectors failed');
    expect(messages('error').join('\n')).toContain('Alpha');
    expect(messages('spinner-failed')[0]).toBe(
      'Some connectors could not be deleted'
    );
  });

  test('--allow-failures reports the failure but succeeds', async () => {
    failingDelete = new Set(['Alpha']);

    await expect(deleteConnectors(false, true)).resolves.toBe(true);

    expect(messages('warn').join('\n')).toContain('1 of 2 connectors failed');
  });

  test('no connector is not a failure', async () => {
    stored = [INFO_PROVIDER];

    await expect(deleteConnectors(false)).resolves.toBe(true);

    expect(calls).toEqual([]);
    expect(messages('spinner')[0]).toBe('Deleted 0 connectors.');
  });

  test('a failing read deletes nothing and fails', async () => {
    readFailure = new Error('Error reading connectors');

    await expect(deleteConnectors(false)).resolves.toBe(false);

    expect(calls).toEqual([]);
    expect(everythingPrinted()).toContain('Error reading connectors');
  });
});
