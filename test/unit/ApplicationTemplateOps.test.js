/**
 * Unit tests for the application template commands (src/ops/ApplicationTemplateOps.ts
 * and src/utils/ApplicationTemplateSource.ts) without a tenant and without the
 * CDN. The real import graph pulls in all of frodo-lib, whose bundled ESM cannot
 * load under jest's ESM runtime, so the facade and the console are mocked before
 * the modules under test are imported (the pattern of CIMDProfileOps.test.js).
 * What these tests guard is what the commands add to the library:
 * - `--templates` hands the bytes of the file to the library, and wins over
 *   `--channel`; an unreadable file is a failure that names the file;
 * - the templates of the tenant are merged only when the command was told it has
 *   a tenant (`includeOverrides`), never otherwise;
 * - `describe` finds a version by its id whatever the case, reads the whole
 *   template by name and version, and says so when there is none;
 * - `download` asks the source now (`refresh`), saves the text of the cached
 *   catalog unchanged (never a re-encoded copy), and reports what the cache did;
 * - an air-gapped refusal of the library is followed by the advice of this
 *   command line (ErrorCodeHints), and the command fails;
 * - the CLI switches the catalog cache on at start, and there is no way to
 *   switch it off.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);
const everythingPrinted = () => printed.map((entry) => entry.msg).join('\n');

class FakeFrodoError extends Error {
  constructor(message, code, originalErrors) {
    super(message);
    this.name = 'FrodoError';
    this.code = code;
    this.originalErrors = originalErrors;
  }
}

/** The state of the fake library. */
let items = [];
let template;
let catalogResult;
let libraryFailure;
const calls = [];
let baseDirectory = '';
let cacheEnabled = false;
let cachePath;
const saved = [];

/** A catalog like the CDN's, small: two groups. */
const sampleCatalog = {
  AppTemplates: {
    consumer: {
      Saml: {
        '1_2-saml': { id: 'saml', templateVersion: '1.2' },
        '1_3-saml': { id: 'saml', templateVersion: '1.3' },
      },
    },
    enterprise: {
      AzureAD: { '3_3-azure-ad': { id: 'azure.ad', templateVersion: '3.3' } },
    },
  },
};

const listItem = (templateId, name, version, more = {}) => ({
  templateId,
  name,
  group: 'Saml',
  tier: 'consumer',
  templateVersion: version,
  displayName: 'SAML',
  templateType: 'SAML',
  dateUpdated: '09-09-2024',
  isOverride: false,
  newestInGroup: false,
  ...more,
});

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  state: {
    setUseTemplateCatalogCache: (value) => {
      cacheEnabled = value;
    },
    setTemplateCatalogCachePath: (value) => {
      cachePath = value;
    },
  },
  frodo: {
    utils: {
      getFilePath: (file) =>
        baseDirectory ? path.join(baseDirectory, file) : file,
      saveTextToFile: (data, file) => {
        saved.push({ file, data });
        fs.writeFileSync(file, data);
      },
    },
    app: {
      template: {
        listTemplates: async (options) => {
          calls.push(['listTemplates', options]);
          if (libraryFailure) throw libraryFailure;
          return structuredClone(items);
        },
        readCatalog: async (options) => {
          calls.push(['readCatalog', options]);
          if (libraryFailure) throw libraryFailure;
          return structuredClone(catalogResult);
        },
        readTemplate: async (reference, options) => {
          calls.push(['readTemplate', reference, options]);
          if (libraryFailure) throw libraryFailure;
          return { template: structuredClone(template) };
        },
      },
    },
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
  createTable: (head) => {
    const rows = [head];
    return {
      push: (row) => rows.push(row),
      toString: () =>
        rows
          .map((row) =>
            row.map((cell) => (cell?.content ?? cell).toString()).join(' | ')
          )
          .join('\n'),
    };
  },
}));

jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { heading: (text) => text },
}));

