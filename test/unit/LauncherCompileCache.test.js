import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { isTruthyOptInValue } from '../../src/utils/EnvFlags.ts';

/**
 * Node's compile cache in the entry of the npm package (`dist/launch.cjs`, the
 * `bin` and `main` entry and the Docker entrypoint).
 *
 * The entry calls `module.enableCompileCache` with the folder
 * `<config folder>/compile-cache`, where the config folder is
 * `FRODO_CONFIG_PATH` or `<home>/.frodo`, before it loads the app. Node then
 * stores what V8 compiled for every file the app loads and hands it back on
 * the next start, which saves a measurable part of every start after the first
 * (see docs/BUILD-ENV.md section 2.4 for the numbers). What these tests pin:
 *
 * - the first start fills the folder (owner only) and the next one uses it;
 * - it is OFF, and creates nothing, in a CI run (`CI`), in a test run
 *   (`FRODO_TEST`, `FRODO_MOCK`), when asked (`FRODO_NO_COMPILE_CACHE`, with the
 *   values of every other opt-in) and when Node is told not to
 *   (`NODE_DISABLE_COMPILE_CACHE`); a cache that the user chose with
 *   `NODE_COMPILE_CACHE` is theirs and is left alone;
 * - `FRODO_CONFIG_PATH` moves the folder; a config folder that is not an
 *   absolute path (an empty home, `~/x`, `x`) leaves the cache off, so that no
 *   folder is made in the current directory;
 * - an existing `compile-cache` is used only when it is a real folder of the
 *   current user that neither the group nor others can write to (a V8 cache
 *   entry runs as code, so an entry that someone else could write would run as
 *   this user); the entry never changes the mode of a folder that exists;
 * - a home that cannot be written, a file where a folder should be and a
 *   folder that Node cannot use never change a start: same output, same exit
 *   code, nothing more on stderr; the exit code, the signal and the handlers
 *   of the app are the app's with the cache on.
 *
 * The fake-app cases copy the BUILT `dist/launch.cjs` next to a tiny `app.cjs`
 * that reports which cache folder Node gave the process, as in
 * LauncherCommandLine.test.js. The cases that name the real CLI run
 * `dist/launch.cjs` itself with `-v`. Every run has its own HOME below the
 * temporary folder of the operating system; no case touches the real one. Run
 * `npx tsdown` first (the test scripts do not rebuild `dist/`); without a
 * build the cases are skipped.
 */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const LAUNCHER = path.join(ROOT, 'dist', 'launch.cjs');
const hasDist = fs.existsSync(LAUNCHER);
const testif = (condition) => (condition ? test : test.skip);

const posix = process.platform !== 'win32';
// a read-only folder does not stop root, and Windows has no such mode bits
const canWithholdAccess =
  posix && typeof process.getuid === 'function' && process.getuid() !== 0;

const VERSION = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
).version;

/**
 * The fake app. FAKE_APP_MODE selects what it does:
 * - report (the default): reports the folder that Node gives the process for
 *   its compile cache
 * - exit3: sets the exit code 3
 * - selfkill: sends itself SIGTERM, which no handler catches
 * - handlers: handles SIGTERM the way the real app does (says so and exits 0),
 *   says `ready`, and waits
 */
const FAKE_APP = `const mode = process.env.FAKE_APP_MODE || 'report';
if (mode === 'report') {
  process.stdout.write(JSON.stringify({
    dir: require('node:module').getCompileCacheDir() ?? null,
  }));
} else if (mode === 'exit3') {
  process.exitCode = 3;
} else if (mode === 'selfkill') {
  process.kill(process.pid, 'SIGTERM');
  setInterval(() => {}, 1000);
} else if (mode === 'handlers') {
  process.on('SIGTERM', () => {
    process.stdout.write('got SIGTERM\\n');
    process.exit(0);
  });
  process.stdout.write('ready\\n');
  setInterval(() => {}, 1000);
}
`;

/**
 * Files that a case hands to the entry with NODE_OPTIONS (`--require`), to
 * stand in for what the operating system or the machine decides and a test
 * cannot make: another owner of a folder (no root here), no `getuid`, a home
 * folder that is empty or relative.
 */
