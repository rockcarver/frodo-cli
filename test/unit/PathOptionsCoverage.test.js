import {
  commandPathOf,
  defaultAccess,
  looksLikePathOption,
  NOT_FILE_SYSTEM_PATHS,
  notFileSystemPathReason,
  PATH_OPTION_OVERRIDES,
  PATH_OPTIONS,
  pathOptionAt,
  pathOptionOf,
} from '../../src/utils/interactive/PathOptions.ts';
import { loadCommandTree } from '../utils/CommandExamples.js';

/**
 * Every option that names a place in the file system gets the file system
 * picker where the resolution pass would ask for it as text (record 0045), and
 * PathOptions.ts says which options those are. This walks the real command tree
 * and fails for
 *
 * - an option that takes a value and looks like a path (its long name or its
 *   value placeholder has "file", "dir", "folder" or "path" in it) and is neither
 *   classified in PATH_OPTIONS nor listed in NOT_FILE_SYSTEM_PATHS with a reason,
 *   so a new command cannot add a path option that is asked for as text;
 * - an entry of either table, or an override, that matches no option, so a
 *   removed or renamed option cannot leave a stale entry behind.
 *
 * Nothing is listed as a legacy exception, and the list may not start: classify
 * the option or say why it is not a path.
 */

let options;

beforeAll(async () => {
  const { leaves } = await loadCommandTree();
  options = leaves.flatMap((command) =>
    command.options.map((option) => ({
      command,
      option,
      commandPath: commandPathOf(command),
      long: option.long,
    }))
  );
});

const label = ({ commandPath, option }) =>
  `${commandPath.join(' ')} ${option.flags}`;