const {
  countCatalog,
  describeApplicationTemplate,
  describeCacheOutcome,
  downloadApplicationTemplateCatalog,
  listApplicationTemplates,
  DEFAULT_CATALOG_FILE,
} = await import('../../src/ops/ApplicationTemplateOps.ts');
const { catalogOptionsOf, enableTemplateCatalogCache } =
  await import('../../src/utils/ApplicationTemplateSource.ts');

const lastCall = (name) => calls.filter(([n]) => n === name).at(-1);

beforeEach(() => {
  printed.length = 0;
  calls.length = 0;
  saved.length = 0;
  libraryFailure = undefined;
  cacheEnabled = false;
  cachePath = undefined;
  baseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-templates-'));
  items = [
    listItem('1_2-saml', 'saml', '1.2'),
    listItem('1_3-saml', 'saml', '1.3', { newestInGroup: true }),
    listItem('3_3-azure-ad', 'azure.ad', '3.3', {
      group: 'AzureAD',
      tier: 'enterprise',
      displayName: 'Azure AD',
      templateType: 'Enterprise',
      newestInGroup: true,
    }),
  ];
  template = {
    id: 'saml',
    templateVersion: '1.2',
    description: 'SAML applications enable single sign-on.',
    supportUrl: 'https://docs.example.com/saml',
    schema: { fields: ['a', 'b'] },
  };
  catalogResult = {
    catalog: structuredClone(sampleCatalog),
    metadata: {
      source: {
        kind: 'cdn',
        location: 'https://cdn.example.com/appTemplates.json.gz',
      },
      etag: '"abc"',
      lastModified: 'Thu, 12 Nov 2026 23:34:04 GMT',
      fetchedAt: '2026-11-13T05:00:00.000Z',
      cached: false,
      cache: 'revalidated',
      cachePath: path.join(baseDirectory, 'cache-production.json'),
    },
  };
  fs.writeFileSync(
    catalogResult.metadata.cachePath,
    '{"AppTemplates":{"as":"kept"}}\n'
  );
});

afterEach(() => {
  fs.rmSync(baseDirectory, { recursive: true, force: true });
});

describe('the source of the catalog (--templates, --channel)', () => {
  test('1: a file is handed to the library as bytes, and wins over the channel', () => {
    fs.writeFileSync(path.join(baseDirectory, 'saved.json'), '{"x":1}');
    const options = catalogOptionsOf({
      templates: 'saved.json',
      channel: 'development',
    });
    expect(options.catalog).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(options.catalog).toString()).toBe('{"x":1}');
    expect(options.channel).toBeUndefined();
  });

  test('2: the channel alone is passed on, and nothing at all leaves the library its default', () => {
    expect(catalogOptionsOf({ channel: 'development' })).toEqual({
      channel: 'development',
    });
    expect(catalogOptionsOf({})).toEqual({});
  });

  test('3: a file that cannot be read fails with its name and the cause kept', () => {
    expect(() => catalogOptionsOf({ templates: 'missing.json' })).toThrow(
      /Cannot read the catalog file .*missing\.json/
    );
    try {
      catalogOptionsOf({ templates: 'missing.json' });
    } catch (error) {
      expect(error.cause).toBeDefined();
    }
  });
});

