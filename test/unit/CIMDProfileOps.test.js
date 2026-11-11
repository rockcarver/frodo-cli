/**
 * Unit tests for the CIMD profile verbs (src/ops/CIMDProfileOps.ts) without a
 * tenant. The real import graph pulls in all of frodo-lib, whose bundled ESM
 * cannot load under jest's ESM runtime, so the facade and the console are
 * mocked before the module under test is imported (the pattern of
 * ConnectorVerbsOps.test.js). What these tests guard is what the commands add
 * to the library:
 * - the two read shapes of the server (a read by id wraps a member as
 *   `{ inherited, value }`, the list returns it plain with `null` for an
 *   unset member) and a sparse profile (only the groups and attributes that
 *   were stored) show the same way, and an attribute that is absent is shown
 *   as not set, never as a default the server did not store;
 * - a deployment that does not offer the type is a normal answer: a note on
 *   stderr and no failure for the list forms, the library's coded error and a
 *   failure for a command that names a profile;
 * - the ops code does not branch on the deployment type.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';
import { getTypedFilename } from '../utils/LibFilenames.js';

const HOST = 'https://openam-zion.example.com/am';

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);
const everythingPrinted = () => printed.map((entry) => entry.msg).join('\n');

/** A profile as the list returns it: plain values, `null` for an unset member. */
const plainProfile = (id, more = {}) => ({
  _id: id,
  _rev: '-1122334455',
  _type: { _id: 'CIMDProfile', name: 'CIMD Profile', collection: true },
  cimdConfig: {
    cimdSsrfProtectionEnabled: true,
    cimdMetadataDenyList: ['scope', 'redirect_uris'],
    cimdClientIdUrlPatterns: [
      `https://agents.zion.example.com/${id}/*`,
      'https://agents.zion.example.com:8443/agents/*',
    ],
  },
  coreOAuth2ClientConfig: {
    status: 'Active',
    scopes: ['openid', 'profile'],
    defaultScopes: ['openid'],
    redirectionUris: ['https://agents.zion.example.com/callback'],
    clientName: ['Zion MCP clients'],
    authorizationDetailTypes: [],
  },
  advancedOAuth2ClientConfig: {
    grantTypes: ['authorization_code', 'refresh_token'],
    tokenEndpointAuthMethod: 'none',
    require_pushed_authorization_requests: false,
    tlsCaSecretLabelIdentifier: null,
  },
  overrideOAuth2ClientConfig: { providerOverridesEnabled: false },
  ...more,
});

/** The same profile as a read by id answers it: the members of the groups wrapped. */
const wrapped = (profile) => {
  const copy = structuredClone(profile);
  for (const [group, members] of Object.entries(copy)) {
    if (!group.endsWith('Config') || group === 'overrideOAuth2ClientConfig') {
      continue;
    }
    for (const [name, value] of Object.entries(members)) {
      members[name] =
        value === null ? { inherited: false } : { inherited: false, value };
    }
  }
  return copy;
};

/** A profile that holds only what was stored: two groups, no padding with defaults. */
const sparseProfile = (id) => ({
  _id: id,
  _type: { _id: 'CIMDProfile', name: 'CIMD Profile', collection: true },
  cimdConfig: {
    cimdClientIdUrlPatterns: ['https://agents.zion.example.com/*'],
  },
  coreOAuth2ClientConfig: { clientName: ['Sparse profile'] },
});

class FakeFrodoError extends Error {
  constructor(message, code, originalErrors) {
    super(message);
    this.name = 'FrodoError';
    this.code = code;
    this.originalErrors = originalErrors;
  }

  getCombinedMessage() {
    return this.message;
  }
}

const NOT_AVAILABLE = () =>
  new FakeFrodoError(
    "CIMD profiles are not available in the alpha realm of this deployment: the server does not offer the agent type 'CIMDProfile'.",
    'CIMD_PROFILES_NOT_AVAILABLE'
  );

let stored = [];
let offered = true;
let readFailure;
let availabilityFailure;
let deploymentType = 'cloud';
let realm = '/alpha';
const calls = [];
let baseDirectory = '';
/** Decides which file the fake `saveJsonToFile` cannot write. */
let cannotWrite = () => false;
/** Ids the fake delete cannot delete. */
let cannotDelete = new Set();

/** What the fake import does with a profile: `{ error, created, repaired }` by id; the default is a profile that was created. */
let importPlan = {};

/** The outcome of the import of one profile, as the library reports it. */
const importOutcome = (id) => {
  const plan = importPlan[id] ?? {};
  if (plan.error) throw plan.error;
  return {
    profile: { _id: id },
    created: plan.created ?? true,
    repaired: plan.repaired ?? false,
  };
};
/** The error the library reports for a profile it could not import: it names the profile, the cause is nested. */
const itemError = (id, cause) =>
  new FakeFrodoError(
    `Error importing alpha realm CIMD profile ${id}`,
    undefined,
    [cause]
  );

const lib = {
  isCIMDProfileAvailable: async () => {
    if (availabilityFailure) throw availabilityFailure;
    return offered;
  },
  readCIMDProfiles: async () => {
    if (readFailure) throw readFailure;
    return offered ? structuredClone(stored) : [];
  },
  readCIMDProfile: async (id) => {
    calls.push(['readCIMDProfile', id]);
    if (readFailure) throw readFailure;
    if (!offered) throw NOT_AVAILABLE();
    const found = stored.find(
      (profile) => profile._id.toLowerCase() === id.toLowerCase()
    );
    if (!found) throw new Error(`alpha realm CIMD profile ${id} not found`);
    return structuredClone(found);
  },
  importCIMDProfile: async (id, data) => {
    calls.push(['importCIMDProfile', id, data]);
    if (!offered) throw NOT_AVAILABLE();
    if (!data.cimdProfile[id]) throw new Error('not found in import data');
    try {
      return importOutcome(id);
    } catch (error) {
      throw itemError(id, error);
    }
  },
  importCIMDProfiles: async (data, callback) => {
    calls.push(['importCIMDProfiles', data]);
    const results = [];
    for (const id of Object.keys(data.cimdProfile)) {
      try {
        const result = importOutcome(id);
        results.push(result);
        callback?.(undefined, result);
      } catch (error) {
        callback?.(itemError(id, error));
      }
    }
    return results;
  },
  deleteCIMDProfile: async (id) => {
    calls.push(['deleteCIMDProfile', id]);
    if (!offered) throw NOT_AVAILABLE();
    const found = stored.find((profile) => profile._id === id);
    if (!found) throw new Error(`alpha realm CIMD profile ${id} not found`);
    if (cannotDelete.has(id)) throw new Error(`could not delete ${id}`);
    stored = stored.filter((profile) => profile._id !== id);
    return found;
  },
  deleteCIMDProfiles: async (callback) => {
    calls.push(['deleteCIMDProfiles']);
    if (readFailure) throw readFailure;
    const deleted = [];
    for (const profile of offered ? structuredClone(stored) : []) {
      try {
        if (cannotDelete.has(profile._id)) {
          throw new Error(`could not delete ${profile._id}`);
        }
        stored = stored.filter((item) => item._id !== profile._id);
        deleted.push(profile);
        callback?.(undefined, profile);
      } catch (error) {
        callback?.(
          new FakeFrodoError(
            `Error deleting alpha realm CIMD profile ${profile._id}`,
            undefined,
            [error]
          )
        );
      }
    }
    return deleted;
  },
  createCIMDProfileExportTemplate: () => ({
    meta: { origin: HOST },
    cimdProfile: {},
  }),
  exportCIMDProfile: async (id) => {
    calls.push(['exportCIMDProfile', id]);
    if (readFailure) throw readFailure;
    if (!offered) throw NOT_AVAILABLE();
    const profile = await lib.readCIMDProfile(id);
    return { meta: { origin: HOST }, cimdProfile: { [profile._id]: profile } };
  },
  exportCIMDProfiles: async () => {
    calls.push(['exportCIMDProfiles']);
    if (readFailure) throw readFailure;
    return {
      meta: { origin: HOST },
      cimdProfile: offered
        ? Object.fromEntries(
            structuredClone(stored).map((profile) => [profile._id, profile])
          )
        : {},
    };
  },
};

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  state: {
    getHost: () => HOST,
    getRealm: () => realm,
    getDeploymentType: () => deploymentType,
  },
  frodo: {
    utils: {
      // as the library has it: the root realm is '/'
      getRealmName: (name) => (name === '/' ? '/' : name.split('/').pop()),
      getTypedFilename,
      titleCase: (input) =>
        input
          .toString()
          .toLowerCase()
          .split(' ')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
      getFilePath: (file) =>
        baseDirectory ? path.join(baseDirectory, file) : file,
      getWorkingDirectory: () => baseDirectory || '.',
      // as the library has it, as far as these tests look: the metadata can be left out
      saveJsonToFile: (data, file, includeMeta) => {
        if (cannotWrite(file)) throw new Error('could not write the file');
        const copy = structuredClone(data);
        if (!includeMeta) delete copy.meta;
        fs.writeFileSync(file, JSON.stringify(copy, null, 2));
      },
    },
    oauth2oidc: { cimd: lib },
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
  // as the real one: an indicator that was never created has nothing to stop
  stopProgressIndicator: (id, msg, status = 'none') => {
    if (id === undefined || id === null) return;
    printed.push({ msg: String(msg), type: `indicator-${status}` });
  },
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
  deleteCIMDProfile,
  deleteCIMDProfiles,
  describeCIMDProfile,
  exportCIMDProfilesToFile,
  exportCIMDProfilesToFiles,
  exportCIMDProfileToFile,
  importCIMDProfileFromFile,
  importCIMDProfilesFromFile,
  importCIMDProfilesFromFiles,
  importFirstCIMDProfileFromFile,
  listCIMDProfiles,
  printCIMDProfilePlan,
  reportCIMDProfilesUnavailable,
} = await import('../../src/ops/CIMDProfileOps.ts');

