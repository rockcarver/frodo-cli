/**
 * The options whose value is a path in the file system, and what each one
 * is for (record 0045). The resolution pass asks for such an option with the
 * file system picker instead of a line of text, and this table says which
 * options they are, whether the picker offers a file or a folder, and whether
 * the command reads from the path or writes to it.
 *
 * A zero-import module (the EntityPickFamilies pattern): the pass, the picker
 * and the unit tests all read it. A test walks the real command tree and fails
 * for an option that looks like a path and is neither classified here nor
 * listed in `NOT_FILE_SYSTEM_PATHS` with a reason, and for an entry here that
 * matches no option, so a new command cannot slip a path option past the
 * picker and a removed option cannot leave a stale entry behind.
 */

/** What the user picks: an existing or new file, or a folder. */
export type PathKind = 'file' | 'directory';

/** Whether the command reads from the path (it must exist) or writes to it (it may be new). */
export type PathAccess = 'read' | 'write';

/** How one option is classified. */
export type PathOptionSpec = {
  kind: PathKind;
  /** Left out: derived from the command's verb, see `defaultAccess`. */
  access?: PathAccess;
  /** Only files that end in one of these are shown (`.json`); folders always are. */
  extensions?: readonly string[];
  /** Entries whose name starts with a dot are shown: the usual value of the option is one (`.env`). */
  showHidden?: boolean;
};

/** A classified option, as the picker uses it. */
export type ResolvedPathOption = {
  kind: PathKind;
  access: PathAccess;
  extensions?: readonly string[];
  showHidden?: boolean;
};

/** The part of a commander command this module reads. */
export type CommandLike = {
  name(): string;
  parent?: CommandLike | null;
};

/** The name of the root command. */
const PROGRAM_NAME = 'frodo';

const JSON_FILES = ['.json'] as const;

/**
 * The path options, by long name. Where the same long name means different
 * things in different commands, `PATH_OPTION_OVERRIDES` says so for those.
 */
export const PATH_OPTIONS: Readonly<Record<string, PathOptionSpec>> = {
  // the shared options of every command: -D names the working directory, the
  // folder a command reads its files from and writes its files to
  '--directory': { kind: 'directory' },
  '--env-file': { kind: 'file', access: 'read', showHidden: true },
  '--sa-jwk-file': { kind: 'file', access: 'read' },
  '--private-key': { kind: 'file', access: 'read' },
  // the export and import files of the commands
  '--file': { kind: 'file' },
  '--output-file': { kind: 'file', access: 'write' },
  '--entities-file': { kind: 'file', access: 'read', extensions: JSON_FILES },
  // config-manager
  '--config-folder': { kind: 'directory', access: 'read' },
  '--config-file': { kind: 'file', access: 'read', extensions: JSON_FILES },
  // promote
  '--frodo-export-dir': { kind: 'directory', access: 'read' },
  '--master-dir': { kind: 'directory', access: 'read' },
  // keys and configuration a command reads
  '--jwk-file': { kind: 'file', access: 'read', extensions: JSON_FILES },
  '--claims-config': { kind: 'file', access: 'read', extensions: JSON_FILES },
  '--on-retrieve-script': { kind: 'file', access: 'read', extensions: ['.js'] },
  '--on-store-script': { kind: 'file', access: 'read', extensions: ['.js'] },
};

/**
 * Where a command means something else by an option of the table, keyed by
 * the command path without `frodo` and the long name: `config-manager pull saml --file`.
 * What is set here replaces what the table says for that command.
 */
export const PATH_OPTION_OVERRIDES: Readonly<
  Record<string, Partial<PathOptionSpec>>
> = {
  // the config-manager pull commands that take -f read a config file that says
  // what to export; the exported files go to the working directory
  'config-manager pull authz-policies --file': {
    access: 'read',
    extensions: JSON_FILES,
  },
  'config-manager pull cimd-profiles --file': {
    access: 'read',
    extensions: JSON_FILES,
  },
  'config-manager pull csp --file': { access: 'read', extensions: JSON_FILES },
  'config-manager pull oauth2-agents --file': {
    access: 'read',
    extensions: JSON_FILES,
  },
  'config-manager pull saml --file': { access: 'read', extensions: JSON_FILES },
  'config-manager pull service-objects --file': {
    access: 'read',
    extensions: JSON_FILES,
  },
  'config-manager pull trusted-jwt-issuers --file': {
    access: 'read',
    extensions: JSON_FILES,
  },
};