const PRELOADS = {
  otherUser: `const real = process.getuid.bind(process);
process.getuid = () => real() + 1;
`,
  noGetuid: `process.getuid = undefined;
`,
  emptyHomedir: `require('node:os').homedir = () => '';
`,
  relativeHomedir: `require('node:os').homedir = () => 'relative-home';
`,
  groupWritableUmask: `process.umask(0o002);
`,
};

/**
 * The variables of the runner that change what the entry does or prints. Every
 * case sets the ones it needs: the test scripts set FRODO_TEST and
 * NODE_OPTIONS, a CI job sets CI, and a developer may have any of the rest.
 */
const DECIDED_BY_THE_CASE = [
  'CI',
  'NODE_OPTIONS',
  'NODE_NO_WARNINGS',
  'NODE_PENDING_DEPRECATION',
  'NODE_COMPILE_CACHE',
  'NODE_DISABLE_COMPILE_CACHE',
  'NODE_DEBUG_NATIVE',
  'HOME',
  'USERPROFILE',
];

/** The environment of a run: the runner's own without what the cases decide (and no FRODO_ variable), then the HOME of the run. */
function envFor(home, env = {}) {
  const rest = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) =>
        !DECIDED_BY_THE_CASE.includes(name) && !name.startsWith('FRODO_')
    )
  );
  return {
    ...rest,
    HOME: home,
    USERPROFILE: home,
    NO_COLOR: '1',
    FRODO_NO_UPDATE_CHECK: '1',
    FRODO_NO_PROMPT: '1',
    FRODO_NO_CACHE: 'true',
    ...env,
  };
}

let base;
let dir;
let counter = 0;

beforeAll(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-launcher-cache-'));
  dir = path.join(base, 'entry');
  fs.mkdirSync(dir);
  if (hasDist) fs.copyFileSync(LAUNCHER, path.join(dir, 'launch.cjs'));
  fs.writeFileSync(path.join(dir, 'app.cjs'), FAKE_APP);
  for (const [name, code] of Object.entries(PRELOADS)) {
    fs.writeFileSync(path.join(base, `${name}.cjs`), code);
  }
});

afterAll(() => {
  if (base) fs.rmSync(base, { recursive: true, force: true });
});

/** A new, empty HOME. */
function newHome() {
  const home = path.join(base, `home-${(counter += 1)}`);
  fs.mkdirSync(home);
  return home;
}

/** The NODE_OPTIONS that load one of the PRELOADS into the entry's process. */
const preload = (name) => ({
  NODE_OPTIONS: `--require ${JSON.stringify(path.join(base, `${name}.cjs`))}`,
});

/** A new, empty folder to run in: whatever a run makes in its working directory shows there. */
function newCwd() {
  const cwd = path.join(base, `cwd-${(counter += 1)}`);
  fs.mkdirSync(cwd);
  return cwd;
}

/** Runs the copied entry with the fake app and returns what spawnSync reports plus what the app saw. */
function runFake(home, env = {}, cwd = undefined) {
  const result = cp.spawnSync(
    process.execPath,
    [path.join(dir, 'launch.cjs')],
    {
      env: envFor(home, env),
      encoding: 'utf8',
      cwd,
      // an entry or an app that never ends fails the case instead of the run
      timeout: 60000,
      killSignal: 'SIGKILL',
    }
  );
  return {
    ...result,
    seen:
      result.status === 0 && result.stdout.startsWith('{')
        ? JSON.parse(result.stdout)
        : undefined,
  };
}

/** Runs the REAL entry of this checkout with `-v`. */
function runReal(home, env = {}) {
  return cp.spawnSync(process.execPath, [LAUNCHER, '-v'], {
    env: envFor(home, env),
    encoding: 'utf8',
    timeout: 100000,
    killSignal: 'SIGKILL',
  });
}

/** Every file under a folder with its size and modification time, in a stable order. */
function entriesOf(folder) {
  return fs
    .readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const file = path.join(entry.parentPath, entry.name);
      const stat = fs.statSync(file);
      return `${path.relative(folder, file)} ${stat.size} ${stat.mtimeMs}`;
    })
    .sort();
}

