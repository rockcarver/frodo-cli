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
  constructor(message, code) {
    super(message);
    this.name = 'FrodoError';
    this.code = code;
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
  stopProgressIndicator: (id, msg, status = 'none') =>
    printed.push({ msg: String(msg), type: `indicator-${status}` }),
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
  describeCIMDProfile,
  exportCIMDProfilesToFile,
  exportCIMDProfilesToFiles,
  exportCIMDProfileToFile,
  listCIMDProfiles,
  reportCIMDProfilesUnavailable,
} = await import('../../src/ops/CIMDProfileOps.ts');

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
      expect(messages('indicator-fail')).toHaveLength(2);
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
