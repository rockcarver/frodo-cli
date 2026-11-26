import { jest } from '@jest/globals';
import { Command, Option } from 'commander';
import { EXPECTED_SELECTORS } from './ConfigManagerSelectorRows.js';

/**
 * The delete guard and the wiring of the selectors of the `config-manager
 * delete` commands, for every row of the selectors: the action of each command
 * runs with the selector typed in every spelling, and the REAL bulk-delete
 * guard (a command that can delete more than the one object it names asks
 * first:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md)
 * decides, with no terminal and no -y:
 *
 * - a named delete (`-i`, `-n`, `--name`, the long forms) never asks, is never
 *   refused and never needs `-y`, and the ops function gets the value in the
 *   position of the id or of the name and nothing in the other. A slip here is
 *   the main risk of the step: a condition that still reads the old attribute
 *   makes `-i x` look like "no selector", so the command refuses or asks, or,
 *   with `-y` in a script, deletes everything;
 * - a delete without a selector is refused before the login, and with `-y` or
 *   `-d` it goes on, as before;
 * - an empty value of a selector, in every spelling, is refused while the
 *   command line is parsed: before the guard, the login and the ops function,
 *   even with `-y`; a value of blanks is never "all" either.
 *
 * The ops functions are fakes: what they do with an id is in
 * FrConfigScriptDelete.test.js, FrConfigCustomNodesDelete.test.js,
 * FrConfigThemeDelete.test.js and ApplicationConfigDelete.test.js, the options are in
 * ConfigManagerSelectors.test.js, and the commands that are checked one by one
 * are in the ConfigManagerDelete*Command tests. This is the delete twin of
 * ConfigManagerPushSelectorWiring.test.js, one entry for each delete row of the
 * selectors.
 *
 * `id` and `name` are the positions of the id and of the name in the arguments
 * of the ops function; a type that has an identifier only (`name` null) gets
 * the value of `-n` and `--name` in the position of the id. `extra` are
 * arguments that the command needs to run with a selector (a telemetry
 * exporter needs its category).
 */

