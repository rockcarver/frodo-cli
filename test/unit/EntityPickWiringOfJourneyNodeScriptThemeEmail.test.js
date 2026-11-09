import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Command } from 'commander';

/**
 * Decision record 0038: a command in a family with a registered picker declares
 * nothing and calls no resolver; the framework fills the missing option inside
 * `getTokens`, after the login. So the action of such a command must log in
 * first and read the option afterwards. Driven here for the commands of
 * journey, node, script, theme and email template that needed that change:
 * `getTokens` is a stub that writes the option the way the framework does.
 */

const getTokens = jest.fn();
const printMessage = jest.fn();
const verboseMessage = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();

const ops = {
  JourneyOps: [
    'deleteJourney',
    'deleteJourneys',
    'disableJourney',
    'enableJourney',
    'exportJourneyToFile',
    'exportJourneysToFile',
    'exportJourneysToFiles',
  ],
  NodeOps: [
    'deleteCustomNode',
    'deleteCustomNodes',
    'exportCustomNodesToFile',
    'exportCustomNodesToFiles',
    'exportCustomNodeToFile',
  ],
  ScriptOps: [
    'deleteAllScripts',
    'deleteScriptId',
    'deleteScriptName',
    'describeScript',
    'exportScriptByNameToFile',
    'exportScriptsToFile',
    'exportScriptsToFiles',
    'exportScriptToFile',
  ],
  ThemeOps: [
    'deleteTheme',
    'deleteThemeByName',
    'deleteThemes',
    'exportThemeById',
    'exportThemeByName',
    'exportThemesToFile',
    'exportThemesToFiles',
  ],
  EmailTemplateOps: [
    'deleteAllEmailTemplates',
    'deleteEmailTemplateById',
    'exportEmailTemplatesToFile',
    'exportEmailTemplatesToFiles',
    'exportEmailTemplateToFile',
  ],
};
const fn = {};
for (const [module, names] of Object.entries(ops)) {
  for (const name of names) fn[name] = jest.fn();
  jest.unstable_mockModule(`../../src/ops/${module}`, () =>
    Object.fromEntries(names.map((name) => [name, fn[name]]))
  );
}

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    utils: {
      constants: {
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
      },
    },
  },
  state: { getRealm: () => 'alpha', getVerbose: () => false },
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
    requireOneOf() {
      return this;
    }
    multiOp() {
      return this;
    }
  },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  verboseMessage,
}));
jest.unstable_mockModule('../../src/utils/Console.js', () => ({
  printMessage,
  verboseMessage,
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { positive: (text) => text, command: (text) => text },
}));
jest.unstable_mockModule('../../src/utils/BulkDeleteGuard', () => ({
  checkBulkDelete,
  confirmBulkDelete,
}));

const commands = {
  'journey/journey-delete': (
    await import('../../src/cli/journey/journey-delete')
  ).default,
  'journey/journey-disable': (
    await import('../../src/cli/journey/journey-disable')
  ).default,
  'journey/journey-enable': (
    await import('../../src/cli/journey/journey-enable')
  ).default,
  'journey/journey-export': (
    await import('../../src/cli/journey/journey-export')
  ).default,
  'node/node-delete': (await import('../../src/cli/node/node-delete')).default,
  'node/node-export': (await import('../../src/cli/node/node-export')).default,
  'script/script-delete': (await import('../../src/cli/script/script-delete'))
    .default,
  'script/script-describe': (
    await import('../../src/cli/script/script-describe')
  ).default,
  'script/script-export': (await import('../../src/cli/script/script-export'))
    .default,
  'theme/theme-delete': (await import('../../src/cli/theme/theme-delete'))
    .default,
  'theme/theme-export': (await import('../../src/cli/theme/theme-export'))
    .default,
  'email/email-template-delete': (
    await import('../../src/cli/email/email-template-delete')
  ).default,
  'email/email-template-export': (
    await import('../../src/cli/email/email-template-export')
  ).default,
};

