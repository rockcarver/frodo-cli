import { jest } from '@jest/globals';

const getConnectionProfileByHost = jest.fn();
const createObjectTable = jest.fn((profile) => ({
  toString: () => JSON.stringify(profile),
}));
const printMessage = jest.fn();
const debugMessage = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  state: {},
  frodo: {
    cloud: { serviceAccount: { validateServiceAccount: jest.fn() } },
    conn: {
      getConnectionProfilesPath: jest.fn(),
      getConnectionProfileByHost,
      findConnectionProfiles: jest.fn(),
    },
  },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  createObjectTable,
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

describe('describeConnectionProfile authentication header overrides', () => {
  const host = 'https://tenant.example.com/am';
  let overrides;

  beforeEach(() => {
    jest.clearAllMocks();
    overrides = Object.freeze({
      'X-API-Key': 'dummy-header-value-one',
      Authorization: 'dummy-header-value-two',
    });
    getConnectionProfileByHost.mockResolvedValue({
      tenant: host,
      authenticationHeaderOverrides: overrides,
    });
  });

  test.each([false, undefined])(
    'masks values when showSecrets is %s',
    async (showSecrets) => {
      await describeConnectionProfile(host, showSecrets);

      const rendered = createObjectTable.mock.calls[0][0];
      expect(rendered.authenticationHeaderOverrides).toEqual({
        'X-API-Key': '[present]',
        Authorization: '[present]',
      });
      expect(rendered.authenticationHeaderOverrides).not.toBe(overrides);
      const output = printMessage.mock.calls.flat().join('\n');
      for (const [header, value] of Object.entries(overrides)) {
        expect(output).toContain(header);
        expect(output).not.toContain(value);
      }
      expect(debugMessage.mock.calls.flat().join('\n')).not.toContain(
        'dummy-header-value'
      );
    }
  );

  test('shows values only when showSecrets is true', async () => {
    await describeConnectionProfile(host, true);

    expect(
      createObjectTable.mock.calls[0][0].authenticationHeaderOverrides
    ).toEqual(overrides);
    const output = printMessage.mock.calls.flat().join('\n');
    for (const [header, value] of Object.entries(overrides)) {
      expect(output).toContain(header);
      expect(output).toContain(value);
    }
    expect(debugMessage.mock.calls.flat().join('\n')).not.toContain(
      'dummy-header-value'
    );
  });

  test.each([false, true])(
    'preserves an empty map with showSecrets %s',
    async (showSecrets) => {
      getConnectionProfileByHost.mockResolvedValue({
        tenant: host,
        authenticationHeaderOverrides: {},
      });

      await describeConnectionProfile(host, showSecrets);

      expect(
        createObjectTable.mock.calls[0][0].authenticationHeaderOverrides
      ).toEqual({});
    }
  );

  test.each([false, true])(
    'does not add an absent map with showSecrets %s',
    async (showSecrets) => {
      getConnectionProfileByHost.mockResolvedValue({ tenant: host });

      await describeConnectionProfile(host, showSecrets);

      expect(createObjectTable.mock.calls[0][0]).not.toHaveProperty(
        'authenticationHeaderOverrides'
      );
    }
  );
});

describe('describeConnectionProfile configuration header overrides', () => {
  const host = 'https://tenant.example.com/am';
  const authentication = Object.freeze({
    'X-Gateway-Key': 'dummy-header-value-one',
  });
  const configuration = Object.freeze({
    'X-Configuration-Type': 'dummy-header-value-two',
    'X-Other': 'dummy-header-value-three',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getConnectionProfileByHost.mockResolvedValue({
      tenant: host,
      authenticationHeaderOverrides: authentication,
      configurationHeaderOverrides: configuration,
    });
  });

  test.each([false, undefined])(
    'masks the values of both maps and keeps the names when showSecrets is %s',
    async (showSecrets) => {
      await describeConnectionProfile(host, showSecrets);

      const rendered = createObjectTable.mock.calls[0][0];
      expect(rendered.authenticationHeaderOverrides).toEqual({
        'X-Gateway-Key': '[present]',
      });
      expect(rendered.configurationHeaderOverrides).toEqual({
        'X-Configuration-Type': '[present]',
        'X-Other': '[present]',
      });
      expect(rendered.configurationHeaderOverrides).not.toBe(configuration);
      const output = printMessage.mock.calls.flat().join('\n');
      for (const header of [
        ...Object.keys(authentication),
        ...Object.keys(configuration),
      ]) {
        expect(output).toContain(header);
      }
      for (const value of [
        ...Object.values(authentication),
        ...Object.values(configuration),
      ]) {
        expect(output).not.toContain(value);
        expect(debugMessage.mock.calls.flat().join('\n')).not.toContain(value);
      }
    }
  );

  test('shows the values of both maps only when showSecrets is true', async () => {
    await describeConnectionProfile(host, true);

    const rendered = createObjectTable.mock.calls[0][0];
    expect(rendered.authenticationHeaderOverrides).toEqual(authentication);
    expect(rendered.configurationHeaderOverrides).toEqual(configuration);
  });

  test('labels the configuration map', async () => {
    await describeConnectionProfile(host, false);

    expect(createObjectTable.mock.calls[0][1]).toMatchObject({
      authenticationHeaderOverrides: 'Authentication Header Overrides',
      configurationHeaderOverrides: 'Configuration Header Overrides',
    });
  });

  test.each([false, true])(
    'does not add an absent configuration map with showSecrets %s',
    async (showSecrets) => {
      getConnectionProfileByHost.mockResolvedValue({ tenant: host });

      await describeConnectionProfile(host, showSecrets);

      expect(createObjectTable.mock.calls[0][0]).not.toHaveProperty(
        'configurationHeaderOverrides'
      );
    }
  );

  test.each([false, true])(
    'preserves an empty configuration map with showSecrets %s',
    async (showSecrets) => {
      getConnectionProfileByHost.mockResolvedValue({
        tenant: host,
        configurationHeaderOverrides: {},
      });

      await describeConnectionProfile(host, showSecrets);

      expect(
        createObjectTable.mock.calls[0][0].configurationHeaderOverrides
      ).toEqual({});
    }
  );
});
