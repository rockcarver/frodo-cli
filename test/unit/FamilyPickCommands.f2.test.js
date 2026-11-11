import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import { Command } from 'commander';

/**
 * Decision record 0038 for the `esv` and `secretstore` families: the framework
 * asks for an entity that was not given from `getTokens`, after the login. A
 * command of such a family therefore has to log in BEFORE it looks at the
 * option the picker fills, and has to act on what the pick put there. The
 * tests run the action of every such command the way the framework does:
 * `getTokens` is replaced by a function that sets the picked options on the
 * command, as `resolveFamilyEntityPicks` does, and the operations are
 * recorded.
 *
 * What must hold:
 * - the login comes first, so that a picker can run, whether or not the
 *   option was given;
 * - the entity that was picked is the one that is acted on;
 * - a pick that found nothing to offer, or was declined, never turns into a
 *   delete of everything;
 * - the mapping and alias commands, which print a usage error for an
 *   incomplete command line, still do so without a terminal and without a
 *   login (record 0047: with prompting off the framework adds nothing).
 */

const getTokens = jest.fn();
const printMessage = jest.fn();
const verboseMessage = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();
let canPromptValue = true;

// every export of an operations module becomes a recorded function
const realSecretsOps = await import('../../src/ops/cloud/SecretsOps.ts');
const realVariablesOps = await import('../../src/ops/cloud/VariablesOps.ts');
const realSecretStoreOps = await import('../../src/ops/SecretStoreOps.ts');
const realPromptGate =
  await import('../../src/utils/interactive/PromptGateState.ts');
const recorded = (real) =>
  Object.fromEntries(Object.keys(real).map((key) => [key, jest.fn()]));
const secretsOps = recorded(realSecretsOps);
const variablesOps = recorded(realVariablesOps);
const secretStoreOps = recorded(realSecretStoreOps);

jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(name, hidden = [], types) {
      super(name);
      this.argument('[host]');
      if (!hidden.includes('realm')) this.argument('[realm]');
      this.argument('[username]').argument('[password]');
      this.deploymentTypes = types;
    }

    handleDefaultArgsAndOpts() {}
    requireOneOf() {
      return this;
    }
    requireAllOf() {
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
  printError: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/BulkDeleteGuard', () => ({
  checkBulkDelete,
  confirmBulkDelete,
}));
jest.unstable_mockModule('../../src/utils/interactive/PromptGateState', () => ({
  ...realPromptGate,
  canPrompt: () => canPromptValue,
}));
jest.unstable_mockModule('../../src/ops/cloud/SecretsOps', () => secretsOps);
jest.unstable_mockModule(
  '../../src/ops/cloud/VariablesOps',
  () => variablesOps
);
jest.unstable_mockModule('../../src/ops/SecretStoreOps', () => secretStoreOps);

const load = async (file) => (await import(`../../src/cli/${file}`)).default();

/**
 * Runs the action of a command. `picked` is what the framework's pick sets
 * while `getTokens` runs; `loginOk` is its result.
 */
async function run(file, options, { picked = {}, loginOk = true } = {}) {
  process.exitCode = 0;
  const program = await load(file);
  for (const [key, value] of Object.entries(options)) {
    program.setOptionValue(key, value);
  }
  getTokens.mockImplementation(async () => {
    if (!loginOk) return false;
    for (const [key, value] of Object.entries(picked)) {
      program.setOptionValue(key, value);
    }
    return true;
  });
  const args = program.registeredArguments.map(() => undefined);
  await program._actionHandler.call(program, args);
  const exitCode = process.exitCode;
  process.exitCode = 0;
  return exitCode;
}

const errors = () =>
  printMessage.mock.calls.filter(([, type]) => type === 'error');

beforeEach(() => {
  jest.resetAllMocks();
  canPromptValue = true;
  checkBulkDelete.mockReturnValue(true);
  confirmBulkDelete.mockResolvedValue(true);
  jest.spyOn(Command.prototype, 'outputHelp').mockImplementation(() => {});
  // `esv variable set` shows its help when it has nothing to set
  jest.spyOn(Command.prototype, 'help').mockImplementation(() => {});
});

