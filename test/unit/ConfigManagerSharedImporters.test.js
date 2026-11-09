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
 * The single-item helpers that `push applications` shares with the standalone
 * kinds (frodo-cli#1101, record 0042): `importScriptFromFiles`,
 * `importSamlProviderFromFile`, `findCirclesOfTrustOfProviders`,
 * `importCircleOfTrustFromFile` and `readMappingFromDirectory`. They read the
 * files that the writers of `pull applications` write. The library is a deep
 * stub, the files are real, in a temporary folder.
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
      // Jest takes an object with `calls.all()` and `calls.count()` for a Jasmine spy
      if (typeof prop === 'symbol' || prop === 'then' || prop === 'calls')
        return undefined;
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

const { exportScriptToFiles, importScriptFromFiles } = await import(
  src('configManagerOps/FrConfigScriptOps.ts')
);
const {
  exportCircleOfTrustToFile,
  findCirclesOfTrustOfProviders,
  importCircleOfTrustFromFile,
  importSamlProviderFromFile,
} = await import(src('configManagerOps/FrConfigSamlOps.ts'));
const { exportMappingToDirectory, readMappingFromDirectory } = await import(
  src('configManagerOps/FrConfigConnectorMappingOps.ts')
);

let tmp;
const put = (rel, content) => {
  const target = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    typeof content === 'string' ? content : JSON.stringify(content)
  );
};
const encoded = (text) => Buffer.from(text).toString('base64');