/** An import file of the library's export format, in the directory of the test. */
const writeImportFile = (name, profiles) =>
  fs.writeFileSync(
    path.join(baseDirectory, name),
    JSON.stringify({
      meta: { origin: HOST },
      cimdProfile: Object.fromEntries(
        profiles.map((profile) => [profile._id, profile])
      ),
    })
  );
const libCalls = (name) => calls.filter(([called]) => called === name);

const writtenFiles = () => fs.readdirSync(baseDirectory).sort();
const readWritten = (name) =>
  JSON.parse(fs.readFileSync(path.join(baseDirectory, name), 'utf8'));

beforeEach(() => {
  printed.length = 0;
  calls.length = 0;
  stored = [];
  offered = true;
  readFailure = undefined;
  availabilityFailure = undefined;
  deploymentType = 'cloud';
  realm = '/alpha';
  cannotWrite = () => false;
  importPlan = {};
  cannotDelete = new Set();
  baseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-cimd-'));
});

afterEach(() => {
  fs.rmSync(baseDirectory, { recursive: true, force: true });
});

describe('listCIMDProfiles', () => {
  test('prints the id of every profile, in the order the library returns them (sorted by id)', async () => {
    stored = [plainProfile('alpha-clients'), plainProfile('zion-mcp-clients')];

    expect(await listCIMDProfiles()).toBe(true);

    expect(messages('data')).toEqual(['alpha-clients', 'zion-mcp-clients']);
    expect(messages('warn')).toEqual([]);
  });

  test('--long prints a table with the id, status, URL patterns and SSRF protection', async () => {
    stored = [
      plainProfile('zion-mcp-clients', {
        cimdConfig: {
          cimdClientIdUrlPatterns: [
            'https://agents.zion.example.com/*',
            'https://tools.zion.example.com/*',
          ],
          cimdSsrfProtectionEnabled: false,
        },
        coreOAuth2ClientConfig: { status: 'Inactive' },
      }),
    ];

    expect(await listCIMDProfiles(true)).toBe(true);

    expect(messages('data')).toEqual([
      [
        'Id | Status | Client ID URL patterns | SSRF protection',
        'zion-mcp-clients | Inactive | https://agents.zion.example.com/*\nhttps://tools.zion.example.com/* | disabled',
      ].join('\n'),
    ]);
  });

  test('--long reads a sparse profile and a wrapped one without throwing', async () => {
    stored = [
      sparseProfile('sparse'),
      wrapped(plainProfile('zion-mcp-clients')),
      // a wrapper that says the value is inherited reads as absent
      {
        ...sparseProfile('inherited'),
        cimdConfig: {
          cimdClientIdUrlPatterns: { inherited: true },
          cimdSsrfProtectionEnabled: { inherited: false, value: true },
        },
        coreOAuth2ClientConfig: { status: { inherited: false } },
      },
    ];

    expect(await listCIMDProfiles(true)).toBe(true);

    expect(messages('data')).toEqual([
      [
        'Id | Status | Client ID URL patterns | SSRF protection',
        'sparse | (not set) | https://agents.zion.example.com/* | (not set)',
        'zion-mcp-clients | Active | https://agents.zion.example.com/zion-mcp-clients/*\nhttps://agents.zion.example.com:8443/agents/* | enabled',
        'inherited | (not set) | (not set) | enabled',
      ].join('\n'),
    ]);
  });

  test('a read error is printed and the list fails', async () => {
    readFailure = new Error('connection reset');

    expect(await listCIMDProfiles()).toBe(false);

    expect(messages('error')).toEqual([
      'Error listing CIMD profiles: connection reset',
    ]);
  });

  test('a realm that does not offer the type: one note on stderr, nothing on stdout, and no failure', async () => {
    offered = false;

    expect(await listCIMDProfiles()).toBe(true);
    expect(await listCIMDProfiles(true)).toBe(true);

    expect(messages('data')).toEqual([]);
    expect(messages('warn')).toEqual([
      `CIMD profiles are not available in the alpha realm of ${HOST}: the server does not offer the agent type 'CIMDProfile'.`,
      `CIMD profiles are not available in the alpha realm of ${HOST}: the server does not offer the agent type 'CIMDProfile'.`,
    ]);
  });

  test('the note names the root realm "root", not "/"', async () => {
    offered = false;
    realm = '/';

    expect(await listCIMDProfiles()).toBe(true);

    expect(messages('warn')).toEqual([
      `CIMD profiles are not available in the root realm of ${HOST}: the server does not offer the agent type 'CIMDProfile'.`,
    ]);
  });

  test('a realm that offers the type and holds no profile prints nothing and does not say it is unavailable', async () => {
    stored = [];

    expect(await listCIMDProfiles()).toBe(true);

    expect(printed).toEqual([]);
  });

  test('an empty list and a failed availability check is a failure: "none" cannot be told from "unknown"', async () => {
    offered = true;
    stored = [];
    availabilityFailure = new Error('agent types unreadable');

    expect(await listCIMDProfiles()).toBe(false);

    expect(messages('error')).toEqual([
      'Error listing CIMD profiles: agent types unreadable',
    ]);
  });
});

