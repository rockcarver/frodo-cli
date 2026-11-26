import fs from 'node:fs';
import path from 'node:path';
import {
  frodo,
  FrodoError,
  type FileSetEntry,
  type FileSetReader,
} from '@rockcarver/frodo-lib';
import { assertInside } from './ConfigTreePath';
import {
  asError,
  codeOf,
  containerOf,
  resolveRoot,
  walk,
  type Walked,
} from './FsFileSetRoot';

/**
 * The file-system reader of a file set: the `FileSetReader` that a push is given when its files
 * are in a folder. Every call is a call of the library's contract (a path is relative to the root
 * of the set, with `/` between the parts; `''` is not a path, so the root cannot be listed).
 *
 * - A path that the library gate refuses rejects, before the disk is touched.
 * - A directory or a file that is not there gives `undefined`, and so does a path below a file. A
 *   path in another case or Unicode form than the entry on a case-insensitive disk is not that
 *   entry: `undefined`.
 * - A link is followed when its real path is strictly inside the folder; a link that leaves it, a
 *   link whose target is not there and a loop of links reject.
 * - A listing gives the names as the operating system gives them (nothing is decoded or cut), in
 *   ordinal order (by UTF-16 code unit), and a name that the gate refuses is listed as well: a read
 *   of it rejects. A link to a folder inside the container lists as a directory.
 * - A file is read only when it is a regular file, as strict UTF-8; a byte order mark and carriage
 *   returns are kept. A file that cannot be read (no permission, an I/O error, too many open
 *   files) rejects: it is never `undefined`. A file that vanishes between the listing and the read
 *   is `undefined`.
 *
 * Known differences from the reader that the library keeps in memory: a folder that exists on the
 * disk and is empty lists as `[]` even when no set owns it (the disk knows no ownership), and a root
 * that is not there makes every path `undefined`. The reader never writes, never caches, reads no
 * state and takes no name apart: a name is a name.
 * @param {string} root the folder that holds the set (a relative path is resolved against the working directory when it is made; an empty name is refused)
 * @returns {FileSetReader} the reader
 */
export function fsFileSetReader(root: string): FileSetReader {
  const folder = resolveRoot(root);
  let container: string | undefined;

  /** The real path of the folder, kept after the first success. */
  const containerOfCall = async (): Promise<string | undefined> => {
    if (container === undefined) container = await containerOf(folder, false);
    return container;
  };

  return {
    async listDirectory(setPath: string): Promise<FileSetEntry[] | undefined> {
      frodo.utils.assertFileSetPath(setPath);
      const base = await containerOfCall();
      if (base === undefined) return undefined;
      const walked = await walkOf(base, setPath);
      if (walked.state !== 'found') return undefined;
      let dirents: fs.Dirent[];
      try {
        dirents = await fs.promises.readdir(walked.real, {
          withFileTypes: true,
        });
      } catch (error) {
        if (codeOf(error) === 'ENOENT') return undefined;
        if (codeOf(error) === 'ENOTDIR') {
          throw new Error(`The path '${setPath}' is a file, not a directory.`, {
            cause: error,
          });
        }
        throw new FrodoError(`Error reading ${setPath}`, asError(error));
      }
      const entries: FileSetEntry[] = [];
      for (const dirent of dirents) {
        entries.push({
          name: dirent.name,
          isDirectory:
            dirent.isDirectory() ||
            (dirent.isSymbolicLink() &&
              (await isFolderInside(
                base,
                path.join(walked.real, dirent.name)
              ))),
        });
      }
      return entries.sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0
      );
    },

    async readFile(setPath: string): Promise<string | undefined> {
      frodo.utils.assertFileSetPath(setPath);
      const base = await containerOfCall();
      if (base === undefined) return undefined;
      const walked = await walkOf(base, setPath);
      if (walked.state !== 'found') return undefined;
      let bytes: Buffer;
      try {
        const info = await fs.promises.lstat(walked.real);
        if (info.isDirectory()) {
          throw new Error(`The path '${setPath}' is a directory, not a file.`);
        }
        // a FIFO, a socket or a device is not opened: opening a FIFO waits for a writer
        if (!isRegularFile(info)) {
          throw new Error(`The path '${setPath}' is not a regular file.`);
        }
        const handle = await fs.promises.open(
          walked.real,
          fs.constants.O_RDONLY |
            (fs.constants.O_NOFOLLOW ?? 0) |
            (fs.constants.O_NONBLOCK ?? 0)
        );
        try {
          // the file that was opened is the file that was looked at
          if (!isRegularFile(await handle.stat())) {
            throw new Error(`The path '${setPath}' is not a regular file.`);
          }
          bytes = await handle.readFile();
        } finally {
          await handle.close();
        }
      } catch (error) {
        if (codeOf(error) === 'ENOENT') return undefined;
        // an error of ours (a folder, a FIFO) has no system code and is thrown as it is
        if (codeOf(error) === undefined) throw error;
        throw new FrodoError(`Error reading ${setPath}`, asError(error));
      }
      try {
        // `ignoreBOM` keeps the byte order mark in the text: a file is read byte for byte
        return new TextDecoder('utf-8', {
          fatal: true,
          ignoreBOM: true,
        }).decode(bytes);
      } catch (error) {
        throw new FrodoError(
          `Error reading ${setPath}`,
          new Error('The file is not valid UTF-8 text.', {
            cause: asError(error),
          })
        );
      }
    },
  };
}

/**
 * The walk of a path, where a failure of the file system is an error that names the path and keeps the
 * cause, as every other failure to read is. What the walk says about a link has no code of the system and is
 * thrown as it is.
 * @param {string} container the real path of the container
 * @param {string} setPath the path in the set
 * @returns {Promise<Walked>} what the walk found
 */
async function walkOf(container: string, setPath: string): Promise<Walked> {
  try {
    return await walk(container, setPath.split('/'));
  } catch (error) {
    if (codeOf(error) === undefined) throw error;
    throw new FrodoError(`Error reading ${setPath}`, asError(error));
  }
}

/**
 * Whether what `lstat` or `fstat` found is a regular file (not a folder, a FIFO, a socket or a device).
 * @param {fs.Stats} info what was found
 * @returns {boolean} true for a regular file
 */
function isRegularFile(info: fs.Stats): boolean {
  return info.isFile();
}

/**
 * Whether a link in a listing is a link to a folder inside the container. A link that leaves it, or
 * that leads nowhere, is listed as a name that is not a directory: a read of it rejects, so the
 * listing is not the place that fails.
 * @param {string} container the real path of the container
 * @param {string} link the path of the link
 * @returns {Promise<boolean>} true if the link leads to a folder strictly inside the container
 */
async function isFolderInside(
  container: string,
  link: string
): Promise<boolean> {
  try {
    const real = await fs.promises.realpath(link);
    assertInside(container, real);
    return (await fs.promises.stat(real)).isDirectory();
  } catch {
    return false;
  }
}
