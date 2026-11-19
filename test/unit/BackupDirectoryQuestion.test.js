import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * The question `frodo feature validate --repair` asks when `--backup-dir` is
 * missing and a terminal can be asked (src/cli/feature/BackupDirectoryQuestion.ts,
 * #1300): the file system picker of record 0045, set to a folder that is
 * written to, with the command as it stands in the footer. The picker and the
 * gate are spies here; their own tests cover how they draw and when they open.
 */
const ESCAPE = Symbol('escape');
jest.unstable_mockModule(
  '../../src/utils/interactive/EscapableSelectPrompt',
  () => ({
    ESCAPE,
  })
);

let terminal = true;
jest.unstable_mockModule('../../src/utils/interactive/PromptGateState', () => ({
  canPrompt: () => terminal,
}));

const pickFileSystemPath = jest.fn();
jest.unstable_mockModule(
  '../../src/utils/interactive/FileSystemPicker',
  () => ({
    pickFileSystemPath,
  })
);

const liveOptionPreviewFor = jest.fn();
jest.unstable_mockModule('../../src/cli/ResolveInteractiveInputs', () => ({
  liveOptionPreviewFor,
}));

const { backupDirectoryQuestion } =
  await import('../../src/cli/feature/BackupDirectoryQuestion');

const command = { name: () => 'validate' };

beforeEach(() => {
  jest.clearAllMocks();
  terminal = true;
  liveOptionPreviewFor.mockReturnValue(undefined);
});

describe('backupDirectoryQuestion', () => {
  test('opens the picker on a folder that is written to, named as the option is', async () => {
    pickFileSystemPath.mockResolvedValue('./feature-backup');

    await expect(backupDirectoryQuestion(command)()).resolves.toBe(
      './feature-backup'
    );

    expect(pickFileSystemPath).toHaveBeenCalledTimes(1);
    expect(pickFileSystemPath).toHaveBeenCalledWith(
      expect.objectContaining({
        flags: '--backup-dir <dir>',
        kind: 'directory',
        access: 'write',
      })
    );
  });

  test('shows the command being authored in the footer, with the highlighted folder as the value', async () => {
    const preview = (candidate) =>
      `frodo feature validate --backup-dir ${candidate}`;
    liveOptionPreviewFor.mockReturnValue(preview);
    pickFileSystemPath.mockResolvedValue('x');

    await backupDirectoryQuestion(command)();

    expect(liveOptionPreviewFor).toHaveBeenCalledWith(command, 'backupDir');
    expect(pickFileSystemPath).toHaveBeenCalledWith(
      expect.objectContaining({ preview })
    );
  });

  test('without a footer to show, the picker still opens', async () => {
    pickFileSystemPath.mockResolvedValue('x');

    await backupDirectoryQuestion(command)();

    expect(pickFileSystemPath.mock.calls[0][0]).not.toHaveProperty('preview');
  });

  test('a user who backs out (Escape) gets no directory', async () => {
    pickFileSystemPath.mockResolvedValue(ESCAPE);

    await expect(backupDirectoryQuestion(command)()).resolves.toBeUndefined();
  });

  test('an empty pick is no directory either', async () => {
    pickFileSystemPath.mockResolvedValue('');

    await expect(backupDirectoryQuestion(command)()).resolves.toBeUndefined();
  });

  test('where nobody can be asked (no terminal, --no-prompt, FRODO_NO_PROMPT) it opens nothing', async () => {
    terminal = false;

    await expect(backupDirectoryQuestion(command)()).resolves.toBeUndefined();

    expect(pickFileSystemPath).not.toHaveBeenCalled();
  });
});
