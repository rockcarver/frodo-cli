/**
 * Unit tests for the `oauth issuer` verbs (src/ops/OAuth2TrustedJwtIssuerOps.ts),
 * without a tenant. The real import graph pulls in all of frodo-lib, whose
 * bundled ESM cannot load under jest's ESM runtime, so the facade and the
 * console are mocked before the module under test is imported. What these tests
 * guard is what the commands add to the library: the two shapes of a read (a read
 * by id wraps every setting in `{ inherited, value }`, a query answers plain
 * values), `any user` for an issuer without allowed subjects, an id that is
 * never an empty string or a quiet success, and an output that does not depend
 * on the deployment type.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

const HOST = 'https://openam-matrix.example.com/am';

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);

/** An issuer in the plain shape of a query (`null` for a setting that is not set). */
const plainIssuer = (id, more = {}) => ({
  _id: id,
  _rev: '1',
  issuer: `https://${id}.example.com`,
  allowedSubjects: ['neo', 'trinity'],
  jwksUri: `https://${id}.example.com/jwks`,
  jwkSet: null,
  jwksCacheTimeout: 3600000,
  jwkStoreCacheMissCacheTime: 60000,
  consentedScopesClaim: 'scope',
  resourceOwnerIdentityClaim: 'sub',
  agentgroup: null,
  _type: {
    _id: 'TrustedJwtIssuer',
    name: 'OAuth2 Trusted JWT Issuer',
    collection: true,
  },
  ...more,
});

/** The same issuer as a read by id answers it (`value` missing for a setting that is not set). */
const wrappedIssuer = (id, more = {}) => {
  const plain = plainIssuer(id, more);
  return Object.fromEntries(
    Object.entries(plain).map(([key, value]) => [
      key,
      key.startsWith('_') || key === 'agentgroup'
        ? value
        : value === null
          ? { inherited: false }
          : { inherited: false, value },
    ])
  );
};

/** The issuers of an import file, the way the library finds them. */
const issuersOf = (data) => ({
  ...Object.fromEntries(
    Object.entries(data.agent ?? {}).filter(
      ([, agent]) => agent?._type?._id === 'TrustedJwtIssuer'
    )
  ),
  ...(data.trustedJwtIssuer ?? {}),
});

/** The error the library reports for one issuer it could not import: it names the issuer and wraps the cause. */
const libError = (id) =>
  Object.assign(new Error(`Error importing alpha realm trusted issuer ${id}`), {
    originalErrors: [new Error(`the server refused ${id}`)],
  });

let stored = [];
let wrapped = true;
let readFailure;
let deploymentType = 'cloud';
let realm = 'alpha';
let baseDirectory = '';
let failingSave;
let failingImport = new Set();
let importThrows;
let failingDelete = new Set();
let rawDeleteFailures = new Set();
const calls = [];
const saved = [];

