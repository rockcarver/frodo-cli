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
 *   exits 0 (the check ran); when every failure says that the configuration is
 *   already in the tenant, one more line of advice follows; it asks the tenant
 *   for nothing but the validation (no read of the feature first);
 * - both work with the library that is pinned (the response as the tenant sent
 *   it) and with a library that states the outcome itself (all four fields).
 * - for a feature the library can diagnose (`aiagent`) the diagnosis follows the
 *   validation and a functional problem makes the check fail (#1300); any other
 *   feature prints what it printed before and sends the same requests;
 * The library and the terminal are spies: install is irreversible, so no test
 * reaches a tenant.
 */

const idmFeature = {
  readIdmFeatures: jest.fn(),
  readIdmFeature: jest.fn(),
  hasIdmFeature: jest.fn(),
  validateIdmFeature: jest.fn(),
  installIdmFeature: jest.fn(),
  diagnoseIdmFeature: jest.fn(),
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
    heading: (text) => text,
    warning: (text) => text,
    command: (text) => text,
  },
}));
const confirm = jest.fn();
jest.unstable_mockModule('@inquirer/confirm', () => ({ default: confirm }));

const { FEATURES_WITH_DIAGNOSIS, installFeatureCli, validateFeature } =
  await import('../../src/ops/FeatureOps');
const { brokenDiagnosis, healthyDiagnosis, finding, unsupportedDiagnosis } =
  await import('../utils/FeatureDiagnosisFixtures.js');

const ID = 'aiagent';
const FAILURES = [
  'config/repo.ds: /resourceMapping/explicitMapping/managed/alpha_aiagent: must not already exist',
  'config/managed: /objects/-: value already present at /objects/14',
];
// What the tenant sends, and what a library that states the outcome returns.
// A failure that does not say that the configuration exists already.
const OTHER_FAILURE =
  'config/managed: /objects/-: value does not match the schema';
const ADVICE =
  'All failures say that the configuration is already in the tenant: the feature is installed, or its content came with the tenant. Installing it again cannot work.';
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
/** The advice messages, with the type each was printed as. */
const adviceMessages = () => printed().filter(([, text]) => text === ADVICE);
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
  // the library cannot diagnose this feature: the tests of the validation alone see no diagnosis
  idmFeature.diagnoseIdmFeature.mockResolvedValue({
    ...unsupportedDiagnosis,
    featureId: ID,
  });
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