const WIRING = {
  apps: {
    module: 'ops/ApplicationConfigDeleteOps',
    fn: 'configManagerDeleteApplications',
    others: ['showApplicationDeletePlan'],
    id: 4,
    name: 0,
  },
  connectors: {
    module: 'configManagerOps/FrConfigConnectorDefinitionsOps',
    fn: 'configManagerDeleteConnectorDefinitions',
    id: 0,
    name: null,
  },
  'connector-mappings': {
    module: 'configManagerOps/FrConfigConnectorMappingOps',
    fn: 'configManagerDeleteMappings',
    id: 0,
    name: null,
  },
  cors: {
    module: 'configManagerOps/FrConfigCorsOps',
    fn: 'configManagerDeleteCors',
    id: 0,
    name: null,
  },
  nodes: {
    module: 'configManagerOps/FrConfigCustomNodesOps',
    fn: 'configManagerDeleteCustomNodes',
    id: 3,
    name: 0,
  },
  endpoints: {
    module: 'configManagerOps/FrConfigEndpointsOps',
    fn: 'configManagerDeleteEndpoints',
    id: 0,
    name: null,
  },
  journeys: {
    module: 'configManagerOps/FrConfigJourneysOps',
    fn: 'configManagerDeleteJourneys',
    id: 0,
    name: null,
  },
  scripts: {
    module: 'configManagerOps/FrConfigScriptOps',
    fn: 'configManagerDeleteScripts',
    id: 5,
    name: 2,
  },
  themes: {
    module: 'configManagerOps/FrConfigThemeOps',
    fn: 'configManagerDeleteThemes',
    id: 4,
    name: 0,
  },
  'email-templates': {
    module: 'configManagerOps/FrConfigEmailTemplatesOps',
    fn: 'configManagerDeleteEmailTemplates',
    id: 0,
    name: null,
  },
  secrets: {
    module: 'configManagerOps/FrConfigSecretOps',
    fn: 'configManagerDeleteSecrets',
    others: ['showSecretDeletePlan'],
    id: 0,
    name: null,
  },
  'terms-and-conditions': {
    module: 'configManagerOps/FrConfigTermsAndConditionsOps',
    fn: 'configManagerDeleteTermsAndConditions',
    id: 0,
    name: null,
  },
  variables: {
    module: 'configManagerOps/FrConfigVariableOps',
    fn: 'configManagerDeleteVariables',
    id: 0,
    name: null,
  },
  locales: {
    module: 'configManagerOps/FrConfigLocalesOps',
    fn: 'configManagerDeleteLocales',
    id: 0,
    name: null,
  },
  'oauth-cimd-profiles': {
    module: 'ops/CIMDProfileConfigOps',
    fn: 'configManagerDeleteCIMDProfiles',
    others: ['showCIMDProfileDeletePlan'],
    id: 0,
    name: null,
  },
  'oauth-issuers': {
    module: 'ops/OAuth2TrustedJwtIssuerConfigOps',
    fn: 'configManagerDeleteTrustedJwtIssuers',
    others: ['showTrustedJwtIssuerDeletePlan'],
    id: 0,
    name: null,
  },
  'oauth-software-publishers': {
    module: 'ops/SoftwarePublisherConfigOps',
    fn: 'configManagerDeleteSoftwarePublishers',
    others: ['showSoftwarePublisherDeletePlan'],
    id: 0,
    name: null,
  },
  'remote-servers': {
    module: 'configManagerOps/FrConfigRemoteServersOps',
    fn: 'configManagerDeleteRemoteServers',
    id: 0,
    name: null,
  },
  services: {
    module: 'configManagerOps/FrConfigServiceOps',
    fn: 'configManagerDeleteServices',
    id: 0,
    name: null,
  },
  schedules: {
    module: 'configManagerOps/FrConfigSchedulesOps',
    fn: 'configManagerDeleteSchedules',
    id: 0,
    name: null,
  },
  'secretstore-mappings': {
    module: 'configManagerOps/FrConfigSecretMappingsOps',
    fn: 'configManagerDeleteSecretMappings',
    id: 0,
    name: null,
  },
  telemetry: {
    module: 'configManagerOps/FrConfigTelemetryOps',
    fn: 'configManagerDeleteTelemetry',
    id: 1,
    name: null,
    extra: ['-c', 'otlp'],
  },
};

const getTokens = jest.fn();
const printMessage = jest.fn();
const confirm = jest.fn();
const ops = {};
for (const { module, fn, others = [] } of Object.values(WIRING)) {
  ops[fn] = jest.fn();
  jest.unstable_mockModule(`../../src/${module}`, () => ({
    [fn]: ops[fn],
    ...Object.fromEntries(others.map((name) => [name, jest.fn()])),
  }));
}

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  // the guard names the host and the realm in the question, which is never asked here
  state: {
    getHost: () => 'https://openam-matrix.example.com/am',
    getRealm: () => 'alpha',
  },
  frodo: {
    utils: {
      constants: {
        DEFAULT_REALM_KEY: '__default__realm__',
        CLASSIC_DEPLOYMENT_TYPE_KEY: 'classic',
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
      },
    },
  },
}));
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(args[0]);
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
    }

    handleDefaultArgsAndOpts() {}
    usesRealm() {
      return this;
    }
    multiOp() {
      return this;
    }
  },
  ListOption: class extends Option {},
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text },
}));
jest.unstable_mockModule('../../src/utils/interactive/PositionalArgs', () => ({
  realmOfRun: (_command, realm) => realm,
}));
// the real guard, with nobody to ask: no terminal
jest.unstable_mockModule('../../src/utils/interactive/PromptGateState', () => ({
  canPrompt: () => false,
}));
jest.unstable_mockModule('@inquirer/confirm', () => ({ default: confirm }));

const typeOf = (row) => row.command.split(' ').pop();
// the file of a command is named after the name it had first: a renamed command keeps its file
const fileOf = (row) => (row.formerly ?? row.command).split(' ').pop();
const deleteRows = EXPECTED_SELECTORS.filter((r) =>
  r.command.includes(' delete ')
);
const setups = {};
for (const row of deleteRows) {
  const type = typeOf(row);
  setups[type] = (
    await import(
      `../../src/cli/config-manager/config-manager-delete/config-manager-delete-${fileOf(row)}`
    )
  ).default;
}