describe('the path options of the command tree', () => {
  test('1: the command tree has options to check', () => {
    expect(options.length).toBeGreaterThan(500);
    expect(options.some((entry) => entry.long === '--file')).toBe(true);
    expect(options.some((entry) => entry.long === '--directory')).toBe(true);
  });

  test('2: every option that looks like a path is classified, or listed as not a file system path', () => {
    const unclassified = options
      .filter(({ option }) => looksLikePathOption(option))
      .filter(({ command, option }) => !pathOptionOf(command, option))
      .filter(
        ({ commandPath, long }) => !notFileSystemPathReason(commandPath, long)
      )
      .map(label);
    expect([...new Set(unclassified)]).toEqual([]);
  });

  test('3: a classified option takes a value, and is not also listed as not a path', () => {
    const classified = options.filter(({ command, option }) =>
      pathOptionOf(command, option)
    );
    expect(classified.length).toBeGreaterThan(300);
    const flags = classified
      .filter(({ option }) => !option.required && !option.optional)
      .map(label);
    expect([...new Set(flags)]).toEqual([]);
    const both = classified
      .filter(({ commandPath, long }) =>
        notFileSystemPathReason(commandPath, long)
      )
      .map(label);
    expect([...new Set(both)]).toEqual([]);
  });

  test('4: every entry of the table matches an option', () => {
    const longs = new Set(options.map(({ long }) => long));
    const stale = Object.keys(PATH_OPTIONS).filter((name) => !longs.has(name));
    expect(stale).toEqual([]);
  });

  test('5: every override matches an option of that command that is classified', () => {
    const stale = Object.keys(PATH_OPTION_OVERRIDES).filter((key) => {
      return !options.some(
        ({ command, commandPath, long }) =>
          `${commandPath.join(' ')} ${long}` === key &&
          pathOptionOf(command, { long })
      );
    });
    expect(stale).toEqual([]);
  });

  test('6: an override changes how a path is used, not what it is', () => {
    for (const [key, override] of Object.entries(PATH_OPTION_OVERRIDES)) {
      expect({ key, kind: override.kind }).toEqual({ key, kind: undefined });
    }
  });

  test('7: every entry of the list of options that are not paths matches an option, and says why', () => {
    const stale = Object.keys(NOT_FILE_SYSTEM_PATHS).filter(
      (key) =>
        !options.some(
          ({ commandPath, long }) =>
            long === key || `${commandPath.join(' ')} ${long}` === key
        )
    );
    expect(stale).toEqual([]);
    for (const [key, reason] of Object.entries(NOT_FILE_SYSTEM_PATHS)) {
      expect({ key, long: reason.length >= 40 }).toEqual({ key, long: true });
    }
  });

  test('8: an entry of the list of options that are not paths looks like a path, or it would not need to be listed', () => {
    const needless = Object.keys(NOT_FILE_SYSTEM_PATHS).filter(
      (key) =>
        !options.some(
          ({ option, commandPath, long }) =>
            (long === key || `${commandPath.join(' ')} ${long}` === key) &&
            looksLikePathOption(option)
        )
    );
    expect(needless).toEqual([]);
  });

  test('9: the export options of the commands that write are written to, and the import options read', () => {
    const accessOf = (path, long) => pathOptionAt(path, long)?.access;
    expect(accessOf(['journey', 'export'], '--file')).toBe('write');
    expect(accessOf(['config', 'export'], '--file')).toBe('write');
    expect(accessOf(['idm', 'schema', 'object', 'export'], '--file')).toBe(
      'write'
    );
    expect(accessOf(['journey', 'import'], '--file')).toBe('read');
    expect(accessOf(['journey', 'validate'], '--file')).toBe('read');
    expect(accessOf(['journey', 'describe'], '--file')).toBe('read');
    expect(accessOf(['script', 'list'], '--file')).toBe('read');
    expect(accessOf(['esv', 'secret', 'create'], '--file')).toBe('read');
    expect(accessOf(['journey', 'export'], '--directory')).toBe('write');
    expect(accessOf(['journey', 'import'], '--directory')).toBe('read');
    expect(accessOf(['journey', 'list'], '--directory')).toBe('read');
  });

  test('10: the config-manager commands read their config folder and files, and write to the working directory', () => {
    const at = (path, long) => pathOptionAt(path, long);
    expect(at(['config-manager', 'pull', 'all'], '--config-folder')).toEqual({
      kind: 'directory',
      access: 'read',
    });
    expect(at(['config-manager', 'pull', 'all'], '--directory')).toEqual({
      kind: 'directory',
      access: 'write',
    });
    for (const verb of [
      'authz-policies',
      'csp',
      'oauth2-agents',
      'saml',
      'service-objects',
    ]) {
      expect(at(['config-manager', 'pull', verb], '--file')).toEqual({
        kind: 'file',
        access: 'read',
        extensions: ['.json'],
      });
    }
    expect(at(['config-manager', 'pull', 'raw'], '--config-file')).toEqual({
      kind: 'file',
      access: 'read',
      extensions: ['.json'],
    });
    expect(
      at(['config-manager', 'migrate', 'applications'], '--config-folder')
    ).toEqual({ kind: 'directory', access: 'read' });
    expect(at(['config-manager', 'push', 'all'], '--directory')).toEqual({
      kind: 'directory',
      access: 'read',
    });
  });

  test('10b: the dot files are shown for the option whose usual value is one, and for no other', () => {
    expect(pathOptionAt(['journey', 'export'], '--env-file')).toEqual({
      kind: 'file',
      access: 'read',
      showHidden: true,
    });
    const hidden = Object.entries(PATH_OPTIONS)
      .filter(([, spec]) => spec.showHidden)
      .map(([name]) => name);
    expect(hidden).toEqual(['--env-file']);
  });

  test('11: an option that is not in the table is not a path', () => {
    expect(pathOptionAt(['journey', 'export'], '--journey-id')).toBeUndefined();
    expect(pathOptionAt(['journey', 'export'], '--path')).toBeUndefined();
  });

  test('12: the verbs that write are the export and pull verbs and nothing else', () => {
    expect(defaultAccess(['journey', 'export'])).toBe('write');
    expect(defaultAccess(['config-manager', 'pull', 'saml'])).toBe('write');
    expect(defaultAccess(['config-manager', 'push', 'saml'])).toBe('read');
    expect(defaultAccess(['config-manager', 'delete', 'scripts'])).toBe('read');
    expect(defaultAccess([])).toBe('read');
  });

  test('13: what looks like a path is judged by the words of the name and the placeholder', () => {
    const option = (flags, extra = {}) => ({
      flags,
      long: /--[\w-]+/.exec(flags)?.[0],
      required: /</.test(flags),
      optional: /\[/.test(flags),
      ...extra,
    });
    expect(looksLikePathOption(option('-f, --file <file>'))).toBe(true);
    expect(looksLikePathOption(option('-f, --file [file]'))).toBe(true);
    expect(looksLikePathOption(option('-C, --config-folder <x>'))).toBe(true);
    expect(looksLikePathOption(option('--name <directory>'))).toBe(true);
    expect(looksLikePathOption(option('--filenameFilter <pattern>'))).toBe(
      true
    );
    expect(looksLikePathOption(option('--sub-property <path>'))).toBe(true);
    // a flag takes no value, and a word that only contains "file" is no path
    expect(looksLikePathOption(option('--folders'))).toBe(false);
    expect(looksLikePathOption(option('--profile <profile>'))).toBe(false);
    expect(looksLikePathOption(option('-i, --journey-id <id>'))).toBe(false);
  });
});
