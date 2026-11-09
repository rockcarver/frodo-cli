import { jest } from '@jest/globals';
import { Command, Option } from 'commander';

/**
 * The option sets and the dispatch of `connector list`, `describe`, `export`,
 * `import` and `delete` (frodo-cli#374), parsed from real command lines with
 * the ops functions replaced. What the ops functions do with the arguments is
 * covered by ConnectorVerbsOps.test.js.
 * - `-i` is the id of the connector and is taken from the family's picker
 *   (decision record 0038) after the login, so the commands carry no picker
 *   code and log in first;
 * - the commands that can run many operations are multi-operation commands
 *   (record 0040) and say what the user has to choose (requireOneOf);
 * - a delete of all connectors is refused without a terminal before it logs in
 *   (record 0037), and a delete of one named connector is not guarded.
 */

const getTokens = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();
const ops = {
  listConnectors: jest.fn(),
  describeConnector: jest.fn(),
  exportConnectorToFile: jest.fn(),
  exportConnectorsToFile: jest.fn(),
  exportConnectorsToFiles: jest.fn(),
  importConnectorFromFile: jest.fn(),
  importConnectorsFromFile: jest.fn(),
  importConnectorsFromFiles: jest.fn(),
  importFirstConnectorFromFile: jest.fn(),
  deleteConnector: jest.fn(),
  deleteConnectors: jest.fn(),
  enableConnector: jest.fn(),
  disableConnector: jest.fn(),
};

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  state: {},
  frodo: {
    utils: {
      constants: {
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
      },
    },
  },
}));
// what the real FrodoCommand adds, as far as the commands use it
const rules = new WeakMap();
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(...args);
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
      this.addOption(
        new Option(
          '--allow-failures',
          'Report operations that fail, but still exit with code 0.'
        )
      );
    }

    handleDefaultArgsAndOpts() {}

    requireOneOf(group) {
      rules.set(this, { ...(rules.get(this) ?? {}), oneOf: group });
      return this;
    }

    multiOp() {
      rules.set(this, { ...(rules.get(this) ?? {}), multiOp: true });
      return this;
    }
  },
  FrodoStubCommand: class extends Command {},
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/ops/ConnectorOps', () => ops);
jest.unstable_mockModule('../../src/utils/BulkDeleteGuard', () => ({
  checkBulkDelete,
  confirmBulkDelete,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: jest.fn(),
  verboseMessage: jest.fn(),
}));

const { default: setupList } =
  await import('../../src/cli/connector/connector-list');
const { default: setupDescribe } =
  await import('../../src/cli/connector/connector-describe');
const { default: setupExport } =
  await import('../../src/cli/connector/connector-export');
const { default: setupImport } =
  await import('../../src/cli/connector/connector-import');
const { default: setupDelete } =
  await import('../../src/cli/connector/connector-delete');

/** Parses a real command line; commander errors are thrown, not printed. */
async function parse(setup, ...argv) {
  const program = setup();
  program.exitOverride();
  program.configureOutput({ writeErr: () => {}, writeOut: () => {} });
  await program.parseAsync(argv, { from: 'user' });
  return program;
}

const rulesOf = (setup) => rules.get(setup());

let exitCodeBefore;

beforeEach(() => {
  jest.resetAllMocks();
  exitCodeBefore = process.exitCode;
  process.exitCode = undefined;
  getTokens.mockResolvedValue(true);
  checkBulkDelete.mockReturnValue(true);
  confirmBulkDelete.mockResolvedValue(true);
  for (const fn of Object.values(ops)) fn.mockResolvedValue(true);
});

afterEach(() => {
  process.exitCode = exitCodeBefore;
});

describe('connector list', () => {
  test('lists, short by default and long with -l', async () => {
    await parse(setupList);
    await parse(setupList, '-l');

    expect(ops.listConnectors.mock.calls).toEqual([[false], [true]]);
    expect(process.exitCode).toBeUndefined();
  });

  test('a failed login or a failed list exits 1', async () => {
    getTokens.mockResolvedValue(false);
    await parse(setupList);
    expect(ops.listConnectors).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    getTokens.mockResolvedValue(true);
    ops.listConnectors.mockResolvedValue(false);
    await parse(setupList);
    expect(process.exitCode).toBe(1);
  });

  test('is not a multi-operation command', () => {
    expect(rulesOf(setupList)).toBeUndefined();
  });
});