const lib = {
  readOAuth2TrustedJwtIssuers: async () => {
    if (readFailure) throw readFailure;
    return structuredClone(stored);
  },
  readOAuth2TrustedJwtIssuer: async (id) => {
    calls.push(['readOAuth2TrustedJwtIssuer', id]);
    const found = stored.find((entry) => entry._id === id);
    if (!found) throw new Error(`no such trusted issuer ${id}`);
    return structuredClone(wrapped ? wrappedIssuer(id, found) : found);
  },
  createOAuth2TrustedJwtIssuerExportTemplate: () => ({
    meta: { origin: HOST },
    trustedJwtIssuer: {},
  }),
  // a read by id is wrapped and a query is plain, as AM answers them; the library does not make them agree
  exportOAuth2TrustedJwtIssuer: async (id) => {
    calls.push(['exportOAuth2TrustedJwtIssuer', id]);
    const found = stored.find((entry) => entry._id === id);
    if (!found) throw new Error(`no such trusted issuer ${id}`);
    return {
      meta: { origin: HOST },
      trustedJwtIssuer: {
        [id]: structuredClone(wrapped ? wrappedIssuer(id, found) : found),
      },
    };
  },
  exportOAuth2TrustedJwtIssuers: async () => {
    calls.push(['exportOAuth2TrustedJwtIssuers']);
    if (readFailure) throw readFailure;
    return {
      meta: { origin: HOST },
      trustedJwtIssuer: Object.fromEntries(
        structuredClone(stored).map((entry) => [entry._id, entry])
      ),
    };
  },
  deleteOAuth2TrustedJwtIssuer: async (id) => {
    calls.push(['deleteOAuth2TrustedJwtIssuer', id]);
    if (!stored.some((entry) => entry._id === id)) {
      throw new Error(`Error deleting alpha realm trusted issuer ${id}`);
    }
    stored = stored.filter((entry) => entry._id !== id);
    return { _id: id };
  },
  // the library reads the issuers itself and reports every one to the callback; it throws when it cannot read them
  deleteOAuth2TrustedJwtIssuers: async (resultCallback) => {
    calls.push(['deleteOAuth2TrustedJwtIssuers']);
    if (readFailure) throw readFailure;
    const deleted = [];
    for (const issuer of structuredClone(stored)) {
      if (rawDeleteFailures.has(issuer._id)) {
        // an error that is not wrapped by the library: it names the issuer only by its URL
        resultCallback(
          Object.assign(new Error('Request failed with status code 500'), {
            config: {
              url: `${HOST}/json/realms/root/realms/alpha/realm-config/agents/TrustedJwtIssuer/${issuer._id}`,
            },
          })
        );
      } else if (failingDelete.has(issuer._id)) {
        resultCallback(
          Object.assign(
            new Error(
              `Error deleting alpha realm trusted issuer ${issuer._id}`
            ),
            { originalErrors: [new Error(`the server refused ${issuer._id}`)] }
          )
        );
      } else {
        stored = stored.filter((entry) => entry._id !== issuer._id);
        deleted.push(issuer);
        resultCallback(undefined, issuer);
      }
    }
    return deleted;
  },
  // what the library does with an import file: its own key, and the issuers among the entries of an agent export
  importOAuth2TrustedJwtIssuer: async (id, data) => {
    calls.push(['importOAuth2TrustedJwtIssuer', id, structuredClone(data)]);
    const issuer = issuersOf(data)[id];
    if (!issuer)
      throw new Error(`Trusted issuer ${id} not found in import data!`);
    if (failingImport.has(id)) throw libError(id);
    return issuer;
  },
  importFirstOAuth2TrustedJwtIssuer: async (data) => {
    calls.push(['importFirstOAuth2TrustedJwtIssuer', structuredClone(data)]);
    const [first] = Object.values(issuersOf(data));
    if (!first) throw new Error('No trusted issuers found in import data!');
    if (failingImport.has(first._id)) throw libError(first._id);
    return first;
  },
  importOAuth2TrustedJwtIssuers: async (data, _options, resultCallback) => {
    calls.push(['importOAuth2TrustedJwtIssuers', structuredClone(data)]);
    if (importThrows) throw importThrows;
    for (const issuer of Object.values(issuersOf(data))) {
      if (failingImport.has(issuer._id)) resultCallback(libError(issuer._id));
      else resultCallback(undefined, issuer);
    }
    return [];
  },
};

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  state: {
    getDeploymentType: () => deploymentType,
    getRealm: () => realm,
  },
  frodo: {
    utils: {
      // a stand-in for the library's slug: the helper under test adds its rules on top of it
      getTypedFilename: (name, type) =>
        `${name.replace(/[^\w\s$*_+~.()'"!\-@]+/g, '').replace(/\s+/g, '-')}.${type}.json`,
      titleCase: (input) =>
        input
          .toString()
          .toLowerCase()
          .split(' ')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
      getRealmName: (value) => {
        const components = value.split('/');
        return components.length > 0 && value !== '/'
          ? components[components.length - 1]
          : '/';
      },
      saveJsonToFile: (data, file, includeMeta) => {
        if (failingSave && file.includes(failingSave)) {
          throw new Error('could not write the file');
        }
        saved.push({ data: structuredClone(data), file, includeMeta });
      },
      getWorkingDirectory: () => baseDirectory || '.',
      getFilePath: (file) =>
        baseDirectory ? path.join(baseDirectory, file) : file,
    },
    oauth2oidc: { issuer: lib },
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
  listOAuth2TrustedJwtIssuers,
  describeOAuth2TrustedJwtIssuer,
  exportOAuth2TrustedJwtIssuerToFile,
  exportOAuth2TrustedJwtIssuersToFile,
  exportOAuth2TrustedJwtIssuersToFiles,
  importFirstOAuth2TrustedJwtIssuerFromFile,
  importOAuth2TrustedJwtIssuerFromFile,
  importOAuth2TrustedJwtIssuersFromFile,
  importOAuth2TrustedJwtIssuersFromFiles,
  deleteOAuth2TrustedJwtIssuerById,
  deleteOAuth2TrustedJwtIssuers,
  printTrustedIssuerPlan,
} = await import('../../src/ops/OAuth2TrustedJwtIssuerOps.ts');

const savedFile = (entry) => path.relative(baseDirectory, entry.file);

beforeEach(() => {
  printed.length = 0;
  calls.length = 0;
  saved.length = 0;
  stored = [];
  wrapped = true;
  readFailure = undefined;
  failingSave = undefined;
  failingImport = new Set();
  importThrows = undefined;
  failingDelete = new Set();
  rawDeleteFailures = new Set();
  deploymentType = 'cloud';
  realm = 'alpha';
  baseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-issuer-'));
});

afterEach(() => {
  fs.rmSync(baseDirectory, { recursive: true, force: true });
});

describe('listOAuth2TrustedJwtIssuers', () => {
  beforeEach(() => {
    stored = [plainIssuer('zion'), plainIssuer('alpha-issuer')];
  });

  test('lists the id of every issuer, sorted by id', async () => {
    await expect(listOAuth2TrustedJwtIssuers()).resolves.toBe(true);

    expect(messages('data')).toEqual(['alpha-issuer', 'zion']);
  });

  test('--long shows the issuer, the allowed subjects one per line and the JWKS URI', async () => {
    await expect(listOAuth2TrustedJwtIssuers(true)).resolves.toBe(true);

    const [table] = messages('data');
    expect(table).toBe(
      [
        'Id | Issuer | Allowed subjects | JWKS URI',
        'alpha-issuer | https://alpha-issuer.example.com | neo\ntrinity | https://alpha-issuer.example.com/jwks',
        'zion | https://zion.example.com | neo\ntrinity | https://zion.example.com/jwks',
      ].join('\n')
    );
  });

  test('an issuer without allowed subjects reads "any user", because AM then lets it name any realm user', async () => {
    stored = [
      plainIssuer('open', { allowedSubjects: [] }),
      plainIssuer('missing', { allowedSubjects: null }),
    ];

    await listOAuth2TrustedJwtIssuers(true);

    const [table] = messages('data');
    expect(table).toContain('missing | https://missing.example.com | any user');
    expect(table).toContain('open | https://open.example.com | any user');
  });

  test('takes the wrapped shape as well as the plain one, and members that are missing do not throw', async () => {
    stored = [
      wrappedIssuer('wrapped'),
      wrappedIssuer('unset', { jwksUri: null, allowedSubjects: null }),
      { _id: 'bare' },
    ];

    await expect(listOAuth2TrustedJwtIssuers(true)).resolves.toBe(true);

    const [table] = messages('data');
    expect(table).toContain(
      'wrapped | https://wrapped.example.com | neo\ntrinity | https://wrapped.example.com/jwks'
    );
    expect(table).toContain('unset | https://unset.example.com | any user | ');
    expect(table).toContain('bare |  | any user | ');
  });

  test('a realm without issuers, which is what the library answers for the Cloud root realm, lists nothing and succeeds', async () => {
    stored = [];

    await expect(listOAuth2TrustedJwtIssuers()).resolves.toBe(true);
    await expect(listOAuth2TrustedJwtIssuers(true)).resolves.toBe(true);

    // the short form prints nothing, the long form an empty table with its header
    expect(messages('data')).toEqual([
      'Id | Issuer | Allowed subjects | JWKS URI',
    ]);
    expect(messages('error')).toEqual([]);
  });

  test('a failing read prints the error and fails', async () => {
    readFailure = new Error('Error reading alpha realm trusted issuers');

    await expect(listOAuth2TrustedJwtIssuers()).resolves.toBe(false);

    expect(messages('error')[0]).toContain(
      'Error listing trusted JWT issuers: Error reading alpha realm trusted issuers'
    );
  });
});