let errorOutput;
beforeEach(() => {
  jest.clearAllMocks();
  errorOutput = jest.spyOn(console, 'error').mockImplementation(() => {});
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-shared-importers-'));
  frodo.utils.getWorkingDirectory.mockReset().mockReturnValue(tmp);
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
  frodo.utils.readJsonFile
    .mockReset()
    .mockImplementation((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
  frodo.script.updateScript.mockReset();
  frodo.saml2.entityProvider.importSaml2Providers.mockReset();
  frodo.saml2.circlesOfTrust.importCirclesOfTrust.mockReset();
});
afterEach(() => {
  errorOutput.mockRestore();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('importScriptFromFiles', () => {
  test('reads the configuration and the text that it refers to, and updates the script with the text', async () => {
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
    frodo.script.updateScript.mockResolvedValue({ _id: 'abc' });

    await importScriptFromFiles('abc', 'alpha');

    expect(frodo.script.updateScript).toHaveBeenCalledTimes(1);
    const [id, data] = frodo.script.updateScript.mock.calls[0];
    expect(id).toBe('abc');
    expect(data.name).toBe('My Script');
    expect(data.script).toBe('outcome = "true";');
  });

  test('the root realm is read from the folder root', async () => {
    exportScriptToFiles(
      {
        _id: 'r1',
        name: 'Root Script',
        context: 'OAUTH2_ACCESS_TOKEN_MODIFICATION',
        script: encoded('x'),
      },
      '/'
    );
    frodo.script.updateScript.mockResolvedValue({});

    await importScriptFromFiles('r1', '/');

    expect(frodo.script.updateScript.mock.calls[0][1].script).toBe('x');
  });

  test('says so when the script did not change, and does not fail', async () => {
    exportScriptToFiles(
      {
        _id: 'same',
        name: 'Same',
        context: 'OAUTH2_ACCESS_TOKEN_MODIFICATION',
        script: encoded('x'),
      },
      'alpha'
    );
    frodo.script.updateScript.mockResolvedValue(undefined);

    await importScriptFromFiles('same', 'alpha');

    expect(errorOutput).toHaveBeenCalledWith(
      expect.stringMatching(/No change in script Same/)
    );
  });

  test('a script with a blank name is refused, and nothing is updated', async () => {
    put('realms/alpha/scripts/scripts-config/blank.json', {
      _id: 'blank',
      name: '  ',
      script: { file: 'scripts-content/x/blank.js' },
    });

    await expect(importScriptFromFiles('blank', 'alpha')).rejects.toThrow(
      /valid \(non-blank\) name/
    );
    expect(frodo.script.updateScript).not.toHaveBeenCalled();
  });

  test('a script without a configuration file fails with the file system error', async () => {
    await expect(importScriptFromFiles('missing', 'alpha')).rejects.toThrow();
    expect(frodo.script.updateScript).not.toHaveBeenCalled();
  });
});

describe('importSamlProviderFromFile', () => {
  const file = (entityId) => ({
    config: { entityId, foo: 1 },
    metadata: `<EntityDescriptor entityID="${entityId}"/>`,
  });

  test.each(['hosted', 'remote'])(
    'a %s provider is imported on its own, without dependencies',
    async (location) => {
      await importSamlProviderFromFile(file('urn:zion:sp'), location);

      expect(
        frodo.saml2.entityProvider.importSaml2Providers
      ).toHaveBeenCalledTimes(1);
      const [data, options] =
        frodo.saml2.entityProvider.importSaml2Providers.mock.calls[0];
      const other = location === 'hosted' ? 'remote' : 'hosted';
      expect(data).toEqual({
        script: {},
        saml: {
          hosted: {},
          remote: {},
          metadata: {
            'urn:zion:sp': ['<EntityDescriptor entityID="urn:zion:sp"/>'],
          },
          [location]: { 'urn:zion:sp': { entityId: 'urn:zion:sp', foo: 1 } },
          [other]: {},
        },
      });
      expect(options).toEqual({ deps: false });
    }
  );
});

describe('findCirclesOfTrustOfProviders and importCircleOfTrustFromFile', () => {
  const cot = (id, members) => ({ _id: id, trustedProviders: members });

  test('finds the circles that have one of the providers as a member, sorted, in the folder of the realm', () => {
    put('realms/alpha/realm-config/saml/COT/b.json', cot('b', ['urn:a|saml2']));
    put(
      'realms/alpha/realm-config/saml/COT/a.json',
      cot('a', ['urn:other|saml2', 'URN:A|SAML2'])
    );
    put(
      'realms/alpha/realm-config/saml/COT/c.json',
      cot('c', ['urn:unrelated|saml2'])
    );
    put('realms/alpha/realm-config/saml/COT/notes.txt', 'not json');
    put('realms/bravo/realm-config/saml/COT/z.json', cot('z', ['urn:a|saml2']));

    expect(findCirclesOfTrustOfProviders('alpha', ['urn:a'])).toEqual([
      'a',
      'b',
    ]);
  });

  test('a realm without circle of trust files has none, and the root realm is read from root', () => {
    expect(findCirclesOfTrustOfProviders('alpha', ['urn:a'])).toEqual([]);
    put('realms/root/realm-config/saml/COT/r.json', cot('r', ['urn:a|saml2']));
    expect(findCirclesOfTrustOfProviders('/', ['urn:a'])).toEqual(['r']);
  });

  test('a circle that has no member list is not a match', () => {
    put('realms/alpha/realm-config/saml/COT/x.json', { _id: 'x' });
    expect(findCirclesOfTrustOfProviders('alpha', ['urn:a'])).toEqual([]);
  });

  test('imports the circle of trust of the file, and only that one', async () => {
    put('realms/alpha/realm-config/saml/COT/a.json', cot('a', ['urn:a|saml2']));
    put('realms/alpha/realm-config/saml/COT/b.json', cot('b', ['urn:b|saml2']));

    await importCircleOfTrustFromFile('a', 'alpha');

    expect(
      frodo.saml2.circlesOfTrust.importCirclesOfTrust
    ).toHaveBeenCalledWith({
      script: {},
      saml: {
        hosted: {},
        remote: {},
        metadata: {},
        cot: { a: { _id: 'a', trustedProviders: ['urn:a|saml2'] } },
      },
    });
  });

  test('reads what exportCircleOfTrustToFile writes', async () => {
    frodo.saml2.circlesOfTrust.exportCircleOfTrust.mockResolvedValue({
      saml: { cot: { zion: cot('zion', ['urn:a|saml2']) } },
    });
    await exportCircleOfTrustToFile('zion', 'alpha');

    expect(findCirclesOfTrustOfProviders('alpha', ['urn:a'])).toEqual(['zion']);
    await importCircleOfTrustFromFile('zion', 'alpha');
    expect(
      frodo.saml2.circlesOfTrust.importCirclesOfTrust.mock.calls[0][0].saml.cot
    ).toHaveProperty('zion');
  });
});

describe('readMappingFromDirectory', () => {
  test('puts back the script sources that exportMappingToDirectory moved into files', () => {
    const mapping = {
      name: 'systemZionUser_managedAlpha_user',
      source: 'system',
      onCreate: {
        type: 'text/javascript',
        source: ['var a = 1;', 'a;'],
      },
      properties: [{ source: 'mail', target: 'mail' }],
    };
    exportMappingToDirectory(
      structuredClone(mapping),
      'realms/alpha/applications/Zion/mappings/systemZionUser_managedAlpha_user'
    );

    const read = readMappingFromDirectory(
      'realms/alpha/applications/Zion/mappings/systemZionUser_managedAlpha_user',
      'systemZionUser_managedAlpha_user'
    );

    expect(read.onCreate).toEqual({
      type: 'text/javascript',
      source: 'var a = 1;\na;',
    });
    expect(read.properties).toEqual(mapping.properties);
    expect(read.name).toBe(mapping.name);
    // the reference to the file is gone
    expect(JSON.stringify(read)).not.toMatch(/"file"/);
  });

  test('a mapping without scripts is read as it is', () => {
    put('m/plain/plain.json', { name: 'plain', source: 's' });
    expect(readMappingFromDirectory('m/plain', 'plain')).toEqual({
      name: 'plain',
      source: 's',
    });
  });
});
