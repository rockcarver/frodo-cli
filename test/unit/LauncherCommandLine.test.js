import cp from 'child_process';
import fs from 'fs';
import { builtinModules } from 'module';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { isTruthyOptInValue } from '../../src/utils/EnvFlags.ts';

/**
 * How the entry of the npm package (`dist/launch.cjs`, the `bin` and `main`
 * entry and the Docker entrypoint) starts the app.
 *
 * The entry runs the app, `app.cjs`, in its OWN process. It used to spawn a
 * second Node process (`node --no-warnings --enable-source-maps app.cjs`) and
 * forward four signals to it, and before that it also passed
 * `--experimental-loader`. The second process cost about a quarter of every
 * start and about 170 MB for a server that idles, copied the exit code but
 * not a death by signal (a killed app exited 0), and was orphaned when it was
 * itself killed. These tests keep all of that gone, and they pin what the
 * single process has to do in its place: source maps are OFF unless
 * `FRODO_SOURCE_MAPS` asks for them (and must be switched on BEFORE the app
 * loads), and `process.argv[1]` is the path of `app.cjs` (frodo-lib recognises
 * the CLI by that name; without it every e2e replay in dev mode, which runs
 * this entry, finds no recording). It does NOT touch process warnings: until
 * frodo-lib stopped loading its test recorder at start-up (5.0.0-51), the entry
 * removed the `warning` listeners, because that load printed Node 26's
 * `localStorage` ExperimentalWarning on every start. Warnings are Node's own
 * business again, and `node --no-warnings` or `NODE_OPTIONS=--no-warnings`
 * still silences them. `test/unit/LauncherStderrFakeAm.test.js` runs the real
 * CLI and pins that a normal start writes nothing to stderr.
 *
 * The entry is a standalone file (it requires only Node built-ins and
 * `./app.cjs`), so the test copies the BUILT `dist/launch.cjs` next to a fake
 * `app.cjs` that reports how it was started or behaves as the case needs, and
 * runs the copy. Nothing of the real CLI runs. Run `npx tsdown` first (the
 * test scripts do not rebuild `dist/`); without a build the cases are skipped.
 */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const DIST = path.join(ROOT, 'dist');
const LAUNCHER = path.join(DIST, 'launch.cjs');
const hasDist = fs.existsSync(LAUNCHER);
const testif = (condition) => (condition ? test : test.skip);

const SIGNALS = ['SIGHUP', 'SIGTERM', 'SIGINT', 'SIGQUIT'];

/**
 * The fake app. FAKE_APP_MODE selects what it does:
 * - report: prints what it can see of its own process as JSON (the number of
 *   `warning` listeners and whether the entry set `NODE_NO_WARNINGS` among them)
 * - warn: emits a process warning
 * - throw: throws (the source map maps every line of this file to the same
 *   line of `Original.ts`)
 * - exit3: sets the exit code 3
 * - selfkill: sends itself SIGTERM, which no handler catches
 * - idle: writes its own pid to FAKE_READY, says `ready`, and waits
 * - handlers: handles the four signals the way the real app does (says which
 *   one it got and exits 0), says `ready`, and waits
 */
const FAKE_APP = `const mode = process.env.FAKE_APP_MODE;
const wait = () => setInterval(() => {}, 1000);
if (mode === 'report') {
  process.stdout.write(JSON.stringify({
    pid: process.pid,
    execArgv: process.execArgv,
    sourceMapsEnabled: process.sourceMapsEnabled,
    warningListeners: process.listenerCount('warning'),
    setsNoWarnings: 'NODE_NO_WARNINGS' in process.env,
    argv1: process.argv[1],
    args: process.argv.slice(2),
  }));
} else if (mode === 'warn') {
  process.emitWarning('a process warning');
} else if (mode === 'throw') {
  throw new Error('thrown by the fake app');
} else if (mode === 'exit3') {
  process.exitCode = 3;
} else if (mode === 'selfkill') {
  process.kill(process.pid, 'SIGTERM');
  wait();
} else if (mode === 'idle') {
  require('node:fs').writeFileSync(process.env.FAKE_READY, String(process.pid));
  process.stdout.write('ready\\n');
  wait();
} else if (mode === 'handlers') {
  for (const name of ['SIGHUP', 'SIGTERM', 'SIGINT', 'SIGQUIT']) {
    process.on(name, () => {
      process.stdout.write('got ' + name + '\\n');
      process.exit(0);
    });
  }
  process.stdout.write('ready\\n');
  wait();
}
//# sourceMappingURL=app.cjs.map
`;