const cacheOf = (home) => path.join(home, '.frodo', 'compile-cache');

/** Whether the app was given a cache folder, and it is the one that was asked for. */
function usesCacheIn(seen, folder) {
  return typeof seen.dir === 'string' && seen.dir.startsWith(folder + path.sep);
}

describe('the entry turns on the compile cache', () => {
  testif(hasDist)(
    'the first start fills <HOME>/.frodo/compile-cache for the owner only, the next start uses it',
    () => {
      const home = newHome();
      const first = runReal(home);
      expect(first.status).toBe(0);
      expect(first.stderr).toBe('');
      expect(first.stdout).toContain(`cli: v${VERSION}`);

      const cache = cacheOf(home);
      expect(fs.statSync(cache).isDirectory()).toBe(true);
      if (posix) expect(fs.statSync(cache).mode & 0o777).toBe(0o700);
      const afterFirst = entriesOf(cache);
      expect(afterFirst.length).toBeGreaterThan(0);

      const second = runReal(home);
      expect(second.status).toBe(0);
      expect(second.stderr).toBe('');
      expect(second.stdout).toBe(first.stdout);
      // nothing was compiled again: no entry was added or written again
      expect(entriesOf(cache)).toEqual(afterFirst);

      // Node's own account of the third start: it takes the entries of the
      // second (its debug output names every file that it loaded from the
      // cache; run `NODE_DEBUG_NATIVE=COMPILE_CACHE node dist/launch.cjs -v` to
      // see it, and update the pattern if a later Node words it differently)
      const third = runReal(home, { NODE_DEBUG_NATIVE: 'COMPILE_CACHE' });
      expect(third.status).toBe(0);
      expect(third.stderr).toMatch(/dist[\\/]app\.cjs was accepted/);
      expect(third.stderr).not.toMatch(/was not initialized/);
    },
    120000
  );

  testif(hasDist)(
    'the app gets that folder from Node before it loads, and the entry stays silent',
    () => {
      const home = newHome();
      const { status, stderr, seen } = runFake(home);
      expect(status).toBe(0);
      expect(stderr).toBe('');
      expect(usesCacheIn(seen, cacheOf(home))).toBe(true);
      expect(fs.readdirSync(cacheOf(home)).length).toBeGreaterThan(0);
    }
  );

  testif(hasDist)(
    'FRODO_CONFIG_PATH moves the folder to <FRODO_CONFIG_PATH>/compile-cache',
    () => {
      const home = newHome();
      const config = path.join(home, 'elsewhere', 'config');
      const { status, stderr, seen } = runFake(home, {
        FRODO_CONFIG_PATH: config,
      });
      expect(status).toBe(0);
      expect(stderr).toBe('');
      expect(usesCacheIn(seen, path.join(config, 'compile-cache'))).toBe(true);
      expect(fs.existsSync(path.join(home, '.frodo'))).toBe(false);
    }
  );

  testif(hasDist)(
    'an empty FRODO_CONFIG_PATH is the same as none: <HOME>/.frodo',
    () => {
      const home = newHome();
      const { seen } = runFake(home, { FRODO_CONFIG_PATH: '' });
      expect(usesCacheIn(seen, cacheOf(home))).toBe(true);
    }
  );

  testif(hasDist)(
    'a cache that the user chose with NODE_COMPILE_CACHE is used and no other is made',
    () => {
      const home = newHome();
      const chosen = path.join(home, 'chosen');
      const { status, stderr, seen } = runFake(home, {
        NODE_COMPILE_CACHE: chosen,
      });
      expect(status).toBe(0);
      expect(stderr).toBe('');
      expect(usesCacheIn(seen, chosen)).toBe(true);
      expect(fs.existsSync(path.join(home, '.frodo'))).toBe(false);
    }
  );
});

