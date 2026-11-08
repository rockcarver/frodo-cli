/**
 * `mapping delete` with -c/--connector-id or -t/--managed-object-type together
 * with -a is disabled until frodo-lib#948 is fixed and pinned: with a filter the
 * library deletes all new-style mappings, not only the matching ones. The
 * refusal comes before the login and before any question, so these runs never
 * try a login and the refusal is the only thing that happens. Without a filter
 * the command is unchanged and goes on to the login.
 */
import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const HOST = 'http://127.0.0.1:9/am';
const ISSUE = 'https://github.com/rockcarver/frodo-lib/issues/948';

async function run(args) {
  try {
    const { stdout, stderr } = await exec(`frodo mapping delete ${args} ${HOST}`, {
      env: { ...process.env, FRODO_TEST: '0' },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

describe('frodo mapping delete with a filter', () => {
  test.each([
    ['-a -y -c someConnector'],
    ['-a -y --connector-id someConnector'],
    ['-a -y -t user'],
    ['-a -y --managed-object-type user'],
    ['-a -y -c someConnector -t user'],
    // the refusal about the filter comes before the one about confirmation
    ['-a -c someConnector'],
  ])('"mapping delete %s" is refused before the login', async (args) => {
    const { code, stderr } = await run(args);

    expect(code).toBe(1);
    expect(stderr).toContain('is disabled for now');
    expect(stderr).toContain(ISSUE);
    expect(stderr).toContain('Delete all mappings with -a, or one mapping with -i');
    expect(stderr).not.toContain('Refusing to delete');
    // no login was tried
    expect(stderr).not.toContain('Error getting tokens');
  });

  test('"mapping delete -c x" alone is still an error about what to delete, not a delete', async () => {
    const { code, stderr } = await run('-c someConnector');

    expect(code).toBe(1);
    expect(stderr).toContain('is required to choose what to delete');
    expect(stderr).not.toContain('Error getting tokens');
    expect(stderr).not.toContain(
      'Delete all mappings with -a, or one mapping with -i'
    );
  });
});

describe('frodo mapping delete without a filter', () => {
  test.each([['-a -y'], ['-i sync/x']])(
    '"mapping delete %s" is not refused and goes on to the login',
    async (args) => {
      const { stderr } = await run(args);

      expect(stderr).not.toContain('is disabled for now');
      // the login was tried (the host is not a saved connection profile)
      expect(stderr).toContain('Error getting tokens');
    }
  );
});