describe('describeCIMDProfile', () => {
  const expectedRows = [
    'Property | Value',
    'Agent Id | zion-mcp-clients',
    'Status | Active',
    'Client ID URL patterns | https://agents.zion.example.com/zion-mcp-clients/*\nhttps://agents.zion.example.com:8443/agents/*',
    'Metadata override deny list | scope\nredirect_uris',
    'SSRF protection | enabled',
    'Grant types | authorization_code\nrefresh_token',
    'Token endpoint auth method | none',
    'Scopes | openid\nprofile',
    'Default scopes | openid',
    'Redirect URIs | https://agents.zion.example.com/callback',
    'Require PAR | false',
    'Provider overrides | false',
  ];

  test('prints a table of the settings that decide who may act as a client', async () => {
    stored = [plainProfile('zion-mcp-clients')];

    expect(await describeCIMDProfile('zion-mcp-clients')).toBe(true);

    expect(messages('data')).toEqual([expectedRows.join('\n')]);
  });

  test('the wrapped shape of a read by id shows the same table as the plain shape of the list', async () => {
    stored = [wrapped(plainProfile('zion-mcp-clients'))];

    expect(await describeCIMDProfile('zion-mcp-clients')).toBe(true);

    expect(messages('data')).toEqual([expectedRows.join('\n')]);
  });

  test('a wrapper without a value and a null member are shown as not set, an empty list as none', async () => {
    stored = [
      plainProfile('zion-mcp-clients', {
        advancedOAuth2ClientConfig: {
          grantTypes: { inherited: false },
          tokenEndpointAuthMethod: null,
        },
        coreOAuth2ClientConfig: { status: 'Active', scopes: [] },
      }),
    ];

    expect(await describeCIMDProfile('zion-mcp-clients')).toBe(true);

    const rows = messages('data')[0].split('\n');
    expect(rows).toContain('Grant types | (not set)');
    expect(rows).toContain('Token endpoint auth method | (not set)');
    expect(rows).toContain('Scopes | (none)');
  });

  test('a wrapper that says the value is inherited is read as an absent attribute', async () => {
    stored = [
      plainProfile('zion-mcp-clients', {
        cimdConfig: {
          cimdClientIdUrlPatterns: { inherited: true, value: ['https://x/*'] },
          cimdSsrfProtectionEnabled: { inherited: true },
        },
      }),
    ];

    expect(await describeCIMDProfile('zion-mcp-clients')).toBe(true);

    const rows = messages('data')[0].split('\n');
    expect(rows).toContain('Client ID URL patterns | (not set)');
    expect(rows).toContain('SSRF protection | (not set)');
  });

  test('a sparse profile: no throw, every missing attribute is not set, and no default is invented', async () => {
    stored = [sparseProfile('sparse')];

    expect(await describeCIMDProfile('sparse')).toBe(true);

    expect(messages('data')).toEqual([
      [
        'Property | Value',
        'Agent Id | sparse',
        'Status | (not set)',
        'Client ID URL patterns | https://agents.zion.example.com/*',
        'Metadata override deny list | (not set)',
        'SSRF protection | (not set)',
        'Grant types | (not set)',
        'Token endpoint auth method | (not set)',
        'Scopes | (not set)',
        'Default scopes | (not set)',
        'Redirect URIs | (not set)',
        'Require PAR | (not set)',
        'Provider overrides | (not set)',
      ].join('\n'),
    ]);
  });

  test('--json prints the whole profile unchanged', async () => {
    const profile = plainProfile('zion-mcp-clients');
    stored = [profile];

    expect(await describeCIMDProfile('zion-mcp-clients', true)).toBe(true);

    expect(messages('data')).toHaveLength(1);
    expect(JSON.parse(messages('data')[0])).toEqual(profile);
  });

  test('the id is matched ignoring case and the stored id is shown', async () => {
    stored = [plainProfile('zion-mcp-clients')];

    expect(await describeCIMDProfile('ZION-MCP-CLIENTS')).toBe(true);

    expect(messages('data')[0]).toContain('Agent Id | zion-mcp-clients');
  });

  test('a profile that does not exist fails and says so', async () => {
    stored = [plainProfile('zion-mcp-clients')];

    expect(await describeCIMDProfile('missing')).toBe(false);

    expect(messages('error')).toEqual([
      'Error describing CIMD profile missing: alpha realm CIMD profile missing not found',
    ]);
    expect(messages('data')).toEqual([]);
  });

  test('a read error fails', async () => {
    readFailure = new Error('connection reset');

    expect(await describeCIMDProfile('zion-mcp-clients')).toBe(false);

    expect(messages('error')).toEqual([
      'Error describing CIMD profile zion-mcp-clients: connection reset',
    ]);
  });

  test('a realm that does not offer the type fails with the error of the library: the user named something that cannot exist', async () => {
    offered = false;

    expect(await describeCIMDProfile('zion-mcp-clients')).toBe(false);

    expect(messages('error')).toEqual([
      "Error describing CIMD profile zion-mcp-clients: CIMD profiles are not available in the alpha realm of this deployment: the server does not offer the agent type 'CIMDProfile'.",
    ]);
  });

  test('no id, because the picker had nothing to offer: fails, and says why', async () => {
    stored = [];
    expect(await describeCIMDProfile(undefined)).toBe(false);
    expect(messages('warn')).toEqual([
      'There is no CIMD profile to choose from.',
    ]);

    printed.length = 0;
    offered = false;
    expect(await describeCIMDProfile(undefined)).toBe(false);
    expect(messages('warn')).toEqual([
      `CIMD profiles are not available in the alpha realm of ${HOST}: the server does not offer the agent type 'CIMDProfile'.`,
    ]);
    expect(calls).toEqual([]);
  });
});

describe('describeCIMDProfile with no id and a type check that fails', () => {
  test('prints the error as it is, without naming a profile called undefined', async () => {
    availabilityFailure = new Error('agent types unreadable');

    expect(await describeCIMDProfile(undefined)).toBe(false);

    expect(messages('error')).toEqual(['agent types unreadable']);
  });
});

describe('reportCIMDProfilesUnavailable', () => {
  test('says nothing and answers false when the type is offered', async () => {
    expect(await reportCIMDProfilesUnavailable()).toBe(false);
    expect(printed).toEqual([]);
  });

  test('prints the note once on stderr and answers true when it is not', async () => {
    offered = false;

    expect(await reportCIMDProfilesUnavailable()).toBe(true);

    expect(printed).toEqual([
      {
        msg: `CIMD profiles are not available in the alpha realm of ${HOST}: the server does not offer the agent type 'CIMDProfile'.`,
        type: 'warn',
      },
    ]);
  });
});