describe('installFeatureCli, definitions that are in the tenant but differ (frodo-cli#1332)', () => {
  // The registry reads "not installed" when definitions of the feature are in
  // the tenant but differ from the original, and an install then adds them a
  // second time: for a feature the library can diagnose, the install asks the
  // diagnosis first and refuses, with -y too, and sends nothing to the install
  // endpoint.
  const differences = [
    {
      object: 'alpha_aiagent',
      location: 'onDelete.source',
      cosmeticClass: 'whitespace',
    },
    {
      object: 'bravo_aiagent',
      location: 'schema.title',
      cosmeticClass: 'title',
    },
  ];
  const driftOf = (id, severity) =>
    finding(
      id,
      severity,
      '2 definition(s) of the feature differ from the original; that is why the registry reads not installed.',
      false,
      { differences }
    );
  const notInstalled = finding(
    'registry-not-installed',
    'warning',
    'The registry reports no installed version.'
  );
  const diagnosisOf = (...findings) => ({
    featureId: ID,
    supported: true,
    installedVersion: null,
    availableVersions: ['1'],
    findings,
  });

  beforeEach(() => {
    idmFeature.installIdmFeature.mockResolvedValue(rawInstallOk);
  });

  test.each([
    [
      'cosmetic drift that makes the registry read not installed (error)',
      'definitions-cosmetic-drift',
      'error',
    ],
    [
      'cosmetic drift while the feature works (warning)',
      'definitions-cosmetic-drift',
      'warning',
    ],
    ['structural drift', 'definitions-structural-drift', 'error'],
  ])(
    '%s: refused with -y, nothing sent to the install endpoint, exit 1',
    async (_name, id, severity) => {
      idmFeature.diagnoseIdmFeature.mockResolvedValue(
        diagnosisOf(notInstalled, driftOf(id, severity))
      );

      await expect(installFeatureCli(ID, true)).resolves.toBe(false);

      expect(idmFeature.diagnoseIdmFeature).toHaveBeenCalledTimes(1);
      expect(idmFeature.diagnoseIdmFeature).toHaveBeenCalledWith(ID);
      expect(idmFeature.installIdmFeature).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
      expect(printError).not.toHaveBeenCalled();
      const [text] = printedOfType('error');
      expect(printedOfType('error')).toHaveLength(1);
      expect(text).toContain(`Refusing to install the feature "${ID}"`);
      expect(text).toContain('would add them a second time');
      // the finding, with the differences under it, and what to do about it
      expect(text).toContain(
        '2 definition(s) of the feature differ from the original'
      );
      expect(text).toContain('alpha_aiagent  onDelete.source  whitespace');
      expect(text).toContain('bravo_aiagent  schema.title  title');
      expect(text).toContain(`frodo feature validate -i ${ID}`);
      expect(text).toContain(`frodo feature validate -i ${ID} --repair`);
      // the registry finding is not repeated: only the drift is the reason
      expect(text).not.toContain('The registry reports no installed version.');
      // no confirmation warning was printed either
      expect(printedOfType('warn')).toEqual([]);
    }
  );

  test('refused on a terminal without -y too: the user is not asked first', async () => {
    setTerminal(true);
    idmFeature.diagnoseIdmFeature.mockResolvedValue(
      diagnosisOf(
        notInstalled,
        driftOf('definitions-cosmetic-drift', 'warning')
      )
    );

    await expect(installFeatureCli(ID, false)).resolves.toBe(false);

    expect(confirm).not.toHaveBeenCalled();
    expect(idmFeature.installIdmFeature).not.toHaveBeenCalled();
    expect(printedOfType('warn')).toEqual([]);
  });

  test('refused without a terminal and without -y: the refusal names the drift, not the missing -y', async () => {
    setTerminal(false);
    idmFeature.diagnoseIdmFeature.mockResolvedValue(
      diagnosisOf(
        notInstalled,
        driftOf('definitions-structural-drift', 'error')
      )
    );

    await expect(installFeatureCli(ID, false)).resolves.toBe(false);

    const [text] = printedOfType('error');
    expect(text).toContain(`Refusing to install the feature "${ID}"`);
    expect(text).not.toContain('Refusing to prompt');
    expect(idmFeature.installIdmFeature).not.toHaveBeenCalled();
  });

  test('the diagnosis is asked before the confirmation', async () => {
    setTerminal(true);
    confirm.mockResolvedValue(true);
    const order = [];
    idmFeature.diagnoseIdmFeature.mockImplementation(async () => {
      order.push('diagnose');
      return diagnosisOf(notInstalled);
    });
    confirm.mockImplementation(async () => {
      order.push('confirm');
      return true;
    });

    await expect(installFeatureCli(ID, false)).resolves.toBe(true);

    expect(order).toEqual(['diagnose', 'confirm']);
  });

  test('no drift: a feature that is not installed is installed as before', async () => {
    idmFeature.diagnoseIdmFeature.mockResolvedValue(diagnosisOf(notInstalled));

    await expect(installFeatureCli(ID, true)).resolves.toBe(true);

    expect(idmFeature.diagnoseIdmFeature).toHaveBeenCalledTimes(1);
    expect(idmFeature.installIdmFeature).toHaveBeenCalledTimes(1);
    expect(idmFeature.installIdmFeature).toHaveBeenCalledWith(ID);
    expect(printedOfType('success')).toEqual([`Installed feature "${ID}".`]);
    expect(printedOfType('error')).toEqual([]);
  });

  test('a problem that is not a drift (a closed gate, a missing provider) does not keep the install from going ahead', async () => {
    idmFeature.diagnoseIdmFeature.mockResolvedValue(
      diagnosisOf(
        notInstalled,
        finding(
          'gate-closed',
          'error',
          'AM does not accept AI agents in the realm alpha.'
        ),
        finding(
          'provider-missing',
          'error',
          'The realm bravo has no OAuth 2.0 provider.',
          true
        )
      )
    );

    await expect(installFeatureCli(ID, true)).resolves.toBe(true);

    expect(idmFeature.installIdmFeature).toHaveBeenCalledTimes(1);
  });

  test('a diagnosis that says the library does not judge the feature does not keep it back', async () => {
    idmFeature.diagnoseIdmFeature.mockResolvedValue({
      ...unsupportedDiagnosis,
      featureId: ID,
      // even if findings were present, an unsupported diagnosis is not judged
      findings: [driftOf('definitions-cosmetic-drift', 'warning')],
    });

    await expect(installFeatureCli(ID, true)).resolves.toBe(true);

    expect(idmFeature.installIdmFeature).toHaveBeenCalledTimes(1);
  });

  test('a feature outside the list: the diagnosis is not asked, the requests are the ones it always sent', async () => {
    expect(FEATURES_WITH_DIAGNOSIS).not.toContain('groups');
    idmFeature.diagnoseIdmFeature.mockResolvedValue(
      diagnosisOf(driftOf('definitions-cosmetic-drift', 'error'))
    );

    await expect(installFeatureCli('groups', true)).resolves.toBe(true);

    expect(idmFeature.diagnoseIdmFeature).not.toHaveBeenCalled();
    expect(idmFeature.hasIdmFeature).toHaveBeenCalledTimes(1);
    expect(idmFeature.installIdmFeature).toHaveBeenCalledWith('groups');
  });

  test('an installed feature says so and the diagnosis is not asked', async () => {
    idmFeature.hasIdmFeature.mockResolvedValue(true);

    await expect(installFeatureCli(ID, true)).resolves.toBe(true);

    expect(idmFeature.diagnoseIdmFeature).not.toHaveBeenCalled();
    expect(idmFeature.installIdmFeature).not.toHaveBeenCalled();
  });

  test('a diagnosis that cannot be made is reported, fails the command and installs nothing', async () => {
    const error = new Error('Error diagnosing IDM feature aiagent');
    idmFeature.diagnoseIdmFeature.mockRejectedValue(error);

    await expect(installFeatureCli(ID, true)).resolves.toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(printError).toHaveBeenCalledWith(
      error,
      `Error installing feature "${ID}"`
    );
    expect(idmFeature.installIdmFeature).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
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
    '%s: prints the summary, each failure under it and the advice, and succeeds',
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
        ['data', ADVICE],
      ]);
      expect(printError).not.toHaveBeenCalled();
    }
  );

  test('asks the tenant for the validation only: the feature is not read first', async () => {
    idmFeature.validateIdmFeature.mockResolvedValue(rawValidateFailed);

    await validateFeature('groups');

    expect(idmFeature.validateIdmFeature).toHaveBeenCalledTimes(1);
    expect(idmFeature.hasIdmFeature).not.toHaveBeenCalled();
    expect(idmFeature.readIdmFeature).not.toHaveBeenCalled();
    expect(idmFeature.readIdmFeatures).not.toHaveBeenCalled();
    // a feature the library cannot diagnose costs no request beyond the validation (the recorded e2e test replays that)
    expect(idmFeature.diagnoseIdmFeature).not.toHaveBeenCalled();
  });

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
    'a feature that can be installed (%s): Valid, no failure lines, no advice',
    async (_name, body) => {
      idmFeature.validateIdmFeature.mockResolvedValue(body);

      await expect(validateFeature(ID)).resolves.toBe(true);

      expect(printed()).toEqual([['data', '+Valid+: Validate complete.']]);
    }
  );

  test('success false without a failures list (the response of an older tenant): the summary only, no advice', async () => {
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
      failures: [OTHER_FAILURE],
    });

    await expect(validateFeature(ID)).resolves.toBe(true);

    expect(printed()).toEqual([
      [
        'data',
        `-Invalid-: Validate complete. 1 failure(s).\n  - ${OTHER_FAILURE}`,
      ],
    ]);
  });

  test('success true with failures listed: Invalid, the failures are never hidden', async () => {
    idmFeature.validateIdmFeature.mockResolvedValue({
      ...rawValidateOk,
      failures: [OTHER_FAILURE],
    });

    await expect(validateFeature(ID)).resolves.toBe(true);

    expect(printed()).toEqual([
      ['data', `-Invalid-: Validate complete.\n  - ${OTHER_FAILURE}`],
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

  describe('advice when the configuration is in the tenant already', () => {
    const invalid = (failures) => ({
      status: 200,
      success: false,
      message: `Validate complete. ${failures.length} failure(s).`,
      failures,
    });

    test.each([
      [
        'is already present',
        'config/managed: /objects/3/schema: is already present',
      ],
      [
        'must not already exist',
        'config/repo.ds: /resourceMapping/explicitMapping/managed/alpha_aiagent: must not already exist',
      ],
      [
        'value already present',
        'config/managed: /objects/-: value already present at /objects/14',
      ],
    ])(
      'a failure with the wording "%s" alone gets the advice, after the failures',
      async (_wording, failure) => {
        idmFeature.validateIdmFeature.mockResolvedValue(invalid([failure]));

        await expect(validateFeature(ID)).resolves.toBe(true);

        expect(printed()).toEqual([
          [
            'data',
            `-Invalid-: Validate complete. 1 failure(s).\n  - ${failure}`,
          ],
          ['data', ADVICE],
        ]);
      }
    );

    test('all of the three wordings together get the advice once', async () => {
      const failures = [
        'config/managed: /objects/3/schema: is already present',
        FAILURES[0],
        FAILURES[1],
      ];
      idmFeature.validateIdmFeature.mockResolvedValue(invalid(failures));

      await validateFeature(ID);

      expect(adviceMessages()).toEqual([['data', ADVICE]]);
    });

    test('one failure that says something else: no advice, every failure still listed', async () => {
      idmFeature.validateIdmFeature.mockResolvedValue(
        invalid([FAILURES[0], OTHER_FAILURE, FAILURES[1]])
      );

      await expect(validateFeature(ID)).resolves.toBe(true);

      expect(printed()).toEqual([
        [
          'data',
          `-Invalid-: Validate complete. 3 failure(s).\n  - ${FAILURES[0]}\n  - ${OTHER_FAILURE}\n  - ${FAILURES[1]}`,
        ],
      ]);
    });

    test('the one other failure may come first or last', async () => {
      for (const failures of [
        [OTHER_FAILURE, FAILURES[0]],
        [FAILURES[0], OTHER_FAILURE],
      ]) {
        printMessage.mockClear();
        idmFeature.validateIdmFeature.mockResolvedValue(invalid(failures));

        await validateFeature(ID);

        expect(adviceMessages()).toEqual([]);
      }
    });

    test('an entry that is not a text among matching failures: no advice, the entry is shown', async () => {
      idmFeature.validateIdmFeature.mockResolvedValue(
        invalid([FAILURES[0], { reason: 'is already present' }])
      );

      await validateFeature(ID);

      expect(adviceMessages()).toEqual([]);
      expect(printedOfType('data')).toEqual([
        `-Invalid-: Validate complete. 2 failure(s).\n  - ${FAILURES[0]}\n  - {"reason":"is already present"}`,
      ]);
    });

    test('a failures list that is empty or not an array: no advice', async () => {
      for (const failures of [[], 'is already present', null]) {
        printMessage.mockClear();
        idmFeature.validateIdmFeature.mockResolvedValue({
          status: 200,
          success: false,
          message: 'Validate complete.',
          failures,
        });

        await validateFeature(ID);

        expect(adviceMessages()).toEqual([]);
      }
    });

    test('the advice is a message of its own, on the stream of the failures (data), not part of them', async () => {
      idmFeature.validateIdmFeature.mockResolvedValue(rawValidateFailed);

      await validateFeature(ID);

      expect(printMessage).toHaveBeenCalledTimes(2);
      expect(printMessage.mock.calls[0][0]).not.toContain(ADVICE);
      expect(printMessage.mock.calls[1]).toEqual([ADVICE, 'data']);
    });
  });

  describe('a feature id that the tenant does not know', () => {
    const notFound = () =>
      Object.assign(new Error('Error validating IDM feature nosuch'), {
        originalErrors: [
          Object.assign(new Error('Request failed with status code 404'), {
            httpStatus: 404,
            httpMessage: 'Resource &#39;feature/nosuch&#39; not found',
          }),
        ],
      });

    test('says so, lists the features of the tenant, points at feature list, and fails without the raw error', async () => {
      idmFeature.validateIdmFeature.mockRejectedValue(notFound());
      idmFeature.readIdmFeatures.mockResolvedValue([
        { _id: 'groups' },
        { _id: 'aiagent' },
      ]);

      await expect(validateFeature('nosuch')).resolves.toBe(false);

      expect(printed()).toEqual([
        [
          'error',
          'Feature "nosuch" does not exist on this tenant. Features of this tenant: groups, aiagent. Run "frodo feature list" to see which are installed.',
        ],
      ]);
      expect(printError).not.toHaveBeenCalled();
      expect(idmFeature.diagnoseIdmFeature).not.toHaveBeenCalled();
    });

    test('a list that cannot be read is left out, the message still says the feature does not exist', async () => {
      idmFeature.validateIdmFeature.mockRejectedValue(notFound());
      idmFeature.readIdmFeatures.mockRejectedValue(
        Object.assign(new Error('forbidden'), { httpStatus: 403 })
      );

      await expect(validateFeature('nosuch')).resolves.toBe(false);

      expect(printed()).toEqual([
        [
          'error',
          'Feature "nosuch" does not exist on this tenant. Run "frodo feature list" to see which are installed.',
        ],
      ]);
      expect(printError).not.toHaveBeenCalled();
    });

    test('an error that is not a 404 is not described as an unknown feature, and the list is not read', async () => {
      const error = Object.assign(new Error('Error validating IDM feature x'), {
        httpStatus: 500,
      });
      idmFeature.validateIdmFeature.mockRejectedValue(error);

      await expect(validateFeature('x')).resolves.toBe(false);

      expect(printError).toHaveBeenCalledWith(
        error,
        'Error validating feature "x"'
      );
      expect(idmFeature.readIdmFeatures).not.toHaveBeenCalled();
      expect(printedOfType('error')).toEqual([]);
    });

    test('a 404 from the diagnosis of a feature the tenant knows is an error of the diagnosis, not an unknown feature', async () => {
      idmFeature.validateIdmFeature.mockResolvedValue(rawValidateFailed);
      const error = notFound();
      idmFeature.diagnoseIdmFeature.mockRejectedValue(error);

      await expect(validateFeature('aiagent')).resolves.toBe(false);

      expect(printError).toHaveBeenCalledWith(
        error,
        'Error validating feature "aiagent"'
      );
      expect(idmFeature.readIdmFeatures).not.toHaveBeenCalled();
      expect(printedOfType('error')).toEqual([]);
    });
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
});

/**
 * `frodo feature validate` for a feature the library can diagnose (#1300): the
 * diagnosis follows the validation; a functional problem (a finding of
 * severity error) makes the check fail, so that it can serve in a pipeline;
 * warnings never do; `--json` prints the diagnosis and nothing else.
 */
describe('validateFeature, the diagnosis', () => {
  beforeEach(() => {
    idmFeature.validateIdmFeature.mockResolvedValue(rawValidateFailed);
  });

  test('the library can diagnose aiagent, and a plain validate of any other feature does not ask it', () => {
    expect(FEATURES_WITH_DIAGNOSIS).toEqual(['aiagent']);
  });

  test('prints the diagnosis first, then the validation and its advice, all on stdout', async () => {
    idmFeature.diagnoseIdmFeature.mockResolvedValue(healthyDiagnosis);

    await expect(validateFeature('aiagent')).resolves.toBe(true);

    expect(idmFeature.diagnoseIdmFeature).toHaveBeenCalledWith('aiagent');
    const types = printMessage.mock.calls.map(([, type]) => type);
    expect(types).toEqual(['data', 'data', 'data']);
    expect(printMessage.mock.calls[0][0]).toContain(
      'Diagnosis of feature "aiagent":'
    );
    expect(printMessage.mock.calls[0][0]).toContain('No problem found.');
    expect(printMessage.mock.calls[1][0]).toContain('-Invalid-: Validate');
    expect(printMessage.mock.calls[2]).toEqual([ADVICE, 'data']);
  });

  test('the diagnosis is still asked for after the validation: the requests and their order did not change', async () => {
    idmFeature.diagnoseIdmFeature.mockResolvedValue(healthyDiagnosis);

    await validateFeature('aiagent');

    expect(
      idmFeature.validateIdmFeature.mock.invocationCallOrder[0]
    ).toBeLessThan(idmFeature.diagnoseIdmFeature.mock.invocationCallOrder[0]);
  });

  test('a functional problem fails the check, and the diagnosis is still printed', async () => {
    idmFeature.diagnoseIdmFeature.mockResolvedValue(brokenDiagnosis);

    await expect(validateFeature('aiagent')).resolves.toBe(false);

    expect(printMessage.mock.calls[0][0]).toContain(
      '4 functional problems, 2 warnings; 3 repairable.'
    );
    expect(printMessage.mock.calls[0][0]).toContain('--repair');
    expect(printMessage.mock.calls[1][0]).toContain('-Invalid-: Validate');
    expect(printError).not.toHaveBeenCalled();
  });

  test('warnings alone do not fail the check', async () => {
    idmFeature.diagnoseIdmFeature.mockResolvedValue({
      ...healthyDiagnosis,
      findings: [
        finding('registry-not-installed', 'warning', 'No installed version.'),
        finding('definitions-cosmetic-drift', 'warning', 'Cosmetic.', false),
      ],
    });

    await expect(validateFeature('aiagent')).resolves.toBe(true);
  });

  test('a diagnosis that says the library does not judge the feature prints nothing more', async () => {
    idmFeature.diagnoseIdmFeature.mockResolvedValue({
      ...unsupportedDiagnosis,
      featureId: 'aiagent',
    });

    await expect(validateFeature('aiagent')).resolves.toBe(true);

    expect(printMessage).toHaveBeenCalledTimes(2);
  });

  test('a diagnosis that cannot be made is an error: printed, and the check fails', async () => {
    const error = new Error('Error diagnosing IDM feature aiagent');
    idmFeature.diagnoseIdmFeature.mockRejectedValue(error);

    await expect(validateFeature('aiagent')).resolves.toBe(false);

    expect(printError).toHaveBeenCalledWith(
      error,
      'Error validating feature "aiagent"'
    );
  });

  test('a diagnosis that cannot be made does not take the validation with it: it and its advice are printed, then the error', async () => {
    idmFeature.diagnoseIdmFeature.mockRejectedValue(
      new Error('Error diagnosing IDM feature aiagent')
    );

    await expect(validateFeature('aiagent')).resolves.toBe(false);

    expect(printed()).toEqual([
      [
        'data',
        `-Invalid-: Validate complete. 2 failure(s).\n  - ${FAILURES[0]}\n  - ${FAILURES[1]}`,
      ],
      ['data', ADVICE],
    ]);
    expect(printError).toHaveBeenCalledTimes(1);
  });

  describe('--json', () => {
    test('prints the diagnosis as JSON and nothing else: no validation, no advice', async () => {
      idmFeature.diagnoseIdmFeature.mockResolvedValue(brokenDiagnosis);

      await expect(validateFeature('aiagent', { json: true })).resolves.toBe(
        false
      );

      expect(idmFeature.validateIdmFeature).not.toHaveBeenCalled();
      expect(printMessage).toHaveBeenCalledTimes(1);
      const [text, type] = printMessage.mock.calls[0];
      expect(type).toBe('data');
      expect(JSON.parse(text)).toEqual(brokenDiagnosis);
    });

    test('exits like the text form: a healthy tenant passes', async () => {
      idmFeature.diagnoseIdmFeature.mockResolvedValue(healthyDiagnosis);

      await expect(validateFeature('aiagent', { json: true })).resolves.toBe(
        true
      );
    });

    test('a feature the library cannot diagnose: the library says so, in JSON, and the check passes', async () => {
      idmFeature.diagnoseIdmFeature.mockResolvedValue(unsupportedDiagnosis);

      await expect(validateFeature('groups', { json: true })).resolves.toBe(
        true
      );

      expect(JSON.parse(printMessage.mock.calls[0][0])).toEqual(
        unsupportedDiagnosis
      );
    });

    test('a diagnosis that cannot be made is printed as an error, not as JSON', async () => {
      const error = new Error('boom');
      idmFeature.diagnoseIdmFeature.mockRejectedValue(error);

      await expect(validateFeature('aiagent', { json: true })).resolves.toBe(
        false
      );

      expect(printError).toHaveBeenCalledWith(
        error,
        'Error validating feature "aiagent"'
      );
      expect(printMessage).not.toHaveBeenCalled();
    });
  });
});
