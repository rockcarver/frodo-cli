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
 * The single-item writers that `pull scripts`, `pull saml` and
 * `pull connector-mappings` share with the commands that pull one of these
 * objects because an application uses it (frodo-cli#1101, record 0042):
 * `exportScriptToFiles`, `exportCircleOfTrustToFile`, `readSamlProviderForFile`
 * and `exportMappingToDirectory`. The library is a deep stub, the files are real,
 * in a temporary folder.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const src = (file) => path.resolve(root, 'src', file);

/** A function that is a spy and, for any property read, another such function. */
function deepStub() {
  const children = new Map();
  return new Proxy(jest.fn(), {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      if (!children.has(prop)) children.set(prop, deepStub());
      return children.get(prop);
    },
  });
}

const frodo = deepStub();
const state = deepStub();
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo,
  state,
  FrodoError: class FrodoError extends Error {},
}));
const { exportScriptToFiles } = await import(
  src('configManagerOps/FrConfigScriptOps.ts')
);
const { exportCircleOfTrustToFile, readSamlProviderForFile } = await import(
  src('configManagerOps/FrConfigSamlOps.ts')
);
const { exportMappingToDirectory } = await import(
  src('configManagerOps/FrConfigConnectorMappingOps.ts')
);

let tmp;
const read = (rel) => fs.readFileSync(path.join(tmp, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-shared-writers-'));
  frodo.utils.getFilePath.mockReset().mockImplementation((rel) => {
    const target = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    return target;
  });
  frodo.utils.saveJsonToFile
    .mockReset()
    .mockImplementation((data, file) =>
      fs.writeFileSync(file, JSON.stringify(data))
    );
  frodo.utils.saveTextToFile
    .mockReset()
    .mockImplementation((data, file) => fs.writeFileSync(file, data));
  frodo.utils.decodeBase64
    .mockReset()
    .mockImplementation((text) => Buffer.from(text, 'base64').toString());
  frodo.saml2.entityProvider.exportSaml2Provider.mockReset();
  frodo.saml2.circlesOfTrust.exportCircleOfTrust.mockReset();
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('exportScriptToFiles', () => {
  const encoded = (text) => Buffer.from(text).toString('base64');

  test('writes the configuration with a file reference and the decoded text next to it', () => {
    exportScriptToFiles(
      {
        _id: 'abc',
        name: 'My Script',
        context: 'AUTHENTICATION_TREE_DECISION_NODE',
        language: 'JAVASCRIPT',
        script: encoded('outcome = "true";'),
      },
      'alpha'
    );

    const config = readJson('realms/alpha/scripts/scripts-config/abc.json');
    expect(config.script).toEqual({
      file: 'scripts-content/AUTHENTICATION_TREE_DECISION_NODE/My Script.js',
    });
    expect(config.name).toBe('My Script');
    expect(
      read(
        'realms/alpha/scripts/scripts-content/AUTHENTICATION_TREE_DECISION_NODE/My Script.js'
      )
    ).toBe('outcome = "true";');
  });

  test('a script that is a list of lines is joined, and the root realm is written as root', () => {
    exportScriptToFiles(
      {
        _id: 'r1',
        name: 'Lines',
        context: 'OAUTH2_ACCESS_TOKEN_MODIFICATION',
        script: [encoded('a'), encoded('b')].join('\n'),
      },
      '/'
    );
    expect(
      fs.existsSync(
        path.join(tmp, 'realms/root/scripts/scripts-config/r1.json')
      )
    ).toBe(true);

    exportScriptToFiles(
      {
        _id: 'r2',
        name: 'Array',
        context: 'OAUTH2_ACCESS_TOKEN_MODIFICATION',
        script: [encoded('one')],
      },
      'bravo'
    );
    expect(
      read(
        'realms/bravo/scripts/scripts-content/OAUTH2_ACCESS_TOKEN_MODIFICATION/Array.js'
      )
    ).toBe('one');
  });
});

describe('exportCircleOfTrustToFile', () => {
  test('writes the circle of trust under realm-config/saml/COT', async () => {
    const calls = [];
    frodo.saml2.circlesOfTrust.exportCircleOfTrust.mockImplementation(
      async (...args) => {
        calls.push(args);
        return { saml: { cot: { zion: { _id: 'zion', status: 'active' } } } };
      }
    );

    await exportCircleOfTrustToFile('zion', 'alpha');

    expect(calls).toEqual([['zion']]);
    expect(readJson('realms/alpha/realm-config/saml/COT/zion.json')).toEqual({
      _id: 'zion',
      status: 'active',
    });
  });

  test('the root realm is written as root', async () => {
    frodo.saml2.circlesOfTrust.exportCircleOfTrust.mockResolvedValue({
      saml: { cot: { c: { _id: 'c' } } },
    });
    await exportCircleOfTrustToFile('c', '/');
    expect(
      fs.existsSync(path.join(tmp, 'realms/root/realm-config/saml/COT/c.json'))
    ).toBe(true);
  });
});

describe('readSamlProviderForFile', () => {
  const exported = (hosted, remote, metadata) => ({
    saml: { hosted, remote, metadata },
  });

  test('a hosted provider: its configuration and its metadata, exported without dependencies', async () => {
    const calls = [];
    frodo.saml2.entityProvider.exportSaml2Provider.mockImplementation(
      async (...args) => {
        calls.push(args);
        return exported({ a: { entityId: 'a' } }, {}, { a: '<md/>' });
      }
    );

    expect(await readSamlProviderForFile('a')).toEqual({
      location: 'hosted',
      config: { entityId: 'a' },
      metadata: '<md/>',
    });
    expect(calls).toEqual([['a', { deps: false }]]);
  });

  test('a remote provider whose metadata is a list of lines', async () => {
    frodo.saml2.entityProvider.exportSaml2Provider.mockResolvedValue(
      exported({}, { b: { entityId: 'b' } }, { b: ['<x>', '</x>'] })
    );

    expect(await readSamlProviderForFile('b')).toEqual({
      location: 'remote',
      config: { entityId: 'b' },
      metadata: '<x>\n</x>',
    });
  });

  test('literal ${ in the configuration is escaped, as in pull saml', async () => {
    frodo.saml2.entityProvider.exportSaml2Provider.mockResolvedValue(
      exported({ c: { note: 'a ${b}' } }, {}, { c: 'm' })
    );

    const { config } = await readSamlProviderForFile('c');

    expect(config.note).toBe('a \\${b}');
  });

  test('a provider that is neither hosted nor remote cannot be written', async () => {
    frodo.saml2.entityProvider.exportSaml2Provider.mockResolvedValue(
      exported({}, {}, {})
    );

    await expect(readSamlProviderForFile('d')).rejects.toThrow(
      /neither a hosted nor a remote/
    );
  });
});

describe('exportMappingToDirectory', () => {
  test('script sources become files next to the mapping and are referenced by file', () => {
    const mapping = {
      name: 'systemUserToManaged',
      source: 'system/User',
      onCreate: { type: 'text/javascript', source: ['line 1', 'line 2'] },
      onUpdate: { type: 'text/javascript', source: 'single' },
      plain: { type: 'other', source: 'untouched' },
    };

    exportMappingToDirectory(mapping, 'dir/mappings/systemUserToManaged');

    expect(
      read('dir/mappings/systemUserToManaged/systemUserToManaged.onCreate.js')
    ).toBe('line 1\nline 2');
    expect(
      read('dir/mappings/systemUserToManaged/systemUserToManaged.onUpdate.js')
    ).toBe('single');
    const written = readJson(
      'dir/mappings/systemUserToManaged/systemUserToManaged.json'
    );
    expect(written.onCreate).toEqual({
      type: 'text/javascript',
      file: 'systemUserToManaged.onCreate.js',
    });
    expect(written.onUpdate.file).toBe('systemUserToManaged.onUpdate.js');
    expect(written.plain).toEqual({ type: 'other', source: 'untouched' });
    expect(written.source).toBe('system/User');
  });
});
