import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * How `frodo shell --web` hands its one-time link to a browser it opens.
 *
 * The link holds the secret that signs the console in. An address given to the
 * program that opens a browser is an argument of that program, and any process
 * of the machine can read the arguments of the others for as long as they live
 * (and the browser that program starts may keep them for as long as it runs).
 * So the program is given the address of a LAUNCHER FILE instead: a page that
 * does nothing but send the browser on to the link. The file sits in a new
 * folder that only the current user can enter, is readable by that user alone,
 * and is removed as soon as the link is used, after two minutes, and when the
 * console stops. No secret is in any argument list.
 *
 * What stays true: a process of the same user (and root) can read the file for
 * that short time, as it can already read the credentials of the console. The
 * link is also always printed to the terminal.
 */

/** The start of the name of the folder that holds a launcher file. */
export const LAUNCHER_FOLDER_PREFIX = 'frodo-shell-open-';
/** The name of the launcher file, the only thing in its folder. */
export const LAUNCHER_FILE_NAME = 'open.html';
/** How long a launcher file may live before it is removed unused. */
export const LAUNCHER_LIFETIME_MS = 2 * 60 * 1000;
/** How long without a sign-in before the terminal is reminded of the printed link. */
export const SIGN_IN_HINT_MS = 20 * 1000;
/** Folders of earlier runs that are older than this are removed at the next start. */
export const STALE_LAUNCHER_AGE_MS = 10 * 60 * 1000;

const escapeAttribute = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The page of the launcher file: it sends the browser on to the link at once
 * and says what to do if it does not. No script and no outside resource; the
 * referrer is not sent, so the link is not handed on to the console's page.
 * @param link the one-time link of the console
 * @returns the HTML of the page
 */
export function launcherPage(link: string): string {
  return (
    '<!doctype html>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="referrer" content="no-referrer">\n' +
    `<meta http-equiv="refresh" content="0;url=${escapeAttribute(link)}">\n` +
    '<title>frodo</title>\n' +
    '<p>Opening the frodo console. If nothing happens, use the link that frodo printed in the terminal.\n'
  );
}

/** A launcher file that exists on disk until it is removed. */
export type LauncherFile = {
  /** The path of the file. */
  path: string;
  /** The `file:` address of the file: the only thing the opener is given. */
  url: string;
  /** Removes the file and its folder; safe to call again and after a crash of either. */
  remove(): void;
};

/**
 * Writes a launcher file for `link` into a new folder of the temporary
 * directory that only the current user can enter (mode 0700), with a file only
 * that user can read (mode 0600).
 * @param link the one-time link of the console
 * @param folder the directory to make the new folder in (the temporary directory of the user by default)
 * @returns the launcher file
 */
export function createLauncherFile(
  link: string,
  folder: string = os.tmpdir()
): LauncherFile {
  const directory = fs.mkdtempSync(path.join(folder, LAUNCHER_FOLDER_PREFIX));
  // mkdtemp makes it 0700 less what the umask takes away; say it again, so that
  // the user can always enter it
  fs.chmodSync(directory, 0o700);
  const file = path.join(directory, LAUNCHER_FILE_NAME);
  fs.writeFileSync(file, launcherPage(link), { flag: 'wx', mode: 0o600 });
  // the umask may have taken owner bits from the mode of the file as well: the
  // browser of the same user has to be able to read it
  fs.chmodSync(file, 0o600);
  return {
    path: file,
    url: pathToFileURL(file).href,
    remove() {
      removeLauncherFolder(directory);
    },
  };
}

/**
 * Removes a folder of a launcher file, and nothing else: the file it holds
 * first, then the folder, which only goes when it is empty.
 * @param directory the folder
 * @returns true when the folder was removed
 */