/** [command file, options of the command, the pick, the operation, the module that holds it] */
const ACT_ON_THE_PICK = [
  [
    'esv/esv-secret-describe',
    {},
    { secretId: 'esv-picked' },
    'describeSecret',
    secretsOps,
  ],
  [
    'esv/esv-secret-set',
    { description: 'text' },
    { secretId: 'esv-picked' },
    'setSecretDescription',
    secretsOps,
  ],
  [
    'esv/esv-secret-export',
    {},
    { secretId: 'esv-picked' },
    'exportSecretToFile',
    secretsOps,
  ],
  [
    'esv/esv-secret-version-activate',
    { version: '2' },
    { secretId: 'esv-picked' },
    'activateVersionOfSecret',
    secretsOps,
  ],
  [
    'esv/esv-secret-version-deactivate',
    { version: '2' },
    { secretId: 'esv-picked' },
    'deactivateVersionOfSecret',
    secretsOps,
  ],
  [
    'esv/esv-secret-version-delete',
    { version: '2' },
    { secretId: 'esv-picked' },
    'deleteVersionOfSecret',
    secretsOps,
  ],
  [
    'esv/esv-variable-describe',
    {},
    { variableId: 'esv-picked' },
    'describeVariable',
    variablesOps,
  ],
  [
    'esv/esv-variable-export',
    {},
    { variableId: 'esv-picked' },
    'exportVariableToFile',
    variablesOps,
  ],
  [
    'esv/esv-variable-set',
    { value: 'x' },
    { variableId: 'esv-picked' },
    'updateVariable',
    variablesOps,
  ],
  [
    'esv/esv-variable-delete',
    {},
    { variableId: 'esv-picked' },
    'deleteVariableById',
    variablesOps,
  ],
  [
    'secretstore/secretstore-describe',
    {},
    { secretstoreId: 'zion' },
    'describeSecretStore',
    secretStoreOps,
  ],
  [
    'secretstore/secretstore-export',
    {},
    { secretstoreId: 'zion' },
    'exportSecretStoreToFile',
    secretStoreOps,
  ],
  [
    'secretstore/secretstore-delete',
    {},
    { secretstoreId: 'zion' },
    'deleteSecretStore',
    secretStoreOps,
  ],
  [
    'secretstore/secretstore-mapping-list',
    {},
    { secretstoreId: 'zion' },
    'listSecretStoreMappings',
    secretStoreOps,
  ],
  [
    'secretstore/secretstore-mapping-delete',
    {},
    { secretstoreId: 'zion', secretId: 'am.default' },
    'deleteSecretStoreMapping',
    secretStoreOps,
  ],
  [
    'secretstore/secretstore-mapping-alias-list',
    {},
    { secretstoreId: 'zion', secretId: 'am.default' },
    'listSecretStoreMappingAliases',
    secretStoreOps,
  ],
  [
    'secretstore/secretstore-mapping-alias-activate',
    { alias: 'a1' },
    { secretstoreId: 'zion', secretId: 'am.default' },
    'activateSecretStoreMappingAlias',
    secretStoreOps,
  ],
  [
    'secretstore/secretstore-mapping-alias-delete',
    { alias: 'a1' },
    { secretstoreId: 'zion', secretId: 'am.default' },
    'deleteSecretStoreMappingAlias',
    secretStoreOps,
  ],
];

describe('a command of a family with a picker logs in first and acts on what was picked', () => {
  it.each(ACT_ON_THE_PICK)(
    '%s',
    async (file, options, picked, operation, module) => {
      module[operation].mockResolvedValue(true);
      expect(await run(file, options, { picked })).toBe(0);
      expect(getTokens).toHaveBeenCalledTimes(1);
      expect(module[operation]).toHaveBeenCalledTimes(1);
      // the first argument of every operation is the entity that was picked
      // (the store, then the mapping, for the mapping commands)
      expect(module[operation].mock.calls[0][0]).toBe(Object.values(picked)[0]);
      if (picked.secretId && picked.secretstoreId) {
        expect(module[operation].mock.calls[0]).toContain(picked.secretId);
      }
    }
  );

  it.each(ACT_ON_THE_PICK)(
    '%s: a declined pick or a failed login runs nothing',
    async (file, options, _picked, operation, module) => {
      expect(await run(file, options, { loginOk: false })).toBe(1);
      expect(getTokens).toHaveBeenCalledTimes(1);
      expect(module[operation]).not.toHaveBeenCalled();
    }
  );
});

describe('a pick that found nothing to offer never becomes a delete of everything', () => {
  it.each([
    [
      'esv/esv-variable-delete',
      'deleteVariables',
      variablesOps,
      'deleteVariableById',
    ],
    [
      'secretstore/secretstore-delete',
      'deleteSecretStores',
      secretStoreOps,
      'deleteSecretStore',
    ],
  ])('%s', async (file, all, module, one) => {
    expect(await run(file, {}, { picked: {} })).toBe(1);
    expect(module[all]).not.toHaveBeenCalled();
    expect(module[one]).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(errors()).toHaveLength(1);
  });

  it('secretstore mapping delete', async () => {
    expect(
      await run('secretstore/secretstore-mapping-delete', {}, { picked: {} })
    ).toBe(1);
    expect(secretStoreOps.deleteSecretStoreMapping).not.toHaveBeenCalled();
    expect(secretStoreOps.deleteSecretStoreMappings).not.toHaveBeenCalled();
    expect(errors()).toHaveLength(1);
  });

  it.each([
    ['esv/esv-secret-export'],
    ['esv/esv-variable-export'],
    ['secretstore/secretstore-export'],
  ])('%s says so instead of exporting nothing silently', async (file) => {
    expect(await run(file, {}, { picked: {} })).toBe(1);
    expect(errors()).toHaveLength(1);
  });
});

