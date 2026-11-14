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
 * - `list` shows the newest version of each template (by the mark of the
 *   library, never by a date), or every version, and reads the catalog once;
 *   `--long` prints the columns Id, Name, Category, Prov, Ver and Updated, one
 *   letter for each thing a template provides, a star behind the version of a
 *   template that has older versions (and in no view that has a row for each
 *   version), and a key line below the table that explains exactly what is in
 *   it;
 * - `describe` finds the template by its id (`-i`) or display name (`-n`),
 *   takes the newest version unless a version is named, reads the whole
 *   template by name and version, never accepts the key the catalog keeps a
 *   version under, says so when there is no such template or version, and
 *   never fails on an entry whose fields have the wrong types;
 * - `download` asks the source now (`refresh`), saves the text of the cached
 *   catalog unchanged (never a re-encoded copy), and reports what the cache did;
 * - no text of an entry reaches the output with an escape sequence, the 8-bit
 *   CSI or a bidi override in it, whichever field carries it (the id, display
 *   name, version, group, type or date of a row) and whichever command or flag
 *   prints it, and the library is still asked with the text as it listed it;
 * - an air-gapped refusal of the library fails the command and is followed by
 *   the advice for a template command (pass a file); the advice about the
 *   switch comes from `printError` (src/utils/AirGapHint.ts, cli#1307);
 * - the CLI switches the catalog cache on at start, and there is no way to
 *   switch it off.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';
import {
  fixtureCatalog,
  fixtureIds,
  listItemsOf,
  POISON,
  POISONABLE_FIELDS,
  poisonFixture,
  UNSAFE_OUTPUT,
} from '../utils/ApplicationTemplateFixtures.js';

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
/** The entries of the templates the tenant defines itself, by the id of the version. */
const overrideEntries = new Map();
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
          const item = items.find(
            (candidate) =>
              candidate.name === reference.templateName &&
              candidate.templateVersion === reference.templateVersion
          );
          const entry = item
            ? (overrideEntries.get(item.templateId) ??
              catalogResult.catalog.AppTemplates?.[item.tier]?.[item.group]?.[
                item.templateId
              ])
            : undefined;
          return { template: structuredClone(entry ?? template) };
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
const { textOf } = await import('../../src/utils/ApplicationTemplateView.ts');

const lastCall = (name) => calls.filter(([n]) => n === name).at(-1);

beforeEach(() => {
  printed.length = 0;
  calls.length = 0;
  saved.length = 0;
  libraryFailure = undefined;
  overrideEntries.clear();
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
  beforeEach(() => {
    items = listItemsOf(fixtureCatalog);
    catalogResult.catalog = structuredClone(fixtureCatalog);
  });

  const row = (id, version) =>
    messages('data')
      .join('\n')
      .split('\n')
      .find((line) =>
        version === undefined
          ? line.startsWith(`${id} |`)
          : // the table of every version has the version second
            line.startsWith(`${id} | ${version} |`)
      );

  test('4: prints the id of each template once, and merges the tenant only when told there is one', async () => {
    expect(await listApplicationTemplates({})).toBe(true);
    expect(messages('data')).toEqual(fixtureIds);
    // the plain list reads the list and nothing else
    expect(calls.map(([name]) => name)).toEqual(['listTemplates']);
    expect(lastCall('listTemplates')[1].includeOverrides).toBe(false);
    await listApplicationTemplates({ includeOverrides: true });
    expect(lastCall('listTemplates')[1].includeOverrides).toBe(true);
  });

  test('5: the newest version is the one the library marked, not the first and not the one with the latest date', async () => {
    // ldap 2.10 is newer than 2.3 by number although its date is no date
    await listApplicationTemplates({ long: true });
    expect(row('ldap')).toContain(' | 2.10* | ');
    // the dates of the versions of a template are made to point the other way
    items.find((item) => item.templateVersion === '2.3').dateUpdated =
      '12-31-2030';
    printed.length = 0;
    await listApplicationTemplates({ long: true });
    expect(row('ldap')).toContain(' | 2.10* | ');
    // the library's mark decides: move it and the list follows it
    items.find((item) => item.templateVersion === '2.3').newestInGroup = true;
    items.find((item) => item.templateVersion === '2.10').newestInGroup = false;
    printed.length = 0;
    await listApplicationTemplates({ long: true });
    expect(row('ldap')).toContain(' | 2.3* | ');
  });

  const dataLines = () => messages('data').join('\n').split('\n');

  /** The fixture without the templates that have no letter, so that no cell says `?`. */
  const withoutUnknown = () => {
    const keep = ['saml', 'bookmark', 'azure.ad', 'ai.target'];
    items = items.filter((item) => keep.includes(item.name));
  };

  test('6: --long is a table with the id, name, category, what the template provides, its newest version and the date of that version, and a key line below it', async () => {
    await listApplicationTemplates({ long: true });
    const lines = dataLines();
    expect(lines[0]).toBe('Id | Name | Category | Prov | Ver | Updated');
    // the rows, a blank line, the key
    expect(lines).toHaveLength(1 + fixtureIds.length + 2);
    expect(lines[lines.length - 2]).toBe('');
    expect(row('azure.ad')).toBe(
      'azure.ad | Microsoft Entra | Uncategorized | P | 3.4* | 2026-08-19'
    );
    expect(row('saml')).toBe('saml | SAML | saml | S | 1.3* | 2026-02-05');
    expect(row('bookmark')).toBe(
      'bookmark | Bookmark | bookmark | B | 1.0 | 2025-12-09'
    );
    expect(row('ai.target')).toBe(
      'ai.target | AI Target (Demo) | AI Services | AP | 1.0 | 2026-05-15'
    );
    // a date that is no date is printed as it is
    expect(row('ldap')).toBe(
      'ldap | LDAP | IT infrastructure | P | 2.10* | sometime in 2023'
    );
    // no connector column any more
    expect(lines[0]).not.toContain('Connector');
    // the catalog is read once for all the rows, and no template one by one
    expect(calls.map(([name]) => name)).toEqual([
      'listTemplates',
      'readCatalog',
    ]);
  });

  test('7: the key line has the letters of Prov and what the star means, and nothing else when nothing needs it', async () => {
    withoutUnknown();
    await listApplicationTemplates({ long: true });
    const lines = dataLines();
    expect(lines[lines.length - 1]).toBe(
      'P provisioning  A AI target  S SAML  O OIDC  F WS-Fed  T WS-Trust  B bookmark  * older versions exist'
    );
    expect(lines[lines.length - 1]).toHaveLength(101);
    expect(lines[lines.length - 2]).toBe('');
  });

  test('8: a template that no letter fits says ? and the key says what ? means, and only then', async () => {
    await listApplicationTemplates({ long: true });
    // class.name has a connector but says nothing about provisioning; escape and odd say nothing at all
    for (const id of ['class.name', 'escape', 'odd']) {
      expect(row(id).split(' | ')[3]).toBe('?');
    }
    expect(dataLines().at(-1)).toMatch(/ {2}\? not known$/);
    printed.length = 0;
    items = items.filter((item) => item.name === 'saml');
    await listApplicationTemplates({ long: true });
    expect(dataLines().at(-1)).not.toContain('?');
  });

  test('9: the star is behind the version of a template with older versions, no space, and not behind a template with one version', async () => {
    await listApplicationTemplates({ long: true });
    const version = (id) => row(id).split(' | ')[4];
    expect(version('azure.ad')).toBe('3.4*');
    expect(version('saml')).toBe('1.3*');
    expect(version('ldap')).toBe('2.10*');
    expect(version('bookmark')).toBe('1.0');
    expect(version('ai.target')).toBe('1.0');
    // dropping the older versions of a template takes its star away
    printed.length = 0;
    items = items.filter(
      (item) => !(item.name === 'azure.ad' && item.templateVersion === '3.3')
    );
    await listApplicationTemplates({ long: true });
    expect(version('azure.ad')).toBe('3.4');
  });

  test('10: the plain list and the table of the versions without --long have no key line', async () => {
    await listApplicationTemplates({});
    expect(messages('data')).toEqual(fixtureIds);
    printed.length = 0;
    await listApplicationTemplates({ allVersions: true });
    expect(dataLines()).not.toContain('');
    expect(dataLines().at(-1)).not.toContain('provisioning');
  });

  test('11: the templates of the tenant are marked with D, are read through the library, and may lack a category and capabilities', async () => {
    const saml = items.find(
      (item) => item.name === 'saml' && item.templateVersion === '1.3'
    );
    saml.isOverride = true;
    overrideEntries.set(saml.templateId, {
      id: 'saml',
      templateVersion: '1.3',
      displayName: 'SAML',
    });
    await listApplicationTemplates({ long: true, includeOverrides: true });
    const lines = dataLines();
    expect(lines[0]).toBe('Id | Name | Category | Prov | Ver | Updated | D');
    // no category, nothing known: the cell is empty and the letter is ?
    expect(row('saml')).toBe('saml | SAML |  | ? | 1.3* | 2026-02-05 | D');
    expect(row('azure.ad')).toMatch(/ \| $/);
    expect(lines.at(-1)).toContain('  D defined by the tenant');
    expect(lines.at(-1)).toContain('  ? not known');
    expect(
      calls.filter(([name]) => name === 'readTemplate').map(([, ref]) => ref)
    ).toEqual([{ templateName: 'saml', templateVersion: '1.3' }]);
    // without a template of the tenant there is no such column or line
    printed.length = 0;
    saml.isOverride = false;
    await listApplicationTemplates({ long: true });
    expect(dataLines()[0]).toBe('Id | Name | Category | Prov | Ver | Updated');
    expect(dataLines().at(-1)).not.toContain('defined by the tenant');
  });

  test('12: --all-versions prints the id and the version of every version, with the newest marked', async () => {
    await listApplicationTemplates({ allVersions: true });
    const lines = messages('data').join('\n').split('\n');
    expect(lines[0]).toBe('Id | Version | Newest');
    expect(lines).toHaveLength(1 + items.length);
    expect(row('azure.ad', '3.3')).toBe('azure.ad | 3.3 | ');
    expect(row('azure.ad', '3.4')).toBe('azure.ad | 3.4 | yes');
    expect(row('ldap', '2.3')).toBe('ldap | 2.3 | ');
    expect(row('ldap', '2.10')).toBe('ldap | 2.10 | yes');
    // no key of the catalog anywhere, and no star
    expect(messages('data').join('\n')).not.toMatch(/\d_\d+-/);
    expect(messages('data').join('\n')).not.toContain('*');
  });

  test('13: --long --all-versions has a row for every version in the columns Id, Ver, Name, Category, Prov, Updated and N, no star, and a key line that explains N', async () => {
    withoutUnknown();
    await listApplicationTemplates({ long: true, allVersions: true });
    const lines = dataLines();
    expect(lines[0]).toBe('Id | Ver | Name | Category | Prov | Updated | N');
    expect(lines).toHaveLength(1 + items.length + 2);
    expect(row('azure.ad', '3.3')).toBe(
      'azure.ad | 3.3 | Microsoft Entra | Uncategorized | P | 2024-10-03 | '
    );
    expect(row('azure.ad', '3.4')).toBe(
      'azure.ad | 3.4 | Microsoft Entra | Uncategorized | P | 2026-08-19 | N'
    );
    expect(row('saml', '1.2')).toContain(' | S | 2024-09-09 | ');
    // the star has one meaning: older versions exist, and every version has a row here
    expect(lines.slice(0, -2).join('\n')).not.toContain('*');
    expect(lines.at(-1)).toBe(
      'P provisioning  A AI target  S SAML  O OIDC  F WS-Fed  T WS-Trust  B bookmark  N newest version'
    );
    expect(lines.at(-1)).not.toContain('older versions');
  });

  test('14: --long --all-versions has the column N only when some version is not the newest, and D only when the tenant defines one', async () => {
    items = items.filter((item) => item.name === 'bookmark');
    await listApplicationTemplates({ long: true, allVersions: true });
    expect(dataLines()[0]).toBe('Id | Ver | Name | Category | Prov | Updated');
    expect(dataLines().at(-1)).not.toContain('N newest version');
    expect(dataLines().at(-1)).not.toContain('defined by the tenant');
    printed.length = 0;
    items = listItemsOf(fixtureCatalog).filter((item) => item.name === 'saml');
    items[0].isOverride = true;
    overrideEntries.set(items[0].templateId, { id: 'saml' });
    await listApplicationTemplates({
      long: true,
      allVersions: true,
      includeOverrides: true,
    });
    expect(dataLines()[0]).toBe(
      'Id | Ver | Name | Category | Prov | Updated | N | D'
    );
    expect(row('saml', '1.2')).toBe(
      'saml | 1.2 | SAML |  | ? | 2024-09-09 |  | D'
    );
    expect(dataLines().at(-1)).toContain(
      '  N newest version  D defined by the tenant'
    );
  });

  test('15: --all-versions shows the Override column only when the tenant defines a template', async () => {
    await listApplicationTemplates({ allVersions: true });
    expect(messages('data').join('\n').split('\n')[0]).not.toContain(
      'Override'
    );
    printed.length = 0;
    items[0].isOverride = true;
    overrideEntries.set(items[0].templateId, { id: items[0].name });
    await listApplicationTemplates({
      allVersions: true,
      includeOverrides: true,
    });
    expect(messages('data').join('\n').split('\n')[0]).toBe(
      'Id | Version | Newest | Override'
    );
    expect(row(items[0].name)).toBe(`${items[0].name} | 1.0 | yes | yes`);
  });

  test('16: the channel and the file reach the library', async () => {
    await listApplicationTemplates({ channel: 'development' });
    expect(lastCall('listTemplates')[1].channel).toBe('development');
    fs.writeFileSync(path.join(baseDirectory, 'c.json'), '{}');
    await listApplicationTemplates({ templates: 'c.json', long: true });
    expect(lastCall('listTemplates')[1].catalog).toBeInstanceOf(Uint8Array);
    expect(lastCall('readCatalog')[1].catalog).toBeInstanceOf(Uint8Array);
  });

  test('17: an unreadable file or a failure of the library is an error and a failed command', async () => {
    expect(await listApplicationTemplates({ templates: 'nope.json' })).toBe(
      false
    );
    expect(messages('error').join('\n')).toContain('nope.json');
    libraryFailure = new Error('the catalog is not a catalog');
    expect(await listApplicationTemplates({})).toBe(false);
  });
});

describe('describe', () => {
  beforeEach(() => {
    items = listItemsOf(fixtureCatalog);
    catalogResult.catalog = structuredClone(fixtureCatalog);
  });

  const lines = () => everythingPrinted().split('\n');
  const readCalls = () =>
    calls
      .filter(([name]) => name === 'readTemplate')
      .map(([, reference]) => reference);

  test('18: -i takes the newest version, whatever the case and whether the id is written with dots or hyphens, and reads the whole entry by name and version', async () => {
    for (const id of ['azure.ad', 'AZURE.AD', 'azure-ad']) {
      printed.length = 0;
      calls.length = 0;
      expect(await describeApplicationTemplate({ id }, {})).toBe(true);
      expect(readCalls()[0]).toEqual({
        templateName: 'azure.ad',
        templateVersion: '3.4',
      });
      expect(lines()).toContain('Id: azure.ad');
      expect(lines()).toContain('Version: 3.4 (newest)');
    }
  });

  test('19: -v takes another version and says which one is the newest', async () => {
    expect(
      await describeApplicationTemplate({ id: 'azure.ad', version: '3.3' }, {})
    ).toBe(true);
    expect(readCalls()[0]).toEqual({
      templateName: 'azure.ad',
      templateVersion: '3.3',
    });
    expect(lines()).toContain('Version: 3.3 (the newest is 3.4)');
    expect(lines()).toContain('Updated: 2024-10-03');
    // the connector bundle of that version, not of the newest
    expect(everythingPrinted()).toContain('[1.5.20.17, 1.6.0.0)');
    expect(everythingPrinted()).not.toContain('Register an app in Entra first');
  });

  test('20: -n takes the display name, whatever the case', async () => {
    expect(
      await describeApplicationTemplate({ name: 'MICROSOFT entra' }, {})
    ).toBe(true);
    expect(lines()).toContain('Id: azure.ad');
    expect(lines()).toContain('Display name: Microsoft Entra');
    expect(readCalls()[0].templateName).toBe('azure.ad');
  });

  test('21: the key the catalog keeps a version under is not an id: the command fails, says where the ids are and reads nothing', async () => {
    for (const id of ['3_4-azure-ad', '1_2-SAML']) {
      printed.length = 0;
      expect(await describeApplicationTemplate({ id }, {})).toBe(false);
      expect(messages('error')[0]).toContain(`"${id}" not found`);
      expect(messages('error')[0]).toContain('"frodo app template list"');
      expect(messages('error')[0]).toContain('name the version with -v');
    }
    expect(readCalls()).toEqual([]);
  });

  test('22: an id, a display name or a version that is not there, two names for different templates, and no name at all are errors, and nothing is read', async () => {
    const errorOf = async (selector) => {
      printed.length = 0;
      expect(await describeApplicationTemplate(selector, {})).toBe(false);
      return messages('error')[0];
    };
    expect(await errorOf({ id: 'nope' })).toContain('"nope" not found');
    expect(await errorOf({ name: 'Nope' })).toContain(
      'No application template has the display name "Nope"'
    );
    expect(await errorOf({ id: 'ldap', version: '9.9' })).toBe(
      'Application template ldap has no version 9.9. Versions: 2.3, 2.10.'
    );
    expect(await errorOf({ id: 'saml', name: 'Microsoft Entra' })).toContain(
      'name different application templates (saml and azure.ad)'
    );
    expect(await errorOf({})).toContain('-i (id) or -n (display name)');
    expect(readCalls()).toEqual([]);
  });

  test('23: the summary has the header, the versions, the connector, the capabilities, the object types and the form', async () => {
    await describeApplicationTemplate({ id: 'azure.ad' }, {});
    const out = everythingPrinted();
    expect(lines().slice(0, 9)).toEqual([
      'Id: azure.ad',
      'Display name: Microsoft Entra',
      'Group: AzureAD (enterprise)',
      'Category: Uncategorized',
      'Provides: provisioning',
      'Version: 3.4 (newest)',
      'Updated: 2026-08-19',
      'Description: Reads and provisions Entra.',
      'Support URL: https://docs.example.com/entra',
    ]);
    // the versions: the connector bundle each needs, the counts, the marks
    expect(out).toContain(
      'Version | Updated | Connector bundle | Object types | Properties | Note'
    );
    expect(out).toContain('3.3 | 2024-10-03 | [1.5.20.17, 1.6.0.0) | 1 | 2 | ');
    expect(out).toContain(
      '3.4 | 2026-08-19 | [1.5.20.35, 1.6.0.0) | 2 | 4 | shown, newest'
    );
    expect(out).toContain('  Name: MSGraphAPI Connector');
    expect(out).toContain(
      '  Class: org.example.msgraphapi.MSGraphAPIConnector'
    );
    expect(out).toContain(
      '  Bundle: org.example.msgraphapi-connector [1.5.20.35, 1.6.0.0)'
    );
    expect(out).toContain('  Paging: cookie');
    expect(out).toContain('  Needs a remote connector server (RCS): yes');
    expect(out).toContain('  Prerequisites: Register an app in Entra first');
    expect(out).toContain(
      '  Basic configuration (2, * required): Tenant*, Client Secret'
    );
    expect(out).toContain(
      '  Advanced configuration (1, * required): Exclude Unmodified'
    );
    expect(out).toContain('  Provisioning: create, read, update, delete');
    expect(out).toContain('  Incremental reconciliation: whenChanged (ge)');
    expect(out).toContain('User | __ACCOUNT__ | user | 3 | 1');
    expect(out).toContain('Group | __GROUP__ | assignment | 1 | 1');
    expect(out).toContain('  applicationDetails: 2 fields');
    expect(out).toContain('  provisioning: 1 default value');
    // the long fields are for --long, the empty section is not shown
    expect(out).not.toContain('Client Secret | clientSecret');
    expect(out).not.toContain('Properties of');
    expect(out).not.toContain('nothing');
    // the key the catalog keeps the version under is nowhere
    expect(out).not.toMatch(/\d_\d+-azure/);
  });

  test('24: --long adds the table of the connector configuration, the properties of each object type and the labels of the form fields', async () => {
    await describeApplicationTemplate({ id: 'azure.ad' }, { long: true });
    const out = everythingPrinted();
    expect(out).toContain('Label | Property | Type | Required');
    expect(out).toContain('Tenant | tenant | string | yes');
    expect(out).toContain('Client Secret | clientSecret | password | ');
    expect(out).toContain('Properties of User');
    expect(out).toContain('Properties of Group');
    expect(out).toContain('Name | Type | Flags');
    expect(out).toContain('userPrincipalName | string | required');
    expect(out).toContain('memberOf | string | multi-valued, read-only');
    expect(out).toContain('  applicationDetails: 2 fields: Name, Description');
    expect(out).toContain('  provisioning: 1 default value: performHardDelete');
  });

  test('25: a template without a connector or object types leaves those sections and columns out, and an SSO template says its protocols and setup', async () => {
    await describeApplicationTemplate({ id: 'saml' }, {});
    const out = everythingPrinted();
    expect(lines()).toContain('Provides: SSO: SAML');
    expect(lines()).toContain('Version: 1.3 (newest)');
    expect(out).toContain('Version | Updated | Note');
    expect(out).not.toContain('Connector bundle');
    expect(out).not.toContain('Connector\n');
    expect(out).not.toContain('Object types');
    expect(out).toContain('  SSO: SAML');
    expect(out).toContain('  SSO setup: instructions, schema, defaults');
    expect(out).toContain('  Client types: iOS, Android, React');
    printed.length = 0;
    await describeApplicationTemplate({ id: 'bookmark' }, {});
    expect(lines()).toContain('Provides: Bookmark');
    // one version: no table of versions; nothing to say about capabilities
    expect(everythingPrinted()).not.toContain('Versions');
    expect(everythingPrinted()).not.toContain('Capabilities');
    expect(lines()).toContain('  applicationDetails: 1 field');
  });

  test('26: an AI target says so, and that it needs an OAuth flow', async () => {
    await describeApplicationTemplate({ id: 'ai.target' }, {});
    expect(lines()).toContain('Provides: target+provisioning');
    expect(lines()).toContain('  Provisioning: read');
    expect(lines()).toContain('  Target: yes');
    expect(lines()).toContain('  Needs an OAuth flow: yes');
  });

  test('27: --json prints the whole entry of the version and nothing else', async () => {
    await describeApplicationTemplate(
      { id: 'azure.ad', version: '3.3' },
      { json: true }
    );
    expect(JSON.parse(messages('data').join(''))).toEqual(
      fixtureCatalog.AppTemplates.enterprise.AzureAD['3_3-azure-ad']
    );
    expect(printed).toHaveLength(1);
  });

  test('28: a template of the tenant is marked, and its version is read through the library', async () => {
    const saml = items.find(
      (item) => item.name === 'saml' && item.templateVersion === '1.3'
    );
    saml.isOverride = true;
    overrideEntries.set(saml.templateId, {
      id: 'saml',
      templateVersion: '1.3',
      displayName: 'SAML',
      description: 'The tenant says so.',
    });
    expect(
      await describeApplicationTemplate(
        { id: 'saml' },
        { includeOverrides: true }
      )
    ).toBe(true);
    expect(lines()).toContain('Defined by the tenant: yes');
    expect(lines()).toContain('Description: The tenant says so.');
    expect(everythingPrinted()).toContain(
      'shown, newest, defined by the tenant'
    );
  });

  test('29: an entry whose fields have the wrong types prints what it can, and a control character does not reach the terminal', async () => {
    expect(
      await describeApplicationTemplate({ id: 'odd' }, { long: true })
    ).toBe(true);
    expect(lines()).toContain('Id: odd');
    expect(lines()).toContain('Updated: 13-45-2026');
    expect(lines()).toContain('Description: 12');
    expect(everythingPrinted()).not.toContain('Connector');
    printed.length = 0;
    await describeApplicationTemplate({ id: 'escape' }, {});
    expect(everythingPrinted()).not.toMatch(/[\u0000-\u0009\u000b-\u001f]/);
    expect(lines()).toContain('Description: before [31mred [0m after');
  });

  test('30: the tenant is merged only when told there is one, and the same options reach the list and the reads', async () => {
    await describeApplicationTemplate(
      { id: 'saml' },
      { includeOverrides: true, channel: 'development' }
    );
    expect(lastCall('listTemplates')[1]).toMatchObject({
      includeOverrides: true,
      channel: 'development',
    });
    expect(lastCall('readTemplate')[2]).toMatchObject({
      includeOverrides: true,
      channel: 'development',
    });
    expect(lastCall('readCatalog')[1]).toMatchObject({
      channel: 'development',
    });
    await describeApplicationTemplate({ id: 'saml' }, {});
    expect(lastCall('listTemplates')[1].includeOverrides).toBe(false);
  });
});

describe('describe: a version that is empty, and a template without a display name', () => {
  beforeEach(() => {
    items = listItemsOf(fixtureCatalog);
    catalogResult.catalog = structuredClone(fixtureCatalog);
  });

  test('31: -v with an empty text (an unset shell variable) fails like an unknown version, and nothing is read', async () => {
    expect(
      await describeApplicationTemplate({ id: 'azure.ad', version: '' }, {})
    ).toBe(false);
    expect(messages('error')[0]).toBe(
      'Application template azure.ad has no version "". Versions: 3.3, 3.4.'
    );
    expect(lastCall('readTemplate')).toBeUndefined();
  });

  test('32: a template without a display name is shown with its id as its display name, and -n finds it by that', async () => {
    items.find((item) => item.name === 'odd').displayName = undefined;
    await listApplicationTemplates({ long: true });
    const lines = messages('data').join('\n').split('\n');
    expect(lines.find((line) => line.startsWith('odd |'))).toContain(
      'odd | odd | '
    );
    printed.length = 0;
    expect(await describeApplicationTemplate({ name: 'ODD' }, {})).toBe(true);
    expect(everythingPrinted().split('\n')).toContain('Display name: odd');
  });
});

describe('an escape sequence in a field of an entry', () => {
  // one field of the saml template carries an escape that starts a color, the
  // 8-bit CSI and a bidi override; no command may print any of them, and the
  // library must still be asked with the text as it listed it
  const everyCommand = (id, name, version) => [
    () => listApplicationTemplates({}),
    () => listApplicationTemplates({ long: true }),
    () => listApplicationTemplates({ allVersions: true }),
    () => listApplicationTemplates({ long: true, allVersions: true }),
    () => describeApplicationTemplate({ id }, {}),
    () => describeApplicationTemplate({ id }, { long: true }),
    () => describeApplicationTemplate({ name }, { long: true }),
    () => describeApplicationTemplate({ id, version }, {}),
    // the error lists the versions of the template
    () => describeApplicationTemplate({ id, version: 'no such version' }, {}),
  ];

  test.each(POISONABLE_FIELDS)(
    '33: %s: nothing printed by list or describe carries it',
    async (field) => {
      const poisoned = poisonFixture(field);
      items = listItemsOf(poisoned);
      catalogResult.catalog = structuredClone(poisoned);
      const raw = items.filter(
        (item) => item.group?.startsWith('Sa') && item.name.startsWith('sa')
      );
      expect(raw.length).toBe(2);
      // what the user types is what the command printed: the safe text
      // the library's mark says which one is the newest (a version with an
      // escape in it is not a number, so the fixture's own order is no guide)
      const newest = raw.find((item) => item.newestInGroup) ?? raw[1];
      const older = raw.find((item) => item !== newest);
      const id = textOf(newest.name);
      const name = textOf(newest.displayName);
      const version = textOf(older.templateVersion);
      for (const run of everyCommand(id, name, version)) {
        printed.length = 0;
        calls.length = 0;
        await run();
        expect(printed.length).toBeGreaterThan(0);
        expect(everythingPrinted()).not.toMatch(UNSAFE_OUTPUT);
      }
      // the template was found and described, and the library was asked
      // with the row as it listed it
      printed.length = 0;
      calls.length = 0;
      expect(await describeApplicationTemplate({ id }, {})).toBe(true);
      expect(everythingPrinted()).toContain(`Id: ${id}`);
      const asked = calls.find(([call]) => call === 'readTemplate')[1];
      expect(asked).toEqual({
        templateName: newest.name,
        templateVersion: newest.templateVersion,
      });
      if (field === 'id' || field === 'templateVersion') {
        expect(JSON.stringify(asked)).toContain(
          JSON.stringify(POISON).slice(1, -1)
        );
      }
    }
  );

  test('34: the fields of the entry itself (description, connector, form) are made safe as well', async () => {
    const poisoned = structuredClone(fixtureCatalog);
    const entry = poisoned.AppTemplates.enterprise.AzureAD['3_4-azure-ad'];
    entry.description = `d${POISON}`;
    entry.supportUrl = `https://x${POISON}`;
    entry.connectorDisplayName = `c${POISON}`;
    entry.categories = [`cat${POISON}`];
    entry.capabilities.provisioning[`Read${POISON}`] = true;
    entry.objectTypes[0].properties[0].name = `p${POISON}`;
    entry.schema.applicationDetails[0][0].label = `l${POISON}`;
    entry.connectorTemplate.basic[0][0].label = `b${POISON}`;
    items = listItemsOf(poisoned);
    catalogResult.catalog = structuredClone(poisoned);
    for (const options of [{}, { long: true }]) {
      printed.length = 0;
      await describeApplicationTemplate({ id: 'azure.ad' }, options);
      expect(everythingPrinted()).toContain('Description: d [31m');
      expect(everythingPrinted()).not.toMatch(UNSAFE_OUTPUT);
    }
    printed.length = 0;
    await listApplicationTemplates({ long: true });
    expect(everythingPrinted()).not.toMatch(UNSAFE_OUTPUT);
  });
});

describe('download', () => {
  test('35: asks the source now, saves the text of the cached catalog unchanged, and says what the cache did', async () => {
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

  test('36: without a file it saves appTemplates.json in the working directory and says so', async () => {
    expect(await downloadApplicationTemplateCatalog()).toBe(true);
    expect(saved[0].file).toBe(path.join(baseDirectory, DEFAULT_CATALOG_FILE));
    expect(messages('info')[0]).toContain(DEFAULT_CATALOG_FILE);
  });

  test('37: without a kept file it writes the catalog the library returned', async () => {
    delete catalogResult.metadata.cachePath;
    const file = path.join(baseDirectory, 'plain.json');
    await downloadApplicationTemplateCatalog('plain.json');
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(sampleCatalog);
  });

  test('38: a stale copy after an error is a warning, and air-gapped mode is said in words', async () => {
    catalogResult.metadata.cache = 'stale-after-error';
    catalogResult.metadata.cacheError = 'getaddrinfo ENOTFOUND';
    await downloadApplicationTemplateCatalog('a.json');
    expect(messages('warn')[0]).toContain('getaddrinfo ENOTFOUND');
    expect(describeCacheOutcome({ cache: 'offline' })).toContain(
      'air-gapped mode is on'
    );
  });

  test('39: an air-gapped refusal fails the command and is followed by the advice of this command line', async () => {
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

  test('40: the same advice follows a refusal while listing', async () => {
    libraryFailure = new FakeFrodoError('Air-gapped mode is on.', 'AIR_GAPPED');
    expect(await listApplicationTemplates({})).toBe(false);
    expect(messages('info').join('\n')).toContain('--templates <file>');
  });
});

describe('the catalog counts', () => {
  test('41: versions and groups of both tiers are counted', () => {
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
  test('42: the CLI switches it on at start, in the default folder of the library', () => {
    delete process.env.FRODO_CONFIG_PATH;
    expect(cacheEnabled).toBe(false);
    enableTemplateCatalogCache();
    expect(cacheEnabled).toBe(true);
    expect(cachePath).toBeUndefined();
  });

  test('43: the folder moves with FRODO_CONFIG_PATH like the other files of frodo', () => {
    process.env.FRODO_CONFIG_PATH = '/srv/frodo-config';
    try {
      enableTemplateCatalogCache();
    } finally {
      delete process.env.FRODO_CONFIG_PATH;
    }
    expect(cacheEnabled).toBe(true);
    expect(cachePath).toBe(path.join('/srv/frodo-config', 'AppTemplates'));
  });

  test('44: src/app.ts calls the switch at start, before it builds the commands, and nothing offers a way to turn it off', () => {
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
