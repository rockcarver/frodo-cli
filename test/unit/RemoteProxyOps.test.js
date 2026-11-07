/**
 * Unit tests for the remote proxy commands (src/ops/RemoteProxyOps.ts), without
 * a tenant. The real import graph pulls in all of frodo-lib, whose bundled ESM
 * cannot load under jest's ESM runtime, so the facade and the console are
 * mocked before the module under test is imported. What these tests guard is
 * what the commands add to the library: secrets are never printed or written in
 * the clear, secrets that only one tenant can decrypt are flagged, names that
 * cannot be addressed are left out, and a command that cannot succeed sends no
 * request.
 */
import { jest } from '@jest/globals';

const HOST = 'https://openam-alpha.example.com/am';
const OTHER_HOST = 'https://openam-beta.example.com/am';
const CLEAR_SECRET = 'clear-text-secret-1234567890';

/** What IDM returns for a secret it encrypted: no clear text. */
const crypto = (data) => ({ $crypto: { type: 'x-simple-encryption', value: { data } } });

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);
const everythingPrinted = () => printed.map((entry) => entry.msg).join('\n');

const saved = [];
const created = [];
const updated = [];
const imported = [];
let readProxies = [];
let exportedProxies = {};
// where getFilePath puts relative paths; empty keeps them relative to the working directory
let baseDirectory = '';
let importFailure;

const bearer = (name, overrides = {}) => ({
  _id: `external.idm/${name}`,
  enabled: true,
  authType: 'bearer',
  instanceUrl: 'https://openam-beta.example.com/openidm/',
  clientId: 'frodo-proxy',
  clientSecret: crypto('AAAA'),
  tokenEndpoint: 'https://openam-beta.example.com/am/oauth2/access_token',
  tokenEndpointAuthMethod: 'client_secret_post',
  scope: ['fr:idm:*'],
  scopeDelimiter: ' ',
  ...overrides,
});

const remoteProxy = {
  REMOTE_PROXY_TYPE: 'external.idm',
  isValidRemoteProxyName: (name) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name),
  getTenantBoundSecrets: (proxy) =>
    ['password', 'clientSecret'].filter(
      (property) => proxy[property] && typeof proxy[property] === 'object'
    ),
  readRemoteProxies: async () => readProxies,
  readRemoteProxy: async (name) => {
    const proxy = readProxies.find((p) => p._id === `external.idm/${name}`);
    if (!proxy) throw new Error(`no such remote proxy ${name}`);
    return structuredClone(proxy);
  },
  exportRemoteProxy: async (name) => ({
    meta: { origin: HOST },
    remoteProxy: { [name]: bearer(name) },
  }),
  exportRemoteProxies: async () => ({
    meta: { origin: HOST },
    remoteProxy: exportedProxies,
  }),
  createRemoteProxyExportTemplate: () => ({ meta: { origin: HOST }, remoteProxy: {} }),
  importRemoteProxies: async (data) => {
    if (importFailure) throw importFailure;
    imported.push(data);
    return Object.values(data.remoteProxy);
  },
  createRemoteProxy: async (name, data) => {
    created.push({ name, data });
    return data;
  },
  updateRemoteProxy: async (name, data) => {
    updated.push({ name, data });
    return data;
  },
  deleteRemoteProxy: async (name) => ({ _id: `external.idm/${name}` }),
  deleteRemoteProxies: async () => [],
};

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: {
      getTypedFilename: (name, type) => `${name}.${type}.json`,
      saveJsonToFile: (data, file, includeMeta) =>
        saved.push({ data, file, includeMeta }),
      getFilePath: (file) => (baseDirectory ? path.join(baseDirectory, file) : file),
      readJsonFile: (file) => JSON.parse(fs.readFileSync(file, 'utf8')),
      getWorkingDirectory: () => '.',
    },
    idm: { remoteProxy },
  },
  state: { getHost: () => HOST },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: (msg, type) => printed.push({ msg: String(msg), type }),
  printError: (error) =>
    printed.push({ msg: String(error?.message ?? error), type: 'error' }),
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
  succeedSpinner: () => {},
  failSpinner: () => {},
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
  configManagerExportRemoteProxies,
  configManagerImportRemoteProxies,
  createRemoteProxy,
  describeRemoteProxy,
  exportRemoteProxiesToFile,
  exportRemoteProxyToFile,
  importRemoteProxyFromFile,
  listRemoteProxies,
  updateRemoteProxy,
} = await import('../../src/ops/RemoteProxyOps.ts');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