describe('list', () => {
  test('4: prints the ids, and merges the tenant only when told there is one', async () => {
    expect(await listApplicationTemplates({})).toBe(true);
    expect(messages('data')).toEqual(['1_2-saml', '1_3-saml', '3_3-azure-ad']);
    expect(lastCall('listTemplates')[1].includeOverrides).toBe(false);
    await listApplicationTemplates({ includeOverrides: true });
    expect(lastCall('listTemplates')[1].includeOverrides).toBe(true);
  });

  test('5: --long prints a table with the override and newest marks', async () => {
    items[0].isOverride = true;
    await listApplicationTemplates({ long: true, includeOverrides: true });
    const table = messages('data').join('\n').split('\n');
    expect(table[0]).toContain('Override');
    const row = (id) => table.find((line) => line.startsWith(id));
    expect(row('1_2-saml')).toMatch(/\| yes \|\s*\|/); // override yes, newest no
    expect(row('1_3-saml')).toMatch(/\|\s*\| yes \|/); // not an override, newest yes
    expect(row('3_3-azure-ad')).toContain('AzureAD');
  });

  test('6: the channel and the file reach the library', async () => {
    await listApplicationTemplates({ channel: 'development' });
    expect(lastCall('listTemplates')[1].channel).toBe('development');
    fs.writeFileSync(path.join(baseDirectory, 'c.json'), '{}');
    await listApplicationTemplates({ templates: 'c.json' });
    expect(lastCall('listTemplates')[1].catalog).toBeInstanceOf(Uint8Array);
  });

  test('7: an unreadable file or a failure of the library is an error and a failed command', async () => {
    expect(await listApplicationTemplates({ templates: 'nope.json' })).toBe(
      false
    );
    expect(messages('error').join('\n')).toContain('nope.json');
    libraryFailure = new Error('the catalog is not a catalog');
    expect(await listApplicationTemplates({})).toBe(false);
  });
});

describe('describe', () => {
  test('8: finds the version by its id whatever the case, and reads the whole template by name and version', async () => {
    expect(await describeApplicationTemplate('1_2-SAML', {})).toBe(true);
    expect(lastCall('readTemplate')[1]).toEqual({
      templateName: 'saml',
      templateVersion: '1.2',
    });
    const text = everythingPrinted();
    expect(text).toContain('Id: 1_2-saml');
    expect(text).toContain('Newest version: no');
    expect(text).toContain('Description: SAML applications enable');
    expect(text).toContain('Support URL: https://docs.example.com/saml');
    expect(text).not.toContain('"fields"');
  });

  test('9: --json prints the whole template and nothing else', async () => {
    await describeApplicationTemplate('1_2-saml', { json: true });
    expect(JSON.parse(messages('data').join(''))).toEqual(template);
  });

  test('10: an id that is not there is an error and a failed command, and the template is not read', async () => {
    expect(await describeApplicationTemplate('nope', {})).toBe(false);
    expect(messages('error')[0]).toContain('nope not found');
    expect(lastCall('readTemplate')).toBeUndefined();
  });

  test('11: the tenant is merged only when told there is one, and the same options reach both reads', async () => {
    await describeApplicationTemplate('1_2-saml', {
      includeOverrides: true,
      channel: 'development',
    });
    expect(lastCall('listTemplates')[1]).toMatchObject({
      includeOverrides: true,
      channel: 'development',
    });
    expect(lastCall('readTemplate')[2]).toMatchObject({
      includeOverrides: true,
      channel: 'development',
    });
  });
});