describe('connector describe', () => {
  test('-i is mandatory, so the framework picks a missing one after the login', () => {
    const option = setupDescribe().options.find(
      (candidate) => candidate.long === '--connector-id'
    );
    expect(option.mandatory).toBe(true);
  });

  test('describes the connector, as a table or with --json', async () => {
    await parse(setupDescribe, '-i', 'ZionDirectory');
    await parse(setupDescribe, '-i', 'ZionDirectory', '--json');

    expect(ops.describeConnector.mock.calls).toEqual([
      ['ZionDirectory', undefined],
      ['ZionDirectory', true],
    ]);
    expect(process.exitCode).toBeUndefined();
  });

  test('the login comes first, and a failed login or a declined pick runs nothing and exits 1', async () => {
    getTokens.mockResolvedValue(false);

    await parse(setupDescribe, '-i', 'ZionDirectory');

    expect(ops.describeConnector).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a failed describe exits 1', async () => {
    ops.describeConnector.mockResolvedValue(false);

    await parse(setupDescribe, '-i', 'ZionDirectory');

    expect(process.exitCode).toBe(1);
  });
});

describe('connector export', () => {
  test('the user has to choose what to export, and the command is a multi-operation command', () => {
    expect(rulesOf(setupExport)).toEqual({
      oneOf: {
        options: ['all', 'allSeparate', 'connectorId'],
        purpose: 'what to export',
      },
      multiOp: true,
    });
  });

  test('-i exports that connector with its mappings and the metadata by default', async () => {
    await parse(setupExport, '-i', 'ZionDirectory');

    expect(ops.exportConnectorToFile.mock.calls).toEqual([
      ['ZionDirectory', undefined, true, true],
    ]);
  });

  test('-f, -N and --no-deps are passed on', async () => {
    await parse(
      setupExport,
      '-i',
      'ZionDirectory',
      '-f',
      'mine.json',
      '-N',
      '--no-deps'
    );

    expect(ops.exportConnectorToFile.mock.calls).toEqual([
      ['ZionDirectory', 'mine.json', false, false],
    ]);
  });

  test('-a exports all connectors to one file', async () => {
    await parse(setupExport, '-a', '-f', 'all.json');

    expect(ops.exportConnectorsToFile.mock.calls).toEqual([['all.json', true]]);
    expect(ops.exportConnectorToFile).not.toHaveBeenCalled();
  });

  test('-A exports all connectors to separate files and passes --allow-failures on', async () => {
    await parse(setupExport, '-A', '--allow-failures');

    expect(ops.exportConnectorsToFiles.mock.calls).toEqual([[true, true]]);
  });

  test.each([
    [['-i', 'x', '-a']],
    [['-i', 'x', '-A']],
    [['-a', '-A']],
    [['-A', '-f', 'x.json']],
  ])('%j is rejected while parsing, before anything is sent', async (argv) => {
    await expect(parse(setupExport, ...argv)).rejects.toMatchObject({
      code: 'commander.conflictingOption',
    });

    expect(getTokens).not.toHaveBeenCalled();
  });

  test('a failed login, a declined pick or a failed export exits 1', async () => {
    getTokens.mockResolvedValue(false);
    await parse(setupExport, '-a');
    expect(ops.exportConnectorsToFile).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    getTokens.mockResolvedValue(true);
    ops.exportConnectorsToFile.mockResolvedValue(false);
    await parse(setupExport, '-a');
    expect(process.exitCode).toBe(1);
  });
});