beforeEach(() => {
  printed.length = 0;
  saved.length = 0;
  created.length = 0;
  updated.length = 0;
  imported.length = 0;
  baseDirectory = '';
  importFailure = undefined;
  readProxies = [
    bearer('beta'),
    bearer('alpha-two', { enabled: false, clientSecret: '&{esv.alpha.two}' }),
    bearer('zzspike/slash'),
  ];
  exportedProxies = {
    beta: bearer('beta'),
    'zzspike/slash': bearer('zzspike/slash'),
  };
});

describe('list', () => {
  test('lists the names that can be addressed in order and warns about the others', async () => {
    expect(await listRemoteProxies(false)).toBe(true);

    expect(messages('data')).toEqual(['alpha-two', 'beta']);
    expect(messages('warn').join('\n')).toContain('"zzspike/slash"');
  });

  test('says how a secret is kept and never prints it', async () => {
    expect(await listRemoteProxies(true)).toBe(true);

    const table = messages('data').join('\n');
    expect(table).toContain('encrypted for this tenant');
    expect(table).toContain('ESV placeholder &{esv.alpha.two}');
    expect(table).not.toContain('AAAA');
  });
});

describe('describe', () => {
  test('flags a secret that only this tenant can decrypt, and does not print it', async () => {
    expect(await describeRemoteProxy('beta', false)).toBe(true);

    const output = everythingPrinted();
    expect(output).toContain('Client secret | encrypted for this tenant');
    expect(output).not.toContain('AAAA');
    expect(messages('warn').join('\n')).toContain(
      'clientSecret of this remote proxy is encrypted for this tenant'
    );
  });

  test('an ESV placeholder is portable: no warning', async () => {
    expect(await describeRemoteProxy('alpha-two', false)).toBe(true);

    expect(messages('warn')).toEqual([]);
    expect(everythingPrinted()).toContain('ESV placeholder &{esv.alpha.two}');
  });

  test('--json prints what IDM returns, a warning goes to the other stream', async () => {
    expect(await describeRemoteProxy('beta', true)).toBe(true);

    const json = JSON.parse(messages('data')[0]);
    expect(json.clientSecret.$crypto).toBeDefined();
    expect(messages('warn')).toHaveLength(1);
  });

  test('a remote proxy that does not exist fails', async () => {
    expect(await describeRemoteProxy('nobody', false)).toBe(false);
  });
});

describe('export', () => {
  test('one proxy is written as the library returns it, with a warning for tenant-bound secrets', async () => {
    expect(await exportRemoteProxyToFile('beta', undefined, true)).toBe(true);

    expect(saved).toHaveLength(1);
    expect(saved[0].file).toBe('beta.remoteproxy.idm.json');
    expect(saved[0].data.remoteProxy.beta.clientSecret.$crypto).toBeDefined();
    expect(messages('warn').join('\n')).toContain('beta (clientSecret)');
  });

  test('all proxies: names that cannot be addressed are left out and said so', async () => {
    expect(await exportRemoteProxiesToFile(undefined, true)).toBe(true);

    expect(Object.keys(saved[0].data.remoteProxy)).toEqual(['beta']);
    expect(messages('warn').join('\n')).toContain('"zzspike/slash"');
  });

  test('no metadata is passed on as asked', async () => {
    await exportRemoteProxyToFile('beta', 'mine.json', false);

    expect(saved[0].file).toBe('mine.json');
    expect(saved[0].includeMeta).toBe(false);
  });
});

