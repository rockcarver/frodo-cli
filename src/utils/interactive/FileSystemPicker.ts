/**
 * The file system picker (record 0045): where the resolution pass would ask
 * for the value of a path option as text, the user walks the file system
 * instead, in the same frame as every other picker (the Navigate menu, the
 * question in a box, the command underneath), and picks an existing file or
 * folder, or makes a new one.
 *
 * The page shows the folder the user is in, then these rows: "Use this
 * folder" (when a folder is picked), "New file…" (when a file is written),
 * "New folder…" (whenever something is written), `..`, the sub-folders as
 * `name/` and the files. Enter on a folder opens it, on a file picks it. The
 * pure parts (reading and ordering a folder, working out where to start, how
 * the pick is written into the command, what a new name may be) are in
 * FileSystemPaths.ts; which options get the picker is PathOptions.ts.
 *
 * The picker is one `escapableSelect` after the other, one per folder, with
 * the text prompt for a name: it keeps the keys (record 0018), the frame
 * (0035) and the footer (0019) of those prompts. It makes no file, and only a
 * folder when the user asks for one; a folder made stays when the pick is
 * cancelled.
 */

import path from 'path';
import {
  escapableSelect,
  ESCAPE,
  type EscapableSelectIntro,
} from './EscapableSelectPrompt';
import { EXIT_ALL, EXIT_ALL_SIGNAL } from './ExitAll';
import {
  buildRows,
  committedValue,
  defaultRowId,
  describeFailure,
  listFolder,
  nodeFileSystem,
  parentFolder,
  startLocation,
  validateNewName,
  type FolderListing,
  type PathFlavor,
  type PickAccess,
  type PickerFileSystem,
  type PickerRow,
  type PickKind,
} from './FileSystemPaths';
import { promptInput } from './PromptGate';

/** What to pick, and what the footer shows while the user does. */
export type FileSystemPickRequest = {
  /** The option, as the question names it: `-f, --file <file>`. */
  flags: string;
  kind: PickKind;
  access: PickAccess;
  /** Only files that end in one of these are shown. */
  extensions?: readonly string[];
  /** Entries whose name starts with a dot are shown. */
  showHidden?: boolean;
  /** The option's value now: the picker opens in its folder and highlights it. */
  current?: string;
  /**
   * The footer: the command with `candidate` as the value of the option, or
   * the command as it stands when there is none (the highlighted row is not a
   * pick). Called on every render.
   */
  preview?: (candidate: string | undefined) => string;
  /** What Enter says on the rows that end the pick ("next" in the resolution pass). */
  commitLabel?: string;
  /** The file system and the path rules; this machine's unless a test says otherwise. */
  fileSystem?: PickerFileSystem;
  flavor?: PathFlavor;
};

/** Rows shown at a time: the page has to fit a 24-line terminal with the menu and the footer. */
const PAGE_SIZE = 12;

/** What Escape says: the pick ends, and the caller decides what that means for the command. */
const ESCAPE_LABEL = 'cancel the pick';

function questionFor(request: FileSystemPickRequest): string {
  const { flags, kind, access } = request;
  if (kind === 'file') {
    return access === 'write'
      ? `Choose or name the file for ${flags}:`
      : `Choose the file for ${flags}:`;
  }
  return access === 'write'
    ? `Choose or create the folder for ${flags}:`
    : `Choose the folder for ${flags}:`;
}

/** What Enter does on a row: it never says more than it does (record 0043). */
function enterLabelFor(
  row: PickerRow | undefined,
  commitLabel: string
): string {
  switch (row?.type) {
    case undefined:
      return '';
    case 'up':
    case 'folder':
      return 'open';
    case 'newFolder':
    case 'newFile':
      return 'ask for a name';
    default:
      return commitLabel;
  }
}

function introFor(input: {
  folder: string;
  listing: FolderListing;
  request: FileSystemPickRequest;
  notice?: string;
}): EscapableSelectIntro[] {
  const { folder, listing, request, notice } = input;
  const intro: EscapableSelectIntro[] = [{ text: `In ${folder}` }];
  if (request.kind === 'file' && request.extensions?.length) {
    intro.push({ text: `Files shown: ${request.extensions.join(' ')}` });
  }
  if (listing.error) {
    intro.push({
      text: `This folder cannot be read: ${listing.error}.`,
      tone: 'error',
    });
  } else if (listing.folders.length === 0 && listing.files.length === 0) {
    intro.push({
      text:
        request.kind === 'directory'
          ? 'There are no folders here.'
          : 'There are no files or folders to show here.',
    });
  }
  if (notice) intro.push({ text: notice, tone: 'error' });
  return intro;
}

/**
 * Asks for the name of a new folder or file, in the folder the page shows,
 * until it is one that can be used. Escape, or an empty answer when nothing is
 * suggested, goes back to the page: undefined.
 */