/** The command of a type, made ready to refuse what the parser refuses without exiting the process. */
function program(type) {
  const command = setups[type]();
  command.exitOverride();
  command.configureOutput({ writeErr: () => {}, writeOut: () => {} });
  return command;
}

/** Runs the command with the arguments and returns what the ops function was called with, or undefined when it was not called; `result` is what the ops function resolves to. */
async function run(type, args, result = true) {
  const { fn, extra = [] } = WIRING[type];
  ops[fn].mockReset().mockResolvedValue(result);
  getTokens.mockReset().mockResolvedValue(true);
  printMessage.mockReset();
  confirm.mockReset();
  process.exitCode = 0;
  await program(type).parseAsync([...extra, ...args, 'matrix', 'alpha'], {
    from: 'user',
  });
  return ops[fn].mock.calls[0];
}

const refusals = () =>
  printMessage.mock.calls.filter(([text]) =>
    String(text).includes('Refusing to delete')
  );

afterEach(() => {
  process.exitCode = 0;
});

describe('the delete commands: a named delete never asks, and the selectors reach the ops function', () => {
  it('has an entry for every delete row of the selectors, and no pull or push row', () => {
    expect(deleteRows.map(typeOf).sort()).toEqual(Object.keys(WIRING).sort());
    expect(deleteRows).toHaveLength(22);
  });

  it.each(deleteRows.map((row) => [typeOf(row), row]))(
    '%s: -i and the long id go to the position of the id, and the delete is not asked about, not refused and needs no -y',
    async (type, row) => {
      const { id, name } = WIRING[type];

      for (const args of [['-i', 'x'], [row.id, 'x'], [`${row.id}=x`]]) {
        const call = await run(type, args);
        const typed = args.join(' ');

        expect([typed, call?.[id]]).toEqual([typed, 'x']);
        // a type with a name that can change: nothing in the position of the name
        if (name !== null) expect(call[name]).toBeUndefined();
        expect([typed, getTokens.mock.calls.length]).toEqual([typed, 1]);
        expect([typed, refusals().length]).toEqual([typed, 0]);
        expect(confirm).not.toHaveBeenCalled();
        expect([typed, process.exitCode]).toEqual([typed, 0]);
      }
    }
  );

  it.each(deleteRows.map((row) => [typeOf(row), row]))(
    '%s: -n, the long name and --name go to the position of the name (or of the id, for an identifier only), and the delete is not asked about, not refused and needs no -y',
    async (type, row) => {
      const { id, name } = WIRING[type];
      const where = name ?? id;
      const spellings = [
        ...(row.name === null
          ? row.aliases.includes('-n')
            ? [['-n', 'x']]
            : []
          : [['-n', 'x'], [row.name, 'x'], [`${row.name}=x`]]),
        ...(row.aliases.includes('--name')
          ? [['--name', 'x'], ['--name=x']]
          : []),
      ];
      expect(spellings.length).toBeGreaterThan(0);

      for (const args of spellings) {
        const call = await run(type, args);
        const typed = args.join(' ');

        expect([typed, call?.[where]]).toEqual([typed, 'x']);
        // a name leaves the position of the id empty
        if (name !== null) expect(call[id]).toBeUndefined();
        expect([typed, getTokens.mock.calls.length]).toEqual([typed, 1]);
        expect([typed, refusals().length]).toEqual([typed, 0]);
        expect(confirm).not.toHaveBeenCalled();
        expect([typed, process.exitCode]).toEqual([typed, 0]);
      }
    }
  );

  it.each(deleteRows.map((row) => [typeOf(row), row]))(
    '%s: without a selector the delete is refused before the login and nothing is deleted; -y goes on with nothing in the position of the id or the name; a dry run goes on without -y',
    async (type) => {
      const { id, name } = WIRING[type];

      const refused = await run(type, []);

      expect(refused).toBeUndefined();
      expect(getTokens).not.toHaveBeenCalled();
      expect(refusals()).toHaveLength(1);
      expect(printMessage.mock.calls[0][1]).toBe('error');
      expect(printMessage.mock.calls[0][0]).toContain('-y/--yes');
      expect(process.exitCode).toBe(1);

      const yes = await run(type, ['-y']);

      expect(yes).toBeDefined();
      expect(yes[id]).toBeUndefined();
      if (name !== null) expect(yes[name]).toBeUndefined();
      expect(getTokens).toHaveBeenCalledTimes(1);
      expect(refusals()).toHaveLength(0);
      expect(process.exitCode).toBe(0);

      const dry = await run(type, ['-d']);

      expect(dry).toBeDefined();
      expect(dry[id]).toBeUndefined();
      expect(refusals()).toHaveLength(0);
      expect(process.exitCode).toBe(0);
    }
  );
});

