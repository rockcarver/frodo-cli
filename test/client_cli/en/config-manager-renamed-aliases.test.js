import cp from 'child_process';
import { promisify } from 'util';
import {
  ALL_RENAMES,
  noticeFor,
} from '../../utils/ConfigManagerRenames.js';

const exec = promisify(cp.exec);

/**
 * The old name of a renamed command of `frodo config` still works: its --help
 * prints the page of the new name (stdout is the same), and one notice on
 * stderr says the name changed. The new name prints no notice. The table of
 * the renames is test/utils/ConfigManagerRenames.js; this test runs the built
 * `frodo`, so it also proves the aliases survive the bundle.
 *
 * The group word `config-manager` is the old name of `config`, a transition
 * alias of its own (the second block): it prints its own notice, first, and
 * then runs the command of the new group name. A command that was renamed too
 * prints two notices, the group first, each once.
 */
describe.each(ALL_RENAMES)(
  'frodo config %s %s (now %s)',
  (verb, oldName, newName) => {
    test('prints the page of the new name for the old name and one notice on stderr', async () => {
      const [asOld, asNew] = await Promise.all([
        exec(`frodo config ${verb} ${oldName} --help`),
        exec(`frodo config ${verb} ${newName} --help`),
      ]);
      expect(asOld.stdout).toBe(asNew.stdout);
      expect(asOld.stdout).toContain(
        `Usage: frodo config ${verb} ${newName} `
      );
      // the note can wrap onto a second line of the description: read the page joined
      expect(asOld.stdout.replace(/\s+/g, ' ')).toContain(
        `(formerly: ${oldName})`
      );
      expect(asOld.stderr.trim()).toBe(noticeFor(oldName, newName));
      expect(asNew.stderr).toBe('');
    });
  }
);

describe('frodo config-manager (now config)', () => {
  const GROUP_NOTICE = noticeFor('config-manager', 'config');

  // one command of every verb that has no renamed word, and the two commands that only the join brought under the old word
  test.each([
    ['pull', 'cors'],
    ['push', 'cors'],
    ['delete', 'cors'],
    ['migrate', 'apps'],
    ['promote', 'status'],
    ['export', ''],
    ['import', ''],
  ])(
    '%s %s prints the page of config and exactly the group notice on stderr',
    async (verb, leaf) => {
      const words = `${verb} ${leaf}`.trim();
      const [asOld, asNew] = await Promise.all([
        exec(`frodo config-manager ${words} --help`),
        exec(`frodo config ${words} --help`),
      ]);
      expect(asOld.stdout).toBe(asNew.stdout);
      expect(asOld.stdout).toContain(`Usage: frodo config ${words} `);
      expect(asOld.stdout).not.toMatch(/Usage: frodo config-manager/);
      expect(asOld.stderr.trim()).toBe(GROUP_NOTICE);
      expect(asNew.stderr).toBe('');
    }
  );

  test('the group itself prints the page of config and the group notice', async () => {
    const [asOld, asNew] = await Promise.all([
      exec('frodo config-manager --help'),
      exec('frodo config --help'),
    ]);
    expect(asOld.stdout).toBe(asNew.stdout);
    expect(asOld.stdout).toContain('Usage: frodo config [options] [command]');
    expect(asOld.stderr.trim()).toBe(GROUP_NOTICE);
    expect(asNew.stderr).toBe('');
  });

  test('a renamed command under the old group word prints two notices, the group first, each once', async () => {
    const asOld = await exec('frodo config-manager pull applications --help');
    const asNew = await exec('frodo config pull apps --help');
    expect(asOld.stdout).toBe(asNew.stdout);
    expect(asOld.stderr.trim().split('\n')).toEqual([
      GROUP_NOTICE,
      noticeFor('applications', 'apps'),
    ]);
    expect(asNew.stderr).toBe('');
  });
});
