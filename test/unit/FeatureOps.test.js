import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

/**
 * `frodo feature install` and `frodo feature validate` (frodo-cli#1213).
 * The ops functions call the library and turn its result into the message and
 * the exit code of the command (true is exit 0, false is exit 1):
 * - an install counts as done unless the result says `success: false` or lists
 *   failures: the response Ping documents has no `success` field, so a missing
 *   one is not a failure; a failed install prints the message and each failure
 *   on its own line and exits 1;
 * - a validation that finds failures prints them under the summary and still
 *   exits 0 (the check ran); a feature that is already installed is not
 *   validated;
 * - both work with the library that is pinned (the response as the tenant sent
 *   it) and with a library that states the outcome itself (all four fields).
 * The library and the terminal are spies: install is irreversible, so no test
 * reaches a tenant.
 */

const idmFeature = {
  readIdmFeatures: jest.fn(),
  readIdmFeature: jest.fn(),
  hasIdmFeature: jest.fn(),
  validateIdmFeature: jest.fn(),
  installIdmFeature: jest.fn(),
};
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: { cloud: { idmFeature } },
  state: {},
}));

const printError = jest.fn();
const printMessage = jest.fn();
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printError,
  printMessage,
  createTable: jest.fn(),
}));
// The colour of a word shows in the text, so a swapped colour is noticed.
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: {
    positive: (text) => `+${text}+`,
    negative: (text) => `-${text}-`,
    muted: (text) => text,
  },
}));
const confirm = jest.fn();
jest.unstable_mockModule('@inquirer/confirm', () => ({ default: confirm }));

const { installFeatureCli, validateFeature } =
  await import('../../src/ops/FeatureOps');

const ID = 'aiagent';
const FAILURES = [
  'config/repo.ds: /resourceMapping/explicitMapping/managed/alpha_aiagent: must not already exist',
  'config/managed: /objects/-: value already present at /objects/14',
];
// What the tenant sends, and what a library that states the outcome returns.
const rawInstallOk = { status: 200, message: 'Install complete.' };
const normalizedInstallOk = {
  status: 200,
  success: true,
  message: 'Install complete.',
  failures: [],
};
const rawValidateOk = {
  status: 200,
  success: true,
  message: 'Validate complete.',
  failures: [],
};
const rawValidateFailed = {
  status: 200,
  success: false,
  message: 'Validate complete. 2 failure(s).',
  failures: FAILURES,
};

/** The printed messages as `[type, text]`, in order. */
const printed = () =>
  printMessage.mock.calls.map(([text, type]) => [type, text]);
const printedOfType = (type) =>
  printed()
    .filter(([t]) => t === type)
    .map(([, text]) => text);
const setTerminal = (isTTY) =>
  Object.defineProperty(process.stdin, 'isTTY', {
    value: isTTY,
    configurable: true,
  });

let originalTty;
beforeEach(() => {
  jest.clearAllMocks();
  originalTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  idmFeature.hasIdmFeature.mockResolvedValue(false);
});
afterEach(() => {
  jest.clearAllMocks();
  if (originalTty) Object.defineProperty(process.stdin, 'isTTY', originalTty);
  else delete process.stdin.isTTY;
});