describe('the compile cache is off, and nothing is created, when it should be', () => {
  testif(hasDist).each([
    ['CI=1', { CI: '1' }],
    ['CI=true', { CI: 'true' }],
    ['CI=TRUE', { CI: 'TRUE' }],
    ['CI=yes', { CI: 'yes' }],
    ['FRODO_TEST=1 (a test run)', { FRODO_TEST: '1' }],
    ['FRODO_MOCK=1 (a replay)', { FRODO_MOCK: '1' }],
    ['FRODO_MOCK=record (a recording)', { FRODO_MOCK: 'record' }],
    ['FRODO_NO_COMPILE_CACHE=1', { FRODO_NO_COMPILE_CACHE: '1' }],
    ['FRODO_NO_COMPILE_CACHE=true', { FRODO_NO_COMPILE_CACHE: 'true' }],
    ['FRODO_NO_COMPILE_CACHE=yes', { FRODO_NO_COMPILE_CACHE: 'yes' }],
    ['FRODO_NO_COMPILE_CACHE=on', { FRODO_NO_COMPILE_CACHE: 'on' }],
    ['FRODO_NO_COMPILE_CACHE=ON', { FRODO_NO_COMPILE_CACHE: 'ON' }],
    ['NODE_DISABLE_COMPILE_CACHE=1', { NODE_DISABLE_COMPILE_CACHE: '1' }],
    // Node disables its cache for any value, so the entry makes no folder for any
    ['NODE_DISABLE_COMPILE_CACHE=0', { NODE_DISABLE_COMPILE_CACHE: '0' }],
    [
      'NODE_DISABLE_COMPILE_CACHE=false',
      { NODE_DISABLE_COMPILE_CACHE: 'false' },
    ],
    ['NODE_DISABLE_COMPILE_CACHE= (empty)', { NODE_DISABLE_COMPILE_CACHE: '' }],
  ])('%s', (_, env) => {
    const home = newHome();
    const { status, stderr, seen } = runFake(home, env);
    expect(status).toBe(0);
    expect(stderr).toBe('');
    expect(seen.dir).toBeNull();
    // not even the config folder: the entry creates nothing when it is off
    expect(fs.readdirSync(home)).toEqual([]);
  });

  testif(hasDist)('FRODO_CONFIG_PATH does not turn it on in a CI run', () => {
    const home = newHome();
    const config = path.join(home, 'config');
    const { seen } = runFake(home, { CI: 'true', FRODO_CONFIG_PATH: config });
    expect(seen.dir).toBeNull();
    expect(fs.existsSync(config)).toBe(false);
  });
});

describe('the compile cache stays on for values that do not say yes', () => {
  testif(hasDist).each([
    ['CI=0', { CI: '0' }],
    ['CI=false', { CI: 'false' }],
    ['CI=FALSE', { CI: 'FALSE' }],
    ['CI= (empty)', { CI: '' }],
    ['FRODO_TEST=0', { FRODO_TEST: '0' }],
    ['FRODO_TEST= (empty)', { FRODO_TEST: '' }],
    ['FRODO_MOCK=0', { FRODO_MOCK: '0' }],
    ['FRODO_MOCK= (empty)', { FRODO_MOCK: '' }],
    // Node ignores an empty NODE_COMPILE_CACHE, and so does the entry
    ['NODE_COMPILE_CACHE= (empty)', { NODE_COMPILE_CACHE: '' }],
  ])('%s', (_, env) => {
    const home = newHome();
    const { status, stderr, seen } = runFake(home, env);
    expect(status).toBe(0);
    expect(stderr).toBe('');
    expect(usesCacheIn(seen, cacheOf(home))).toBe(true);
  });
});

describe('FRODO_NO_COMPILE_CACHE takes the values of every other opt-in', () => {
  // The entry cannot import the helper that every other opt-in uses
  // (`isTruthyOptInValue`: the build would emit a shared chunk for the entry),
  // so it carries a copy of the list of values. This keeps the copy and the
  // helper from drifting apart: whatever the helper says for a value, the
  // entry does.
  testif(hasDist).each([
    ...['1', 'true', 'yes', 'on', 'ON', 'True', 'yEs'],
    ...['0', 'false', 'no', 'off', '', ' ', 'y', 't', '2', 'enable', 'yes '],
    ...[' 1', 'null', 'undefined'],
  ])('agree with isTruthyOptInValue for FRODO_NO_COMPILE_CACHE=%j', (value) => {
    const home = newHome();
    const { seen } = runFake(home, { FRODO_NO_COMPILE_CACHE: value });
    expect(seen.dir === null).toBe(isTruthyOptInValue(value));
  });
});

