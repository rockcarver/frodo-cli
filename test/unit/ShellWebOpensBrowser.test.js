import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  installStubOpener,
  makeHome,
  removeHome,
  signInOverHttp,
  startFrodo,
} from '../utils/WebShell.js';

/**
 * `frodo shell --web` opens the default browser unless `--no-open` is given, and
 * prints the link either way. The opener is NEVER a real one: the launcher the
 * CLI looks for (`open` on macOS, `xdg-open` elsewhere) is a stub on a PATH that
 * holds nothing else, and it only writes the arguments it was given to a file.
 * What the opener is given is the address of a private launcher file, never the
 * link: a process that lists the arguments of the others sees a path.
 * Runs the checkout's own build (`dist/`, or the binary under
 * FRODO_TEST_BINARY=sea).
 */
const run = process.platform === 'win32' ? describe.skip : describe;
const LAUNCHER_FOLDER = /^frodo-shell-open-[A-Za-z0-9]{6}$/;

run('frodo shell --web and the default browser', () => {
  let home;
  let tools;
  let temporary;
  let openerLog;
  let shell;

  beforeEach(() => {
    home = makeHome();
    tools = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-opener-'));
    // the temporary directory of the console: its own, to look at what it leaves
    temporary = path.join(tools, 'tmp');
    fs.mkdirSync(temporary);
    openerLog = path.join(tools, 'opened.log');
  });

  afterEach(async () => {
    if (shell) {
      expect(await shell.stop()).toBe(true);
      shell = undefined;
    }
    removeHome(home);
    fs.rmSync(tools, { recursive: true, force: true });
  });

  /** PATH holds the tools directory only, so no real launcher can be found. */
  function start(args, env = {}) {
    shell = startFrodo({
      args,
      homeDir: home,
      env: { PATH: tools, TMPDIR: temporary, ...env },
    });
    return shell;
  }

  const opened = () =>
    fs.existsSync(openerLog)
      ? fs.readFileSync(openerLog, 'utf8').split('\n').filter(Boolean)
      : [];
  const launcherFolders = () =>
    fs.readdirSync(temporary).filter((name) => LAUNCHER_FOLDER.test(name));
  const secretOf = (link) => new URL(link).searchParams.get('t');

  async function until(check, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (check()) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }

  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** The command lines of every process of the machine, as any user can list them. */
  const processList = () =>
    new Promise((resolve) => {
      cp.execFile(
        'ps',
        ['-axo', 'args='],
        { maxBuffer: 64 * 1024 * 1024 },
        (_, out) => resolve(String(out ?? '').split('\n'))
      );
    });

  test('1: opens the browser once, with the address of a private file and not with the link', async () => {
    installStubOpener(tools, openerLog, { sleepSeconds: 3 });
    start(['shell', '--web']);
    const link = await shell.link();
    const secret = secretOf(link);

    // What a process that lists the arguments of the others sees, for as long as
    // the opener lives: a path, and never the secret.
    const seen = [];
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      for (const line of await processList()) {
        if (line.includes(tools) || line.includes(secret)) {
          seen.push(line);
        }
      }
      await pause(20);
    }
    expect(seen.some((line) => line.includes('/open.html'))).toBe(true);
    expect(seen.filter((line) => line.includes(secret))).toEqual([]);

    // what the opener was given: once, and a file address
    expect(opened()).toHaveLength(1);
    const [given] = opened();
    expect(given).toMatch(
      /^file:\/\/.*\/frodo-shell-open-[A-Za-z0-9]{6}\/open\.html$/
    );
    expect(given).not.toContain('?t=');
    expect(given).not.toContain(secret);

    // the file is private, and holds what sends the browser to the link
    const folder = path.join(temporary, launcherFolders()[0]);
    const file = path.join(folder, 'open.html');
    expect(fs.readdirSync(folder)).toEqual(['open.html']);
    expect(fs.statSync(folder).mode & 0o777).toBe(0o700);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(file, 'utf8')).toContain(link);

    expect(shell.output()).toContain('Opening it in your default browser');
    expect(shell.output()).not.toContain('Could not open a browser');
  }, 90_000);

  test('2: a browser that uses the link ends the file, and the terminal says so without the link', async () => {
    installStubOpener(tools, openerLog);
    start(['shell', '--web']);
    const link = await shell.link();
    expect(await until(() => opened().length > 0)).toBe(true);
    expect(launcherFolders()).toHaveLength(1);

    await signInOverHttp(link);

    expect(await until(() => launcherFolders().length === 0)).toBe(true);
    expect(
      await until(() => shell.output().includes('A browser signed in'))
    ).toBe(true);
    // a second use of the link is refused and says nothing
    const again = await fetch(link, { redirect: 'manual' });
    expect(again.status).toBe(403);
    await pause(300);
    const told = shell
      .output()
      .split('A browser signed in to the web console.');
    expect(told).toHaveLength(2);
    // the secret is in the output once: the banner
    expect(shell.output().split(secretOf(link))).toHaveLength(2);
  }, 90_000);

  test('3: with --no-open it prints the link and opens nothing, and makes no file', async () => {
    installStubOpener(tools, openerLog);
    start(['shell', '--web', '--no-open']);
    await shell.link();

    await pause(3000);
    expect(opened()).toEqual([]);
    expect(launcherFolders()).toEqual([]);
    expect(shell.output()).toContain('Open this link to sign in');
    expect(shell.output()).not.toContain('Opening it in your default browser');
  }, 90_000);

  test('4: with FRODO_BROWSER_LOGIN_NO_OPEN it does the same', async () => {
    installStubOpener(tools, openerLog);
    start(['shell', '--web'], { FRODO_BROWSER_LOGIN_NO_OPEN: '1' });
    await shell.link();

    await pause(3000);
    expect(opened()).toEqual([]);
    expect(launcherFolders()).toEqual([]);
    expect(shell.output()).toContain('Open this link to sign in');
  }, 90_000);

  test('5: a browser that cannot be opened is said so, the link is still printed, nothing is left and the console keeps running', async () => {
    // no launcher at all on the PATH
    start(['shell', '--web']);
    const link = await shell.link();

    expect(
      await until(() =>
        shell.output().includes('Could not open a browser automatically')
      )
    ).toBe(true);
    expect(shell.output()).toContain(link);
    expect(shell.exited).toBe(false);
    expect(opened()).toEqual([]);
    expect(launcherFolders()).toEqual([]);
  }, 90_000);

  test('6: an opener that starts and then ends with an error is said so, and the file goes', async () => {
    installStubOpener(tools, openerLog, { exitCode: 1 });
    start(['shell', '--web']);
    const link = await shell.link();

    expect(
      await until(() =>
        shell.output().includes('Could not open a browser automatically')
      )
    ).toBe(true);
    expect(opened()).toHaveLength(1);
    expect(shell.output()).toContain(link);
    expect(shell.exited).toBe(false);
    expect(launcherFolders()).toEqual([]);
  }, 90_000);

  test('7: the files of runs that were killed are removed at the next start, and only those', async () => {
    const old = new Date(Date.now() - 60 * 60 * 1000);
    const make = (name, when, entries = ['open.html']) => {
      const folder = path.join(temporary, name);
      fs.mkdirSync(folder);
      for (const entry of entries)
        fs.writeFileSync(path.join(folder, entry), 'x');
      fs.utimesSync(folder, when, when);
      return folder;
    };
    const stale = make('frodo-shell-open-aB3dEf', old);
    const fresh = make('frodo-shell-open-gH4jKl', new Date());
    const other = make('frodo-shell-other-mN5pQr', old);
    const odd = make('frodo-shell-open-sT6uVw', old, [
      'open.html',
      'notes.txt',
    ]);
    installStubOpener(tools, openerLog);
    start(['shell', '--web', '--no-open']);
    await shell.link();

    expect(await until(() => !fs.existsSync(stale))).toBe(true);
    expect(fs.existsSync(fresh)).toBe(true);
    expect(fs.existsSync(other)).toBe(true);
    expect(fs.existsSync(odd)).toBe(true);
  }, 90_000);

  test('8: the file goes when the console stops before anyone used it', async () => {
    installStubOpener(tools, openerLog);
    start(['shell', '--web']);
    await shell.link();
    expect(await until(() => launcherFolders().length === 1)).toBe(true);

    expect(await shell.stop()).toBe(true);

    expect(launcherFolders()).toEqual([]);
  }, 90_000);
});