describe('describeOAuth2TrustedJwtIssuer', () => {
  beforeEach(() => {
    stored = [plainIssuer('zion')];
  });

  test('the table names the issuer and its settings, with the key set as present or absent', async () => {
    await expect(describeOAuth2TrustedJwtIssuer('zion')).resolves.toBe(true);

    expect(messages('data')[0]).toBe(
      [
        'Property | Value',
        'Issuer Id | zion',
        'Issuer | https://zion.example.com',
        'Allowed subjects | neo\ntrinity',
        'JWKS URI | https://zion.example.com/jwks',
        'JWK set | not set',
        'JWKS cache timeout | 3600000',
        'JWK store cache miss time | 60000',
        'Consented scopes claim | scope',
        'Resource owner identity claim | sub',
      ].join('\n')
    );
  });

  test('a key set is shown as set, never in full', async () => {
    stored = [plainIssuer('keys', { jwkSet: '{"keys":[{"kty":"RSA"}]}' })];

    await describeOAuth2TrustedJwtIssuer('keys');

    expect(messages('data')[0]).toContain('JWK set | set');
    expect(messages('data')[0]).not.toContain('RSA');
  });

  test('reads the wrapped shape of a read by id, a wrapper without a value counting as not set', async () => {
    stored = [plainIssuer('zion', { jwksUri: null, allowedSubjects: [] })];

    await expect(describeOAuth2TrustedJwtIssuer('zion')).resolves.toBe(true);

    const table = messages('data')[0];
    expect(table).toContain('JWKS URI | \n');
    expect(table).toContain('Allowed subjects | any user');
  });

  test('reads the plain shape too', async () => {
    wrapped = false;

    await expect(describeOAuth2TrustedJwtIssuer('zion')).resolves.toBe(true);

    expect(messages('data')[0]).toContain('Issuer | https://zion.example.com');
  });

  test('--json prints the object unchanged', async () => {
    await expect(describeOAuth2TrustedJwtIssuer('zion', true)).resolves.toBe(
      true
    );

    expect(JSON.parse(messages('data')[0])).toEqual(wrappedIssuer('zion'));
  });

  test('an issuer that does not exist fails and names it', async () => {
    await expect(describeOAuth2TrustedJwtIssuer('missing')).resolves.toBe(
      false
    );

    expect(messages('error')[0]).toContain('missing');
  });

  test('no id (the picker had nothing to offer) says so, reads nothing and fails; it is never an empty success', async () => {
    await expect(describeOAuth2TrustedJwtIssuer(undefined)).resolves.toBe(
      false
    );

    expect(messages('warn')).toEqual([
      'There is no trusted JWT issuer to choose from.',
    ]);
    expect(calls).toEqual([]);
    expect(messages('data')).toEqual([]);
  });
});

describe('exportOAuth2TrustedJwtIssuerToFile', () => {
  beforeEach(() => {
    stored = [
      plainIssuer('zion'),
      plainIssuer('open', { allowedSubjects: [] }),
    ];
  });

  test('writes <id>.oauth2.issuer.json with the key trustedJwtIssuer and the metadata', async () => {
    await expect(
      exportOAuth2TrustedJwtIssuerToFile('zion', undefined, true)
    ).resolves.toBe(true);

    expect(calls).toEqual([['exportOAuth2TrustedJwtIssuer', 'zion']]);
    expect(saved).toHaveLength(1);
    expect(savedFile(saved[0])).toBe('zion.oauth2.issuer.json');
    expect(saved[0].includeMeta).toBe(true);
    expect(Object.keys(saved[0].data)).toEqual(['meta', 'trustedJwtIssuer']);
    expect(Object.keys(saved[0].data.trustedJwtIssuer)).toEqual(['zion']);
  });

  test('-f names the file and -N leaves the metadata out', async () => {
    await expect(
      exportOAuth2TrustedJwtIssuerToFile('zion', 'mine.json', false)
    ).resolves.toBe(true);

    expect(savedFile(saved[0])).toBe('mine.json');
    expect(saved[0].includeMeta).toBe(false);
  });

  test('the file holds the plain shape, although a read by id is wrapped', async () => {
    await exportOAuth2TrustedJwtIssuerToFile('zion', undefined);

    const issuer = saved[0].data.trustedJwtIssuer.zion;
    expect(issuer.issuer).toBe('https://zion.example.com');
    expect(issuer.allowedSubjects).toEqual(['neo', 'trinity']);
    expect(issuer.jwkSet).toBeNull();
    expect(issuer._type).toEqual(plainIssuer('zion')._type);
  });

  test('an id that is not a file name gets a safe one, and the content keeps the exact id', async () => {
    const id = 'a'.repeat(300);
    stored = [plainIssuer(id)];

    await exportOAuth2TrustedJwtIssuerToFile(id, undefined);

    expect(savedFile(saved[0])).toMatch(
      /^a{100}-[0-9a-f]{8}\.oauth2\.issuer\.json$/
    );
    expect(Object.keys(saved[0].data.trustedJwtIssuer)).toEqual([id]);
  });

  test('an issuer that does not exist fails, names it and writes nothing', async () => {
    await expect(
      exportOAuth2TrustedJwtIssuerToFile('missing', undefined)
    ).resolves.toBe(false);

    expect(messages('error')[0]).toContain('missing');
    expect(saved).toEqual([]);
  });

  test('a file that cannot be written fails', async () => {
    failingSave = 'zion';

    await expect(
      exportOAuth2TrustedJwtIssuerToFile('zion', undefined)
    ).resolves.toBe(false);

    expect(messages('error')[0]).toContain('could not write the file');
  });

  test('no id (the picker had nothing to offer) says so, reads nothing and fails', async () => {
    await expect(
      exportOAuth2TrustedJwtIssuerToFile(undefined, undefined)
    ).resolves.toBe(false);

    expect(messages('warn')).toEqual([
      'There is no trusted JWT issuer to choose from.',
    ]);
    expect(calls).toEqual([]);
    expect(saved).toEqual([]);
  });
});

