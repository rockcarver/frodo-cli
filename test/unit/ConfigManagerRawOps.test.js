import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import {
  HOSTILE_VERSION_TEXTS,
  VALID_VERSION_TEXTS,
} from '../utils/PushApiVersionTexts.js';

/**
 * What `config-manager pull raw` hands to frodo-lib and what it does with the answer
 * (src/configManagerOps/FrConfigRawOps.ts, `configManagerExportRaw`), and what `push raw` hands
 * to the library (`configManagerImportRaw`). The library is a stub that records its calls, the
 * output goes to spies, and the config folder is a real temporary folder. `FrConfig`,
 * `ConfigTreePath` and `OperationRun` are the real modules: a test that mocked
 * `clearOperationalAttributes` to delete only `_id` let a push drop the API version of a file
 * unseen. The real commands against a fake tenant are in ConfigManagerRawFakeAm.test.js.
 */

const exportRawConfig = jest.fn();
const importRawConfig = jest.fn();
const readJsonFile = jest.fn();
const saveJsonToFile = jest.fn();
const getFilePath = jest.fn();
const getWorkingDirectory = jest.fn();
const printError = jest.fn();
const printMessage = jest.fn();

class FrodoError extends Error {
  constructor(message, original) {
    super(message);
    this.original = original;
  }
}

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError,
  frodo: {
    utils: {
      getFilePath,
      saveJsonToFile,
      readJsonFile,
      getWorkingDirectory,
      findFilesByName: jest.fn(),
      isBase64Encoded: jest.fn(),
    },
    realm: { readRealms: jest.fn() },
    rawConfig: { exportRawConfig, importRawConfig },
  },
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  createProgressIndicator: jest.fn(() => 'id'),
  printError,
  printMessage,
  stopProgressIndicator: jest.fn(),
  verboseMessage: jest.fn(),
}));
const readStdinToEndSync = jest.fn();
jest.unstable_mockModule('../../src/utils/StdinSync', () => ({
  readStdinToEndSync,
}));

const { configManagerExportRaw, configManagerImportRaw } =
  await import('../../src/configManagerOps/FrConfigRawOps.ts');

let tmp;
let saved;

/** Writes a file below the temporary config folder. */
function put(relative, content) {
  const file = path.join(tmp, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    typeof content === 'string' ? content : JSON.stringify(content)
  );
  return file;
}

