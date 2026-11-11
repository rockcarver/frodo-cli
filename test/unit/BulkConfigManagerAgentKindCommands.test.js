import { jest } from '@jest/globals';
import { Command, Option } from 'commander';

/**
 * The `pull` and `push` commands of the kinds `cimd-profiles` and
 * `trusted-jwt-issuers` as record 0040 asks of a command that runs several
 * operations: each one adds the shared `--allow-failures` option (`.multiOp()`),
 * hands its value on to its ops function, and exits 1 when the ops function
 * reports a failure or when the login fails. The commands name no deployment type:
 * the type exists on all of them and is a non-event where it is not offered, so
 * the login is the plain `getTokens()`. What the ops functions do is covered by the
 * tests of the ops modules; the `delete` commands have their own tests.
 */

const OPS = {
  CIMDProfileConfigOps: [
    'configManagerExportCIMDProfiles',
    'configManagerImportCIMDProfiles',
  ],
  OAuth2TrustedJwtIssuerConfigOps: [
    'configManagerExportTrustedJwtIssuers',
    'configManagerImportTrustedJwtIssuers',
  ],
};
const ops = {};
for (const [module, names] of Object.entries(OPS)) {
  const exports = Object.fromEntries(names.map((name) => [name, jest.fn()]));
  Object.assign(ops, exports);
  jest.unstable_mockModule(`../../src/ops/${module}`, () => exports);
}
const getTokens = jest.fn();
let constructed;

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  state: {},
  frodo: {
    utils: {
      constants: {
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
        DEFAULT_REALM_KEY: '__default__realm__',
      },
    },
  },
}));
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(args[0]);
      constructed = args;
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
    }

    handleDefaultArgsAndOpts() {}
    usesRealm() {
      this.usesRealmCalled = true;
      return this;
    }
    multiOp() {
      this.multiOpCalled = true;
      return this;
    }
  },
  ListOption: class extends Option {},
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: jest.fn(),
  verboseMessage: jest.fn(),
}));

/**
 * `args(allowFailures)` is what the ops function must be called with when the
 * command is invoked for the realm `alpha` with `options`.
 */
const COMMANDS = [
  {
    name: 'config-manager pull cimd-profiles',
    file: 'config-manager-pull/config-manager-pull-cimd-profiles',
    fn: 'configManagerExportCIMDProfiles',
    options: { name: 'zion-agents', file: 'cimd-profiles.json' },
    args: (allowFailures) => [
      'zion-agents',
      'alpha',
      false,
      allowFailures,
      'cimd-profiles.json',
    ],
  },
  {
    name: 'config-manager push cimd-profiles',
    file: 'config-manager-push/config-manager-push-cimd-profiles',
    fn: 'configManagerImportCIMDProfiles',
    options: { name: 'zion-agents' },
    args: (allowFailures) => ['zion-agents', 'alpha', allowFailures],
  },
  {
    name: 'config-manager pull trusted-jwt-issuers',
    file: 'config-manager-pull/config-manager-pull-trusted-jwt-issuers',
    fn: 'configManagerExportTrustedJwtIssuers',
    options: { name: 'zion-issuer', file: 'trusted-jwt-issuers.json' },
    args: (allowFailures) => [
      'zion-issuer',
      'alpha',
      false,
      allowFailures,
      'trusted-jwt-issuers.json',
    ],
  },
  {
    name: 'config-manager push trusted-jwt-issuers',
    file: 'config-manager-push/config-manager-push-trusted-jwt-issuers',
    fn: 'configManagerImportTrustedJwtIssuers',
    options: { name: 'zion-issuer' },
    args: (allowFailures) => ['zion-issuer', 'alpha', allowFailures],
  },
];

const setups = {};
for (const c of COMMANDS) {
  setups[c.file] = (
    await import(`../../src/cli/config-manager/${c.file}`)
  ).default;
}

/** Runs the action of the command as commander does, with the given options. */
async function invoke(program, options) {
  process.exitCode = 0;
  for (const [key, value] of Object.entries(options)) {
    program.setOptionValue(key, value);
  }
  return program._actionHandler.call(program, [
    undefined,
    'alpha',
    undefined,
    undefined,
  ]);
}

describe.each(COMMANDS)('$name', (c) => {
  let exitCodeBefore;

  beforeEach(() => {
    jest.clearAllMocks();
    exitCodeBefore = process.exitCode;
    getTokens.mockResolvedValue(true);
    for (const op of Object.values(ops)) op.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  test('adds the shared --allow-failures option and uses the realm', () => {
    const program = setups[c.file]();
    expect(program.multiOpCalled).toBe(true);
    expect(program.usesRealmCalled).toBe(true);
  });

  test('names no deployment type, and logs in without a list', async () => {
    setups[c.file]();
    expect(constructed).toHaveLength(1);
    expect(constructed[0]).toBe(`frodo ${c.name}`);

    await invoke(setups[c.file](), c.options);

    expect(getTokens).toHaveBeenCalledWith();
  });

  test.each([true, undefined])(
    'hands the value of --allow-failures (%s) to the ops function',
    async (allowFailures) => {
      await invoke(setups[c.file](), { ...c.options, allowFailures });

      expect(ops[c.fn].mock.calls).toEqual([c.args(allowFailures)]);
      expect(process.exitCode).toBe(0);
    }
  );

  test('exits 1 when the ops function reports a failure', async () => {
    ops[c.fn].mockResolvedValue(false);

    await invoke(setups[c.file](), c.options);

    expect(ops[c.fn].mock.calls).toHaveLength(1);
    expect(process.exitCode).toBe(1);
  });

  test('exits 1 and does nothing when the login fails', async () => {
    getTokens.mockResolvedValue(false);

    await invoke(setups[c.file](), c.options);

    for (const op of Object.values(ops)) expect(op.mock.calls).toHaveLength(0);
    expect(process.exitCode).toBe(1);
  });

  test('has no mandatory option: the plain form is the command and the connection', () => {
    const program = setups[c.file]();
    expect(program.options.filter((o) => o.mandatory)).toEqual([]);
  });
});
