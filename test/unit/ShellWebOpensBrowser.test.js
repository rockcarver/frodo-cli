import fs from 'fs';
import os from 'os';
import path from 'path';
import { makeHome, removeHome, startFrodo } from '../utils/WebShell.js';

/**
 * `frodo shell --web` opens the default browser with its one-time link unless
 * `--no-open` is given, and prints the link either way. The browser is never
 * a real one: the launcher the CLI looks for (`open` on macOS, `xdg-open`
 * elsewhere) is a stub on a PATH that holds nothing else, and it only writes
 * the address it was given to a file. Runs the checkout's own build (`dist/`,
 * or the binary under FRODO_TEST_BINARY=sea).
 */
const run = process.platform === 'win32' ? describe.skip : describe;

run('frodo shell --web and the default browser', () => {
  let home;
  let toolsDir;
  let openerLog;
  let shell;

  beforeEach(() => {
    home = makeHome();
    toolsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-opener-'));
    openerLog = path.join(toolsDir, 'opened.log');
  });

  afterEach(async () => {
    if (shell) {
      expect(await shell.stop()).toBe(true);
      shell = undefined;
    }
    removeHome(home);
    fs.rmSync(toolsDir, { recursive: true, force: true });
  });

  /** A launcher that records its arguments and starts nothing. */
  function installOpener() {
    for (const name of ['open', 'xdg-open']) {
      const file = path.join(toolsDir, name);
      fs.writeFileSync(
        file,
        '#!/bin/sh\nprintf \'%s\\n\' "$@" >> "$FRODO_TEST_OPENER_LOG"\n'
      );
      fs.chmodSync(file, 0o755);
    }
  }

  /** PATH holds the stub directory only, so no real launcher can be found. */
  function start(args) {
    shell = startFrodo({
      args,
      homeDir: home,
      env: { PATH: toolsDir, FRODO_TEST_OPENER_LOG: openerLog },
    });
    return shell;
  }

  const opened = () =>
    fs.existsSync(openerLog)
      ? fs.readFileSync(openerLog, 'utf8').split('\n').filter(Boolean)
      : [];

  async function until(check, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (check()) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  }

  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  test('1: opens the browser once with the link it prints', async () => {
    installOpener();
    start(['shell', '--web']);
    const link = await shell.link();

    expect(await until(() => opened().length > 0)).toBe(true);
    // a launcher that is asked twice would redeem the one-time link twice
    await pause(2000);
    expect(opened()).toEqual([link]);
    expect(shell.output()).toContain('Opening it in your default browser');
    expect(shell.output()).not.toContain('Could not open a browser');
  }, 90_000);

  test('2: with --no-open it prints the link and opens nothing', async () => {
    installOpener();
    start(['shell', '--web', '--no-open']);
    await shell.link();

    await pause(3000);
    expect(opened()).toEqual([]);
    expect(shell.output()).toContain('Open this link to sign in');
    expect(shell.output()).not.toContain('Opening it in your default browser');
  }, 90_000);

  test('3: a browser that cannot be opened is said so, the link is still printed and the console keeps running', async () => {
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
  }, 90_000);
});