describe('a folder that cannot be used never changes a start', () => {
  /** Makes the situation, returns the HOME and the variables of the run, and a function that undoes it so the test folder can be removed. */
  const SITUATIONS = [
    [
      'a file where .frodo should be',
      true,
      () => {
        const home = newHome();
        fs.writeFileSync(path.join(home, '.frodo'), 'not a folder');
        return { home, env: {}, undo: () => {} };
      },
    ],
    [
      'FRODO_CONFIG_PATH is a file',
      true,
      () => {
        const home = newHome();
        const config = path.join(home, 'config');
        fs.writeFileSync(config, 'not a folder');
        return { home, env: { FRODO_CONFIG_PATH: config }, undo: () => {} };
      },
    ],
    [
      'FRODO_CONFIG_PATH is below a file',
      true,
      () => {
        const home = newHome();
        const file = path.join(home, 'file');
        fs.writeFileSync(file, 'not a folder');
        return {
          home,
          env: { FRODO_CONFIG_PATH: path.join(file, 'config') },
          undo: () => {},
        };
      },
    ],
    [
      'compile-cache is a file',
      true,
      () => {
        const home = newHome();
        fs.mkdirSync(path.join(home, '.frodo'));
        fs.writeFileSync(cacheOf(home), 'not a folder');
        return { home, env: {}, undo: () => {} };
      },
    ],
    [
      'a read-only home',
      canWithholdAccess,
      () => {
        const home = newHome();
        fs.chmodSync(home, 0o500);
        return { home, env: {}, undo: () => fs.chmodSync(home, 0o700) };
      },
    ],
    [
      'a read-only .frodo',
      canWithholdAccess,
      () => {
        const home = newHome();
        const config = path.join(home, '.frodo');
        fs.mkdirSync(config);
        fs.chmodSync(config, 0o500);
        return { home, env: {}, undo: () => fs.chmodSync(config, 0o700) };
      },
    ],
    [
      'a read-only compile-cache',
      canWithholdAccess,
      () => {
        const home = newHome();
        fs.mkdirSync(cacheOf(home), { recursive: true });
        fs.chmodSync(cacheOf(home), 0o500);
        return {
          home,
          env: {},
          undo: () => fs.chmodSync(cacheOf(home), 0o700),
        };
      },
    ],
  ];

  describe.each(SITUATIONS)('%s', (_, possible, make) => {
    testif(hasDist && possible)(
      'the app starts, exits 0 and nothing is written to stderr',
      () => {
        const { home, env, undo } = make();
        try {
          const { status, stderr, signal, seen } = runFake(home, env);
          expect(signal).toBeNull();
          expect(status).toBe(0);
          expect(stderr).toBe('');
          // the cache is simply off; it is never half on
          expect(seen.dir).toBeNull();
        } finally {
          undo();
        }
      }
    );

    // The CLI has things to say about such a home itself (it cannot write its
    // own files there, and it repairs the mode of a read-only config folder on
    // the first start), so the case is made twice, once per run, and the two
    // runs are compared with the HOME written out of what they print.
    testif(hasDist && possible)(
      'the real CLI prints exactly what it prints with the cache switched off',
      () => {
        const run = (extra) => {
          const { home, env, undo } = make();
          try {
            const result = runReal(home, { ...env, ...extra });
            const plain = (text) => text.split(home).join('<HOME>');
            return {
              status: result.status,
              stdout: plain(result.stdout),
              stderr: plain(result.stderr),
            };
          } finally {
            undo();
          }
        };
        const withCache = run({});
        const without = run({ FRODO_NO_COMPILE_CACHE: '1' });
        expect(withCache.status).toBe(0);
        expect(withCache.stdout).toContain(`cli: v${VERSION}`);
        expect(withCache).toEqual(without);
      },
      120000
    );
  });
});