describe('exportOAuth2TrustedJwtIssuersToFile', () => {
  beforeEach(() => {
    stored = [plainIssuer('zion'), plainIssuer('open')];
  });

  test.each([
    ['alpha', 'allAlphaIssuers.oauth2.issuer.json'],
    ['/alpha', 'allAlphaIssuers.oauth2.issuer.json'],
    ['/', 'allRootIssuers.oauth2.issuer.json'],
    ['/parent/child', 'allChildIssuers.oauth2.issuer.json'],
  ])('in the realm %s writes %s', async (realmName, fileName) => {
    realm = realmName;

    await expect(
      exportOAuth2TrustedJwtIssuersToFile(undefined, true)
    ).resolves.toBe(true);

    expect(saved).toHaveLength(1);
    expect(savedFile(saved[0])).toBe(fileName);
    expect(Object.keys(saved[0].data.trustedJwtIssuer).sort()).toEqual([
      'open',
      'zion',
    ]);
  });

  test('-f names the file and -N leaves the metadata out', async () => {
    await exportOAuth2TrustedJwtIssuersToFile('all.json', false);

    expect(savedFile(saved[0])).toBe('all.json');
    expect(saved[0].includeMeta).toBe(false);
  });

  test('a realm without issuers (the library answers with an empty list for the Cloud root realm) writes the empty section', async () => {
    stored = [];

    await expect(
      exportOAuth2TrustedJwtIssuersToFile(undefined, true)
    ).resolves.toBe(true);

    expect(saved[0].data.trustedJwtIssuer).toEqual({});
  });

  test('one operation: a failing read writes no file and fails', async () => {
    readFailure = new Error('Error exporting alpha realm trusted issuers');

    await expect(
      exportOAuth2TrustedJwtIssuersToFile(undefined, true)
    ).resolves.toBe(false);

    expect(saved).toEqual([]);
    expect(messages('error')[0]).toContain('Error exporting alpha realm');
  });
});

