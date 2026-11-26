import cp from 'child_process';
import { promisify } from 'util';
import {
  ALL_RENAMES,
  noticeFor,
} from '../../utils/ConfigManagerRenames.js';

const exec = promisify(cp.exec);

/**
 * The old name of a renamed config-manager command still works: its --help
 * prints the page of the new name (stdout is the same), and one notice on
 * stderr says the name changed. The new name prints no notice. The table of
 * the renames is test/utils/ConfigManagerRenames.js; this test runs the built
 * `frodo`, so it also proves the aliases survive the bundle.
 */
describe.each(ALL_RENAMES)(
  'frodo config-manager %s %s (now %s)',
  (verb, oldName, newName) => {
    test('prints the page of the new name for the old name and one notice on stderr', async () => {
      const [asOld, asNew] = await Promise.all([
        exec(`frodo config-manager ${verb} ${oldName} --help`),
        exec(`frodo config-manager ${verb} ${newName} --help`),
      ]);
      expect(asOld.stdout).toBe(asNew.stdout);
      expect(asOld.stdout).toContain(
        `Usage: frodo config-manager ${verb} ${newName} `
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