beforeEach(() => {
  jest.clearAllMocks();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-raw-ops-'));
  saved = [];
  getFilePath.mockImplementation((relative) => path.join(tmp, relative));
  getWorkingDirectory.mockReturnValue(tmp);
  readJsonFile.mockImplementation((file) =>
    JSON.parse(fs.readFileSync(file, 'utf8'))
  );
  saveJsonToFile.mockImplementation((object, file) => {
    saved.push({ file: path.relative(tmp, file), object });
  });
  // the tenant answers every path with an object of that path
  exportRawConfig.mockImplementation(async ({ path: apiPath }) => ({
    _id: apiPath,
  }));
  importRawConfig.mockResolvedValue({});
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** The documents that went to standard output. */
const documents = () =>
  printMessage.mock.calls
    .filter(([, kind]) => kind === 'data')
    .map(([text]) => JSON.parse(text));
const errors = () =>
  printMessage.mock.calls
    .filter(([, kind]) => kind === 'error')
    .map(([text]) => String(text))
    .join('\n');

const LISTED = {
  path: '/am/json/realms/root/realms/alpha/realm-config/webhooks/test-webhook',
  overrides: { url: 'https://zion.example.com/override' },
  pushApiVersion: { protocol: '2.0', resource: '1.0' },
};

describe('pull raw without the new options', () => {
  test('hands every item of the file to the library as it is, and saves what the library answers as it is', async () => {
    const items = [
      { path: '/openidm/config/placeholder' },
      LISTED,
      {
        path: '/environment/release',
        pushApiVersion: { protocol: '2.2', resource: '1.1' },
      },
    ];
    const file = put('raw.json', items);
    // what the library answers is what is saved: its overrides and version are its own work,
    // and a placeholder of the tenant data is not escaped here
    const answers = {
      '/openidm/config/placeholder': {
        _id: 'p',
        v: '${ESV_X}',
        list: [1, 2, 3],
      },
      [LISTED.path]: {
        _id: 'w',
        url: 'https://zion.example.com/override',
        _pushApiVersion: { protocol: '2.0', resource: '1.0' },
      },
      '/environment/release': { channel: 'rapid' },
    };
    exportRawConfig.mockImplementation(async ({ path: apiPath }) =>
      structuredClone(answers[apiPath])
    );

    expect(await configManagerExportRaw(file)).toBe(true);

    expect(exportRawConfig.mock.calls.map(([item]) => item)).toEqual(items);
    expect(saved).toEqual([
      {
        file: 'raw/openidm/config/placeholder.json',
        object: answers['/openidm/config/placeholder'],
      },
      { file: `raw${LISTED.path}.json`, object: answers[LISTED.path] },
      {
        file: 'raw/environment/release.json',
        object: answers['/environment/release'],
      },
    ]);
    expect(documents()).toEqual([]);
  });

  test('ignores the push API version of the command line when no path is given', async () => {
    const items = [LISTED];
    const file = put('raw.json', items);

    await configManagerExportRaw(file, false, undefined, false, {
      protocol: '2.1',
      resource: '1.5',
    });

    expect(exportRawConfig.mock.calls.map(([item]) => item)).toEqual(items);
  });
});

describe('pull raw --path', () => {
  test('pulls the path as it is when there is no config file', async () => {
    expect(
      await configManagerExportRaw(undefined, false, '/openidm/config/ok1')
    ).toBe(true);

    expect(exportRawConfig.mock.calls).toEqual([
      [{ path: '/openidm/config/ok1' }],
    ]);
    expect(saved.map((s) => s.file)).toEqual(['raw/openidm/config/ok1.json']);
  });

  test('pulls only the item of the file that lists the path, with its overrides and push API version', async () => {
    const file = put('raw.json', [
      { path: '/openidm/config/ok1' },
      LISTED,
      { path: '/environment/release' },
    ]);

    expect(await configManagerExportRaw(file, false, LISTED.path)).toBe(true);

    expect(exportRawConfig.mock.calls).toEqual([[LISTED]]);
  });

  test('takes the same path with or without its leading slash for the same path, and pulls only that item', async () => {
    const withoutSlash = { ...LISTED, path: LISTED.path.slice(1) };

    await configManagerExportRaw(
      put('raw.json', [{ path: '/openidm/config/ok1' }, LISTED]),
      false,
      LISTED.path.slice(1)
    );
    await configManagerExportRaw(
      put('other.json', [{ path: '/openidm/config/ok1' }, withoutSlash]),
      false,
      LISTED.path
    );

    expect(exportRawConfig.mock.calls).toEqual([[LISTED], [withoutSlash]]);
  });

  test('pulls a path that the file does not list as it is, with nothing of the other items', async () => {
    const file = put('raw.json', [LISTED]);

    await configManagerExportRaw(file, false, '/openidm/config/ok1');

    expect(exportRawConfig.mock.calls).toEqual([
      [{ path: '/openidm/config/ok1' }],
    ]);
  });

  test.each([
    ['a path that starts the path of an item', '/openidm/config/ok'],
    ['a path that the path of an item starts', '/openidm/config/ok12'],
    ['a folder of the path of an item', '/openidm/config'],
    ['a path that ends the path of an item', '/config/ok1'],
  ])(
    'does not take an item for %s: only the whole path is the path',
    async (_, asked) => {
      const file = put('raw.json', [
        { path: '/openidm/config/ok1', overrides: { v: 2 } },
      ]);

      await configManagerExportRaw(file, false, asked);

      expect(exportRawConfig.mock.calls).toEqual([[{ path: asked }]]);
    }
  );

  test('finds the item of the file by the path as it is typed, in the case it is typed: a path of a tenant is case sensitive', async () => {
    const file = put('raw.json', [
      { path: '/openidm/config/OK1', overrides: { v: 2 } },
    ]);

    await configManagerExportRaw(file, false, '/openidm/config/ok1');

    expect(exportRawConfig.mock.calls).toEqual([
      [{ path: '/openidm/config/ok1' }],
    ]);
  });

  test('puts the push API version of the command line into the item, over the one of the file', async () => {
    const file = put('raw.json', [LISTED]);
    const version = { protocol: '2.1', resource: '1.5' };

    await configManagerExportRaw(file, false, LISTED.path, false, version);
    await configManagerExportRaw(
      undefined,
      false,
      '/am/json/x',
      false,
      version
    );

    expect(exportRawConfig.mock.calls).toEqual([
      [{ ...LISTED, pushApiVersion: version }],
      [{ path: '/am/json/x', pushApiVersion: version }],
    ]);
  });

  test('does not read the config file when it is not given, and asks for a path or a file when neither is', async () => {
    expect(await configManagerExportRaw(undefined)).toBe(false);

    expect(errors()).toContain('--path');
    expect(errors()).toContain('--config-file');
    expect(exportRawConfig).not.toHaveBeenCalled();
  });

  test('needs the config file to exist when one is given, even with a path', async () => {
    expect(
      await configManagerExportRaw(path.join(tmp, 'nope.json'), false, 'x/a')
    ).toBe(false);

    expect(errors()).toContain('does not exist');
    expect(exportRawConfig).not.toHaveBeenCalled();
  });

  test('prints the object itself with --stdout, in one document, and saves nothing', async () => {
    exportRawConfig.mockResolvedValue({ _id: 'a', nested: { list: [1, 2] } });

    expect(await configManagerExportRaw(undefined, false, 'x/a', true)).toBe(
      true
    );

    expect(printMessage.mock.calls).toEqual([
      [JSON.stringify({ _id: 'a', nested: { list: [1, 2] } }, null, 2), 'data'],
    ]);
    expect(saveJsonToFile).not.toHaveBeenCalled();
    expect(getFilePath).not.toHaveBeenCalled();
  });

  // The path is a path by design and stays inside the config folder: what the library answers
  // for a path that goes up is not written.
  test.each([
    ['../../x'],
    ['/openidm/../../etc/passwd'],
    ['openidm/config/../../../outside'],
    ['/openidm/config/ok1/../ok2'],
    ['/openidm/config\\..\\..\\x'],
    ['/openidm/config/ok1\\..\\ok2'],
    ['C:/x'],
    ['/etc/passwd/../../x'],
  ])(
    'writes nothing for the path %j and records it as failed',
    async (hostile) => {
      expect(await configManagerExportRaw(undefined, false, hostile)).toBe(
        false
      );

      expect(saved).toEqual([]);
      expect(saveJsonToFile).not.toHaveBeenCalled();
      expect(printError).toHaveBeenCalledTimes(1);
    }
  );

  test('prints a hostile path with --stdout without a file and without the gate', async () => {
    expect(
      await configManagerExportRaw(undefined, false, '../../x', true)
    ).toBe(true);

    expect(documents()).toEqual([{ _id: '../../x' }]);
    expect(saveJsonToFile).not.toHaveBeenCalled();
  });
});

describe('push raw keeps the push API version of the file for the library', () => {
  const VERSION = { protocol: '2.1', resource: '1.0' };
  const OPERATIONAL = {
    _id: 'x',
    _rev: '3',
    createdBy: 'a',
    creationDate: 'b',
    lastModifiedBy: 'c',
    lastModifiedDate: 'd',
  };

  test('a file: the library gets _pushApiVersion in the data, and not the operational attributes', async () => {
    put('raw/am/json/x.json', {
      ...OPERATIONAL,
      value: 1,
      _pushApiVersion: VERSION,
    });
    put('raw/openidm/config/y.json', { ...OPERATIONAL, value: 2 });

    expect(await configManagerImportRaw()).toBe(true);

    const calls = Object.fromEntries(
      importRawConfig.mock.calls.map(([options, data]) => [options.path, data])
    );
    expect(calls).toEqual({
      '/am/json/x': { value: 1, _pushApiVersion: VERSION },
      '/openidm/config/y': { value: 2 },
    });
  });

  test('standard input: the library gets _pushApiVersion in the data, and not the operational attributes', async () => {
    readStdinToEndSync.mockReturnValue(
      JSON.stringify({ ...OPERATIONAL, value: 1, _pushApiVersion: VERSION })
    );

    expect(await configManagerImportRaw('/am/json/x', true)).toBe(true);

    expect(importRawConfig.mock.calls).toEqual([
      [{ path: '/am/json/x' }, { value: 1, _pushApiVersion: VERSION }],
    ]);
  });

  // The library builds the header from what it is given (`resource=undefined`, or a failure for
  // null), and a push ignored the attribute before it was kept: what is not a version is dropped.
  const NOT_A_VERSION = [
    ['a version without a resource', { protocol: '2.1' }],
    ['a version without a protocol', { resource: '1.0' }],
    ['a blank resource', { protocol: '2.1', resource: '  ' }],
    ['a version that is not text', { protocol: 2.1, resource: 1 }],
    ['an empty object', {}],
    ['a list', ['2.1', '1.0']],
    ['a text', 'x'],
    ['null', null],
  ];

  test.each(NOT_A_VERSION)(
    'a file: %s is dropped, silently, and the push goes on',
    async (_, version) => {
      put('raw/am/json/x.json', {
        ...OPERATIONAL,
        value: 1,
        _pushApiVersion: version,
      });

      expect(await configManagerImportRaw()).toBe(true);

      expect(printError).not.toHaveBeenCalled();
      expect(importRawConfig.mock.calls).toEqual([
        [{ path: '/am/json/x' }, { value: 1 }],
      ]);
      expect('_pushApiVersion' in importRawConfig.mock.calls[0][1]).toBe(false);
    }
  );

  test.each(NOT_A_VERSION)(
    'standard input: %s is dropped, silently, and the push goes on',
    async (_, version) => {
      readStdinToEndSync.mockReturnValue(
        JSON.stringify({ ...OPERATIONAL, value: 1, _pushApiVersion: version })
      );

      expect(await configManagerImportRaw('/am/json/x', true)).toBe(true);

      expect(printError).not.toHaveBeenCalled();
      expect(importRawConfig.mock.calls).toEqual([
        [{ path: '/am/json/x' }, { value: 1 }],
      ]);
      expect('_pushApiVersion' in importRawConfig.mock.calls[0][1]).toBe(false);
    }
  );

  // What the library puts into the header is `protocol=<protocol>,resource=<resource>`: a text
  // that is not made of letters, digits, dots, underscores and hyphens would add to it.
  const POSITIONS = [
    ['protocol', (text) => ({ protocol: text, resource: '1.0' })],
    ['resource', (text) => ({ protocol: '2.1', resource: text })],
  ];

  test.each(HOSTILE_VERSION_TEXTS)(
    'a file: a version text with %s is dropped, silently, in the protocol and in the resource',
    async (_, text) => {
      for (const [, make] of POSITIONS) {
        importRawConfig.mockClear();
        put('raw/am/json/x.json', {
          ...OPERATIONAL,
          value: 1,
          _pushApiVersion: make(text),
        });

        expect(await configManagerImportRaw()).toBe(true);

        expect(printError).not.toHaveBeenCalled();
        expect(importRawConfig.mock.calls).toEqual([
          [{ path: '/am/json/x' }, { value: 1 }],
        ]);
      }
    }
  );

  test.each(HOSTILE_VERSION_TEXTS)(
    'standard input: a version text with %s is dropped, silently, in the protocol and in the resource',
    async (_, text) => {
      for (const [, make] of POSITIONS) {
        importRawConfig.mockClear();
        readStdinToEndSync.mockReturnValue(
          JSON.stringify({
            ...OPERATIONAL,
            value: 1,
            _pushApiVersion: make(text),
          })
        );

        expect(await configManagerImportRaw('/am/json/x', true)).toBe(true);

        expect(printError).not.toHaveBeenCalled();
        expect(importRawConfig.mock.calls).toEqual([
          [{ path: '/am/json/x' }, { value: 1 }],
        ]);
      }
    }
  );

  test.each(VALID_VERSION_TEXTS.map((text) => [text.slice(0, 12), text]))(
    'the version text %s is kept for the library, in the protocol and in the resource, on a file and on standard input',
    async (_, text) => {
      for (const [, make] of POSITIONS) {
        const version = make(text);
        importRawConfig.mockClear();
        put('raw/am/json/x.json', {
          ...OPERATIONAL,
          value: 1,
          _pushApiVersion: version,
        });
        await configManagerImportRaw();
        readStdinToEndSync.mockReturnValue(
          JSON.stringify({ ...OPERATIONAL, value: 1, _pushApiVersion: version })
        );
        await configManagerImportRaw('/am/json/x', true);

        expect(importRawConfig.mock.calls).toEqual([
          [{ path: '/am/json/x' }, { value: 1, _pushApiVersion: version }],
          [{ path: '/am/json/x' }, { value: 1, _pushApiVersion: version }],
        ]);
      }
    }
  );

  test('a version with a property besides protocol and resource is kept as it is: the library reads the two', async () => {
    const version = { protocol: '2.1', resource: '1.0', extra: 'x' };
    readStdinToEndSync.mockReturnValue(
      JSON.stringify({ ...OPERATIONAL, value: 1, _pushApiVersion: version })
    );

    expect(await configManagerImportRaw('/am/json/x', true)).toBe(true);

    expect(importRawConfig.mock.calls).toEqual([
      [{ path: '/am/json/x' }, { value: 1, _pushApiVersion: version }],
    ]);
  });

  test('standard input without a version sends none', async () => {
    readStdinToEndSync.mockReturnValue(
      JSON.stringify({ ...OPERATIONAL, value: 1 })
    );

    await configManagerImportRaw('/am/json/x', true);

    expect(importRawConfig.mock.calls[0][1]).toEqual({ value: 1 });
    expect('_pushApiVersion' in importRawConfig.mock.calls[0][1]).toBe(false);
  });
});
