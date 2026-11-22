import cp from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
  isSeaMode,
  repoRoot,
} = require('../e2e/utils/FrodoBinary.cjs');

/** The link that `frodo shell --web` prints to the terminal. */
const LINK = /http:\/\/127\.0\.0\.1:\d+\/\?t=[\w-]+/;

/**
 * Runs this checkout's frodo the way the tests of the web console need it, as
 * a process whose whole tree a test can end: the native binary under
 * FRODO_TEST_BINARY=sea, else node and dist/launch.cjs (run directly, not
 * through the shim of the e2e tests, so that a signal reaches the launcher).
 * @param {string[]} args the command line
 * @returns {[string, string[]]} the executable and its arguments
 */
export function frodoCommand(args) {
  if (isSeaMode) {
    ensureFrodoArtifact();
    return [binaryPath, args];
  }
  return [
    process.execPath,
    [path.join(repoRoot, 'dist', 'launch.cjs'), ...args],
  ];
}

/**
 * The executable that a tab engine runs as, when the web console starts it
 * with FRODO_ENGINE_WORKER set: the native binary itself, or node and the
 * bundle (`dist/app.cjs`, the file the launcher runs).
 * @returns {[string, string[]]} the executable and its arguments
 */
export function engineWorkerCommand() {
  if (isSeaMode) {
    ensureFrodoArtifact();
    return [binaryPath, []];
  }
  return [process.execPath, [path.join(repoRoot, 'dist', 'app.cjs')]];
}

/**
 * Puts a stub of the system's opener (`open` for macOS, `xdg-open` elsewhere)
 * into `directory`: it writes the arguments it was given, one per line, to
 * `logFile`, waits `sleepSeconds`, and ends with `exitCode`. A test puts that
 * directory ALONE on the PATH of the console, so that no real browser can be
 * opened and the arguments of the opener can be read.
 * @param {string} directory where to put the stub
 * @param {string} logFile where the stub writes the arguments
 * @param {{sleepSeconds?: number, exitCode?: number}} [options]
 */
export function installStubOpener(directory, logFile, options = {}) {
  const { sleepSeconds = 0, exitCode = 0 } = options;
  for (const name of ['open', 'xdg-open']) {
    const file = path.join(directory, name);
    fs.writeFileSync(
      file,
      `#!/bin/sh\nprintf '%s\\n' "$@" >> '${logFile}'\n` +
        (sleepSeconds > 0 ? `sleep ${sleepSeconds}\n` : '') +
        `exit ${exitCode}\n`
    );
    fs.chmodSync(file, 0o755);
  }
}

/** A scratch home directory: a test never touches the real one. */
export function makeHome(prefix = 'frodo-webshell-home-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeHome(homeDir) {
  fs.rmSync(homeDir, { recursive: true, force: true });
}

function groupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Starts `frodo <args>` in a process group of its own, with a scratch home,
 * and a watchdog that kills the whole group when a test forgets to stop it.
 * The web console starts one engine process per browser tab; they are all in
 * the group, so ending the group ends them.
 * @param {object} options
 * @param {string[]} options.args the command line
 * @param {string} options.homeDir the scratch home
 * @param {Record<string, string>} [options.env] added to the environment of the process
 * @param {number} [options.watchdogMs] the longest the process may live
 */
export function startFrodo({ args, homeDir, env = {}, watchdogMs = 120_000 }) {
  const [command, commandArgs] = frodoCommand(args);
  const child = cp.spawn(command, commandArgs, {
    cwd: repoRoot,
    detached: true,
    env: {
      ...process.env,
      FRODO_TEST: '1',
      FRODO_NO_CACHE: 'true',
      FRODO_NO_UPDATE_CHECK: '1',
      FRODO_CONNECTION_PROFILES_PATH: '',
      NODE_OPTIONS: '',
      HOME: homeDir,
      ...env,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // printMessage writes to stderr (utils/Console.ts), so the link arrives there.
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  let exited = false;
  child.on('exit', () => {
    exited = true;
  });
  const killGroup = (signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch {
      // the group is gone
    }
  };
  const watchdog = setTimeout(() => killGroup('SIGKILL'), watchdogMs);
  watchdog.unref();

  return {
    child,
    /** Everything the process wrote to its output and error output so far. */
    output: () => output,
    get exited() {
      return exited;
    },
    /** The one-time link, once it is printed. */
    async link(timeoutMs = 40_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const match = LINK.exec(output);
        if (match) return match[0];
        if (exited) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(
        `no link; the process ${exited ? 'ended' : 'was still running'}; output: ${output.replace(/\?t=[\w-]+/g, '?t=<redacted>').slice(0, 500)}`
      );
    },
    /** Ends the process and everything it started; resolves when none is left. */
    async stop() {
      clearTimeout(watchdog);
      killGroup('SIGTERM');
      const deadline = Date.now() + 10_000;
      while (groupAlive(child.pid) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (groupAlive(child.pid)) {
        killGroup('SIGKILL');
        const kill = Date.now() + 5_000;
        while (groupAlive(child.pid) && Date.now() < kill) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      return !groupAlive(child.pid);
    },
    /** Whether any process of the group is still alive. */
    groupAlive: () => groupAlive(child.pid),
  };
}

/**
 * What a browser does with the one-time link, over plain HTTP: redeems it,
 * loads the page for its per-session secret, and returns a function for the
 * calls of the page.
 * @param {string} link the link the terminal showed
 */
export async function signInOverHttp(link) {
  const base = new URL(link).origin;
  const redeemed = await fetch(link, { redirect: 'manual' });
  if (redeemed.status !== 200) {
    throw new Error(`the link was answered with ${redeemed.status}`);
  }
  const cookie = (redeemed.headers.get('set-cookie') ?? '').split(';')[0];
  const page = await (await fetch(`${base}/`, { headers: { cookie } })).text();
  const csrf = /name="csrf-token" content="([^"]+)"/.exec(page)?.[1];
  if (!csrf) throw new Error('the page carries no per-session secret');
  return async function call(method, apiPath, body, engine) {
    const headers = { cookie, 'x-frodo-csrf': csrf };
    if (engine) headers['x-frodo-engine'] = engine;
    if (method === 'POST') {
      headers['content-type'] = 'application/json';
      headers.origin = base;
    }
    const reply = await fetch(`${base}${apiPath}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await reply.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON: the caller reads text
    }
    return { status: reply.status, json, text };
  };
}