/** A source map that sends every line of the fake app to the same line of `Original.ts`. */
function sourceMapFor(app) {
  const lines = app.split('\n').length;
  return JSON.stringify({
    version: 3,
    file: 'app.cjs',
    sources: ['Original.ts'],
    names: [],
    mappings: ['AAAA', ...Array(lines - 1).fill('AACA')].join(';'),
  });
}

let dir;
let children;
let orphans;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-launcher-'));
  fs.copyFileSync(LAUNCHER, path.join(dir, 'launch.cjs'));
  // A loader with no hooks, so that an entry which still passed the flag
  // would start the app anyway and the assertions below, not a start-up
  // failure, would be what fails.
  fs.writeFileSync(path.join(dir, 'loader.cjs'), 'module.exports = {};');
  fs.writeFileSync(path.join(dir, 'app.cjs'), FAKE_APP);
  fs.writeFileSync(path.join(dir, 'app.cjs.map'), sourceMapFor(FAKE_APP));
});

beforeEach(() => {
  children = [];
  orphans = [];
});

afterEach(() => {
  for (const child of children) child.kill('SIGKILL');
  for (const pid of orphans) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone, which is the point
    }
  }
});

afterAll(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * The variables of the runner that change what a start prints or does: the
 * cases set them (or leave them out) themselves. `NODE_NO_WARNINGS` and
 * `NODE_PENDING_DEPRECATION` are the two that Node reads besides
 * `NODE_OPTIONS` (a shell or a CI job often sets the first).
 */
const DECIDED_BY_THE_CASE = [
  'NODE_OPTIONS',
  'NODE_NO_WARNINGS',
  'NODE_PENDING_DEPRECATION',
  'FRODO_SOURCE_MAPS',
];

/** The environment of a run: the runner's own, without the variables the cases decide. */
function envFor(mode, env = {}) {
  const rest = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !DECIDED_BY_THE_CASE.includes(name)
    )
  );
  return { ...rest, FAKE_APP_MODE: mode, ...env };
}

/** Runs the copied entry to its end and returns what spawnSync reports. */
function run(mode, { args = [], env } = {}) {
  return cp.spawnSync(
    process.execPath,
    [path.join(dir, 'launch.cjs'), ...args],
    {
      env: envFor(mode, env),
      encoding: 'utf8',
    }
  );
}

/** Runs the copied entry with the `report` app and returns the pid of the entry and what the app saw. */
function report({ args = [], env } = {}) {
  const result = run('report', { args, env });
  return { entryPid: result.pid, ...JSON.parse(result.stdout) };
}