describe('the delete commands: what the ops function reports is the exit code', () => {
  // a delete that failed, or an id that was not there, must end the command with exit code 1: the ops functions say so by resolving false
  it.each(deleteRows.map((row) => [typeOf(row), row]))(
    '%s: a delete that the ops function reports as failed exits 1, one that it reports as done exits 0, for a named delete and for a delete of all',
    async (type) => {
      for (const args of [['-i', 'x'], ['-y']]) {
        const typed = args.join(' ');

        const failed = await run(type, args, false);

        expect([typed, failed !== undefined]).toEqual([typed, true]);
        expect([typed, process.exitCode]).toEqual([typed, 1]);

        const done = await run(type, args, true);

        expect([typed, done !== undefined]).toEqual([typed, true]);
        expect([typed, process.exitCode]).toEqual([typed, 0]);
      }
    }
  );
});

describe('the delete commands: an empty selector is refused before anything, a blank one is never "all"', () => {
  /** Every spelling of every selector of the row, typed with an empty value. */
  const empties = (row) => [
    ['-i', ''],
    [row.id, ''],
    [`${row.id}=`],
    ...(row.name === null
      ? row.aliases.includes('-n')
        ? [['-n', '']]
        : []
      : [['-n', ''], [row.name, ''], [`${row.name}=`]]),
    ...(row.aliases.includes('--name') ? [['--name', ''], ['--name=']] : []),
  ];

  it.each(deleteRows.map((row) => [typeOf(row), row]))(
    '%s: every spelling with an empty value is refused by the parser, even with -y, before the guard, the login and the ops function',
    async (type, row) => {
      for (const args of empties(row)) {
        const typed = args.join(' ');

        // -y would delete everything if the empty value were taken for "no selector"
        await expect(run(type, [...args, '-y'])).rejects.toMatchObject({
          code: 'commander.invalidArgument',
          exitCode: 1,
        });
        expect([typed, ops[WIRING[type].fn].mock.calls.length]).toEqual([
          typed,
          0,
        ]);
        expect([typed, getTokens.mock.calls.length]).toEqual([typed, 0]);
        expect([typed, printMessage.mock.calls.length]).toEqual([typed, 0]);
        expect(confirm).not.toHaveBeenCalled();
      }
    }
  );

  /** The commands that check a value of blanks themselves: they say so in their own words and go no further. */
  const REFUSES_BLANKS = new Set([
    'connectors',
    'connector-mappings',
    'cors',
    'secrets',
    'oauth-cimd-profiles',
    'oauth-issuers',
    'oauth-software-publishers',
    'locales',
    'remote-servers',
    'schedules',
    'secretstore-mappings',
    'services',
    'telemetry',
  ]);

  it.each(deleteRows.map((row) => [typeOf(row), row]))(
    '%s: a value of blanks is never "all": the command refuses it in its own words, or the ops function gets the blanks as the one thing to delete',
    async (type) => {
      const { id } = WIRING[type];

      const call = await run(type, ['-i', '  ', '-y']);

      if (REFUSES_BLANKS.has(type)) {
        // refused before the login and before the ops function, with the exit code 1
        expect(call).toBeUndefined();
        expect(getTokens).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
        expect(printMessage).toHaveBeenCalledWith(
          expect.stringContaining('must not be empty'),
          'error'
        );
        expect(refusals()).toHaveLength(0);
      } else {
        // the blanks name one object, which the ops function does not find: never all
        expect(call?.[id]).toBe('  ');
      }
    }
  );

  it('delete scripts: an empty prefix is refused by the parser, even with -y, as it would match every script', async () => {
    for (const args of [['-p', ''], ['--prefix', ''], ['--prefix=']]) {
      await expect(run('scripts', [...args, '-y'])).rejects.toMatchObject({
        code: 'commander.invalidArgument',
        exitCode: 1,
      });
      expect(ops.configManagerDeleteScripts).not.toHaveBeenCalled();
      expect(getTokens).not.toHaveBeenCalled();
    }
    // a prefix that is not empty still asks as a delete of more than one script does
    expect(await run('scripts', ['-p', 'Example'])).toBeUndefined();
    expect(refusals()).toHaveLength(1);
  });
});

