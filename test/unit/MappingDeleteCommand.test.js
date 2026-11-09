import fs from 'fs';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import { Command } from 'commander';

/**
 * `frodo mapping delete` with the picker of the mapping family (decision
 * record 0038, frodo-cli#1160). The framework asks for the mapping from
 * `getTokens`, after the login, and fills `-i` with the id of the mapping. The
 * tests run the action the way the framework does: `getTokens` is replaced by
 * a function that sets the picked option on the command, and the operations are
 * recorded.
 *
 * What must hold:
 * - the login comes first, whether or not `-i` was given;
 * - the mapping that was picked is the one that is deleted;
 * - a pick that found nothing to offer, or was declined, never turns into a
 *   delete of everything;
 * - a run that nobody can be asked about is refused before the login (record
 *   0037), and `-a` still asks before it deletes all.
 */

const getTokens = jest.fn();
const printMessage = jest.fn();
const verboseMessage = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();
const deleteMapping = jest.fn();
const deleteMappings = jest.fn();

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
jest.unstable_mockModule('../../src/ops/MappingOps', () => ({
  deleteMapping,
  deleteMappings,
}));

/**
 * Runs the action. `picked` is what the framework's pick sets while
 * `getTokens` runs; `loginOk` is its result.
 */
async function run(options, { picked = {}, loginOk = true } = {}) {
  process.exitCode = 0;
  const program = (
    await import('../../src/cli/mapping/mapping-delete.ts')
  ).default();
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

beforeEach(() => {
  jest.resetAllMocks();
  checkBulkDelete.mockReturnValue(true);
  confirmBulkDelete.mockResolvedValue(true);
  deleteMapping.mockResolvedValue(true);
  deleteMappings.mockResolvedValue(true);
});

describe('mapping delete', () => {
  it('deletes the mapping that was picked, after the login', async () => {
    const exitCode = await run({}, { picked: { mappingId: 'mapping/zion' } });
    expect(getTokens).toHaveBeenCalledTimes(1);
    expect(deleteMapping).toHaveBeenCalledWith('mapping/zion');
    expect(deleteMappings).not.toHaveBeenCalled();
    expect(exitCode).toBe(0);
  });

  it('logs in before it deletes the mapping that was given', async () => {
    const exitCode = await run({ mappingId: 'sync/legacy' });
    expect(getTokens).toHaveBeenCalledTimes(1);
    expect(deleteMapping).toHaveBeenCalledWith('sync/legacy');
    expect(exitCode).toBe(0);
  });

  it('fails when the deletion fails', async () => {
    deleteMapping.mockResolvedValue(false);
    expect(await run({ mappingId: 'sync/legacy' })).toBe(1);
  });

  it('asks before it deletes all mappings, narrowed by -c and -t', async () => {
    const exitCode = await run({
      all: true,
      connectorId: 'systemMatrix',
      managedObjectType: 'user',
      allowFailures: true,
    });
    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    expect(deleteMappings).toHaveBeenCalledWith('systemMatrix', 'user', true);
    expect(deleteMapping).not.toHaveBeenCalled();
    expect(exitCode).toBe(0);
  });

  it('deletes nothing when the question about all mappings is declined', async () => {
    confirmBulkDelete.mockResolvedValue(false);
    expect(await run({ all: true })).toBe(1);
    expect(deleteMappings).not.toHaveBeenCalled();
  });

  it('refuses -a before the login when nobody can be asked', async () => {
    checkBulkDelete.mockReturnValue(false);
    expect(await run({ all: true })).toBe(1);
    expect(getTokens).not.toHaveBeenCalled();
    expect(deleteMappings).not.toHaveBeenCalled();
  });

  it('deletes nothing and says so when the pick found no mapping, instead of falling through to all', async () => {
    const exitCode = await run({}, { picked: {} });
    expect(deleteMapping).not.toHaveBeenCalled();
    expect(deleteMappings).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(printMessage).toHaveBeenCalledWith('No mappings found to delete.');
    expect(exitCode).toBe(0);
  });

  it('fails without deleting anything when the login or the pick failed', async () => {
    const exitCode = await run({}, { loginOk: false });
    expect(exitCode).toBe(1);
    expect(deleteMapping).not.toHaveBeenCalled();
    expect(deleteMappings).not.toHaveBeenCalled();
  });

  it('declares no picker in its command file: the framework resolves it', () => {
    const file = fileURLToPath(
      new URL('../../src/cli/mapping/mapping-delete.ts', import.meta.url)
    );
    expect(fs.readFileSync(file, 'utf8')).not.toMatch(
      /deferEntityPicks|resolveEntityPicks/
    );
  });
});