describe('exportCIMDProfileToFile', () => {
  test('writes <id>.cimd.agent.json with the profile under the key cimdProfile, and the metadata', async () => {
    const profile = plainProfile('zion-mcp-clients');
    stored = [profile];

    expect(await exportCIMDProfileToFile('zion-mcp-clients')).toBe(true);

    expect(writtenFiles()).toEqual(['zion-mcp-clients.cimd.agent.json']);
    expect(readWritten('zion-mcp-clients.cimd.agent.json')).toEqual({
      meta: { origin: HOST },
      cimdProfile: { 'zion-mcp-clients': profile },
    });
    expect(messages('indicator-success')).toEqual([
      expect.stringMatching(
        /^Exported zion-mcp-clients to .*zion-mcp-clients\.cimd\.agent\.json\.$/
      ),
    ]);
  });

  test('-f names the file, -N leaves the metadata out', async () => {
    stored = [plainProfile('zion-mcp-clients')];

    expect(
      await exportCIMDProfileToFile('zion-mcp-clients', 'mine.json', false)
    ).toBe(true);

    expect(writtenFiles()).toEqual(['mine.json']);
    expect(Object.keys(readWritten('mine.json'))).toEqual(['cimdProfile']);
  });

  test('a profile typed in another case is written as stored, under the stored id and its file name', async () => {
    stored = [plainProfile('zion-mcp-clients')];

    expect(await exportCIMDProfileToFile('ZION-MCP-CLIENTS')).toBe(true);

    expect(writtenFiles()).toEqual(['zion-mcp-clients.cimd.agent.json']);
    expect(
      Object.keys(readWritten('zion-mcp-clients.cimd.agent.json').cimdProfile)
    ).toEqual(['zion-mcp-clients']);
  });

  test('a sparse profile is written as it is: no group added, no null filled in', async () => {
    const profile = sparseProfile('sparse');
    stored = [profile];

    expect(await exportCIMDProfileToFile('sparse')).toBe(true);

    expect(readWritten('sparse.cimd.agent.json').cimdProfile.sparse).toEqual(
      profile
    );
  });

  test('a profile that does not exist fails, writes no file and says so', async () => {
    stored = [plainProfile('zion-mcp-clients')];

    expect(await exportCIMDProfileToFile('missing')).toBe(false);

    expect(writtenFiles()).toEqual([]);
    expect(messages('error')).toEqual([
      'alpha realm CIMD profile missing not found',
    ]);
    expect(messages('indicator-fail')).toEqual(['Error exporting missing']);
  });

  test('a realm that does not offer the type fails with the error of the library and writes no file', async () => {
    offered = false;

    expect(await exportCIMDProfileToFile('zion-mcp-clients')).toBe(false);

    expect(writtenFiles()).toEqual([]);
    expect(messages('error')).toEqual([
      "CIMD profiles are not available in the alpha realm of this deployment: the server does not offer the agent type 'CIMDProfile'.",
    ]);
  });

  test('a file that cannot be written fails', async () => {
    stored = [plainProfile('zion-mcp-clients')];
    cannotWrite = () => true;

    expect(await exportCIMDProfileToFile('zion-mcp-clients')).toBe(false);

    expect(messages('error')).toEqual(['could not write the file']);
  });

  test('no id, because the picker had nothing to offer: fails, writes nothing, and says why', async () => {
    expect(await exportCIMDProfileToFile(undefined, undefined)).toBe(false);
    expect(messages('warn')).toEqual([
      'There is no CIMD profile to choose from.',
    ]);

    printed.length = 0;
    offered = false;
    expect(await exportCIMDProfileToFile(undefined, undefined)).toBe(false);
    expect(messages('warn')).toEqual([
      `CIMD profiles are not available in the alpha realm of ${HOST}: the server does not offer the agent type 'CIMDProfile'.`,
    ]);
    expect(writtenFiles()).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('exportCIMDProfilesToFile', () => {
  test('writes all profiles to all<Realm>Agents.cimd.agent.json, the realm in its name', async () => {
    stored = [plainProfile('alpha-clients'), plainProfile('zion-mcp-clients')];

    expect(await exportCIMDProfilesToFile(undefined)).toBe(true);

    expect(writtenFiles()).toEqual(['allAlphaAgents.cimd.agent.json']);
    expect(
      Object.keys(readWritten('allAlphaAgents.cimd.agent.json').cimdProfile)
    ).toEqual(['alpha-clients', 'zion-mcp-clients']);
    expect(messages('info')).toEqual([
      expect.stringMatching(
        /^Exported 2 CIMD profiles to .*allAlphaAgents\.cimd\.agent\.json\.$/
      ),
    ]);
  });

  test('the root realm is named root in the file name', async () => {
    stored = [plainProfile('zion-mcp-clients')];
    realm = '/';

    expect(await exportCIMDProfilesToFile(undefined)).toBe(true);

    expect(writtenFiles()).toEqual(['allRootAgents.cimd.agent.json']);
  });

  test('-f names the file, -N leaves the metadata out', async () => {
    stored = [plainProfile('zion-mcp-clients')];

    expect(await exportCIMDProfilesToFile('all.json', false)).toBe(true);

    expect(writtenFiles()).toEqual(['all.json']);
    expect(Object.keys(readWritten('all.json'))).toEqual(['cimdProfile']);
  });

  test('a realm that offers the type and holds no profile gets a file with an empty section', async () => {
    expect(await exportCIMDProfilesToFile(undefined)).toBe(true);

    expect(readWritten('allAlphaAgents.cimd.agent.json')).toEqual({
      meta: { origin: HOST },
      cimdProfile: {},
    });
    expect(messages('warn')).toEqual([]);
  });

  test('a realm that does not offer the type: the note, no file (it would claim an export that did not happen), and no failure', async () => {
    offered = false;

    expect(await exportCIMDProfilesToFile(undefined)).toBe(true);

    expect(writtenFiles()).toEqual([]);
    expect(messages('warn')).toEqual([
      `CIMD profiles are not available in the alpha realm of ${HOST}: the server does not offer the agent type 'CIMDProfile'.`,
    ]);
  });

  test('one operation: a read error fails and writes no file', async () => {
    stored = [plainProfile('zion-mcp-clients')];
    readFailure = new Error('connection reset');

    expect(await exportCIMDProfilesToFile(undefined)).toBe(false);

    expect(writtenFiles()).toEqual([]);
    expect(messages('error')).toEqual([
      'Error exporting all CIMD profiles: connection reset',
    ]);
  });
});

describe('exportCIMDProfilesToFiles', () => {
  test('writes one file per profile, each with the metadata and only its own profile', async () => {
    stored = [plainProfile('alpha-clients'), plainProfile('zion-mcp-clients')];

    expect(await exportCIMDProfilesToFiles()).toBe(true);

    expect(writtenFiles()).toEqual([
      'alpha-clients.cimd.agent.json',
      'zion-mcp-clients.cimd.agent.json',
    ]);
    expect(readWritten('zion-mcp-clients.cimd.agent.json')).toEqual({
      meta: { origin: HOST },
      cimdProfile: { 'zion-mcp-clients': plainProfile('zion-mcp-clients') },
    });
    expect(messages('error')).toEqual([]);
  });

  test('-N leaves the metadata out of every file', async () => {
    stored = [plainProfile('alpha-clients'), plainProfile('zion-mcp-clients')];

    expect(await exportCIMDProfilesToFiles(false)).toBe(true);

    for (const name of writtenFiles()) {
      expect(Object.keys(readWritten(name))).toEqual(['cimdProfile']);
    }
  });

  test('a sparse profile is written as it is', async () => {
    stored = [sparseProfile('sparse')];

    expect(await exportCIMDProfilesToFiles()).toBe(true);

    expect(readWritten('sparse.cimd.agent.json').cimdProfile.sparse).toEqual(
      sparseProfile('sparse')
    );
  });

  describe('file names', () => {
    const IDS = [
      'x'.repeat(7500),
      'a b',
      'a-b',
      'a.b',
      'a@b',
      '日本語',
      '日本',
      '😀',
      'Ünï',
      'zion-mcp-clients',
    ];

    const run = async () => {
      stored = IDS.map((id) => sparseProfile(id));
      expect(await exportCIMDProfilesToFiles()).toBe(true);
      return writtenFiles();
    };

    test('every id gets a distinct, valid file name of at most 140 characters, and the file still holds the exact id', async () => {
      const files = await run();

      expect(files).toHaveLength(IDS.length);
      expect(new Set(files.map((name) => name.toLowerCase())).size).toBe(
        IDS.length
      );
      for (const name of files) {
        expect(name.length).toBeLessThanOrEqual(140);
        expect(name).toMatch(/^[^/\\\0]+\.cimd\.agent\.json$/);
      }
      const idsInFiles = files.flatMap((name) =>
        Object.keys(readWritten(name).cimdProfile)
      );
      expect(idsInFiles.sort()).toEqual([...IDS].sort());
      // an id that makes a usable file name keeps it
      expect(files).toContain('zion-mcp-clients.cimd.agent.json');
      expect(files).toContain('a.b.cimd.agent.json');
      expect(files).toContain('a@b.cimd.agent.json');
      expect(files).toContain('Uni.cimd.agent.json');
    });

    test('the names are deterministic: a second export writes the same names', async () => {
      const first = await run();
      fs.rmSync(baseDirectory, { recursive: true, force: true });
      baseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-cimd-'));

      expect(await run()).toEqual(first);
    });

    test('a name that was changed is mentioned once, a name that was not is not', async () => {
      await run();

      const mentioned = messages('info').filter((msg) =>
        msg.includes('does not make a usable file name')
      );
      // the 7,500 characters, the second of `a b` and `a-b`, the two CJK ids and the emoji
      expect(mentioned).toHaveLength(5);
      expect(mentioned.join('\n')).not.toContain('zion-mcp-clients');
    });

    test('-i with a long id uses the same function', async () => {
      stored = [sparseProfile('y'.repeat(7500))];

      expect(await exportCIMDProfileToFile('y'.repeat(7500))).toBe(true);

      const [name] = writtenFiles();
      expect(name.length).toBeLessThanOrEqual(140);
      expect(name).toMatch(/^y{100}-[0-9a-f]{8}\.cimd\.agent\.json$/);
    });
  });

  describe('decision record 0040', () => {
    const four = () => ['a', 'b', 'c', 'd'].map((id) => plainProfile(id));

    test('a profile whose file cannot be written is named in one summary, the others are still written, and the command fails', async () => {
      stored = four();
      cannotWrite = (file) => path.basename(file).startsWith('b.');

      expect(await exportCIMDProfilesToFiles()).toBe(false);

      expect(writtenFiles()).toEqual([
        'a.cimd.agent.json',
        'c.cimd.agent.json',
        'd.cimd.agent.json',
      ]);
      expect(messages('error')).toEqual([
        'could not write the file',
        '1 of 4 profiles failed:\n  - b: could not write the file',
      ]);
    });

    test('with --allow-failures the failure is still printed and the command succeeds', async () => {
      stored = four();
      cannotWrite = (file) => path.basename(file).startsWith('b.');

      expect(await exportCIMDProfilesToFiles(true, true)).toBe(true);

      expect(messages('error')).toEqual(['could not write the file']);
      expect(messages('warn')).toEqual([
        '1 of 4 profiles failed:\n  - b: could not write the file\nThe exit code stays 0 because --allow-failures was given.',
      ]);
    });

    test('two failures are both named', async () => {
      stored = four();
      cannotWrite = (file) => /^[bc]\./.test(path.basename(file));

      expect(await exportCIMDProfilesToFiles()).toBe(false);

      expect(messages('error').at(-1)).toBe(
        '2 of 4 profiles failed:\n  - b: could not write the file\n  - c: could not write the file'
      );
      expect(writtenFiles()).toEqual([
        'a.cimd.agent.json',
        'd.cimd.agent.json',
      ]);
    });

    test('a failure to read the profiles fails the command whatever --allow-failures says', async () => {
      stored = four();
      readFailure = new Error('connection reset');

      expect(await exportCIMDProfilesToFiles(true, false)).toBe(false);
      expect(await exportCIMDProfilesToFiles(true, true)).toBe(false);

      expect(writtenFiles()).toEqual([]);
      expect(messages('error')).toEqual([
        'connection reset',
        'connection reset',
      ]);
    });

    test('a realm that offers the type and holds no profile: nothing to export is not a failure, and no file is written', async () => {
      expect(await exportCIMDProfilesToFiles()).toBe(true);

      expect(writtenFiles()).toEqual([]);
      expect(messages('info')).toEqual(['Nothing to export.']);
      expect(messages('error')).toEqual([]);
    });

    test('a realm that does not offer the type: the note, no file, and no failure', async () => {
      offered = false;

      expect(await exportCIMDProfilesToFiles()).toBe(true);

      expect(writtenFiles()).toEqual([]);
      expect(messages('warn')).toEqual([
        `CIMD profiles are not available in the alpha realm of ${HOST}: the server does not offer the agent type 'CIMDProfile'.`,
      ]);
      expect(messages('info')).toEqual([]);
    });
  });
});

describe('importCIMDProfileFromFile (-i)', () => {
  test('imports exactly the profile named, of a file of three: one library call, with that id and the file as it is', async () => {
    const profiles = ['a', 'b', 'c'].map((id) => plainProfile(id));
    writeImportFile('three.cimd.agent.json', profiles);

    expect(await importCIMDProfileFromFile('b', 'three.cimd.agent.json')).toBe(
      true
    );

    expect(libCalls('importCIMDProfile')).toHaveLength(1);
    expect(libCalls('importCIMDProfile')[0][1]).toBe('b');
    expect(libCalls('importCIMDProfiles')).toEqual([]);
    expect(messages('indicator-success')).toEqual(['Created b.']);
  });

  test('says Updated for an existing profile and the extra sentence for a created profile that was written again', async () => {
    writeImportFile('in.json', [plainProfile('a'), plainProfile('b')]);
    importPlan = {
      a: { created: false },
      b: { created: true, repaired: true },
    };

    expect(await importCIMDProfileFromFile('a', 'in.json')).toBe(true);
    expect(await importCIMDProfileFromFile('b', 'in.json')).toBe(true);

    expect(messages('indicator-success')).toEqual([
      'Updated a.',
      'Created b (the server added defaults; written again as in the file).',
    ]);
  });

  test('hands a sparse profile to the library unchanged: no group added, no null filled in', async () => {
    const sparse = sparseProfile('sparse');
    writeImportFile('in.json', [sparse]);

    expect(await importCIMDProfileFromFile('sparse', 'in.json')).toBe(true);

    expect(libCalls('importCIMDProfile')[0][2].cimdProfile.sparse).toEqual(
      sparse
    );
  });

  test('hands the wrapped and the plain shape to the library as they are', async () => {
    const plain = plainProfile('plain');
    const wrap = wrapped(plainProfile('wrapped'));
    writeImportFile('in.json', [plain, wrap]);

    expect(await importCIMDProfileFromFile('plain', 'in.json')).toBe(true);
    expect(await importCIMDProfileFromFile('wrapped', 'in.json')).toBe(true);

    const [first, second] = libCalls('importCIMDProfile');
    expect(first[2].cimdProfile.plain).toEqual(plain);
    expect(second[2].cimdProfile.wrapped).toEqual(wrap);
  });

  test('a profile that is not in the file is an error and nothing is sent', async () => {
    writeImportFile('in.json', [plainProfile('a')]);

    expect(await importCIMDProfileFromFile('missing', 'in.json')).toBe(false);

    expect(messages('error')).toEqual([
      expect.stringMatching(/^CIMD profile missing not found in .*in\.json!$/),
    ]);
    expect(libCalls('importCIMDProfile')).toEqual([]);
  });

  test('the id is the key of the file, exactly: an id in another case is not that profile', async () => {
    writeImportFile('in.json', [plainProfile('a')]);

    expect(await importCIMDProfileFromFile('A', 'in.json')).toBe(false);

    expect(libCalls('importCIMDProfile')).toEqual([]);
  });

  test('a file that does not exist, is not JSON, or has no cimdProfile section fails', async () => {
    fs.writeFileSync(path.join(baseDirectory, 'broken.json'), '{ not json');
    fs.writeFileSync(
      path.join(baseDirectory, 'other.json'),
      JSON.stringify({ script: {} })
    );

    expect(await importCIMDProfileFromFile('a', 'missing.json')).toBe(false);
    expect(await importCIMDProfileFromFile('a', 'broken.json')).toBe(false);
    expect(await importCIMDProfileFromFile('a', 'other.json')).toBe(false);

    expect(messages('indicator-fail')).toHaveLength(0);
    expect(messages('error')).toHaveLength(3);
    expect(messages('error')[2]).toMatch(
      /^No CIMD profiles found in .*other\.json$/
    );
    expect(libCalls('importCIMDProfile')).toEqual([]);
  });

  test('a file of 4.x that holds the profiles under the key agent says how to import it', async () => {
    fs.writeFileSync(
      path.join(baseDirectory, 'old.agent.json'),
      JSON.stringify({ agent: { a: plainProfile('a') } })
    );

    expect(await importCIMDProfileFromFile('a', 'old.agent.json')).toBe(false);

    expect(messages('error')[0]).toMatch(
      /^No CIMD profiles found in .*old\.agent\.json\. The file holds them under the key 'agent' \(frodo 4\.x\): import it with frodo agent import -f .*old\.agent\.json$/
    );
  });

  test('a profile the library cannot import fails with the error of the library', async () => {
    writeImportFile('in.json', [plainProfile('a')]);
    importPlan = { a: { error: new Error('Invalid attribute specified.') } };

    expect(await importCIMDProfileFromFile('a', 'in.json')).toBe(false);

    expect(messages('indicator-fail')).toEqual([
      'Error importing CIMD profile a',
    ]);
    expect(messages('error')).toEqual([
      'Error importing alpha realm CIMD profile a',
    ]);
  });

  test('a realm that does not offer the type fails with the error of the library, because the user named the profile', async () => {
    writeImportFile('in.json', [plainProfile('a')]);
    offered = false;

    expect(await importCIMDProfileFromFile('a', 'in.json')).toBe(false);

    expect(messages('error')).toEqual([
      "CIMD profiles are not available in the alpha realm of this deployment: the server does not offer the agent type 'CIMDProfile'.",
    ]);
  });
});

describe('importFirstCIMDProfileFromFile', () => {
  test('imports the first profile of the file and only that one (it never imports all, frodo-cli#1147)', async () => {
    writeImportFile('three.json', [
      plainProfile('first'),
      plainProfile('second'),
      plainProfile('third'),
    ]);

    expect(await importFirstCIMDProfileFromFile('three.json')).toBe(true);

    expect(libCalls('importCIMDProfile').map((call) => call[1])).toEqual([
      'first',
    ]);
    expect(libCalls('importCIMDProfiles')).toEqual([]);
  });

  test('a file without a profile is an error', async () => {
    writeImportFile('empty.json', []);

    expect(await importFirstCIMDProfileFromFile('empty.json')).toBe(false);

    expect(messages('error')).toEqual([
      expect.stringMatching(/^No CIMD profile found in .*empty\.json!$/),
    ]);
    expect(calls).toEqual([]);
  });

  test('a file that cannot be used fails', async () => {
    expect(await importFirstCIMDProfileFromFile('missing.json')).toBe(false);
  });
});

describe('importCIMDProfilesFromFile (-a)', () => {
  const four = () => ['a', 'b', 'c', 'd'].map((id) => plainProfile(id));

  test('imports every profile of the file and counts what was created and updated', async () => {
    writeImportFile('four.json', four());
    importPlan = { b: { created: false }, d: { created: false } };

    expect(await importCIMDProfilesFromFile('four.json')).toBe(true);

    expect(libCalls('importCIMDProfiles')).toHaveLength(1);
    expect(messages('info')).toEqual([
      'Created a.',
      'Updated b.',
      'Created c.',
      'Updated d.',
      'Imported 4 CIMD profiles: 2 created, 2 updated.',
    ]);
    expect(messages('error')).toEqual([]);
  });

  test('says when a created profile was written again, and counts it as created', async () => {
    writeImportFile('one.json', [plainProfile('a')]);
    importPlan = { a: { repaired: true } };

    expect(await importCIMDProfilesFromFile('one.json')).toBe(true);

    expect(messages('info')).toEqual([
      'Created a (the server added defaults; written again as in the file).',
      'Imported 1 CIMD profile: 1 created, 0 updated.',
    ]);
  });

  test('hands the file to the library as it is (a sparse profile stays sparse)', async () => {
    const sparse = sparseProfile('sparse');
    writeImportFile('in.json', [sparse, plainProfile('full')]);

    expect(await importCIMDProfilesFromFile('in.json')).toBe(true);

    expect(libCalls('importCIMDProfiles')[0][1].cimdProfile.sparse).toEqual(
      sparse
    );
  });

  test('one profile that fails does not stop the others: one summary names it, and the command fails', async () => {
    writeImportFile('four.json', four());
    importPlan = { b: { error: new Error('Invalid attribute specified.') } };

    expect(await importCIMDProfilesFromFile('four.json')).toBe(false);

    expect(messages('info').slice(-1)).toEqual([
      'Imported 3 CIMD profiles: 3 created, 0 updated.',
    ]);
    expect(messages('error').at(-1)).toBe(
      '1 of 4 profiles failed:\n  - Error importing alpha realm CIMD profile b: Invalid attribute specified.'
    );
  });

  test('with --allow-failures the failure is still printed and the command succeeds', async () => {
    writeImportFile('four.json', four());
    importPlan = { b: { error: new Error('Invalid attribute specified.') } };

    expect(await importCIMDProfilesFromFile('four.json', true)).toBe(true);

    expect(messages('warn').at(-1)).toBe(
      '1 of 4 profiles failed:\n  - Error importing alpha realm CIMD profile b: Invalid attribute specified.\nThe exit code stays 0 because --allow-failures was given.'
    );
  });

  test('two failures are both named', async () => {
    writeImportFile('four.json', four());
    importPlan = {
      b: { error: new Error('first reason') },
      d: {
        error: new Error(
          "Wrong agent type! Expected 'CIMDProfile' but got 'WebAgent'."
        ),
      },
    };

    expect(await importCIMDProfilesFromFile('four.json')).toBe(false);

    expect(messages('error').at(-1)).toBe(
      "2 of 4 profiles failed:\n  - Error importing alpha realm CIMD profile b: first reason\n  - Error importing alpha realm CIMD profile d: Wrong agent type! Expected 'CIMDProfile' but got 'WebAgent'."
    );
  });

  test('a file that was named and does not exist, or cannot be parsed, fails whatever --allow-failures says', async () => {
    fs.writeFileSync(path.join(baseDirectory, 'broken.json'), '{ not json');

    expect(await importCIMDProfilesFromFile('missing.json', true)).toBe(false);
    expect(await importCIMDProfilesFromFile('broken.json', true)).toBe(false);

    expect(libCalls('importCIMDProfiles')).toEqual([]);
    expect(messages('warn')).toEqual([]);
  });

  test('a file without a profile has nothing to import, which is not a failure', async () => {
    writeImportFile('empty.json', []);

    expect(await importCIMDProfilesFromFile('empty.json')).toBe(true);

    expect(messages('warn')).toEqual([
      expect.stringMatching(/^No CIMD profiles found in .*empty\.json\.$/),
    ]);
    expect(libCalls('importCIMDProfiles')).toEqual([]);
  });

  test('two ids that differ only in case are one profile: a warning names both', async () => {
    writeImportFile('in.json', [plainProfile('Zion'), plainProfile('zion')]);

    expect(await importCIMDProfilesFromFile('in.json')).toBe(true);

    expect(messages('warn')).toEqual([
      "The ids 'Zion' and 'zion' in in.json are one CIMD profile (ids are not case-sensitive): the later one overwrites the earlier.",
    ]);
  });
});

describe('importCIMDProfilesFromFiles (-A)', () => {
  test('imports the profiles of every *.cimd.agent.json file of the working directory, in the order of the file names', async () => {
    writeImportFile('b.cimd.agent.json', [plainProfile('b')]);
    writeImportFile('a.cimd.agent.json', [plainProfile('a')]);

    expect(await importCIMDProfilesFromFiles()).toBe(true);

    expect(
      libCalls('importCIMDProfiles').map((call) =>
        Object.keys(call[1].cimdProfile)
      )
    ).toEqual([['a'], ['b']]);
    expect(messages('info').slice(-1)).toEqual([
      'Imported 2 CIMD profiles: 2 created, 0 updated.',
    ]);
  });

  test('ignores files of other types: x.agent.json, x.web.agent.json and x.cimd.json', async () => {
    writeImportFile('x.agent.json', [plainProfile('other1')]);
    writeImportFile('x.web.agent.json', [plainProfile('other2')]);
    writeImportFile('x.cimd.json', [plainProfile('other3')]);
    writeImportFile('mine.cimd.agent.json', [plainProfile('mine')]);

    expect(await importCIMDProfilesFromFiles()).toBe(true);

    expect(
      libCalls('importCIMDProfiles').flatMap((call) =>
        Object.keys(call[1].cimdProfile)
      )
    ).toEqual(['mine']);
  });

  test('a file that cannot be parsed is a failed item named by its file name; the profiles of the good files are imported', async () => {
    writeImportFile('a.cimd.agent.json', [plainProfile('a')]);
    fs.writeFileSync(
      path.join(baseDirectory, 'b.cimd.agent.json'),
      '{ not json'
    );
    writeImportFile('c.cimd.agent.json', [plainProfile('c')]);

    expect(await importCIMDProfilesFromFiles()).toBe(false);

    expect(
      libCalls('importCIMDProfiles').flatMap((call) =>
        Object.keys(call[1].cimdProfile)
      )
    ).toEqual(['a', 'c']);
    expect(messages('error').at(-1)).toMatch(
      /^1 of 3 profiles failed:\n  - b\.cimd\.agent\.json: /
    );
  });

  test('with --allow-failures the unusable file and the failed profile are named and the command succeeds', async () => {
    writeImportFile('a.cimd.agent.json', [
      plainProfile('a'),
      plainProfile('b'),
    ]);
    fs.writeFileSync(
      path.join(baseDirectory, 'c.cimd.agent.json'),
      '{ not json'
    );
    importPlan = { b: { error: new Error('Invalid attribute specified.') } };

    expect(await importCIMDProfilesFromFiles(true)).toBe(true);

    expect(messages('warn').at(-1)).toMatch(
      /^2 of 3 profiles failed:\n  - Error importing alpha realm CIMD profile b: Invalid attribute specified\.\n  - c\.cimd\.agent\.json: .*\nThe exit code stays 0 because --allow-failures was given\.$/
    );
  });

  test('no file is not a failure', async () => {
    writeImportFile('x.agent.json', [plainProfile('other')]);

    expect(await importCIMDProfilesFromFiles()).toBe(true);

    expect(messages('warn')).toEqual([
      expect.stringMatching(
        /^No CIMD profile files \(\*\.cimd\.agent\.json\) found in .*!$/
      ),
    ]);
    expect(libCalls('importCIMDProfiles')).toEqual([]);
  });

  test('a directory that cannot be read ends the command whatever --allow-failures says', async () => {
    fs.rmSync(baseDirectory, { recursive: true, force: true });

    expect(await importCIMDProfilesFromFiles(true)).toBe(false);
    expect(await importCIMDProfilesFromFiles(false)).toBe(false);
  });
});

describe('a realm that does not offer the type', () => {
  beforeEach(() => {
    offered = false;
  });

  test('-a: every profile of the file is a failed item with the reason, the note is printed once, and nothing is sent', async () => {
    writeImportFile(
      'three.json',
      ['a', 'b', 'c'].map((id) => plainProfile(id))
    );

    expect(await importCIMDProfilesFromFile('three.json')).toBe(false);

    expect(libCalls('importCIMDProfiles')).toEqual([]);
    expect(messages('warn')).toEqual([
      `CIMD profiles are not available in the alpha realm of ${HOST}: the server does not offer the agent type 'CIMDProfile'.`,
    ]);
    expect(messages('error')).toEqual([
      '3 of 3 profiles failed:\n  - a: the server does not offer the CIMDProfile agent type\n  - b: the server does not offer the CIMDProfile agent type\n  - c: the server does not offer the CIMDProfile agent type',
    ]);
  });

  test('-a with --allow-failures keeps the exit code at 0 and still names them', async () => {
    writeImportFile(
      'two.json',
      ['a', 'b'].map((id) => plainProfile(id))
    );

    expect(await importCIMDProfilesFromFile('two.json', true)).toBe(true);

    expect(messages('warn').at(-1)).toContain(
      '2 of 2 profiles failed:\n  - a: the server does not offer the CIMDProfile agent type'
    );
    expect(libCalls('importCIMDProfiles')).toEqual([]);
  });

  test('-A: the note is printed once for all the files, and every profile of every file is a failed item', async () => {
    writeImportFile('a.cimd.agent.json', [plainProfile('a')]);
    writeImportFile('b.cimd.agent.json', [plainProfile('b')]);

    expect(await importCIMDProfilesFromFiles()).toBe(false);

    expect(messages('warn')).toHaveLength(1);
    expect(messages('error')).toEqual([
      '2 of 2 profiles failed:\n  - a: the server does not offer the CIMDProfile agent type\n  - b: the server does not offer the CIMDProfile agent type',
    ]);
    expect(libCalls('importCIMDProfiles')).toEqual([]);
  });

  test('-A with no file is still not a failure, and says nothing about the type', async () => {
    expect(await importCIMDProfilesFromFiles()).toBe(true);

    expect(messages('warn')).toEqual([
      expect.stringMatching(/^No CIMD profile files/),
    ]);
  });

  test('a failed check of the type is not an item failure: it fails the command whatever --allow-failures says', async () => {
    offered = true;
    availabilityFailure = new Error('agent types unreadable');
    writeImportFile(
      'two.json',
      ['a', 'b'].map((id) => plainProfile(id))
    );

    expect(await importCIMDProfilesFromFile('two.json', true)).toBe(false);

    expect(messages('error')).toEqual(['agent types unreadable']);
  });
});

describe('printCIMDProfilePlan', () => {
  test('lists the id and the client id URL patterns of every profile, as data, and deletes nothing', async () => {
    stored = [
      plainProfile('alpha-clients'),
      plainProfile('zion-mcp-clients', {
        cimdConfig: {
          cimdClientIdUrlPatterns: [
            'https://agents.zion.example.com/*',
            'https://tools.zion.example.com/*',
          ],
        },
      }),
    ];

    expect(await printCIMDProfilePlan()).toBe(true);

    expect(messages('info')).toEqual([
      'The following CIMD profiles would be deleted:',
    ]);
    expect(messages('data')).toEqual([
      '  alpha-clients  https://agents.zion.example.com/alpha-clients/*, https://agents.zion.example.com:8443/agents/*',
      '  zion-mcp-clients  https://agents.zion.example.com/*, https://tools.zion.example.com/*',
    ]);
    expect(libCalls('deleteCIMDProfile')).toEqual([]);
    expect(libCalls('deleteCIMDProfiles')).toEqual([]);
  });

  test('reads the wrapped shape, and a sparse profile without a pattern', async () => {
    stored = [
      wrapped(plainProfile('wrapped')),
      { _id: 'bare', _type: { _id: 'CIMDProfile' } },
    ];

    expect(await printCIMDProfilePlan()).toBe(true);

    expect(messages('data')).toEqual([
      '  wrapped  https://agents.zion.example.com/wrapped/*, https://agents.zion.example.com:8443/agents/*',
      '  bare  (not set)',
    ]);
  });

  test('no profile: says so, and succeeds', async () => {
    expect(await printCIMDProfilePlan()).toBe(true);

    expect(messages('info')).toEqual(['No CIMD profiles found.']);
  });

  test('a realm that does not offer the type: the note, and success', async () => {
    offered = false;

    expect(await printCIMDProfilePlan()).toBe(true);

    expect(messages('warn')).toEqual([
      `CIMD profiles are not available in the alpha realm of ${HOST}: the server does not offer the agent type 'CIMDProfile'.`,
    ]);
  });

  test('a profile list that cannot be read fails, so the guard does not ask', async () => {
    readFailure = new Error('connection reset');
    // the plan reads through readCIMDProfiles
    expect(await printCIMDProfilePlan()).toBe(false);

    expect(messages('error')).toEqual([
      'Error reading the CIMD profiles: connection reset',
    ]);
  });
});

describe('deleteCIMDProfile (-i)', () => {
  test('deletes that profile and nothing else', async () => {
    stored = [plainProfile('a'), plainProfile('b')];

    expect(await deleteCIMDProfile('a')).toBe(true);

    expect(libCalls('deleteCIMDProfile')).toEqual([['deleteCIMDProfile', 'a']]);
    expect(stored.map((profile) => profile._id)).toEqual(['b']);
    expect(messages('indicator-success')).toEqual(['Deleted a.']);
  });

  test('a profile that does not exist fails and says so', async () => {
    expect(await deleteCIMDProfile('missing')).toBe(false);

    expect(messages('indicator-fail')).toEqual(['Error deleting missing']);
    expect(messages('error')).toEqual([
      'alpha realm CIMD profile missing not found',
    ]);
  });

  test('a delete that fails fails', async () => {
    stored = [plainProfile('a')];
    cannotDelete = new Set(['a']);

    expect(await deleteCIMDProfile('a')).toBe(false);

    expect(messages('error')).toEqual(['could not delete a']);
  });

  test('a realm that does not offer the type fails with the error of the library: the user named a profile that cannot exist', async () => {
    offered = false;

    expect(await deleteCIMDProfile('a')).toBe(false);

    expect(messages('error')).toEqual([
      "CIMD profiles are not available in the alpha realm of this deployment: the server does not offer the agent type 'CIMDProfile'.",
    ]);
  });

  test('no id, because the picker found no profile: nothing to delete, which is not a failure, and nothing is deleted', async () => {
    stored = [];

    expect(await deleteCIMDProfile(undefined)).toBe(true);

    expect(messages('info')).toEqual(['No CIMD profiles found to delete.']);
    expect(calls).toEqual([]);
  });

  test('no id in a realm that does not offer the type: the note, and no failure either', async () => {
    offered = false;

    expect(await deleteCIMDProfile(undefined)).toBe(true);

    expect(messages('warn')).toEqual([
      `CIMD profiles are not available in the alpha realm of ${HOST}: the server does not offer the agent type 'CIMDProfile'.`,
    ]);
    expect(messages('info')).toEqual([]);
  });
});

describe('deleteCIMDProfiles (-a)', () => {
  const four = () => ['a', 'b', 'c', 'd'].map((id) => plainProfile(id));

  test('deletes every profile through the library and counts them', async () => {
    stored = four();

    expect(await deleteCIMDProfiles()).toBe(true);

    expect(stored).toEqual([]);
    expect(libCalls('deleteCIMDProfiles')).toHaveLength(1);
    expect(messages('info')).toEqual(['Deleted 4 CIMD profiles.']);
    expect(messages('error')).toEqual([]);
  });

  test('one profile that cannot be deleted does not stop the others: one summary names it, and the command fails', async () => {
    stored = four();
    cannotDelete = new Set(['c']);

    expect(await deleteCIMDProfiles()).toBe(false);

    expect(stored.map((profile) => profile._id)).toEqual(['c']);
    expect(messages('info')).toEqual(['Deleted 3 CIMD profiles.']);
    expect(messages('error').at(-1)).toBe(
      '1 of 4 profiles failed:\n  - Error deleting alpha realm CIMD profile c: could not delete c'
    );
  });

  test('with --allow-failures the failure is still printed and the command succeeds', async () => {
    stored = four();
    cannotDelete = new Set(['c']);

    expect(await deleteCIMDProfiles(true)).toBe(true);

    expect(messages('warn').at(-1)).toBe(
      '1 of 4 profiles failed:\n  - Error deleting alpha realm CIMD profile c: could not delete c\nThe exit code stays 0 because --allow-failures was given.'
    );
  });

  test('two failures are both named', async () => {
    stored = four();
    cannotDelete = new Set(['b', 'd']);

    expect(await deleteCIMDProfiles()).toBe(false);

    expect(messages('error').at(-1)).toBe(
      '2 of 4 profiles failed:\n  - Error deleting alpha realm CIMD profile b: could not delete b\n  - Error deleting alpha realm CIMD profile d: could not delete d'
    );
  });

  test('a failure to read the profiles fails the command whatever --allow-failures says', async () => {
    stored = four();
    readFailure = new Error('connection reset');

    expect(await deleteCIMDProfiles(true)).toBe(false);
    expect(await deleteCIMDProfiles(false)).toBe(false);

    expect(stored).toHaveLength(4);
    expect(messages('error')).toEqual(['connection reset', 'connection reset']);
  });

  test('no profile: nothing to delete is not a failure', async () => {
    expect(await deleteCIMDProfiles()).toBe(true);

    expect(messages('info')).toEqual(['No CIMD profiles found to delete.']);
  });

  test('a realm that does not offer the type: the note, and success', async () => {
    offered = false;

    expect(await deleteCIMDProfiles()).toBe(true);

    expect(messages('warn')).toEqual([
      `CIMD profiles are not available in the alpha realm of ${HOST}: the server does not offer the agent type 'CIMDProfile'.`,
    ]);
    expect(messages('info')).toEqual([]);
  });

  test('--dry-run prints the plan and never calls the library delete', async () => {
    stored = four();

    expect(await deleteCIMDProfiles(false, true)).toBe(true);
    expect(await deleteCIMDProfiles(true, true)).toBe(true);

    expect(libCalls('deleteCIMDProfile')).toEqual([]);
    expect(libCalls('deleteCIMDProfiles')).toEqual([]);
    expect(stored).toHaveLength(4);
    expect(messages('data')).toHaveLength(8);
  });
});

describe('what an export file holds', () => {
  test('a CIMD profile holds no secret: none of the files has a userpassword, a client_secret or an -encrypted key', async () => {
    stored = [plainProfile('alpha-clients'), plainProfile('zion-mcp-clients')];

    expect(await exportCIMDProfilesToFile(undefined)).toBe(true);
    expect(await exportCIMDProfilesToFiles()).toBe(true);
    expect(await exportCIMDProfileToFile('alpha-clients', 'one.json')).toBe(
      true
    );

    for (const name of writtenFiles()) {
      const text = fs.readFileSync(path.join(baseDirectory, name), 'utf8');
      expect(text).not.toMatch(/userpassword|client_secret|-encrypted"/i);
    }
  });
});

// The same expectations on every deployment: the ops code must not branch on it.
describe.each(['cloud', 'forgeops', 'classic'])(
  'on a %s deployment',
  (type) => {
    beforeEach(() => {
      deploymentType = type;
    });

    test('list and describe give the same output', async () => {
      stored = [plainProfile('zion-mcp-clients')];

      expect(await listCIMDProfiles()).toBe(true);
      expect(await describeCIMDProfile('zion-mcp-clients')).toBe(true);

      expect(messages('data')).toEqual([
        'zion-mcp-clients',
        expect.stringContaining('Agent Id | zion-mcp-clients'),
      ]);
    });

    test('the exports give the same files', async () => {
      stored = [plainProfile('zion-mcp-clients'), sparseProfile('sparse')];

      expect(await exportCIMDProfileToFile('sparse', undefined)).toBe(true);
      expect(await exportCIMDProfilesToFile(undefined)).toBe(true);
      expect(await exportCIMDProfilesToFiles()).toBe(true);

      expect(writtenFiles()).toEqual([
        'allAlphaAgents.cimd.agent.json',
        'sparse.cimd.agent.json',
        'zion-mcp-clients.cimd.agent.json',
      ]);
    });

    test('the imports give the same messages, offered or not', async () => {
      writeImportFile('in.cimd.agent.json', [
        plainProfile('a'),
        plainProfile('b'),
      ]);
      importPlan = { b: { created: false } };

      expect(await importCIMDProfileFromFile('a', 'in.cimd.agent.json')).toBe(
        true
      );
      expect(await importCIMDProfilesFromFile('in.cimd.agent.json')).toBe(true);
      expect(await importCIMDProfilesFromFiles()).toBe(true);
      expect(messages('indicator-success')).toEqual(['Created a.']);
      expect(messages('info')).toEqual([
        'Created a.',
        'Updated b.',
        'Imported 2 CIMD profiles: 1 created, 1 updated.',
        'Created a.',
        'Updated b.',
        'Imported 2 CIMD profiles: 1 created, 1 updated.',
      ]);

      printed.length = 0;
      offered = false;
      expect(await importCIMDProfilesFromFile('in.cimd.agent.json', true)).toBe(
        true
      );
      expect(await importCIMDProfilesFromFiles()).toBe(false);
      expect(messages('error').at(-1)).toContain(
        '2 of 2 profiles failed:\n  - a: the server does not offer the CIMDProfile agent type'
      );
    });

    test('the plan and the deletes give the same output', async () => {
      stored = [plainProfile('a'), plainProfile('b'), plainProfile('c')];

      expect(await printCIMDProfilePlan()).toBe(true);
      expect(await deleteCIMDProfile('a')).toBe(true);
      expect(await deleteCIMDProfiles()).toBe(true);

      expect(messages('data')).toHaveLength(3);
      expect(messages('indicator-success')).toEqual(['Deleted a.']);
      expect(messages('info')).toEqual([
        'The following CIMD profiles would be deleted:',
        'Deleted 2 CIMD profiles.',
      ]);
    });

    test('a type that is not offered gives the same note and the same error', async () => {
      offered = false;

      expect(await listCIMDProfiles()).toBe(true);
      expect(await describeCIMDProfile('zion-mcp-clients')).toBe(false);

      expect(messages('warn')).toHaveLength(1);
      expect(messages('error')).toHaveLength(1);
      expect(messages('error')[0]).toContain(
        "the server does not offer the agent type 'CIMDProfile'"
      );
    });
  }
);