describe('installFeatureCli', () => {
  test.each([
    ['the body as Ping documents it, without success', rawInstallOk],
    ['a library that states the outcome', normalizedInstallOk],
    [
      'success true and an empty failures list',
      { ...rawInstallOk, success: true, failures: [] },
    ],
    [
      'an empty failures list without success',
      { ...rawInstallOk, failures: [] },
    ],
    ['failures that is not an array', { ...rawInstallOk, failures: 'none' }],
  ])('%s: prints the success line and succeeds', async (_name, body) => {
    idmFeature.installIdmFeature.mockResolvedValue(body);

    await expect(installFeatureCli(ID, true)).resolves.toBe(true);

    expect(idmFeature.installIdmFeature).toHaveBeenCalledTimes(1);
    expect(idmFeature.installIdmFeature).toHaveBeenCalledWith(ID);
    expect(printedOfType('success')).toEqual([`Installed feature "${ID}".`]);
    expect(printedOfType('error')).toEqual([]);
    expect(printError).not.toHaveBeenCalled();
  });

  test('the success line does not repeat the message of the library', async () => {
    idmFeature.installIdmFeature.mockResolvedValue(rawInstallOk);

    await installFeatureCli(ID, true);

    const text = printMessage.mock.calls.map(([t]) => t).join('\n');
    expect(text).not.toContain('Install complete.');
    expect(text).not.toContain('failed');
  });

  test('success false with failures: the message and each failure on its own line, and fails', async () => {
    idmFeature.installIdmFeature.mockResolvedValue({
      status: 200,
      success: false,
      message: 'Install did not complete. 2 failure(s).',
      failures: FAILURES,
    });

    await expect(installFeatureCli(ID, true)).resolves.toBe(false);

    expect(printedOfType('error')).toEqual([
      `Install failed: Install did not complete. 2 failure(s).\n  - ${FAILURES[0]}\n  - ${FAILURES[1]}`,
    ]);
    expect(printedOfType('success')).toEqual([]);
    expect(printError).not.toHaveBeenCalled();
  });

  test('failures without a success field is a failure', async () => {
    idmFeature.installIdmFeature.mockResolvedValue({
      status: 200,
      message: 'Install complete. 1 failure(s).',
      failures: [FAILURES[0]],
    });

    await expect(installFeatureCli(ID, true)).resolves.toBe(false);

    expect(printedOfType('error')).toEqual([
      `Install failed: Install complete. 1 failure(s).\n  - ${FAILURES[0]}`,
    ]);
    expect(printedOfType('success')).toEqual([]);
  });

  test('success true with failures listed is a failure', async () => {
    idmFeature.installIdmFeature.mockResolvedValue({
      ...normalizedInstallOk,
      failures: [FAILURES[1]],
    });

    await expect(installFeatureCli(ID, true)).resolves.toBe(false);

    expect(printedOfType('error')).toEqual([
      `Install failed: Install complete.\n  - ${FAILURES[1]}`,
    ]);
    expect(printedOfType('success')).toEqual([]);
  });

  test('success false without failures: only the message', async () => {
    idmFeature.installIdmFeature.mockResolvedValue({
      status: 200,
      success: false,
      message: 'Feature is locked.',
      failures: [],
    });

    await expect(installFeatureCli(ID, true)).resolves.toBe(false);

    expect(printedOfType('error')).toEqual([
      'Install failed: Feature is locked.',
    ]);
  });

  test('success false without a message: still says it failed', async () => {
    idmFeature.installIdmFeature.mockResolvedValue({
      status: 200,
      success: false,
      failures: [FAILURES[0]],
    });

    await expect(installFeatureCli(ID, true)).resolves.toBe(false);

    expect(printedOfType('error')).toEqual([
      `Install failed.\n  - ${FAILURES[0]}`,
    ]);
  });

  test('an already installed feature keeps its message, succeeds and does not install', async () => {
    idmFeature.hasIdmFeature.mockResolvedValue(true);

    await expect(installFeatureCli(ID, true)).resolves.toBe(true);

    expect(printed()).toEqual([
      ['info', `Feature "${ID}" is already installed.`],
    ]);
    expect(idmFeature.installIdmFeature).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  test('a request that fails (HTTP or network error) is reported by printError and fails', async () => {
    const error = new Error('Error installing IDM feature aiagent');
    idmFeature.installIdmFeature.mockRejectedValue(error);

    await expect(installFeatureCli(ID, true)).resolves.toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(printError).toHaveBeenCalledWith(
      error,
      `Error installing feature "${ID}"`
    );
    expect(printedOfType('success')).toEqual([]);
    expect(printedOfType('error')).toEqual([]);
  });

  test('a failed check for the installed feature fails before anything is installed', async () => {
    const error = new Error('Error reading IDM feature aiagent');
    idmFeature.hasIdmFeature.mockRejectedValue(error);

    await expect(installFeatureCli(ID, true)).resolves.toBe(false);

    expect(printError).toHaveBeenCalledWith(
      error,
      `Error installing feature "${ID}"`
    );
    expect(idmFeature.installIdmFeature).not.toHaveBeenCalled();
  });

  describe('confirmation (unchanged)', () => {
    const WARNING = `This installs the "${ID}" feature. This cannot be undone. Uninstalling or disabling a feature requires contacting Ping support and rolling back the environment.`;

    test('-y warns, does not ask and installs', async () => {
      idmFeature.installIdmFeature.mockResolvedValue(rawInstallOk);

      await expect(installFeatureCli(ID, true)).resolves.toBe(true);

      expect(printed()[0]).toEqual(['warn', WARNING]);
      expect(confirm).not.toHaveBeenCalled();
    });

    test('on a terminal it asks, defaulting to no, and installs on yes', async () => {
      setTerminal(true);
      confirm.mockResolvedValue(true);
      idmFeature.installIdmFeature.mockResolvedValue(rawInstallOk);

      await expect(installFeatureCli(ID, false)).resolves.toBe(true);

      expect(confirm).toHaveBeenCalledWith({
        message: `Install feature "${ID}"? This cannot be undone. Continue? (y|n):`,
        default: false,
      });
      expect(printed()[0]).toEqual(['warn', WARNING]);
      expect(idmFeature.installIdmFeature).toHaveBeenCalledTimes(1);
    });

    test('on a terminal, no aborts without installing', async () => {
      setTerminal(true);
      confirm.mockResolvedValue(false);

      await expect(installFeatureCli(ID, false)).resolves.toBe(false);

      expect(printedOfType('warn')).toEqual([WARNING, 'Install aborted.']);
      expect(idmFeature.installIdmFeature).not.toHaveBeenCalled();
    });

    test('without a terminal and without -y it refuses', async () => {
      setTerminal(false);

      await expect(installFeatureCli(ID, false)).resolves.toBe(false);

      expect(confirm).not.toHaveBeenCalled();
      expect(printedOfType('error')).toEqual([
        '\nRefusing to prompt for confirmation without an interactive terminal. Use -y/--yes to proceed non-interactively.',
      ]);
      expect(idmFeature.installIdmFeature).not.toHaveBeenCalled();
    });
  });
});

describe('validateFeature', () => {
  test.each([
    ['the response as the tenant sent it', rawValidateFailed],
    [
      'a library that states the outcome',
      { ...rawValidateFailed, failures: [...FAILURES] },
    ],
  ])(
    '%s: prints the summary and each failure under it, and succeeds',
    async (_name, body) => {
      idmFeature.validateIdmFeature.mockResolvedValue(body);

      await expect(validateFeature(ID)).resolves.toBe(true);

      expect(idmFeature.validateIdmFeature).toHaveBeenCalledTimes(1);
      expect(idmFeature.validateIdmFeature).toHaveBeenCalledWith(ID);
      expect(printed()).toEqual([
        [
          'data',
          `-Invalid-: Validate complete. 2 failure(s).\n  - ${FAILURES[0]}\n  - ${FAILURES[1]}`,
        ],
      ]);
      expect(printError).not.toHaveBeenCalled();
    }
  );

  test.each([
    ['the response as the tenant sent it', rawValidateOk],
    [
      'no failures field',
      { status: 200, success: true, message: 'Validate complete.' },
    ],
    [
      'no success field and no failures',
      { status: 200, message: 'Validate complete.', failures: [] },
    ],
    ['failures that is not an array', { ...rawValidateOk, failures: 'none' }],
  ])(
    'a feature that can be installed (%s): Valid, no failure lines',
    async (_name, body) => {
      idmFeature.validateIdmFeature.mockResolvedValue(body);

      await expect(validateFeature(ID)).resolves.toBe(true);

      expect(printed()).toEqual([['data', '+Valid+: Validate complete.']]);
    }
  );

  test('success false without a failures list (the response of an older tenant): the summary only', async () => {
    idmFeature.validateIdmFeature.mockResolvedValue({
      status: 200,
      success: false,
      message: 'Validate complete. Resources must NOT already exist.',
    });

    await expect(validateFeature(ID)).resolves.toBe(true);

    expect(printed()).toEqual([
      [
        'data',
        '-Invalid-: Validate complete. Resources must NOT already exist.',
      ],
    ]);
  });

  test('failures without a success field: Invalid', async () => {
    idmFeature.validateIdmFeature.mockResolvedValue({
      status: 200,
      message: 'Validate complete. 1 failure(s).',
      failures: [FAILURES[0]],
    });

    await expect(validateFeature(ID)).resolves.toBe(true);

    expect(printed()).toEqual([
      [
        'data',
        `-Invalid-: Validate complete. 1 failure(s).\n  - ${FAILURES[0]}`,
      ],
    ]);
  });

  test('success true with failures listed: Invalid, the failures are never hidden', async () => {
    idmFeature.validateIdmFeature.mockResolvedValue({
      ...rawValidateOk,
      failures: [FAILURES[1]],
    });

    await expect(validateFeature(ID)).resolves.toBe(true);

    expect(printed()).toEqual([
      ['data', `-Invalid-: Validate complete.\n  - ${FAILURES[1]}`],
    ]);
  });

  test('a result without a message prints the verdict alone', async () => {
    idmFeature.validateIdmFeature.mockResolvedValue({
      status: 200,
      success: true,
    });

    await expect(validateFeature(ID)).resolves.toBe(true);

    expect(printed()).toEqual([['data', '+Valid+']]);
  });

  test('an installed feature says so, succeeds and is not validated', async () => {
    idmFeature.hasIdmFeature.mockResolvedValue(true);

    await expect(validateFeature('groups')).resolves.toBe(true);

    expect(idmFeature.hasIdmFeature).toHaveBeenCalledWith('groups');
    expect(printed()).toEqual([
      ['info', 'Feature "groups" is already installed.'],
    ]);
    expect(idmFeature.validateIdmFeature).not.toHaveBeenCalled();
  });

  test('a feature that is not installed is validated after the check', async () => {
    idmFeature.hasIdmFeature.mockResolvedValue(false);
    idmFeature.validateIdmFeature.mockResolvedValue(rawValidateOk);

    await validateFeature(ID);

    expect(idmFeature.hasIdmFeature).toHaveBeenCalledWith(ID);
    expect(idmFeature.validateIdmFeature).toHaveBeenCalledTimes(1);
  });

  test('a request that fails (HTTP or network error) is reported by printError and fails', async () => {
    const error = new Error('Error validating IDM feature aiagent');
    idmFeature.validateIdmFeature.mockRejectedValue(error);

    await expect(validateFeature(ID)).resolves.toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(printError).toHaveBeenCalledWith(
      error,
      `Error validating feature "${ID}"`
    );
    expect(printMessage).not.toHaveBeenCalled();
  });

  test('a failed check for the installed feature fails before anything is validated', async () => {
    const error = new Error('Error reading IDM feature aiagent');
    idmFeature.hasIdmFeature.mockRejectedValue(error);

    await expect(validateFeature(ID)).resolves.toBe(false);

    expect(printError).toHaveBeenCalledWith(
      error,
      `Error validating feature "${ID}"`
    );
    expect(idmFeature.validateIdmFeature).not.toHaveBeenCalled();
  });
});
