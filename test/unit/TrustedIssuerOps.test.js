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

let stored = [];
let wrapped = true;
let readFailure;
let deploymentType = 'cloud';
let realm = 'alpha';
let baseDirectory = '';
let failingSave;
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
      printed.length = 0;
      await listOAuth2TrustedJwtIssuers();
      await listOAuth2TrustedJwtIssuers(true);
      await describeOAuth2TrustedJwtIssuer('zion');
      await describeOAuth2TrustedJwtIssuer('open', true);
      saved.length = 0;
      await exportOAuth2TrustedJwtIssuerToFile('zion', undefined);
      await exportOAuth2TrustedJwtIssuersToFile(undefined);
      await exportOAuth2TrustedJwtIssuersToFiles();
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