/**
 * Options that look like a path (a long name or a value placeholder with
 * "file", "dir", "folder" or "path" in it) and are not one, each with the
 * reason. Keyed by the long name, or by the command path and the long name
 * where only that command's option is meant.
 */
export const NOT_FILE_SYSTEM_PATHS: Readonly<Record<string, string>> = {
  '--filename-filter':
    'Names or ~patterns of the files to push, matched against the files of the working directory; it names no location.',
  '--filenameFilter':
    'Names or ~patterns of the scripts to push, matched against the files of the working directory; it names no location.',
  '--sub-property':
    'A dot-path to a property nested inside a schema object, not a location in the file system.',
  '--clear':
    'The path of a frodo command (journey list), whose saved defaults are cleared.',
  'config-manager push raw --path':
    'The path of a service object configuration inside the raw folder of the working directory, such as realms/alpha/..., not a location in the file system.',
};

/** Verbs of a command that write what they export or pull: `-D` and `-f` are then written to. */
export const WRITE_VERBS: readonly string[] = ['export', 'pull'];

/**
 * The names of the command and its parents, without the program name:
 * `['config-manager', 'pull', 'saml']`. The program is the root, named
 * `frodo`; a tree of command groups built without it (the tests do) starts at
 * the group.
 */
export function commandPathOf(command: CommandLike): string[] {
  const names: string[] = [];
  for (
    let cursor: CommandLike | null | undefined = command;
    cursor;
    cursor = cursor.parent
  ) {
    names.unshift(cursor.name());
  }
  if (names[0] === PROGRAM_NAME) names.shift();
  return names;
}

/**
 * Whether a command reads from the path of its options or writes to it, when
 * the table does not say: a command whose path has a write verb (`export`,
 * `pull`) writes, every other command (import, push, describe, list, validate,
 * create, delete, ...) reads.
 */
export function defaultAccess(commandPath: readonly string[]): PathAccess {
  return commandPath.some((name) => WRITE_VERBS.includes(name))
    ? 'write'
    : 'read';
}

/**
 * How `longName` (`--file`) of the command at `commandPath` is classified, or
 * undefined when it is not a path option.
 */
export function pathOptionAt(
  commandPath: readonly string[],
  longName: string
): ResolvedPathOption | undefined {
  const spec = PATH_OPTIONS[longName];
  if (!spec) return undefined;
  const override =
    PATH_OPTION_OVERRIDES[`${commandPath.join(' ')} ${longName}`];
  const merged = { ...spec, ...override };
  const extensions = merged.extensions;
  return {
    kind: merged.kind,
    access: merged.access ?? defaultAccess(commandPath),
    ...(extensions ? { extensions } : {}),
    ...(merged.showHidden ? { showHidden: true } : {}),
  };
}

/** How an option of a command is classified, or undefined when it is not a path option. */
export function pathOptionOf(
  command: CommandLike,
  option: { long?: string }
): ResolvedPathOption | undefined {
  if (!option.long) return undefined;
  return pathOptionAt(commandPathOf(command), option.long);
}

/** The words of an option name or a value placeholder: `--config-folder`, `<filenameFilter>` -> config, folder / filename, filter. */
function wordsOf(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const PATH_WORDS = new Set([
  'file',
  'files',
  'filename',
  'filenames',
  'dir',
  'dirs',
  'directory',
  'directories',
  'folder',
  'folders',
  'path',
  'paths',
]);

/**
 * Whether an option that takes a value looks like it names a location in the
 * file system: its long name or its value placeholder has a word such as
 * "file", "dir", "folder" or "path" in it. A flag without a value never does.
 */
export function looksLikePathOption(option: {
  long?: string;
  flags: string;
  required?: boolean;
  optional?: boolean;
}): boolean {
  if (!option.required && !option.optional) return false;
  const placeholder = /[<[]([^>\]]*)[>\]]/.exec(option.flags)?.[1] ?? '';
  return [...wordsOf(option.long ?? ''), ...wordsOf(placeholder)].some((word) =>
    PATH_WORDS.has(word)
  );
}

/** Why an option that looks like a path is not one, or undefined when it is not listed. */
export function notFileSystemPathReason(
  commandPath: readonly string[],
  longName: string
): string | undefined {
  return (
    NOT_FILE_SYSTEM_PATHS[`${commandPath.join(' ')} ${longName}`] ??
    NOT_FILE_SYSTEM_PATHS[longName]
  );
}