describe('import', () => {
  let directory;
  const writeExport = (origin, proxies) => {
    const file = path.join(directory, 'export.remoteproxy.idm.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ meta: origin ? { origin } : undefined, remoteProxy: proxies })
    );
    return file;
  };

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-proxy-'));
  });
  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('secrets encrypted for another tenant are imported with a warning that names the tenant', async () => {
    const file = writeExport(OTHER_HOST, { beta: bearer('beta') });

    expect(await importRemoteProxyFromFile('beta', file)).toBe(true);

    expect(imported).toHaveLength(1);
    expect(messages('warn').join('\n')).toContain(OTHER_HOST);
    expect(messages('warn').join('\n')).toContain('beta (clientSecret)');
  });

  test('secrets of this tenant, and ESV placeholders, give no warning', async () => {
    expect(
      await importRemoteProxyFromFile('beta', writeExport(HOST, { beta: bearer('beta') }))
    ).toBe(true);
    expect(
      await importRemoteProxyFromFile(
        'portable',
        writeExport(OTHER_HOST, { portable: bearer('portable', { clientSecret: '&{esv.portable}' }) })
      )
    ).toBe(true);

    expect(messages('warn')).toEqual([]);
  });

  test('a file without metadata is an unknown tenant and warns', async () => {
    expect(
      await importRemoteProxyFromFile('beta', writeExport(undefined, { beta: bearer('beta') }))
    ).toBe(true);

    expect(messages('warn').join('\n')).toContain('an unknown tenant');
  });

  test('only the proxy asked for is imported', async () => {
    const file = writeExport(HOST, {
      beta: bearer('beta'),
      other: bearer('other'),
    });

    expect(await importRemoteProxyFromFile('beta', file)).toBe(true);

    expect(Object.keys(imported[0].remoteProxy)).toEqual(['beta']);
  });

  test('a proxy that is not in the file is an error and nothing is imported', async () => {
    const file = writeExport(HOST, { beta: bearer('beta') });

    expect(await importRemoteProxyFromFile('missing', file)).toBe(false);

    expect(imported).toEqual([]);
    expect(messages('error').join('\n')).toContain('Remote proxy missing not found');
  });
});

describe('config-manager export', () => {
  test('writes one file per proxy under remote-proxies, as IDM returns it and without metadata', async () => {
    expect(await configManagerExportRemoteProxies()).toBe(true);

    expect(saved.map((entry) => entry.file)).toEqual([
      'remote-proxies/beta.json',
      'remote-proxies/alpha-two.json',
    ]);
    expect(saved.every((entry) => entry.includeMeta === false)).toBe(true);
    expect(saved[0].data).toEqual(bearer('beta'));
  });

  test('a name that cannot be addressed is left out and said so', async () => {
    await configManagerExportRemoteProxies();

    expect(saved.map((entry) => entry.file)).not.toContain('remote-proxies/zzspike/slash.json');
    expect(messages('warn').join('\n')).toContain('"zzspike/slash"');
  });

  test('secrets that only this tenant can decrypt are flagged, an ESV placeholder is not', async () => {
    await configManagerExportRemoteProxies();
    expect(messages('warn').join('\n')).toContain('beta (clientSecret)');
    expect(messages('warn').join('\n')).not.toContain('alpha-two');

    printed.length = 0;
    await configManagerExportRemoteProxies('alpha-two');
    expect(messages('warn')).toEqual([]);
  });

  test('one proxy by name writes only that file', async () => {
    expect(await configManagerExportRemoteProxies('alpha-two')).toBe(true);

    expect(saved.map((entry) => entry.file)).toEqual(['remote-proxies/alpha-two.json']);
  });

  test('a proxy that does not exist is an error and writes nothing', async () => {
    expect(await configManagerExportRemoteProxies('nothing')).toBe(false);

    expect(saved).toEqual([]);
    expect(messages('error').join('\n')).toContain('no such remote proxy nothing');
  });

  test('a tenant without remote proxies writes nothing, says so, and succeeds', async () => {
    readProxies = [];

    expect(await configManagerExportRemoteProxies()).toBe(true);

    expect(saved).toEqual([]);
    expect(messages('info')).toEqual(['No remote proxies found.']);
  });

  test('quiet (the step of pull all) says nothing when there is no proxy', async () => {
    readProxies = [];

    expect(await configManagerExportRemoteProxies(undefined, true)).toBe(true);

    expect(printed).toEqual([]);
  });
});