describe('exportOAuth2TrustedJwtIssuersToFiles', () => {
  beforeEach(() => {
    stored = ['a', 'b', 'c', 'd'].map((id) => plainIssuer(id));
  });

  test('writes one file per issuer, each with its own export template', async () => {
    await expect(exportOAuth2TrustedJwtIssuersToFiles(true)).resolves.toBe(
      true
    );

    expect(saved.map(savedFile)).toEqual([
      'a.oauth2.issuer.json',
      'b.oauth2.issuer.json',
      'c.oauth2.issuer.json',
      'd.oauth2.issuer.json',
    ]);
    for (const entry of saved) {
      expect(Object.keys(entry.data.trustedJwtIssuer)).toHaveLength(1);
      expect(entry.includeMeta).toBe(true);
    }
  });

  test('a very long id and two ids with one slug get distinct, valid names', async () => {
    const long = 'x'.repeat(5000);
    stored = [plainIssuer('ab'), plainIssuer('a/b'), plainIssuer(long)];

    await expect(exportOAuth2TrustedJwtIssuersToFiles(true)).resolves.toBe(
      true
    );

    const names = saved.map(savedFile);
    expect(new Set(names).size).toBe(3);
    expect(names[0]).toBe('ab.oauth2.issuer.json');
    expect(names[1]).toMatch(/^ab-[0-9a-f]{8}\.oauth2\.issuer\.json$/);
    expect(names[2]).toMatch(/^x{100}-[0-9a-f]{8}\.oauth2\.issuer\.json$/);
    // the content keeps the exact id
    expect(Object.keys(saved[1].data.trustedJwtIssuer)).toEqual(['a/b']);
  });

  test('a file that cannot be written does not stop the others; one summary names it and the command fails', async () => {
    failingSave = 'b.oauth2';

    await expect(exportOAuth2TrustedJwtIssuersToFiles(true)).resolves.toBe(
      false
    );

    expect(saved.map(savedFile)).toEqual([
      'a.oauth2.issuer.json',
      'c.oauth2.issuer.json',
      'd.oauth2.issuer.json',
    ]);
    expect(messages('error').join('\n')).toContain(
      '1 of 4 issuers failed:\n  - b: could not write the file'
    );
  });

  test('--allow-failures keeps the exit at success but still names the failure', async () => {
    failingSave = 'b.oauth2';

    await expect(
      exportOAuth2TrustedJwtIssuersToFiles(true, true)
    ).resolves.toBe(true);

    expect(messages('warn').join('\n')).toContain(
      '1 of 4 issuers failed:\n  - b: could not write the file'
    );
    expect(messages('warn').join('\n')).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('a failure to read the issuers fails whatever --allow-failures says', async () => {
    readFailure = new Error('Error exporting alpha realm trusted issuers');

    await expect(
      exportOAuth2TrustedJwtIssuersToFiles(true, true)
    ).resolves.toBe(false);

    expect(saved).toEqual([]);
  });

  test('no issuers is nothing to export, not a failure', async () => {
    stored = [];

    await expect(exportOAuth2TrustedJwtIssuersToFiles(true)).resolves.toBe(
      true
    );

    expect(messages('info')).toEqual(['Nothing to export.']);
    expect(saved).toEqual([]);
  });

  test('-N leaves the metadata out of every file', async () => {
    await exportOAuth2TrustedJwtIssuersToFiles(false);

    expect(saved.every((entry) => entry.includeMeta === false)).toBe(true);
  });
});

describe('one shape for -i, -a and -A', () => {
  // The library reads a single issuer wrapped in { inherited, value } and a list plain. Until it makes the two
  // agree, the CLI writes the plain shape for all three, so the same issuer is the same in every file.
  beforeEach(() => {
    stored = [
      plainIssuer('zion'),
      plainIssuer('open', { allowedSubjects: [], jwksUri: null }),
    ];
  });

  test.each(['zion', 'open'])(
    'the file of -i and the files of -a and -A hold equal issuers (%s)',
    async (id) => {
      await exportOAuth2TrustedJwtIssuerToFile(id, 'one.json');
      await exportOAuth2TrustedJwtIssuersToFile('all.json');
      await exportOAuth2TrustedJwtIssuersToFiles();

      const byId = saved.find((entry) => savedFile(entry) === 'one.json').data
        .trustedJwtIssuer[id];
      const all = saved.find((entry) => savedFile(entry) === 'all.json').data
        .trustedJwtIssuer[id];
      const separate = saved.find(
        (entry) => savedFile(entry) === `${id}.oauth2.issuer.json`
      ).data.trustedJwtIssuer[id];
      expect(byId).toEqual(all);
      expect(separate).toEqual(all);
      // not a wrapper left over from the read by id
      expect(byId.issuer).toBe(`https://${id}.example.com`);
    }
  );
});

/** An export file of trusted issuers, as `oauth issuer export` writes it. */
const issuerFile = (...ids) => ({
  meta: { origin: HOST },
  trustedJwtIssuer: Object.fromEntries(ids.map((id) => [id, plainIssuer(id)])),
});

/** A file of the generic agent export: issuers among the other agents, under `agent`. */
const agentFile = () => ({
  agent: {
    'old-issuer': plainIssuer('old-issuer'),
    'a-web-agent': {
      _id: 'a-web-agent',
      _type: { _id: 'WebAgent', name: 'Web Agent', collection: true },
    },
  },
});

const writeFile = (name, data) =>
  fs.writeFileSync(
    path.join(baseDirectory, name),
    typeof data === 'string' ? data : JSON.stringify(data)
  );
const libCalls = (name) => calls.filter(([call]) => call === name);

describe('importOAuth2TrustedJwtIssuerFromFile', () => {
  test('imports the named issuer and no other, handing the library the file as it is', async () => {
    const data = issuerFile('a', 'b', 'c');
    writeFile('in.json', data);

    await expect(
      importOAuth2TrustedJwtIssuerFromFile('b', 'in.json')
    ).resolves.toBe(true);

    expect(libCalls('importOAuth2TrustedJwtIssuer')).toEqual([
      ['importOAuth2TrustedJwtIssuer', 'b', data],
    ]);
    expect(libCalls('importOAuth2TrustedJwtIssuers')).toEqual([]);
    expect(messages('spinner')).toEqual([
      `Imported b from ${path.join(baseDirectory, 'in.json')}.`,
    ]);
  });

  test('takes a file of the generic agent export, which the library reads', async () => {
    const data = agentFile();
    writeFile('old.agent.json', data);

    await expect(
      importOAuth2TrustedJwtIssuerFromFile('old-issuer', 'old.agent.json')
    ).resolves.toBe(true);

    expect(libCalls('importOAuth2TrustedJwtIssuer')[0][2]).toEqual(data);
  });

  test('an issuer that is not in the file fails and says so', async () => {
    writeFile('in.json', issuerFile('a'));

    await expect(
      importOAuth2TrustedJwtIssuerFromFile('missing', 'in.json')
    ).resolves.toBe(false);

    expect(messages('error')[0]).toContain(
      'Trusted issuer missing not found in import data!'
    );
  });

  test('an agent of another type in an agent file is not an issuer', async () => {
    writeFile('old.agent.json', agentFile());

    await expect(
      importOAuth2TrustedJwtIssuerFromFile('a-web-agent', 'old.agent.json')
    ).resolves.toBe(false);
  });

  test('a file that does not exist, or is not JSON, or is not an object fails and names the file', async () => {
    await expect(
      importOAuth2TrustedJwtIssuerFromFile('a', 'nope.json')
    ).resolves.toBe(false);
    expect(messages('error')[0]).toContain('nope.json');

    writeFile('bad.json', 'not json');
    await expect(
      importOAuth2TrustedJwtIssuerFromFile('a', 'bad.json')
    ).resolves.toBe(false);
    expect(messages('error')[1]).toContain('bad.json is not valid JSON');

    writeFile('list.json', '[]');
    await expect(
      importOAuth2TrustedJwtIssuerFromFile('a', 'list.json')
    ).resolves.toBe(false);
    expect(messages('error')[2]).toContain('list.json is not an export file');
    expect(calls).toEqual([]);
  });

  test('a library failure for the issuer fails', async () => {
    writeFile('in.json', issuerFile('a'));
    failingImport = new Set(['a']);

    await expect(
      importOAuth2TrustedJwtIssuerFromFile('a', 'in.json')
    ).resolves.toBe(false);

    expect(messages('error')[0]).toContain('trusted issuer a');
  });
});

describe('importFirstOAuth2TrustedJwtIssuerFromFile', () => {
  test('imports exactly the first issuer of a file with three (frodo-cli#1147 imported them all)', async () => {
    writeFile('in.json', issuerFile('a', 'b', 'c'));

    await expect(
      importFirstOAuth2TrustedJwtIssuerFromFile('in.json')
    ).resolves.toBe(true);

    expect(libCalls('importFirstOAuth2TrustedJwtIssuer')).toHaveLength(1);
    expect(libCalls('importOAuth2TrustedJwtIssuers')).toEqual([]);
    expect(libCalls('importOAuth2TrustedJwtIssuer')).toEqual([]);
    expect(messages('spinner')[0]).toMatch(/^Imported a from /);
  });

  test('takes a file of the generic agent export', async () => {
    writeFile('old.agent.json', agentFile());

    await expect(
      importFirstOAuth2TrustedJwtIssuerFromFile('old.agent.json')
    ).resolves.toBe(true);

    expect(messages('spinner')[0]).toMatch(/^Imported old-issuer from /);
  });

  test('a file without issuers fails and says so', async () => {
    writeFile('none.json', { trustedJwtIssuer: {} });

    await expect(
      importFirstOAuth2TrustedJwtIssuerFromFile('none.json')
    ).resolves.toBe(false);

    expect(messages('error')[0]).toContain('No trusted issuers found');
  });

  test('a file that does not exist fails', async () => {
    await expect(
      importFirstOAuth2TrustedJwtIssuerFromFile('nope.json')
    ).resolves.toBe(false);
  });
});

describe('importOAuth2TrustedJwtIssuersFromFile', () => {
  test('imports every issuer of the file', async () => {
    const data = issuerFile('a', 'b', 'c', 'd');
    writeFile('in.json', data);

    await expect(
      importOAuth2TrustedJwtIssuersFromFile('in.json')
    ).resolves.toBe(true);

    expect(libCalls('importOAuth2TrustedJwtIssuers')).toEqual([
      ['importOAuth2TrustedJwtIssuers', data],
    ]);
    expect(messages('error')).toEqual([]);
  });

  test('one failing issuer does not stop the others; one summary names it and the command fails', async () => {
    writeFile('in.json', issuerFile('a', 'b', 'c', 'd'));
    failingImport = new Set(['b']);

    await expect(
      importOAuth2TrustedJwtIssuersFromFile('in.json')
    ).resolves.toBe(false);

    expect(messages('error').join('\n')).toContain(
      '1 of 4 issuers failed:\n  - b: the server refused b'
    );
  });

  test('--allow-failures keeps the exit at success but names the failure', async () => {
    writeFile('in.json', issuerFile('a', 'b', 'c', 'd'));
    failingImport = new Set(['b']);

    await expect(
      importOAuth2TrustedJwtIssuersFromFile('in.json', true)
    ).resolves.toBe(true);

    expect(messages('warn').join('\n')).toContain(
      '1 of 4 issuers failed:\n  - b: the server refused b'
    );
  });

  test('two failing issuers are both named', async () => {
    writeFile('in.json', issuerFile('a', 'b', 'c', 'd'));
    failingImport = new Set(['a', 'd']);

    await importOAuth2TrustedJwtIssuersFromFile('in.json');

    expect(messages('error').join('\n')).toContain(
      '2 of 4 issuers failed:\n  - a: the server refused a\n  - d: the server refused d'
    );
  });

  test('an error of the library that is not about one issuer is a failure named by the file', async () => {
    writeFile('in.json', issuerFile('a', 'b'));
    importThrows = new Error('the import data is unusable');

    await expect(
      importOAuth2TrustedJwtIssuersFromFile('in.json')
    ).resolves.toBe(false);

    expect(messages('error').join('\n')).toContain(
      '1 of 1 issuer failed:\n  - in.json: the import data is unusable'
    );
  });

  test('a file that does not exist or cannot be parsed fails whatever --allow-failures says', async () => {
    await expect(
      importOAuth2TrustedJwtIssuersFromFile('nope.json', true)
    ).resolves.toBe(false);

    writeFile('bad.json', '{"trustedJwtIssuer": ');
    await expect(
      importOAuth2TrustedJwtIssuersFromFile('bad.json', true)
    ).resolves.toBe(false);

    expect(calls).toEqual([]);
  });

  test('a file without issuers in either place is an error, whatever --allow-failures says', async () => {
    writeFile('journeys.json', { journey: {} });
    writeFile('web.agent.json', {
      agent: { w: { _id: 'w', _type: { _id: 'WebAgent' } } },
    });

    await expect(
      importOAuth2TrustedJwtIssuersFromFile('journeys.json', true)
    ).resolves.toBe(false);
    await expect(
      importOAuth2TrustedJwtIssuersFromFile('web.agent.json', true)
    ).resolves.toBe(false);

    expect(messages('error')[0]).toContain('No trusted issuers found in');
  });

  test('an empty trustedJwtIssuer section is an empty import: said and not a failure', async () => {
    writeFile('empty.json', issuerFile());

    await expect(
      importOAuth2TrustedJwtIssuersFromFile('empty.json')
    ).resolves.toBe(true);

    expect(messages('spinner')[0]).toContain('No trusted issuers to import');
    expect(messages('error')).toEqual([]);
  });

  test('a file of the generic agent export imports its issuers and leaves the other agents out', async () => {
    const data = agentFile();
    writeFile('old.agent.json', data);

    await expect(
      importOAuth2TrustedJwtIssuersFromFile('old.agent.json')
    ).resolves.toBe(true);

    // the library gets the file as it is and picks the issuers out itself
    expect(libCalls('importOAuth2TrustedJwtIssuers')[0][1]).toEqual(data);
    expect(messages('error')).toEqual([]);
  });

  test('the wrapped and the plain shape of an issuer reach the library unchanged', async () => {
    const data = {
      trustedJwtIssuer: {
        plain: plainIssuer('plain'),
        wrapped: wrappedIssuer('wrapped'),
      },
    };
    writeFile('both.json', data);

    await importOAuth2TrustedJwtIssuersFromFile('both.json');

    expect(libCalls('importOAuth2TrustedJwtIssuers')[0][1]).toEqual(data);
  });
});

describe('importOAuth2TrustedJwtIssuersFromFiles', () => {
  test('imports the issuers of every *.oauth2.issuer.json file, in order, and nothing else', async () => {
    writeFile('b.oauth2.issuer.json', issuerFile('b1', 'b2'));
    writeFile('a.oauth2.issuer.json', issuerFile('a1'));
    writeFile('x.agent.json', agentFile());
    writeFile('x.web.agent.json', agentFile());
    writeFile('notes.txt', 'text');

    await expect(importOAuth2TrustedJwtIssuersFromFiles()).resolves.toBe(true);

    expect(
      libCalls('importOAuth2TrustedJwtIssuers').map(([, data]) =>
        Object.keys(data.trustedJwtIssuer)
      )
    ).toEqual([['a1'], ['b1', 'b2']]);
  });

  test('takes the *.trustedJwtIssuer.json files of a full export too', async () => {
    writeFile('t.trustedJwtIssuer.json', issuerFile('t1'));
    writeFile('u.oauth2.issuer.json', issuerFile('u1'));

    await expect(importOAuth2TrustedJwtIssuersFromFiles()).resolves.toBe(true);

    expect(libCalls('importOAuth2TrustedJwtIssuers')).toHaveLength(2);
  });

  test('a file that cannot be parsed is a failed item named by its file; the others are still imported', async () => {
    writeFile('a.oauth2.issuer.json', issuerFile('a1', 'a2'));
    writeFile('b.oauth2.issuer.json', issuerFile('b1'));
    writeFile('c.oauth2.issuer.json', 'not json');

    await expect(importOAuth2TrustedJwtIssuersFromFiles()).resolves.toBe(false);

    expect(libCalls('importOAuth2TrustedJwtIssuers')).toHaveLength(2);
    expect(messages('error').join('\n')).toMatch(
      /1 of 4 issuers failed:\n\s+- c\.oauth2\.issuer\.json: .*is not valid JSON/
    );
  });

  test('a failing issuer inside a good file and a bad file are in one summary', async () => {
    writeFile('a.oauth2.issuer.json', issuerFile('a1', 'a2'));
    writeFile('b.oauth2.issuer.json', '{');
    failingImport = new Set(['a2']);

    await importOAuth2TrustedJwtIssuersFromFiles();

    const summary = messages('error').join('\n');
    expect(summary).toContain('2 of 3 issuers failed:');
    expect(summary).toContain('- a2: the server refused a2');
    expect(summary).toContain('- b.oauth2.issuer.json:');
  });

  test('--allow-failures keeps the exit at success', async () => {
    writeFile('a.oauth2.issuer.json', issuerFile('a1'));
    writeFile('b.oauth2.issuer.json', 'not json');

    await expect(importOAuth2TrustedJwtIssuersFromFiles(true)).resolves.toBe(
      true
    );
  });

  test('a file without issuers is a failed item, an empty section is not', async () => {
    writeFile('a.oauth2.issuer.json', issuerFile());
    writeFile('b.oauth2.issuer.json', { journey: {} });

    await expect(importOAuth2TrustedJwtIssuersFromFiles()).resolves.toBe(false);

    expect(messages('error').join('\n')).toContain(
      '1 of 1 issuer failed:\n  - b.oauth2.issuer.json: No trusted issuers found in b.oauth2.issuer.json'
    );
  });

  test('no matching file is a warning, not a failure', async () => {
    writeFile('x.agent.json', agentFile());

    await expect(importOAuth2TrustedJwtIssuersFromFiles()).resolves.toBe(true);

    expect(messages('warn')).toEqual([
      `No trusted issuer files (*.oauth2.issuer.json) found in ${baseDirectory}!`,
    ]);
    expect(calls).toEqual([]);
  });

  test('a directory that cannot be read fails whatever --allow-failures says', async () => {
    fs.rmSync(baseDirectory, { recursive: true, force: true });

    await expect(importOAuth2TrustedJwtIssuersFromFiles(true)).resolves.toBe(
      false
    );
  });
});

describe('deleteOAuth2TrustedJwtIssuerById', () => {
  beforeEach(() => {
    stored = [plainIssuer('a'), plainIssuer('b')];
  });

  test('deletes that issuer and no other', async () => {
    await expect(deleteOAuth2TrustedJwtIssuerById('a')).resolves.toBe(true);

    expect(calls).toEqual([['deleteOAuth2TrustedJwtIssuer', 'a']]);
    expect(stored.map((entry) => entry._id)).toEqual(['b']);
    expect(messages('spinner')).toEqual(['Deleted a.']);
  });

  test('an issuer that does not exist fails and names it', async () => {
    await expect(deleteOAuth2TrustedJwtIssuerById('missing')).resolves.toBe(
      false
    );

    expect(messages('error')[0]).toContain('missing');
    expect(stored).toHaveLength(2);
  });
});

describe('printTrustedIssuerPlan', () => {
  test('lists the issuers by id with the issuer value and the subjects, "any user" when there are none', async () => {
    stored = [
      plainIssuer('zion'),
      plainIssuer('open', { allowedSubjects: [] }),
      plainIssuer('alpha', { allowedSubjects: ['neo'] }),
    ];

    await expect(printTrustedIssuerPlan()).resolves.toBe(true);

    expect(messages('info')).toEqual([
      'The following trusted JWT issuers would be deleted:',
    ]);
    expect(messages('data')).toEqual([
      '  alpha: issuer https://alpha.example.com, allowed subjects: neo',
      '  open: issuer https://open.example.com, allowed subjects: any user',
      '  zion: issuer https://zion.example.com, allowed subjects: neo, trinity',
    ]);
  });

  test('a realm without issuers says so and succeeds', async () => {
    await expect(printTrustedIssuerPlan()).resolves.toBe(true);

    expect(messages('info')).toEqual(['No trusted JWT issuers found.']);
  });

  test('a failing read prints the error and fails, so that the guard does not ask', async () => {
    readFailure = new Error('Error reading alpha realm trusted issuers');

    await expect(printTrustedIssuerPlan()).resolves.toBe(false);

    expect(messages('error')[0]).toContain(
      'Error reading the trusted JWT issuers'
    );
  });
});

describe('deleteOAuth2TrustedJwtIssuers', () => {
  beforeEach(() => {
    stored = ['a', 'b', 'c', 'd'].map((id) => plainIssuer(id));
  });

  test('deletes every issuer', async () => {
    await expect(deleteOAuth2TrustedJwtIssuers()).resolves.toBe(true);

    expect(stored).toEqual([]);
    expect(messages('spinner')).toEqual(['Deleted 4 trusted JWT issuers.']);
  });

  test('one issuer that cannot be deleted does not stop the others; one summary names it and the command fails', async () => {
    failingDelete = new Set(['b']);

    await expect(deleteOAuth2TrustedJwtIssuers()).resolves.toBe(false);

    expect(stored.map((entry) => entry._id)).toEqual(['b']);
    expect(messages('error').join('\n')).toContain(
      '1 of 4 issuers failed:\n  - b: the server refused b'
    );
  });

  test('--allow-failures keeps the exit at success but names the failure', async () => {
    failingDelete = new Set(['b']);

    await expect(deleteOAuth2TrustedJwtIssuers(true)).resolves.toBe(true);

    expect(messages('warn').join('\n')).toContain(
      '1 of 4 issuers failed:\n  - b: the server refused b'
    );
  });

  test('an error that is not wrapped by the library names the issuer by the last segment of its URL', async () => {
    rawDeleteFailures = new Set(['c']);

    await expect(deleteOAuth2TrustedJwtIssuers()).resolves.toBe(false);

    expect(stored.map((entry) => entry._id)).toEqual(['c']);
    expect(messages('error').join('\n')).toContain(
      '1 of 4 issuers failed:\n  - c: '
    );
  });

  test('a failure to read the issuers fails whatever --allow-failures says', async () => {
    readFailure = new Error('Error deleting alpha realm trusted issuers');

    await expect(deleteOAuth2TrustedJwtIssuers(true)).resolves.toBe(false);

    expect(stored).toHaveLength(4);
  });

  test('a realm without issuers (which the library answers for the Cloud root realm) is nothing to delete, not a failure', async () => {
    stored = [];

    await expect(deleteOAuth2TrustedJwtIssuers()).resolves.toBe(true);

    expect(messages('spinner')).toEqual([
      'No trusted JWT issuers found to delete.',
    ]);
    expect(messages('error')).toEqual([]);
  });

  test('a dry run deletes nothing: the library delete is never called and the plan is printed', async () => {
    stored = [plainIssuer('open', { allowedSubjects: [] }), plainIssuer('b')];

    await expect(deleteOAuth2TrustedJwtIssuers(false, true)).resolves.toBe(
      true
    );

    expect(libCalls('deleteOAuth2TrustedJwtIssuers')).toEqual([]);
    expect(libCalls('deleteOAuth2TrustedJwtIssuer')).toEqual([]);
    expect(stored).toHaveLength(2);
    expect(messages('data')).toEqual([
      '  b: issuer https://b.example.com, allowed subjects: neo, trinity',
      '  open: issuer https://open.example.com, allowed subjects: any user',
    ]);
  });
});

describe.each(['cloud', 'forgeops', 'classic'])(
  'on a %s deployment',
  (type) => {
    beforeEach(() => {
      stored = [
        plainIssuer('zion'),
        plainIssuer('open', { allowedSubjects: [] }),
      ];
    });

    /** Everything the three verbs print for the stored issuers. */
    async function output() {
      // the deletes below remove issuers: every run starts from the same realm
      stored = [
        plainIssuer('zion'),
        plainIssuer('open', { allowedSubjects: [] }),
      ];
      printed.length = 0;
      await listOAuth2TrustedJwtIssuers();
      await listOAuth2TrustedJwtIssuers(true);
      await describeOAuth2TrustedJwtIssuer('zion');
      await describeOAuth2TrustedJwtIssuer('open', true);
      saved.length = 0;
      await exportOAuth2TrustedJwtIssuerToFile('zion', undefined);
      await exportOAuth2TrustedJwtIssuersToFile(undefined);
      await exportOAuth2TrustedJwtIssuersToFiles();
      writeFile('in.oauth2.issuer.json', issuerFile('i1', 'i2'));
      await importOAuth2TrustedJwtIssuerFromFile('i1', 'in.oauth2.issuer.json');
      await importFirstOAuth2TrustedJwtIssuerFromFile('in.oauth2.issuer.json');
      await importOAuth2TrustedJwtIssuersFromFile('in.oauth2.issuer.json');
      await importOAuth2TrustedJwtIssuersFromFiles();
      await printTrustedIssuerPlan();
      await deleteOAuth2TrustedJwtIssuers(false, true);
      await deleteOAuth2TrustedJwtIssuerById('open');
      await deleteOAuth2TrustedJwtIssuers();
      return [
        ...printed.map((entry) => `${entry.type}: ${entry.msg}`),
        ...saved.map((entry) =>
          JSON.stringify([savedFile(entry), entry.data.trustedJwtIssuer])
        ),
      ];
    }

    test('list and describe print what they print on every other deployment type, because trusted issuers exist on all of them', async () => {
      deploymentType = 'cloud';
      const reference = await output();
      deploymentType = type;

      const actual = await output();

      expect(actual).not.toEqual([]);
      expect(actual).toEqual(reference);
    });
  }
);
