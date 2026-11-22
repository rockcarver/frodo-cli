import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  createLauncherFile,
  LAUNCHER_FILE_NAME,
  LAUNCHER_FOLDER_PREFIX,
  LAUNCHER_LIFETIME_MS,
  launcherPage,
  openBrowserThroughLauncherFile,
  removeStaleLauncherFolders,
  SIGN_IN_HINT_MS,
  STALE_LAUNCHER_AGE_MS,
} from './ShellWebLauncher';

/**
 * The launcher file: the page that the browser is opened on instead of the
 * one-time link, so that no secret is in the arguments of the opener.
 */

const LINK =
  'http://127.0.0.1:41234/?t=AbCdEfGh_ijklMNOP-qrstuvwxyz0123456789ABC';
const onPosix = process.platform !== 'win32';

let base: string;
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-launcher-test-'));
});
afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

describe('the launcher page', () => {
  it('sends the browser on to the link at once, with no script and no referrer', () => {
    const page = launcherPage(LINK);
    expect(page).toContain(
      `<meta http-equiv="refresh" content="0;url=${LINK}">`
    );
    expect(page).toContain('<meta name="referrer" content="no-referrer">');
    expect(page).not.toMatch(/<script|src=|href=/i);
  });

  it('does not let a link close its attribute', () => {
    const page = launcherPage('http://127.0.0.1:1/?t="><script>x</script>&y=1');
    expect(page).not.toContain('<script>');
    expect(page).toContain('&#34;&#62;&#60;script&#62;');
    expect(page).toContain('&#38;y=1');
  });
});

describe('createLauncherFile', () => {
  it('makes a new folder and a file in it, and the address of the file is a file address', () => {
    const launcher = createLauncherFile(LINK, base);
    expect(path.dirname(path.dirname(launcher.path))).toBe(base);
    expect(path.basename(path.dirname(launcher.path))).toMatch(
      new RegExp(`^${LAUNCHER_FOLDER_PREFIX}[A-Za-z0-9]{6}$`)
    );
    expect(path.basename(launcher.path)).toBe(LAUNCHER_FILE_NAME);
    expect(launcher.url.startsWith('file://')).toBe(true);
    expect(launcher.url.endsWith(`/${LAUNCHER_FILE_NAME}`)).toBe(true);
    // the address of the file holds nothing of the link
    expect(launcher.url).not.toContain('?t=');
    expect(launcher.url).not.toContain('AbCdEfGh');
    expect(fs.readFileSync(launcher.path, 'utf8')).toBe(launcherPage(LINK));
  });

  (onPosix ? it : it.skip)(
    'lets only the user enter the folder (0700) and read the file (0600), whatever the umask is',
    () => {
      const before = process.umask(0o000);
      try {
        const launcher = createLauncherFile(LINK, base);
        expect(fs.statSync(path.dirname(launcher.path)).mode & 0o777).toBe(
          0o700
        );
        expect(fs.statSync(launcher.path).mode & 0o777).toBe(0o600);
      } finally {
        process.umask(before);
      }
    }
  );

  it('removes the file and its folder, and may be asked again', () => {
    const launcher = createLauncherFile(LINK, base);
    launcher.remove();
    expect(fs.readdirSync(base)).toEqual([]);
    expect(() => launcher.remove()).not.toThrow();
  });

  it('removes nothing but its own file and folder', () => {
    const launcher = createLauncherFile(LINK, base);
    const other = path.join(base, 'keep.txt');
    fs.writeFileSync(other, 'x');
    fs.writeFileSync(path.join(path.dirname(launcher.path), 'extra.txt'), 'x');
    launcher.remove();
    // the file is gone; the folder holds something else, so it stays
    expect(fs.existsSync(launcher.path)).toBe(false);
    expect(fs.existsSync(path.dirname(launcher.path))).toBe(true);
    expect(fs.existsSync(other)).toBe(true);
  });
});

