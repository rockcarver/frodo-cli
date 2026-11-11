/**
 * The guard of the delete commands that can remove more than the one object
 * they name (cli record 0037), through the real CLI and without a tenant. Without
 * a terminal the bulk form is refused before the login, so these runs never reach
 * the host (it cannot be reached) and the refusal is the only thing that
 * happens. A single named target and `-y` are not refused, so they go on to the
 * login and fail on the host instead.
 */
import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const HOST = 'http://127.0.0.1:9/am';

// [command, the bulk form, a single named target (or undefined when the command has none)]
const COMMANDS = [
  ['agent ai delete', '-a', '-i x'],
  ['agent delete', '-a', '-i x'],
  ['agent gateway delete', '-a', '-i x'],
  ['agent java delete', '-a', '-i x'],
  ['agent web delete', '-a', '-i x'],
  ['aiagent delete', '-a', '-i x'],
  ['app delete', '-a', '-i x'],
  ['authz policy delete', '-a', '-i x'],
  ['authz set delete', '-a', '-i x'],
  ['authz type delete', '-a', '-i x'],
  ['connector delete', '-a', '-i x'],
  ['email template delete', '-a', '-i x'],
  ['esv secret delete', '-a', '-i x'],
  ['esv variable delete', '-a', '-i x'],
  ['idm remote-proxy delete', '-a', '-i x'],
  ['iga workflow delete', '-a --draft-only', '-i x --draft-only'],
  ['journey delete', '-a', '-i x'],
  ['log key delete', '-a', '-i x'],
  ['mapping delete', '-a', '-i x'],
  ['node delete', '-a', '-i x'],
  ['saml delete', '-a', '-i x'],
  ['script delete', '-a', '-i x'],
  ['secretstore delete', '--all', '-i x'],
  [
    'secretstore mapping delete',
    '--all --secretstore-id x --secretstore-type KeyStoreSecretStore',
    '--secretstore-id x --secretstore-type KeyStoreSecretStore -s y',
  ],
  [
    'secretstore mapping alias delete',
    '--all -i x -s y',
    '-i x -s y -a z',
  ],
  ['service delete', '-a', '-i x'],
  ['theme delete', '-a', '-i x'],
];

async function run(command, args, extra = '') {
  try {
    const { stdout, stderr } = await exec(
      `frodo ${command} ${args} ${extra} ${HOST}`,
      { env: { ...process.env, FRODO_TEST: '0' } }
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

describe('a bulk delete without a terminal and without --yes', () => {
  test.each(COMMANDS)('"frodo %s" is refused before the login', async (command, bulk) => {
    const { code, stderr } = await run(command, bulk);

    expect(code).toBe(1);
    expect(stderr).toContain('Refusing to delete');
    expect(stderr).toContain('-y/--yes');
    // these commands have no dry run to name
    expect(stderr).not.toContain('--dry-run');
    expect(stderr).not.toMatch(/ECONNREFUSED|\bconnect\b/i);
  });
});

describe('what is not refused', () => {
  test.each(COMMANDS)('"frodo %s" with --yes goes on to the login', async (command, bulk) => {
    const { stderr } = await run(command, bulk, '-y');

    expect(stderr).not.toContain('Refusing to delete');
  });

  test.each(COMMANDS.filter((entry) => entry[2]))(
    '"frodo %s" with a single named target goes on to the login',
    async (command, _bulk, single) => {
      const { stderr } = await run(command, single);

      expect(stderr).not.toContain('Refusing to delete');
    }
  );
});