describe('the delete commands with a name that can change: the id and the name exclude each other', () => {
  it.each(
    deleteRows
      .filter((row) => row.name !== null)
      .map((row) => [typeOf(row), row])
  )(
    '%s: -i with -n, in either order and with the alias, is refused before the guard, the login and the ops function',
    async (type, row) => {
      const alias = row.aliases.includes('--name') ? '--name' : row.name;

      for (const args of [
        ['-i', 'a', '-n', 'b'],
        ['-n', 'b', '-i', 'a'],
        [alias, 'b', '-i', 'a'],
        [row.id, 'a', row.name, 'b'],
      ]) {
        const typed = args.join(' ');

        await expect(run(type, [...args, '-y'])).rejects.toThrow(
          /cannot be used with option/
        );
        expect([typed, ops[WIRING[type].fn].mock.calls.length]).toEqual([
          typed,
          0,
        ]);
        expect([typed, getTokens.mock.calls.length]).toEqual([typed, 0]);
      }
    }
  );

  it('delete scripts: -i with -p is refused, and -n with -p is accepted as it always was', async () => {
    await expect(run('scripts', ['-i', 'a', '-p', 'b', '-y'])).rejects.toThrow(
      /cannot be used with option/
    );
    expect(ops.configManagerDeleteScripts).not.toHaveBeenCalled();

    const call = await run('scripts', ['-n', 'a', '-p', 'b']);

    // the prefix is handed over and ignored by the ops function, as for a name before
    expect(call[2]).toBe('a');
    expect(call[0]).toEqual(['b']);
    expect(refusals()).toHaveLength(0);
  });
});

describe('the usage examples of the delete commands show the primary spelling of the selector', () => {
  /** The help of the command as `-hhh` prints it after the options, as [title, command line] pairs of the usage examples. */
  const examplesOf = (type) => {
    const command = setups[type]();
    let help = '';
    command.configureOutput({ writeOut: (text) => (help += text) });
    command.outputHelp();
    const lines = help.split('\n');
    return lines
      .map((line, index) => [lines[index - 1] ?? '', line])
      .filter(([, line]) => line.trimStart().startsWith('$ frodo '));
  };

  it.each(deleteRows.map((row) => [typeOf(row), row]))(
    '%s: no example types the alias, and no example that types -i is titled "by name"',
    (type, row) => {
      const examples = examplesOf(type);

      expect(examples.length).toBeGreaterThan(0);
      for (const [title, line] of examples) {
        // -n is the name option of a type with a name that can change; on the others it is an alias, which no example uses
        if (row.name === null) expect(line).not.toMatch(/ (-n|--name)[ =]/);
        if (/ -i /.test(line)) expect(title).not.toMatch(/by name/);
      }
    }
  );

  it.each(
    deleteRows
      .filter((row) => row.name !== null)
      .map((row) => [typeOf(row), row])
  )('%s: one example names the new -i, so that -hhh shows it', (type) => {
    const withId = examplesOf(type).filter(([, line]) => / -i /.test(line));

    expect(withId).toHaveLength(1);
    // the example names one object and carries neither -y nor -d: a named delete needs neither
    expect(withId[0][1]).not.toMatch(/ -[yd] /);
  });
});