describe('removeStaleLauncherFolders', () => {
  const now = Date.now();
  const old = new Date(now - STALE_LAUNCHER_AGE_MS - 60_000);
  const young = new Date(now - STALE_LAUNCHER_AGE_MS + 60_000);

  function folder(
    name: string,
    when: Date,
    entries: string[] = [LAUNCHER_FILE_NAME]
  ) {
    const directory = path.join(base, name);
    fs.mkdirSync(directory);
    for (const entry of entries)
      fs.writeFileSync(path.join(directory, entry), 'x');
    fs.utimesSync(directory, when, when);
    return directory;
  }

  it('removes the folders of ours that are old enough', () => {
    const left = folder(`${LAUNCHER_FOLDER_PREFIX}aB3dEf`, old);
    expect(removeStaleLauncherFolders(base, STALE_LAUNCHER_AGE_MS, now)).toBe(
      1
    );
    expect(fs.existsSync(left)).toBe(false);
  });

  it('leaves a folder that is not old enough', () => {
    const fresh = folder(`${LAUNCHER_FOLDER_PREFIX}aB3dEf`, young);
    expect(removeStaleLauncherFolders(base, STALE_LAUNCHER_AGE_MS, now)).toBe(
      0
    );
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('leaves what is not named like ours, however old', () => {
    const kept = [
      folder('frodo-shell-open-short', old),
      folder(`${LAUNCHER_FOLDER_PREFIX}aB3dEf-more`, old),
      folder('frodo-something-aB3dEf', old),
      folder('somebody-elses-aB3dEf', old),
    ];
    expect(removeStaleLauncherFolders(base, STALE_LAUNCHER_AGE_MS, now)).toBe(
      0
    );
    for (const directory of kept) expect(fs.existsSync(directory)).toBe(true);
  });

  it('leaves a folder that holds anything besides the launcher file', () => {
    const odd = folder(`${LAUNCHER_FOLDER_PREFIX}aB3dEf`, old, [
      LAUNCHER_FILE_NAME,
      'notes.txt',
    ]);
    expect(removeStaleLauncherFolders(base, STALE_LAUNCHER_AGE_MS, now)).toBe(
      0
    );
    expect(fs.existsSync(path.join(odd, 'notes.txt'))).toBe(true);
  });

  it('leaves a file or a link that is named like a folder of ours', () => {
    const aFile = path.join(base, `${LAUNCHER_FOLDER_PREFIX}fileXX`);
    fs.writeFileSync(aFile, 'x');
    fs.utimesSync(aFile, old, old);
    const target = folder('target', old);
    const aLink = path.join(base, `${LAUNCHER_FOLDER_PREFIX}linkXX`);
    if (onPosix) fs.symlinkSync(target, aLink);
    expect(removeStaleLauncherFolders(base, STALE_LAUNCHER_AGE_MS, now)).toBe(
      0
    );
    expect(fs.existsSync(aFile)).toBe(true);
    expect(fs.existsSync(path.join(target, LAUNCHER_FILE_NAME))).toBe(true);
    if (onPosix) expect(fs.lstatSync(aLink).isSymbolicLink()).toBe(true);
  });

  it('does not fail where there is nothing to look in', () => {
    expect(removeStaleLauncherFolders(path.join(base, 'missing'))).toBe(0);
  });
});

describe('openBrowserThroughLauncherFile', () => {
  type Timer = { at: number; callback: () => void; cancelled: boolean };
  let clock: number;
  let timers: Timer[];
  let said: [string, string | undefined][];
  let opened: string[];
  let exits: ((code: number | null) => void)[];
  let outcome: Promise<boolean>;

  const environment = () => ({
    folder: base,
    open: (url: string, onExit: (code: number | null) => void) => {
      opened.push(url);
      exits.push(onExit);
      return outcome;
    },
    say: (text: string, type?: 'warn' | 'info') => said.push([text, type]),
    setTimeout: (callback: () => void, ms: number) => {
      const timer = { at: clock + ms, callback, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer: object) => {
      (timer as Timer).cancelled = true;
    },
  });
  /** Moves the clock and runs the timers that are due and not cancelled. */
  const advance = (ms: number) => {
    clock += ms;
    for (const timer of timers) {
      if (!timer.cancelled && timer.at <= clock) {
        timer.cancelled = true;
        timer.callback();
      }
    }
  };
  const folders = () =>
    fs.readdirSync(base).filter((n) => n.startsWith(LAUNCHER_FOLDER_PREFIX));
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  beforeEach(() => {
    clock = 0;
    timers = [];
    said = [];
    opened = [];
    exits = [];
    outcome = Promise.resolve(true);
  });

  it('gives the opener the address of the file and nothing else', async () => {
    const exitListeners = process.listeners('exit').length;
    const launcher = openBrowserThroughLauncherFile(LINK, environment());
    await settle();
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatch(/^file:\/\/.*\/open\.html$/);
    expect(opened[0]).not.toContain('?t=');
    expect(opened[0]).not.toContain('AbCdEfGh');
    // and the file holds the link, for the browser to follow
    const file = path.join(base, folders()[0], LAUNCHER_FILE_NAME);
    expect(fs.readFileSync(file, 'utf8')).toContain(LINK);
    launcher.stop();
    expect(process.listeners('exit')).toHaveLength(exitListeners);
  });

  it('removes the file when a browser signs in, and says nothing more', async () => {
    const launcher = openBrowserThroughLauncherFile(LINK, environment());
    await settle();
    expect(folders()).toHaveLength(1);
    launcher.signedIn();
    expect(folders()).toHaveLength(0);
    advance(SIGN_IN_HINT_MS + 1000);
    expect(said).toEqual([]);
  });

  it('removes the file after two minutes when nobody used it', async () => {
    const launcher = openBrowserThroughLauncherFile(LINK, environment());
    await settle();
    advance(LAUNCHER_LIFETIME_MS - 1000);
    expect(folders()).toHaveLength(1);
    advance(2000);
    expect(folders()).toHaveLength(0);
    launcher.stop();
  });

  it('removes the file when the console stops, and cancels the timers', async () => {
    const launcher = openBrowserThroughLauncherFile(LINK, environment());
    await settle();
    launcher.stop();
    expect(folders()).toHaveLength(0);
    advance(LAUNCHER_LIFETIME_MS + 1000);
    expect(said).toEqual([]);
  });

  it('removes the file when the process ends, whatever ended it', async () => {
    const launcher = openBrowserThroughLauncherFile(LINK, environment());
    await settle();
    const atExit = process.listeners('exit').at(-1) as () => void;
    atExit();
    expect(folders()).toHaveLength(0);
    launcher.stop();
  });

  it('reminds the person once, after twenty seconds without a sign-in, that the printed link works', async () => {
    const launcher = openBrowserThroughLauncherFile(LINK, environment());
    await settle();
    advance(SIGN_IN_HINT_MS - 1000);
    expect(said).toEqual([]);
    advance(2000);
    expect(said).toEqual([
      ['No browser signed in yet: open the link printed above.', 'info'],
    ]);
    advance(60_000);
    expect(said).toHaveLength(1);
    // the hint never holds the secret
    expect(JSON.stringify(said)).not.toContain('AbCdEfGh');
    launcher.stop();
  });

  it('says so, and removes the file, when the opener cannot start', async () => {
    outcome = Promise.resolve(false);
    openBrowserThroughLauncherFile(LINK, environment());
    await settle();
    expect(said).toEqual([
      [
        'Could not open a browser automatically. Open the link above in a browser.',
        'warn',
      ],
    ]);
    expect(folders()).toHaveLength(0);
    advance(SIGN_IN_HINT_MS + 1000);
    expect(said).toHaveLength(1);
  });

  it('says so, and removes the file, when the opener raises an error', async () => {
    outcome = Promise.reject(new Error('no launcher'));
    openBrowserThroughLauncherFile(LINK, environment());
    await settle();
    expect(said.map(([, type]) => type)).toEqual(['warn']);
    expect(folders()).toHaveLength(0);
  });

  it('says so, and removes the file, when the opener starts and then ends with an error', async () => {
    openBrowserThroughLauncherFile(LINK, environment());
    await settle();
    expect(said).toEqual([]);
    exits[0](1);
    expect(said.map(([, type]) => type)).toEqual(['warn']);
    expect(folders()).toHaveLength(0);
  });

  it('says nothing when the opener ends well', async () => {
    const launcher = openBrowserThroughLauncherFile(LINK, environment());
    await settle();
    exits[0](0);
    expect(said).toEqual([]);
    expect(folders()).toHaveLength(1);
    launcher.stop();
  });

  it('does not stop the console where no private place can be made', () => {
    const launcher = openBrowserThroughLauncherFile(LINK, {
      ...environment(),
      folder: path.join(base, 'missing'),
    });
    expect(said.map(([, type]) => type)).toEqual(['warn']);
    expect(opened).toEqual([]);
    expect(() => {
      launcher.signedIn();
      launcher.stop();
    }).not.toThrow();
  });

  it('does not keep the process alive for its timers', async () => {
    const unref = jest.fn();
    openBrowserThroughLauncherFile(LINK, {
      ...environment(),
      setTimeout: (callback: () => void, ms: number) => {
        const timer = { at: clock + ms, callback, cancelled: false, unref };
        timers.push(timer);
        return timer;
      },
    });
    await settle();
    expect(unref).toHaveBeenCalledTimes(2);
  });
});