describe('config-manager import', () => {
  const writeProxy = (name, proxy = bearer(name), file = `${name}.json`) => {
    fs.mkdirSync(path.join(baseDirectory, 'remote-proxies'), { recursive: true });
    fs.writeFileSync(path.join(baseDirectory, 'remote-proxies', file), JSON.stringify(proxy));
  };

  beforeEach(() => {
    baseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-proxy-cm-'));
  });
  afterEach(() => {
    fs.rmSync(baseDirectory, { recursive: true, force: true });
  });

  test('imports every json file of remote-proxies in one call, named after the file', async () => {
    writeProxy('beta');
    writeProxy('alpha-two', bearer('alpha-two', { clientSecret: '&{esv.alpha.two}' }));
    writeProxy('notes', {}, 'notes.txt');

    expect(await configManagerImportRemoteProxies()).toBe(true);

    expect(imported).toHaveLength(1);
    expect(Object.keys(imported[0].remoteProxy)).toEqual(['alpha-two', 'beta']);
    expect(imported[0].remoteProxy.beta).toEqual(bearer('beta'));
  });

  test('the files are imported in name order, whatever order the file system lists them in', async () => {
    writeProxy('beta');
    writeProxy('alpha-two');
    const readdir = jest
      .spyOn(fs, 'readdirSync')
      .mockReturnValue(['beta.json', 'alpha-two.json']);

    try {
      expect(await configManagerImportRemoteProxies()).toBe(true);
    } finally {
      readdir.mockRestore();
    }

    expect(Object.keys(imported[0].remoteProxy)).toEqual(['alpha-two', 'beta']);
  });

  test('one proxy by name imports only that file', async () => {
    writeProxy('beta');
    writeProxy('alpha-two');

    expect(await configManagerImportRemoteProxies('beta')).toBe(true);

    expect(Object.keys(imported[0].remoteProxy)).toEqual(['beta']);
  });

  test('a secret encrypted by a tenant warns that its origin is unknown, an ESV placeholder does not', async () => {
    writeProxy('beta');
    await configManagerImportRemoteProxies();
    expect(messages('warn').join('\n')).toContain('an unknown tenant');
    expect(messages('warn').join('\n')).toContain('beta (clientSecret)');

    printed.length = 0;
    writeProxy('beta', bearer('beta', { clientSecret: '&{esv.beta}' }));
    await configManagerImportRemoteProxies();
    expect(messages('warn')).toEqual([]);
  });

  test('without a remote-proxies directory nothing is sent and the message names the directory', async () => {
    expect(await configManagerImportRemoteProxies()).toBe(false);

    expect(imported).toEqual([]);
    expect(messages('error').join('\n')).toContain(
      `No remote proxy files found in ${path.join(baseDirectory, 'remote-proxies')}.`
    );
  });

  test('a directory without json files is the same error', async () => {
    writeProxy('notes', {}, 'notes.txt');

    expect(await configManagerImportRemoteProxies()).toBe(false);

    expect(imported).toEqual([]);
    expect(messages('error').join('\n')).toContain('No remote proxy files found');
  });

  test('a name without a file is an error and nothing is sent', async () => {
    writeProxy('beta');

    expect(await configManagerImportRemoteProxies('nothing')).toBe(false);

    expect(imported).toEqual([]);
    expect(messages('error').join('\n')).toContain('Remote proxy file nothing.json not found');
  });

  test('a refusal by the library is reported and the result is false', async () => {
    writeProxy('beta');
    importFailure = new Error("Remote proxy beta has the id 'external.idm/x'");

    expect(await configManagerImportRemoteProxies()).toBe(false);

    expect(messages('error').join('\n')).toContain("has the id 'external.idm/x'");
  });
});

