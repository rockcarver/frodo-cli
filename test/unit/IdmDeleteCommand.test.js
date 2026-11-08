import { jest } from '@jest/globals';
import { Command } from 'commander';

// `frodo idm delete -i <id>` after its entity picker moved to the `idm` family
// of EntityPickFamilies.ts (decision record 0038): the command logs in, which
// is where the framework runs the pick, and deletes what the option names. It
// registers no picker of its own, and a failed or declined login (which a
// declined pick is) deletes nothing and fails the command.

const getTokens = jest.fn();
const deleteConfigEntityById = jest.fn();

jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(...args);
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
    }

    handleDefaultArgsAndOpts() {}
  },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/ops/IdmOps', () => ({
  deleteConfigEntityById,
}));

const { default: setupIdmDelete } =
  await import('../../src/cli/idm/idm-delete');
const { getEntityPicks } =
  await import('../../src/utils/interactive/EntityPickers');

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

describe('frodo idm delete', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getTokens.mockResolvedValue(true);
    deleteConfigEntityById.mockResolvedValue(true);
  });

  afterAll(() => {
    process.exitCode = 0;
  });

  it('logs in, then deletes the entity the option names', async () => {
    await invoke(setupIdmDelete(), { id: 'sync' });
    expect(getTokens).toHaveBeenCalledTimes(1);
    expect(deleteConfigEntityById).toHaveBeenCalledWith('sync');
    expect(process.exitCode).toBe(0);
  });

  it('fails when the delete fails', async () => {
    deleteConfigEntityById.mockResolvedValue(false);
    await invoke(setupIdmDelete(), { id: 'sync' });
    expect(process.exitCode).toBe(1);
  });

  it('deletes nothing and fails when the login fails or the pick is declined', async () => {
    getTokens.mockResolvedValue(false);
    await invoke(setupIdmDelete(), {});
    expect(deleteConfigEntityById).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('declares no entity picker of its own: the idm family supplies it', () => {
    expect(getEntityPicks(setupIdmDelete())).toEqual([]);
  });
});