/** Starts the copied entry with a long-running fake app and resolves once the app said `ready`. */
async function startIdle(mode, env = {}) {
  const readyFile = path.join(dir, `ready-${children.length}`);
  const child = cp.spawn(process.execPath, [path.join(dir, 'launch.cjs')], {
    env: envFor(mode, { FAKE_READY: readyFile, ...env }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  child.output = '';
  child.stdout.on('data', (data) => (child.output += data));
  child.stderr.on('data', (data) => (child.output += data));
  child.ended = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal }))
  );
  const deadline = Date.now() + 15000;
  while (!child.output.includes('ready')) {
    if (Date.now() > deadline || child.exitCode !== null) {
      throw new Error(`the fake app did not become ready: ${child.output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return { child, readyFile };
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('the entry starts the app in its own process', () => {
  testif(hasDist)('the app is the process that was started', () => {
    const { entryPid, pid, execArgv } = report({ args: ['-v'] });
    expect(pid).toBe(entryPid);
    // no flag at all: not a loader, not --no-warnings, not
    // --enable-source-maps
    expect(execArgv).toEqual([]);
  });

  testif(hasDist)(
    'the app sees its own file as argv[1] and the arguments it was given',
    () => {
      const args = ['conn', 'list', '-v', '--', 'two words'];
      const { argv1, args: seen } = report({ args });
      // argv[1] is what frodo-lib tells the CLI by (frodo, frodo.exe or app.cjs)
      expect(path.basename(argv1)).toBe('app.cjs');
      expect(argv1).toBe(fs.realpathSync(path.join(dir, 'app.cjs')));
      expect(seen).toEqual(args);
    }
  );
});

describe('source maps are opt-in (FRODO_SOURCE_MAPS)', () => {
  testif(hasDist)('are off by default', () => {
    expect(report().sourceMapsEnabled).toBe(false);
  });

  testif(hasDist).each(['1', 'true', 'yes', 'on', 'ON', 'True'])(
    'are on for FRODO_SOURCE_MAPS=%s',
    (value) => {
      expect(
        report({ env: { FRODO_SOURCE_MAPS: value } }).sourceMapsEnabled
      ).toBe(true);
    }
  );

  testif(hasDist).each(['0', 'false', 'no', 'off', ''])(
    'are off for FRODO_SOURCE_MAPS=%j',
    (value) => {
      expect(
        report({ env: { FRODO_SOURCE_MAPS: value } }).sourceMapsEnabled
      ).toBe(false);
    }
  );

  // The entry cannot import the helper that the other opt-ins use
  // (`isTruthyOptInValue`; the build would emit a shared chunk for the entry), so
  // it carries a copy of its list of values. This keeps the copy and the helper
  // from drifting apart: whatever the helper says for a value, the entry does.
  testif(hasDist).each([
    ...['1', 'true', 'yes', 'on', 'ON', 'True', 'yEs'],
    ...['0', 'false', 'no', 'off', '', ' ', 'y', 't', '2', 'enable', 'yes '],
    ...[' 1', 'null', 'undefined'],
  ])('agree with isTruthyOptInValue for FRODO_SOURCE_MAPS=%j', (value) => {
    expect(
      report({ env: { FRODO_SOURCE_MAPS: value } }).sourceMapsEnabled
    ).toBe(isTruthyOptInValue(value));
  });

  testif(hasDist)(
    'name the original file in a stack trace when asked for, before the app loads',
    () => {
      const result = run('throw', { env: { FRODO_SOURCE_MAPS: '1' } });
      expect(result.status).toBe(1);
      // the frames of the stack, not the line of code that Node prints above it
      expect(result.stderr).toMatch(/at .*Original\.ts:\d+:\d+/);
      expect(result.stderr).not.toMatch(/at .*app\.cjs:\d+:\d+/);
    }
  );

  testif(hasDist)(
    'leave the bundle in a stack trace when not asked for',
    () => {
      const result = run('throw');
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/at .*app\.cjs:\d+:\d+/);
      expect(result.stderr).not.toContain('Original.ts');
    }
  );

  testif(hasDist)(
    'stay on when Node itself is asked for them (NODE_OPTIONS)',
    () => {
      const result = run('throw', {
        env: { NODE_OPTIONS: '--enable-source-maps' },
      });
      expect(result.stderr).toMatch(/at .*Original\.ts:\d+:\d+/);
    }
  );
});

describe('the entry leaves process warnings to Node', () => {
  /** What the app sees when Node starts it directly, with no entry in front of it. */
  function reportWithoutEntry() {
    const result = cp.spawnSync(process.execPath, [path.join(dir, 'app.cjs')], {
      env: envFor('report'),
      encoding: 'utf8',
    });
    return JSON.parse(result.stdout);
  }

  testif(hasDist)(
    'the app starts with the warning listeners that Node gives every program',
    () => {
      const direct = reportWithoutEntry().warningListeners;
      // Node's own printer is one of them, so a count of 0 would mean that
      // the reference run is silenced already and proves nothing
      expect(direct).toBeGreaterThanOrEqual(1);
      expect(report().warningListeners).toBe(direct);
    }
  );

  testif(hasDist)('a warning of the app is printed, as Node prints it', () => {
    const result = run('warn');
    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/\(node:\d+\) Warning: a process warning/);
  });

  testif(hasDist).each([
    ['NODE_OPTIONS=--no-warnings', { NODE_OPTIONS: '--no-warnings' }],
    ['NODE_NO_WARNINGS=1', { NODE_NO_WARNINGS: '1' }],
  ])('%s still silences them, and the entry does not undo it', (_, env) => {
    const result = run('warn', { env });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(report({ env }).warningListeners).toBe(0);
  });

  testif(hasDist)(
    'the entry sets no warning switch for the processes the app starts',
    () => {
      expect(report().setsNoWarnings).toBe(false);
    }
  );
});

describe('how the process ends is how the command ends', () => {
  testif(hasDist)('the exit code of the app is the exit code', () => {
    const result = run('exit3');
    expect(result.status).toBe(3);
    expect(result.signal).toBeNull();
  });

  testif(hasDist)(
    'an app that is killed by a signal is reported as killed by that signal, not as exit 0',
    () => {
      const result = run('selfkill');
      expect(result.signal).toBe('SIGTERM');
      expect(result.status).toBeNull();
    }
  );

  testif(hasDist)(
    'killing the entry with SIGKILL leaves no process behind',
    async () => {
      const { child, readyFile } = await startIdle('idle');
      const appPid = Number(fs.readFileSync(readyFile, 'utf8'));
      orphans.push(appPid);
      process.kill(child.pid, 'SIGKILL');
      await child.ended;
      // the app is the entry itself; a second process would have outlived it
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(isAlive(appPid)).toBe(false);
    },
    30000
  );
});

describe('the signals a terminal or a supervisor sends reach the app', () => {
  testif(hasDist).each(SIGNALS)(
    '%s sent to the process that was started runs the handler of the app',
    async (name) => {
      const { child } = await startIdle('handlers');
      process.kill(child.pid, name);
      const { code, signal } = await child.ended;
      expect(child.output).toContain(`got ${name}`);
      expect(code).toBe(0);
      expect(signal).toBeNull();
    },
    30000
  );
});

describe('the build', () => {
  testif(hasDist)(
    'emits no loader (run npx tsdown if this fails on an old build)',
    () => {
      expect(fs.existsSync(path.join(DIST, 'loader.cjs'))).toBe(false);
      expect(fs.existsSync(path.join(DIST, 'launch.cjs'))).toBe(true);
      expect(fs.existsSync(path.join(DIST, 'app.cjs'))).toBe(true);
    }
  );

  testif(hasDist)(
    'keeps the entry small and standalone: it requires only Node built-ins and ./app.cjs',
    () => {
      const source = fs.readFileSync(LAUNCHER, 'utf8');
      // it is read and compiled before anything else starts, so it must stay
      // the few lines that it is (a shared chunk, an inlined helper or the
      // bundled app would show here)
      expect(source.startsWith('#!/usr/bin/env node\n')).toBe(true);
      expect(Buffer.byteLength(source)).toBeLessThan(4096);

      const builtins = new Set(
        builtinModules.flatMap((name) => [name, `node:${name}`])
      );
      const targets = [...source.matchAll(/\brequire\(([^)]*)\)/g)].map(
        (match) => match[1].trim()
      );
      const literal = targets.filter((target) => /^["'].*["']$/.test(target));
      const dynamic = targets.filter((target) => !literal.includes(target));
      for (const target of literal) {
        expect(builtins.has(target.slice(1, -1))).toBe(true);
      }
      // the one dynamic require is the app, and the file it names is app.cjs
      expect(dynamic).toEqual(['app']);
      expect(source).toContain('"./app.cjs"');
    }
  );
});