describe('a CLI that another test starts runs without the compile cache', () => {
  // Most tests start the CLI with the environment of the runner (a spread of
  // `process.env`), and the prompting tests empty FRODO_TEST to get the real
  // prompt gate. The global setup of the tests (global-jest-setup.js) sets
  // FRODO_NO_COMPILE_CACHE for all of them, so that a start with a new HOME
  // does not fill a cache that nothing uses again. This is that child, with
  // the runner's own variables apart from the HOME and FRODO_TEST.
  testif(hasDist)(
    'the environment of the runner switches the cache off, also with FRODO_TEST emptied',
    () => {
      const home = newHome();
      const result = cp.spawnSync(
        process.execPath,
        [path.join(dir, 'launch.cjs')],
        {
          env: {
            ...process.env,
            CI: undefined,
            NODE_COMPILE_CACHE: undefined,
            NODE_DISABLE_COMPILE_CACHE: undefined,
            FRODO_MOCK: undefined,
            HOME: home,
            USERPROFILE: home,
            FRODO_TEST: '',
          },
          encoding: 'utf8',
        }
      );
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).dir).toBeNull();
      expect(fs.readdirSync(home)).toEqual([]);
    }
  );
});

describe('an existing compile-cache is used only when it is a real folder of the user that nobody else can enter', () => {
  // A V8 cache entry is run as code, and Node checks an entry for corruption
  // only: not for who wrote it. A folder that someone else can write to, a link
  // into such a folder or a folder of another user would run their entries as
  // this user, so the cache stays off then. A folder that the group or others
  // can enter at all stays off too (mode 0700 only): Node makes the version
  // folder inside it with the umask of the process, which can leave that folder
  // group-writable. Nothing is changed or made.
  const posixOnly = testif(hasDist && posix);

  /** What a folder is and its mode, to see that the entry changed neither. */
  const stateOf = (file) => {
    const stat = fs.lstatSync(file);
    const type = stat.isSymbolicLink()
      ? 'link'
      : stat.isDirectory()
        ? 'folder'
        : 'file';
    return `${type} ${(stat.mode & 0o7777).toString(8)}`;
  };

  /** Runs with a compile-cache that was made by `make(cache, home)` and checks that the cache is off and nothing moved. */
  function expectOff(make) {
    const home = newHome();
    const cache = cacheOf(home);
    fs.mkdirSync(path.dirname(cache), { recursive: true, mode: 0o700 });
    const extra = make(cache, home) ?? {};
    const before = stateOf(cache);
    const { status, stderr, seen } = runFake(home, extra.env);
    expect(status).toBe(0);
    expect(stderr).toBe('');
    expect(seen.dir).toBeNull();
    expect(stateOf(cache)).toBe(before);
    return { home, cache };
  }

  posixOnly.each([
    ['0777', 0o777],
    ['0775 (group can write)', 0o775],
    ['0770 (group can write)', 0o770],
    ['0757 (others can write)', 0o757],
    ['0707 (others can write)', 0o707],
    ['0750 (the group can read)', 0o750],
    ['0755 (group and others can read)', 0o755],
    ['0705 (others can read)', 0o705],
    ['0710 (the group can enter)', 0o710],
    ['0701 (others can enter)', 0o701],
    ['1777 (sticky, others can write)', 0o1777],
    ['2755 (setgid, group and others can read)', 0o2755],
    ['1755 (sticky, group and others can read)', 0o1755],
  ])(
    'a folder with mode %s: cache off, mode kept, nothing written',
    (_, mode) => {
      const { cache } = expectOff((folder) => {
        fs.mkdirSync(folder);
        fs.chmodSync(folder, mode);
      });
      expect(fs.readdirSync(cache)).toEqual([]);
    }
  );

  posixOnly('a folder with mode 0700 is used and keeps its mode', () => {
    const home = newHome();
    const cache = cacheOf(home);
    fs.mkdirSync(cache, { recursive: true });
    fs.chmodSync(cache, 0o700);
    const { status, stderr, seen } = runFake(home);
    expect(status).toBe(0);
    expect(stderr).toBe('');
    expect(usesCacheIn(seen, cache)).toBe(true);
    expect(fs.statSync(cache).mode & 0o7777).toBe(0o700);
  });

  // The reason for the stricter rule: with a group-writable umask Node makes
  // the version folder inside an existing folder group-writable, and a folder
  // that the group can enter would let its members write there.
  posixOnly(
    'under a group-writable umask a folder with mode 0755 stays off and one with mode 0700 is used and stays 0700',
    () => {
      const open = expectOff((folder) => {
        fs.mkdirSync(folder);
        fs.chmodSync(folder, 0o755);
        return { env: preload('groupWritableUmask') };
      });
      expect(fs.readdirSync(open.cache)).toEqual([]);

      const home = newHome();
      const cache = cacheOf(home);
      fs.mkdirSync(cache, { recursive: true });
      fs.chmodSync(cache, 0o700);
      const { status, stderr, seen } = runFake(
        home,
        preload('groupWritableUmask')
      );
      expect(status).toBe(0);
      expect(stderr).toBe('');
      expect(usesCacheIn(seen, cache)).toBe(true);
      expect(fs.statSync(cache).mode & 0o7777).toBe(0o700);
    }
  );

  posixOnly(
    'a link to a folder: cache off, the link stays, nothing is written through it',
    () => {
      let target;
      const { cache } = expectOff((link, home) => {
        target = path.join(home, 'elsewhere');
        fs.mkdirSync(target, { mode: 0o700 });
        fs.symlinkSync(target, link);
      });
      expect(fs.readlinkSync(cache)).toBe(target);
      expect(fs.readdirSync(target)).toEqual([]);
    }
  );

  posixOnly(
    'a link to nothing: cache off, the link stays and its target is not made',
    () => {
      let target;
      const { cache } = expectOff((link, home) => {
        target = path.join(home, 'nowhere');
        fs.symlinkSync(target, link);
      });
      expect(fs.readlinkSync(cache)).toBe(target);
      expect(fs.existsSync(target)).toBe(false);
    }
  );

  posixOnly(
    'a folder that another user owns (the entry sees another uid): cache off, nothing written',
    () => {
      const { cache } = expectOff((folder) => {
        fs.mkdirSync(folder, { mode: 0o700 });
        return { env: preload('otherUser') };
      });
      expect(fs.readdirSync(cache)).toEqual([]);
    }
  );

  posixOnly(
    'the same folder is used when the entry sees its own uid, which is what the previous case changes',
    () => {
      const home = newHome();
      fs.mkdirSync(cacheOf(home), { recursive: true, mode: 0o700 });
      const { status, stderr, seen } = runFake(home);
      expect(status).toBe(0);
      expect(stderr).toBe('');
      expect(usesCacheIn(seen, cacheOf(home))).toBe(true);
    }
  );

  posixOnly(
    'where there is no getuid the owner is not tested and the folder is used',
    () => {
      const home = newHome();
      fs.mkdirSync(cacheOf(home), { recursive: true, mode: 0o700 });
      const { status, stderr, seen } = runFake(home, preload('noGetuid'));
      expect(status).toBe(0);
      expect(stderr).toBe('');
      expect(usesCacheIn(seen, cacheOf(home))).toBe(true);
    }
  );
});

