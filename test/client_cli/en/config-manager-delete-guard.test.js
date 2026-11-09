/**
 * The guard of the `config-manager delete` commands (cli record 0037), through
 * the real CLI and without a tenant. Without a terminal, a delete of more than
 * one object is refused before the login, so these runs never reach the host
 * (it cannot be reached): the refusal is the only thing that happens. A single
 * named target and a dry run are not refused, so they go on to the login and
 * fail on the host instead.
 */
import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const HOST = 'http://127.0.0.1:9/am';

async function run(command) {
  try {
    const { stdout, stderr } = await exec(`${command} ${HOST}`, {
      env: { ...process.env, FRODO_TEST: '0' },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

describe('a delete of more than one object without a terminal and without --yes', () => {
  test.each([
    'frodo config-manager delete applications',
    'frodo config-manager delete custom-nodes',
    'frodo config-manager delete endpoints',
    'frodo config-manager delete scripts',
    'frodo config-manager delete scripts -p Example',
    'frodo config-manager delete scripts -p Example -p Other',
    'frodo config-manager delete themes',
    'frodo config-manager delete email-templates',
  ])('"%s" is refused before the login', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain('Refusing to delete');
    expect(stderr).toContain('-y/--yes');
    expect(stderr).toContain('--dry-run');
    expect(stderr).not.toMatch(/ECONNREFUSED|connect/i);
  });

  test('the refusal says what would have been deleted', async () => {
    const { stderr } = await run('frodo config-manager delete scripts -p Example -p Other');

    expect(stderr).toContain('all eligible scripts that start with "Example" or "Other"');
  });

  test('the refusal of themes names the realms', async () => {
    const { stderr } = await run('frodo config-manager delete themes');

    expect(stderr).toContain('all themes in the selected realms');
  });

  test('the refusal of email templates says what would have been deleted', async () => {
    const { stderr } = await run('frodo config-manager delete email-templates');

    expect(stderr).toContain('all email templates');
  });

  test('the refusal of applications says that the objects they own go too', async () => {
    const { stderr } = await run('frodo config-manager delete applications');

    expect(stderr).toContain('all applications and the objects they own');
  });
});

describe('what is not refused', () => {
  test.each([
    'frodo config-manager delete applications -n Example',
    'frodo config-manager delete custom-nodes -n Example',
    'frodo config-manager delete endpoints -n Example',
    'frodo config-manager delete scripts -n Example',
    'frodo config-manager delete themes -n Example',
    'frodo config-manager delete email-templates -n Example',
    'frodo config-manager delete applications -d',
    'frodo config-manager delete applications -n Example -d',
    'frodo config-manager delete custom-nodes -d',
    'frodo config-manager delete endpoints -d',
    'frodo config-manager delete scripts -d',
    'frodo config-manager delete scripts -p Example -d',
    'frodo config-manager delete themes -d',
    'frodo config-manager delete email-templates -d',
    'frodo config-manager delete applications -y',
    'frodo config-manager delete custom-nodes -y',
    'frodo config-manager delete endpoints -y',
    'frodo config-manager delete scripts -y',
    'frodo config-manager delete themes -y',
    'frodo config-manager delete email-templates -y',
  ])('"%s" goes on to the login', async (command) => {
    const { stderr } = await run(command);

    expect(stderr).not.toContain('Refusing to delete');
  });
});