describe('connector import', () => {
  test('the user has to choose what to import, and the command is a multi-operation command', () => {
    expect(rulesOf(setupImport)).toEqual({
      oneOf: { options: ['file', 'allSeparate'], purpose: 'what to import' },
      multiOp: true,
    });
  });

  test('-i with -f imports that connector with the mappings of the file', async () => {
    await parse(setupImport, '-i', 'ZionDirectory', '-f', 'in.json');

    expect(ops.importConnectorFromFile.mock.calls).toEqual([
      ['ZionDirectory', 'in.json', true],
    ]);
  });

  test('--no-deps is passed on', async () => {
    await parse(
      setupImport,
      '-i',
      'ZionDirectory',
      '-f',
      'in.json',
      '--no-deps'
    );

    expect(ops.importConnectorFromFile.mock.calls[0][2]).toBe(false);
  });

  test('-f alone imports the first connector of the file', async () => {
    await parse(setupImport, '-f', 'in.json');

    expect(ops.importFirstConnectorFromFile.mock.calls).toEqual([
      ['in.json', true],
    ]);
  });

  test('-a with -f imports all connectors of the file and passes --allow-failures on', async () => {
    await parse(setupImport, '-a', '-f', 'in.json', '--allow-failures');

    expect(ops.importConnectorsFromFile.mock.calls).toEqual([
      ['in.json', true],
    ]);
  });

  test('-A imports the separate files', async () => {
    await parse(setupImport, '-A');

    expect(ops.importConnectorsFromFiles.mock.calls).toEqual([[undefined]]);
  });

  test.each([
    [['-i', 'x', '-f', 'in.json', '-a']],
    [['-A', '-f', 'in.json']],
    [['-A', '-a']],
    [['-A', '-i', 'x']],
  ])('%j is rejected while parsing', async (argv) => {
    await expect(parse(setupImport, ...argv)).rejects.toMatchObject({
      code: 'commander.conflictingOption',
    });

    expect(getTokens).not.toHaveBeenCalled();
  });

  test('a failed import exits 1', async () => {
    ops.importFirstConnectorFromFile.mockResolvedValue(false);

    await parse(setupImport, '-f', 'in.json');

    expect(process.exitCode).toBe(1);
  });
});

describe('connector delete', () => {
  test('the user has to choose what to delete, and the command is a multi-operation command', () => {
    expect(rulesOf(setupDelete)).toEqual({
      oneOf: { options: ['all', 'connectorId'], purpose: 'what to delete' },
      multiOp: true,
    });
  });

  test('-i deletes that connector, shallow by default, with --deep deeply, and asks nothing', async () => {
    await parse(setupDelete, '-i', 'ZionDirectory');
    await parse(setupDelete, '-i', 'ZionDirectory', '--deep');

    expect(ops.deleteConnector.mock.calls).toEqual([
      ['ZionDirectory', false],
      ['ZionDirectory', true],
    ]);
    expect(checkBulkDelete).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
  });

  test('-a is checked before the login: a run nobody can be asked about is refused and logs in nowhere', async () => {
    checkBulkDelete.mockReturnValue(false);

    await parse(setupDelete, '-a');

    expect(checkBulkDelete.mock.calls[0][0]).toMatchObject({
      what: 'all connectors',
      yes: undefined,
      dryRunAvailable: false,
    });
    expect(getTokens).not.toHaveBeenCalled();
    expect(ops.deleteConnectors).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('-a asks after the login, and a declined question deletes nothing and exits 1', async () => {
    confirmBulkDelete.mockResolvedValue(false);

    await parse(setupDelete, '-a');

    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    expect(ops.deleteConnectors).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('-a deletes all connectors, with --yes handed to the guard and --deep and --allow-failures passed on', async () => {
    await parse(setupDelete, '-a', '-y', '--deep', '--allow-failures');

    expect(confirmBulkDelete.mock.calls[0][0]).toMatchObject({
      what: 'all connectors',
      yes: true,
    });
    expect(ops.deleteConnectors.mock.calls).toEqual([[true, true]]);
    expect(ops.deleteConnector).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  test.each([[['-i', 'x', '-a']]])(
    '%j is rejected while parsing',
    async (argv) => {
      await expect(parse(setupDelete, ...argv)).rejects.toMatchObject({
        code: 'commander.conflictingOption',
      });

      expect(getTokens).not.toHaveBeenCalled();
    }
  );

  test('a failed login or a failed delete exits 1', async () => {
    getTokens.mockResolvedValue(false);
    await parse(setupDelete, '-i', 'ZionDirectory');
    expect(ops.deleteConnector).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    getTokens.mockResolvedValue(true);
    ops.deleteConnector.mockResolvedValue(false);
    await parse(setupDelete, '-i', 'ZionDirectory');
    expect(process.exitCode).toBe(1);
  });
});