async function askForName(input: {
  what: 'folder' | 'file';
  folder: string;
  listing: FolderListing;
  suggestion?: string;
  request: FileSystemPickRequest;
}): Promise<string | undefined> {
  const { what, folder, listing, suggestion, request } = input;
  let problem: string | undefined;
  for (;;) {
    const answer = await promptInput({
      message: `Name of the new ${what}:`,
      hint: `In ${folder}\n${problem ? `${problem} Try another name.` : 'A name only, without / or \\.'}`,
      ...(what === 'file' && suggestion ? { default: suggestion } : {}),
      ...(request.preview
        ? { preview: () => request.preview!(undefined) }
        : {}),
    });
    if (!answer) return undefined;
    problem = validateNewName(answer, listing.entries, what === 'folder');
    if (!problem) return answer.trim();
  }
}

/**
 * Lets the user pick a path. Resolves with the value to give the option, in
 * the form the command line takes it (relative to the working directory when
 * inside it, else absolute), or with `ESCAPE` when the user backs out. A
 * double Escape ends the session, as in every prompt.
 */
export async function pickFileSystemPath(
  request: FileSystemPickRequest
): Promise<string | typeof ESCAPE> {
  const fileSystem = request.fileSystem ?? nodeFileSystem;
  const flavor = request.flavor ?? path;
  const commitLabel = request.commitLabel ?? 'select';
  const cwd = fileSystem.cwd();
  const start = startLocation(fileSystem, request.current, flavor);
  let folder = start.folder;
  let select: { type: 'folder' | 'file'; name: string } | undefined =
    start.select
      ? {
          type: request.kind === 'directory' ? 'folder' : 'file',
          name: start.select,
        }
      : undefined;
  // the name a new file is offered with: the one the option has now
  const suggestion =
    request.kind === 'file' && request.access === 'write'
      ? start.select
      : undefined;
  let notice: string | undefined;

  for (;;) {
    const listing = listFolder(fileSystem, folder, {
      kind: request.kind,
      extensions: request.extensions,
      showHidden: request.showHidden,
    });
    const rows = buildRows({
      folder,
      listing,
      kind: request.kind,
      access: request.access,
      flavor,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    // the folder of THIS page: `folder` moves on while the page is open
    const here = folder;
    const candidateOf = (id: unknown): string | undefined => {
      const row = typeof id === 'string' ? byId.get(id) : undefined;
      if (row?.type === 'use') return committedValue(here, cwd, flavor);
      if (row?.type === 'file' && row.name !== undefined) {
        return committedValue(flavor.join(here, row.name), cwd, flavor);
      }
      return undefined;
    };
    const defaultId = defaultRowId(rows, {
      kind: request.kind,
      access: request.access,
      select,
    });

    const picked = await escapableSelect<string>({
      message: questionFor(request),
      choices: rows.map((row) => ({ value: row.id, name: row.label })),
      ...(defaultId !== undefined ? { default: defaultId } : {}),
      pageSize: PAGE_SIZE,
      intro: introFor({ folder, listing, request, notice }),
      ...(request.preview
        ? { preview: (id: unknown) => request.preview!(candidateOf(id)) }
        : {}),
      enterLabel: (id) =>
        enterLabelFor(
          typeof id === 'string' ? byId.get(id) : undefined,
          commitLabel
        ),
      escapeLabel: ESCAPE_LABEL,
    });
    notice = undefined;
    select = undefined;

    // a double Escape ends the session from any depth
    if (picked === EXIT_ALL) throw EXIT_ALL_SIGNAL;
    if (picked === ESCAPE || typeof picked !== 'string') return ESCAPE;
    const row = byId.get(picked);
    if (!row) return ESCAPE;

    switch (row.type) {
      case 'use':
        return committedValue(folder, cwd, flavor);
      case 'file':
        return committedValue(flavor.join(folder, row.name!), cwd, flavor);
      case 'up': {
        select = { type: 'folder', name: flavor.basename(folder) };
        folder = parentFolder(folder, flavor) ?? folder;
        break;
      }
      case 'folder':
        folder = flavor.join(folder, row.name!);
        break;
      case 'newFile': {
        const name = await askForName({
          what: 'file',
          folder,
          listing,
          suggestion,
          request,
        });
        if (name !== undefined) {
          return committedValue(flavor.join(folder, name), cwd, flavor);
        }
        break;
      }
      case 'newFolder': {
        const name = await askForName({
          what: 'folder',
          folder,
          listing,
          request,
        });
        if (name === undefined) break;
        const created = flavor.join(folder, name);
        try {
          fileSystem.makeFolder(created);
          folder = created;
        } catch (error) {
          notice = `The folder "${name}" was not created: ${describeFailure(error)}.`;
        }
        break;
      }
    }
  }
}