describe('-a still deletes everything, after the confirmation', () => {
  it.each([
    ['esv/esv-variable-delete', 'deleteVariables', variablesOps],
    ['secretstore/secretstore-delete', 'deleteSecretStores', secretStoreOps],
  ])('%s', async (file, all, module) => {
    module[all].mockResolvedValue(true);
    expect(await run(file, { all: true, yes: true })).toBe(0);
    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    expect(module[all]).toHaveBeenCalledTimes(1);
  });

  it('and does nothing when the confirmation is refused', async () => {
    confirmBulkDelete.mockResolvedValue(false);
    expect(await run('esv/esv-variable-delete', { all: true })).toBe(1);
    expect(variablesOps.deleteVariables).not.toHaveBeenCalled();
  });

  it('secretstore mapping delete -a deletes the mappings of the store that was picked', async () => {
    secretStoreOps.deleteSecretStoreMappings.mockResolvedValue(true);
    expect(
      await run(
        'secretstore/secretstore-mapping-delete',
        { all: true, yes: true },
        { picked: { secretstoreId: 'zion' } }
      )
    ).toBe(0);
    expect(secretStoreOps.deleteSecretStoreMappings.mock.calls[0][0]).toBe(
      'zion'
    );
    expect(getTokens).toHaveBeenCalledTimes(1);
  });
});

describe('the mapping and alias commands', () => {
  const COMMANDS = [
    'secretstore/secretstore-mapping-list',
    'secretstore/secretstore-mapping-delete',
    'secretstore/secretstore-mapping-alias-list',
    'secretstore/secretstore-mapping-alias-activate',
    'secretstore/secretstore-mapping-alias-delete',
  ];

  it.each(COMMANDS)(
    '%s: without a terminal an incomplete command line fails as before, without a login',
    async (file) => {
      canPromptValue = false;
      expect(await run(file, {})).toBe(1);
      expect(getTokens).not.toHaveBeenCalled();
      expect(errors()).toHaveLength(1);
    }
  );

  it.each(COMMANDS)(
    '%s: with every option given the login happens once, where it always did',
    async (file) => {
      expect(
        await run(
          file,
          { secretstoreId: 'zion', secretId: 'am.default', alias: 'a1' },
          { loginOk: false }
        )
      ).toBe(1);
      expect(getTokens).toHaveBeenCalledTimes(1);
    }
  );

  it.each(COMMANDS)(
    '%s: with a terminal and something missing the login comes first, and only once',
    async (file) => {
      secretStoreOps.listSecretStoreMappings.mockResolvedValue(true);
      secretStoreOps.deleteSecretStoreMapping.mockResolvedValue(true);
      secretStoreOps.listSecretStoreMappingAliases.mockResolvedValue(true);
      secretStoreOps.activateSecretStoreMappingAlias.mockResolvedValue(true);
      secretStoreOps.deleteSecretStoreMappingAlias.mockResolvedValue(true);
      await run(
        file,
        { alias: 'a1' },
        { picked: { secretstoreId: 'zion', secretId: 'am.default' } }
      );
      expect(getTokens).toHaveBeenCalledTimes(1);
    }
  );

  it('a type that cannot have mappings is refused before any login', async () => {
    expect(
      await run('secretstore/secretstore-mapping-list', {
        secretstoreType: 'EnvironmentAndSystemPropertySecretStore',
      })
    ).toBe(1);
    expect(getTokens).not.toHaveBeenCalled();
    expect(errors()).toHaveLength(1);
  });
});

describe('the commands of the families carry no picker code of their own', () => {
  const root = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'src',
    'cli'
  );
  // Two commands keep the picker they have (frodo-cli#1081):
  // - `esv secret version create` names an existing secret, but the ratchet
  //   test refuses a family pick on a command called `create`;
  // - `esv secret delete`: its terminal tests (phase5-editor-routing.pty) pin a
  //   picker that opens before any login, and the framework asks after the
  //   login, which the replayed mock tenant of CI answers as ForgeOps
  //   ("Unsupported deployment type"), a type this cloud-only command refuses.
  const KEEPS_ITS_OWN = [
    'esv-secret-delete.ts',
    'esv-secret-version-create.ts',
  ];
  const files = ['esv', 'secretstore'].flatMap((dir) =>
    fs
      .readdirSync(path.join(root, dir))
      .filter((name) => name.endsWith('.ts'))
      .map((name) => ({
        name,
        text: fs.readFileSync(path.join(root, dir, name), 'utf8'),
      }))
  );

  it('neither declares a picker nor runs one: the framework does, from the registry', () => {
    const own = files
      .filter(({ text }) => /deferEntityPicks|resolveEntityPicks/.test(text))
      .map(({ name }) => name);
    expect(own).toEqual(KEEPS_ITS_OWN);
  });
});