describe('the config folder must be an absolute path', () => {
  // `os.homedir()` is an empty string when HOME is set but empty, and a literal
  // `~` is not expanded in a compose file or an env file. Resolved against the
  // working directory, either would make `.frodo/compile-cache` (or `~/x/...`)
  // in whatever folder the user happens to be in, on every start.

  /** Runs in a new working directory and checks that nothing was made there or in the HOME, and that the cache is off. */
  function expectNothingMade(env, { emptyHome = false } = {}) {
    const home = newHome();
    const cwd = newCwd();
    const { status, stderr, seen } = runFake(
      home,
      emptyHome ? { HOME: '', USERPROFILE: '', ...env } : env,
      cwd
    );
    expect(status).toBe(0);
    expect(stderr).toBe('');
    expect(seen.dir).toBeNull();
    expect(fs.readdirSync(cwd)).toEqual([]);
    expect(fs.readdirSync(home)).toEqual([]);
  }

  // `HOME` unset is not run: Node then asks the system for the home folder, and
  // this case would fill the compile cache of the real one. An empty HOME and a
  // home folder that a preload makes empty or relative reach the same code.
  const emptyHomeGivesNoHome =
    hasDist &&
    cp.spawnSync(
      process.execPath,
      ['-e', "process.stdout.write(require('node:os').homedir())"],
      {
        env: { PATH: process.env.PATH, HOME: '', USERPROFILE: '' },
        encoding: 'utf8',
      }
    ).stdout === '';

  testif(emptyHomeGivesNoHome)('HOME is set but empty', () => {
    expectNothingMade({}, { emptyHome: true });
  });

  testif(hasDist)('the home folder is an empty string', () => {
    expectNothingMade(preload('emptyHomedir'));
  });

  testif(hasDist)('the home folder is a relative path', () => {
    expectNothingMade(preload('relativeHomedir'));
  });

  testif(hasDist).each([
    ['a literal ~', '~/frodo-config'],
    ['./x', './frodo-config'],
    ['a bare name', 'frodo-config'],
    ['../x', '../frodo-config'],
  ])('FRODO_CONFIG_PATH is %s', (_, value) => {
    expectNothingMade({ FRODO_CONFIG_PATH: value });
  });

  testif(hasDist)(
    'FRODO_CONFIG_PATH is relative while the home folder is fine: still nothing in the home',
    () => {
      const home = newHome();
      const cwd = newCwd();
      const { seen } = runFake(home, { FRODO_CONFIG_PATH: 'config' }, cwd);
      expect(seen.dir).toBeNull();
      expect(fs.readdirSync(home)).toEqual([]);
      expect(fs.readdirSync(cwd)).toEqual([]);
    }
  );
});