/** `single` is the operation on the picked entity, `bulk` the one behind -a (if any), `empty` what a realm with nothing to pick from does. */
const TABLE = [
  {
    file: 'journey/journey-delete',
    option: 'journeyId',
    single: 'deleteJourney',
    bulk: 'deleteJourneys',
    empty: { code: 0, message: 'No journeys found to delete.' },
  },
  {
    file: 'journey/journey-disable',
    option: 'journeyId',
    single: 'disableJourney',
    empty: { code: 1 },
  },
  {
    file: 'journey/journey-enable',
    option: 'journeyId',
    single: 'enableJourney',
    empty: { code: 1 },
  },
  {
    file: 'journey/journey-export',
    option: 'journeyId',
    single: 'exportJourneyToFile',
    bulk: 'exportJourneysToFile',
    empty: { code: 1 },
  },
  {
    file: 'node/node-delete',
    option: 'nodeId',
    single: 'deleteCustomNode',
    bulk: 'deleteCustomNodes',
    empty: { code: 0, message: 'No custom nodes found to delete.' },
  },
  {
    file: 'node/node-export',
    option: 'nodeId',
    single: 'exportCustomNodeToFile',
    bulk: 'exportCustomNodesToFile',
    empty: { code: 1, message: 'No custom nodes found to export.' },
  },
  {
    file: 'script/script-delete',
    option: 'scriptId',
    single: 'deleteScriptId',
    bulk: 'deleteAllScripts',
    empty: { code: 0, message: 'No scripts found to delete.' },
  },
  {
    file: 'script/script-describe',
    option: 'scriptId',
    single: 'describeScript',
    empty: { code: 1 },
  },
  {
    file: 'script/script-export',
    option: 'scriptId',
    single: 'exportScriptToFile',
    bulk: 'exportScriptsToFile',
    empty: { code: 1, message: 'No scripts found to export.' },
  },
  {
    file: 'theme/theme-delete',
    option: 'themeId',
    single: 'deleteTheme',
    bulk: 'deleteThemes',
    empty: { code: 0, message: 'No themes found to delete.' },
  },
  {
    file: 'theme/theme-export',
    option: 'themeId',
    single: 'exportThemeById',
    bulk: 'exportThemesToFile',
    empty: { code: 1 },
  },
  {
    file: 'email/email-template-delete',
    option: 'templateId',
    single: 'deleteEmailTemplateById',
    bulk: 'deleteAllEmailTemplates',
    empty: { code: 0, message: 'No email templates found to delete.' },
  },
  {
    file: 'email/email-template-export',
    option: 'templateId',
    single: 'exportEmailTemplateToFile',
    bulk: 'exportEmailTemplatesToFile',
    empty: { code: 1 },
  },
];

async function run(file, options = {}) {
  process.exitCode = 0;
  const program = commands[file]();
  for (const [key, value] of Object.entries(options)) {
    program.setOptionValue(key, value);
  }
  // the framework resolves the entity pick in getTokens: this stub does the same
  getTokens.mockImplementation(async () => {
    if (run.pick) program.setOptionValue(run.pick.option, run.pick.value);
    return run.login;
  });
  await program._actionHandler.call(program, [
    undefined,
    'alpha',
    undefined,
    undefined,
  ]);
  return process.exitCode;
}

beforeEach(() => {
  jest.resetAllMocks();
  for (const operation of Object.values(fn)) operation.mockResolvedValue(true);
  checkBulkDelete.mockReturnValue(true);
  confirmBulkDelete.mockResolvedValue(true);
  run.login = true;
  run.pick = undefined;
});

describe.each(TABLE)('$file', ({ file, option, single, bulk, empty }) => {
  it('runs on the entity the framework picks inside the login', async () => {
    run.pick = { option, value: 'picked' };
    expect(await run(file)).toBe(0);
    expect(getTokens).toHaveBeenCalledTimes(1);
    expect(fn[single]).toHaveBeenCalledTimes(1);
    expect(fn[single].mock.calls[0][0]).toBe('picked');
  });

  it('logs in once and runs on the entity that the command line named', async () => {
    expect(await run(file, { [option]: 'typed' })).toBe(0);
    expect(getTokens).toHaveBeenCalledTimes(1);
    expect(fn[single].mock.calls[0][0]).toBe('typed');
  });

  it('runs nothing and exits 1 when the login fails or the pick is declined', async () => {
    run.login = false;
    run.pick = { option, value: 'picked' };
    expect(await run(file)).toBe(1);
    for (const operation of Object.values(fn)) {
      expect(operation).not.toHaveBeenCalled();
    }
  });

  it('runs nothing else when the realm has nothing to pick from', async () => {
    expect(await run(file)).toBe(empty.code);
    for (const operation of Object.values(fn)) {
      expect(operation).not.toHaveBeenCalled();
    }
    if (empty.message) {
      expect(printMessage.mock.calls.map((call) => call[0])).toContain(
        empty.message
      );
    }
  });

  if (bulk) {
    it('does the bulk operation for -a, and never runs the single one', async () => {
      expect(await run(file, { all: true })).toBe(0);
      expect(fn[bulk]).toHaveBeenCalledTimes(1);
      expect(fn[single]).not.toHaveBeenCalled();
    });
  }
});
