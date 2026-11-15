import type { Command } from 'commander';
import { ESCAPE } from '../../utils/interactive/EscapableSelectPrompt';
import { pickFileSystemPath } from '../../utils/interactive/FileSystemPicker';
import { canPrompt } from '../../utils/interactive/PromptGateState';
import { liveOptionPreviewFor } from '../ResolveInteractiveInputs';

/**
 * Asks for the directory of the backup with the file system picker, as the
 * resolution pass asks for a missing path option (record 0045): a folder that
 * is written to, with "New folder..." on the page, and the command as it
 * stands in the footer. The pass cannot ask for it, because the directory is
 * required only with `--repair` and the pass knows only options that are
 * required always. The command hands this question to the repair, which asks
 * only when a repair is going to happen and `--backup-dir` was not given.
 * @param {Command} command the command, for the footer
 * @returns {() => Promise<string | undefined>} the question; it resolves to the folder, or to undefined when the user backs out or nobody can be asked
 */
export function backupDirectoryQuestion(
  command: Command
): () => Promise<string | undefined> {
  return async () => {
    if (!canPrompt()) return undefined;
    const live = liveOptionPreviewFor(command, 'backupDir');
    const picked = await pickFileSystemPath({
      flags: '--backup-dir <dir>',
      kind: 'directory',
      access: 'write',
      ...(live ? { preview: live } : {}),
    });
    return picked === ESCAPE || picked === '' ? undefined : picked;
  };
}
