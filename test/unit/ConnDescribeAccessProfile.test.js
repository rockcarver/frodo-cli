import { jest } from '@jest/globals';

// `frodo conn describe` shows what the saved browser or device session of the
// host can do, from the token cache, without logging in. The library describes
// the cached token the way it describes a live session (access profile).

const getConnectionProfileByHost = jest.fn();
const hasToken = jest.fn();
const readToken = jest.fn();
const getAccessProfile = jest.fn();
const setHost = jest.fn();
const setDeploymentType = jest.fn();
const setBearerTokenMeta = jest.fn();
const printMessage = jest.fn();
const debugMessage = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  state: { setHost, setDeploymentType, setBearerTokenMeta },
  frodo: {
    cloud: { serviceAccount: { validateServiceAccount: jest.fn() } },
    conn: {
      getConnectionProfilesPath: jest.fn(),
      getConnectionProfileByHost,
      findConnectionProfiles: jest.fn(),
    },
    cache: { hasToken, readToken },
    login: { getAccessProfile },
  },
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  createObjectTable: jest.fn(() => ({ toString: () => '<table>' })),
  createTable: jest.fn(),
  debugMessage,
  failSpinner: jest.fn(),
  printError: jest.fn(),
  printMessage,
  showSpinner: jest.fn(),
  succeedSpinner: jest.fn(),
}));

const { describeConnectionProfile } =
  await import('../../src/ops/ConnectionProfileOps');

const area = (id, title, reachable) => ({
  id,
  title,
  scopes: [],
  reachable,
  basis: [],
});
const profileOf = (flow) => ({
  flow,
  clientId: 'AICMCPClient',
  expiresAt: Date.now() + 12 * 60_000,
  refreshable: false,
  grantedScopes: [],
  scopesNotGranted: [],
  amSession: 'present',
  adaptations: [],
  areas: [
    area('am', 'Access Management', 'yes'),
    area('governance', 'Governance', 'no'),
  ],
  measuredOn: '2026-11-14',
});

const tenant = 'https://tenant.example.com/am';
const token = {
  access_token: 'x',
  scope: 'fr:am:*',
  login: { flow: 'browser' },
};
const lines = () =>
  printMessage.mock.calls.map(([message]) => message).join('\n');

beforeEach(() => {
  jest.clearAllMocks();
  getConnectionProfileByHost.mockResolvedValue({
    tenant,
    deploymentType: 'cloud',
    alias: 'matrix',
  });
  hasToken.mockResolvedValue(true);
  readToken.mockResolvedValue(token);
  getAccessProfile.mockReturnValue(profileOf('browser'));
});

describe('conn describe and the saved session', () => {
  test('1: a fresh browser session in the cache is described, from the host of the profile and not from the alias that was typed', async () => {
    await expect(describeConnectionProfile('matrix', false)).resolves.toBe(
      true
    );
    expect(setHost).toHaveBeenCalledWith(tenant);
    expect(setDeploymentType).toHaveBeenCalledWith('cloud');
    expect(readToken).toHaveBeenCalledWith('browserUserBearer');
    expect(setBearerTokenMeta).toHaveBeenCalledWith(token);
    expect(lines()).toContain('What this browser login can do:');
    expect(lines()).toMatch(/Session: +ends in about 12 minutes/);
    // it is part of the output of the command, on stdout like the table
    expect(printMessage).toHaveBeenCalledWith(
      '\nWhat this browser login can do:',
      'data'
    );
  });

  test('2: no session in the cache: the profile is described as before', async () => {
    hasToken.mockResolvedValue(false);
    await expect(describeConnectionProfile('matrix', false)).resolves.toBe(
      true
    );
    expect(readToken).not.toHaveBeenCalled();
    expect(lines()).not.toContain('can do');
    expect(lines()).toContain('<table>');
  });

  test('3: a host that is not a Cloud tenant is not looked up: it has no profile', async () => {
    getConnectionProfileByHost.mockResolvedValue({
      tenant,
      deploymentType: 'forgeops',
    });
    await describeConnectionProfile('matrix', false);
    expect(hasToken).not.toHaveBeenCalled();
    expect(lines()).not.toContain('can do');
  });

  test('3b: a profile that does not say it is a Cloud tenant is not looked up either', async () => {
    getConnectionProfileByHost.mockResolvedValue({ tenant });
    await describeConnectionProfile('matrix', false);
    expect(hasToken).not.toHaveBeenCalled();
    expect(lines()).not.toContain('can do');
  });

  test('4: a cache that cannot be read does not fail the command', async () => {
    readToken.mockRejectedValue(new Error('cannot decrypt'));
    await expect(describeConnectionProfile('matrix', false)).resolves.toBe(
      true
    );
    expect(lines()).not.toContain('can do');
    expect(debugMessage).toHaveBeenCalledWith(
      expect.stringContaining('cannot decrypt')
    );
  });

  test('5: only an interactive session is shown', async () => {
    getAccessProfile.mockReturnValue(profileOf('service-account'));
    await describeConnectionProfile('matrix', false);
    expect(lines()).not.toContain('can do');
  });

  test('6: a profile that was not found is still an error, and the cache is not read', async () => {
    getConnectionProfileByHost.mockResolvedValue(undefined);
    await expect(describeConnectionProfile('matrix', false)).resolves.toBe(
      false
    );
    expect(hasToken).not.toHaveBeenCalled();
  });
});