describe('create', () => {
  const bearerProperties = {
    authType: 'bearer',
    instanceUrl: 'https://openam-beta.example.com/openidm/',
    clientId: 'frodo-proxy',
    clientSecret: '&{esv.beta.proxy.secret}',
    tokenEndpoint: 'https://openam-beta.example.com/am/oauth2/access_token',
    scope: 'fr:idm:*, fr:idc:esv:*',
  };

  test('a bearer proxy with an ESV placeholder is created as asked, without a warning', async () => {
    expect(await createRemoteProxy('beta', bearerProperties)).toBe(true);

    expect(created).toHaveLength(1);
    expect(created[0].data).toMatchObject({
      _id: 'external.idm/beta',
      enabled: true,
      authType: 'bearer',
      clientSecret: '&{esv.beta.proxy.secret}',
      scope: ['fr:idm:*', 'fr:idc:esv:*'],
    });
    expect(messages('warn')).toEqual([]);
  });

  test('a literal secret is passed on, never printed, and the warning says it stays with this tenant', async () => {
    expect(
      await createRemoteProxy('beta', { ...bearerProperties, clientSecret: CLEAR_SECRET })
    ).toBe(true);

    expect(created[0].data.clientSecret).toBe(CLEAR_SECRET);
    expect(everythingPrinted()).not.toContain(CLEAR_SECRET);
    expect(messages('warn').join('\n')).toContain('cannot be moved to another one');
  });

  test('basic authentication needs a user name and a password, and sends nothing without them', async () => {
    expect(
      await createRemoteProxy('beta', {
        authType: 'basic',
        instanceUrl: 'https://openam-beta.example.com/openidm/',
      })
    ).toBe(false);

    expect(created).toEqual([]);
    expect(messages('error').join('\n')).toContain('--basic-user-name');
    expect(messages('error').join('\n')).toContain('--basic-password');
  });

  test('a secret option that nobody resolved (a bare flag) counts as missing', async () => {
    expect(await createRemoteProxy('beta', { ...bearerProperties, clientSecret: true })).toBe(false);

    expect(created).toEqual([]);
    expect(messages('error').join('\n')).toContain('--client-secret');
  });

  test('options of the other authentication type are refused', async () => {
    expect(
      await createRemoteProxy('beta', { ...bearerProperties, basicUserName: 'someone' })
    ).toBe(false);

    expect(created).toEqual([]);
    expect(messages('error').join('\n')).toContain('--basic-user-name belongs to basic authentication');
  });

  test('--disabled creates the proxy disabled', async () => {
    await createRemoteProxy('beta', { ...bearerProperties, disabled: true });

    expect(created[0].data.enabled).toBe(false);
  });
});

describe('update', () => {
  test('changes only what is given and leaves the encrypted secret as IDM returned it', async () => {
    expect(await updateRemoteProxy('beta', { disabled: true, scope: 'fr:idm:*' })).toBe(true);

    expect(updated).toHaveLength(1);
    expect(updated[0].data.enabled).toBe(false);
    expect(updated[0].data.scope).toEqual(['fr:idm:*']);
    expect(updated[0].data.clientSecret).toEqual(crypto('AAAA'));
    expect(updated[0].data.instanceUrl).toBe('https://openam-beta.example.com/openidm/');
  });

  test('a new secret replaces the old one and is never printed', async () => {
    expect(await updateRemoteProxy('beta', { clientSecret: CLEAR_SECRET })).toBe(true);

    expect(updated[0].data.clientSecret).toBe(CLEAR_SECRET);
    expect(everythingPrinted()).not.toContain(CLEAR_SECRET);
  });

  test('a bare secret flag that nobody resolved leaves the secret alone', async () => {
    await updateRemoteProxy('beta', { clientSecret: true, disabled: true });

    expect(updated[0].data.clientSecret).toEqual(crypto('AAAA'));
  });

  test('an option for the other authentication type is refused and nothing is sent', async () => {
    expect(await updateRemoteProxy('beta', { basicUserName: 'someone' })).toBe(false);

    expect(updated).toEqual([]);
    expect(messages('error').join('\n')).toContain('uses bearer authentication');
  });
});