describe('the exit of the app is the exit of the command with the cache on', () => {
  // Every other launcher case runs with the cache off (the test setup), and the
  // exit paths are where a cache that writes at exit could get in the way.
  const filled = (home) => fs.readdirSync(cacheOf(home)).length > 0;

  testif(hasDist)('the exit code of the app is kept', () => {
    const home = newHome();
    const result = runFake(home, { FAKE_APP_MODE: 'exit3' });
    expect(result.status).toBe(3);
    expect(result.signal).toBeNull();
    expect(result.stderr).toBe('');
    expect(filled(home)).toBe(true);
  });

  testif(hasDist && posix)(
    'a death by signal is still a death by signal',
    () => {
      const home = newHome();
      const result = runFake(home, { FAKE_APP_MODE: 'selfkill' });
      expect(result.signal).toBe('SIGTERM');
      expect(result.status).toBeNull();
      expect(result.stderr).toBe('');
      expect(filled(home)).toBe(true);
    }
  );

  testif(hasDist && posix)(
    'the signal handler of the app runs and ends the process with its own code',
    async () => {
      const home = newHome();
      const child = cp.spawn(process.execPath, [path.join(dir, 'launch.cjs')], {
        env: envFor(home, { FAKE_APP_MODE: 'handlers' }),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      try {
        let output = '';
        child.stdout.on('data', (data) => (output += data));
        let errors = '';
        child.stderr.on('data', (data) => (errors += data));
        const ended = new Promise((resolve) =>
          child.once('exit', (code, signal) => resolve({ code, signal }))
        );
        const deadline = Date.now() + 15000;
        while (!output.includes('ready')) {
          if (Date.now() > deadline || child.exitCode !== null) {
            throw new Error(`the fake app did not become ready: ${output}`);
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        child.kill('SIGTERM');
        expect(await ended).toEqual({ code: 0, signal: null });
        expect(output).toContain('got SIGTERM');
        expect(errors).toBe('');
        expect(filled(home)).toBe(true);
      } finally {
        child.kill('SIGKILL');
      }
    },
    30000
  );
});