describe('download', () => {
  test('12: asks the source now, saves the text of the cached catalog unchanged, and says what the cache did', async () => {
    const file = path.join(baseDirectory, 'out.json');
    expect(
      await downloadApplicationTemplateCatalog('out.json', 'development')
    ).toBe(true);
    expect(lastCall('readCatalog')[1]).toEqual({
      refresh: true,
      channel: 'development',
    });
    // the kept file, not a copy re-encoded from the parsed catalog
    expect(fs.readFileSync(file, 'utf8')).toBe(
      '{"AppTemplates":{"as":"kept"}}\n'
    );
    const text = everythingPrinted();
    expect(text).toContain(`Saved the application template catalog to ${file}`);
    expect(text).toContain('Templates: 3 versions in 2 groups');
    expect(text).toContain('unchanged at the source, nothing was downloaded');
    expect(text).toContain('ETag: "abc"');
    expect(text).toContain('Last-Modified: Thu, 12 Nov 2026 23:34:04 GMT');
    expect(text).toContain('--templates <file>');
  });

  test('13: without a file it saves appTemplates.json in the working directory and says so', async () => {
    expect(await downloadApplicationTemplateCatalog()).toBe(true);
    expect(saved[0].file).toBe(path.join(baseDirectory, DEFAULT_CATALOG_FILE));
    expect(messages('info')[0]).toContain(DEFAULT_CATALOG_FILE);
  });

  test('14: without a kept file it writes the catalog the library returned', async () => {
    delete catalogResult.metadata.cachePath;
    const file = path.join(baseDirectory, 'plain.json');
    await downloadApplicationTemplateCatalog('plain.json');
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(sampleCatalog);
  });

  test('15: a stale copy after an error is a warning, and air-gapped mode is said in words', async () => {
    catalogResult.metadata.cache = 'stale-after-error';
    catalogResult.metadata.cacheError = 'getaddrinfo ENOTFOUND';
    await downloadApplicationTemplateCatalog('a.json');
    expect(messages('warn')[0]).toContain('getaddrinfo ENOTFOUND');
    expect(describeCacheOutcome({ cache: 'offline' })).toContain(
      'air-gapped mode is on'
    );
  });

  test('16: an air-gapped refusal fails the command and is followed by the advice of this command line', async () => {
    libraryFailure = new FakeFrodoError(
      'Air-gapped mode is on: the application template catalog cannot be read from the CDN.',
      'AIR_GAPPED'
    );
    expect(await downloadApplicationTemplateCatalog()).toBe(false);
    expect(messages('error')[0]).toContain('Air-gapped mode is on');
    const hint = messages('info').join('\n');
    expect(hint).toContain('--templates <file>');
    expect(hint).toContain('frodo app template download');
    expect(saved).toEqual([]);
  });

  test('17: the same advice follows a refusal while listing', async () => {
    libraryFailure = new FakeFrodoError('Air-gapped mode is on.', 'AIR_GAPPED');
    expect(await listApplicationTemplates({})).toBe(false);
    expect(messages('info').join('\n')).toContain('--templates <file>');
  });
});

describe('the catalog counts', () => {
  test('18: versions and groups of both tiers are counted', () => {
    expect(countCatalog(sampleCatalog)).toEqual({ templates: 3, groups: 2 });
    expect(
      countCatalog({ AppTemplates: { consumer: {}, enterprise: {} } })
    ).toEqual({
      templates: 0,
      groups: 0,
    });
  });
});

describe('the cache of the catalog', () => {
  test('19: the CLI switches it on at start, in the default folder of the library', () => {
    delete process.env.FRODO_CONFIG_PATH;
    expect(cacheEnabled).toBe(false);
    enableTemplateCatalogCache();
    expect(cacheEnabled).toBe(true);
    expect(cachePath).toBeUndefined();
  });

  test('20: the folder moves with FRODO_CONFIG_PATH like the other files of frodo', () => {
    process.env.FRODO_CONFIG_PATH = '/srv/frodo-config';
    try {
      enableTemplateCatalogCache();
    } finally {
      delete process.env.FRODO_CONFIG_PATH;
    }
    expect(cacheEnabled).toBe(true);
    expect(cachePath).toBe(path.join('/srv/frodo-config', 'AppTemplates'));
  });

  test('21: src/app.ts calls the switch at start, before it builds the commands, and nothing offers a way to turn it off', () => {
    const app = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app.ts'),
      'utf8'
    );
    const at = app.indexOf('enableTemplateCatalogCache();');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(app.indexOf('new FrodoStubCommand'));
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'utils', 'ApplicationTemplateSource.ts'),
      'utf8'
    );
    // the only variable it reads is the folder of frodo; none switches the cache
    expect(source.match(/process\.env[^;)]*/g)).toEqual([
      "process.env['FRODO_CONFIG_PATH']",
    ]);
    expect(source).not.toMatch(/setUseTemplateCatalogCache\(false\)/);
    expect(source).not.toMatch(/FRODO_NO_CACHE/);
  });
});