function removeLauncherFolder(directory: string): boolean {
  try {
    fs.rmSync(path.join(directory, LAUNCHER_FILE_NAME), { force: true });
    fs.rmdirSync(directory);
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes the launcher folders that earlier runs left behind (a run that was
 * killed): only a real directory (not a link) directly in `folder`, named like
 * ours, owned by the current user, older than `maxAgeMs`, and holding nothing
 * but the launcher file. Anything else is left alone.
 * @param folder the directory to look in (the temporary directory of the user by default)
 * @param maxAgeMs the age from which a folder counts as left behind
 * @param now the time now, in milliseconds
 * @returns how many folders were removed
 */
export function removeStaleLauncherFolders(
  folder: string = os.tmpdir(),
  maxAgeMs: number = STALE_LAUNCHER_AGE_MS,
  now: number = Date.now()
): number {
  let removed = 0;
  let names: string[];
  try {
    names = fs.readdirSync(folder);
  } catch {
    return 0;
  }
  const mine = typeof process.getuid === 'function' ? process.getuid() : null;
  for (const name of names) {
    if (!/^frodo-shell-open-[A-Za-z0-9]{6}$/.test(name)) continue;
    const directory = path.join(folder, name);
    try {
      const stat = fs.lstatSync(directory);
      if (!stat.isDirectory()) continue;
      if (mine !== null && stat.uid !== mine) continue;
      if (now - stat.mtimeMs < maxAgeMs) continue;
      const entries = fs.readdirSync(directory);
      if (entries.some((entry) => entry !== LAUNCHER_FILE_NAME)) continue;
      if (removeLauncherFolder(directory)) removed++;
    } catch {
      // gone meanwhile, or not ours to look at
    }
  }
  return removed;
}

/** A timer, as far as the launcher cares: it may be told not to keep the process alive. */
type Timer = { unref?: () => void };

/** What the launcher needs from the outside; a test supplies its own. */
export type LauncherEnvironment = {
  /**
   * Asks the system to open an address. Answers whether the opener started;
   * calls `onExit` with its exit code when it ends.
   */
  open: (
    url: string,
    onExit: (code: number | null) => void
  ) => Promise<boolean>;
  /** Says something to the person (the terminal). */
  say: (text: string, type?: 'warn' | 'info') => void;
  /** Where to make the folder of the launcher file. */
  folder?: string;
  /** Timers; a test supplies fake ones. */
  setTimeout?: (callback: () => void, ms: number) => Timer;
  clearTimeout?: (timer: Timer) => void;
};

/** A browser that is being opened through a launcher file. */
export type BrowserLauncher = {
  /** A browser signed in with the link: the file is not needed any more. */
  signedIn(): void;
  /** The console stops: remove the file and the timers. */
  stop(): void;
};

const COULD_NOT_OPEN =
  'Could not open a browser automatically. Open the link above in a browser.';

/**
 * Opens the default browser on a launcher file for `link` and looks after it.
 * The opener is given the address of the file only. The file is removed when a
 * browser signs in, when the opener cannot start or ends with an error, after
 * {@link LAUNCHER_LIFETIME_MS}, when the console stops and when the process
 * ends. A person who has seen no sign-in after {@link SIGN_IN_HINT_MS} is
 * reminded once that the printed link works.
 * @param link the one-time link of the console
 * @param environment the system calls and the terminal
 * @returns what the console calls when a browser signs in and when it stops
 */
export function openBrowserThroughLauncherFile(
  link: string,
  environment: LauncherEnvironment
): BrowserLauncher {
  const timeout =
    environment.setTimeout ?? ((callback, ms) => setTimeout(callback, ms));
  const cancel =
    environment.clearTimeout ?? ((timer) => clearTimeout(timer as never));
  let file: LauncherFile;
  try {
    file = createLauncherFile(link, environment.folder);
  } catch {
    // no private place to put it: the printed link is the way in
    environment.say(COULD_NOT_OPEN, 'warn');
    return { signedIn() {}, stop() {} };
  }
  let finished = false;
  const timers: Timer[] = [];
  // the file does not outlive the process, whatever ended it
  const removeAtExit = () => file.remove();
  process.once('exit', removeAtExit);
  const finish = () => {
    finished = true;
    file.remove();
    for (const timer of timers) cancel(timer);
    timers.length = 0;
    process.off('exit', removeAtExit);
  };
  const failed = () => {
    if (finished) return;
    finish();
    environment.say(COULD_NOT_OPEN, 'warn');
  };
  timers.push(
    timeout(() => {
      environment.say(
        'No browser signed in yet: open the link printed above.',
        'info'
      );
    }, SIGN_IN_HINT_MS),
    timeout(() => file.remove(), LAUNCHER_LIFETIME_MS)
  );
  for (const timer of timers) timer.unref?.();
  environment
    .open(file.url, (code) => {
      if (code !== 0 && code !== null) failed();
    })
    .then(
      (started) => {
        if (!started) failed();
      },
      () => failed()
    );
  return {
    signedIn() {
      if (!finished) finish();
    },
    stop() {
      if (!finished) finish();
    },
  };
}
