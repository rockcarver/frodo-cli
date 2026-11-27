#!/usr/bin/env node
import { lstatSync, mkdirSync, type Stats } from 'node:fs';
import { enableCompileCache } from 'node:module';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * The entry of the npm package (`bin`, `main`, the Docker entrypoint). It runs
 * the app, `app.cjs`, in THIS process: no second Node process, no signal
 * forwarding, and the exit status of the app is the exit status of the
 * command. Keep it standalone: it may import only Node built-ins and it
 * requires `./app.cjs`, so that tsdown emits one small file that has to be read
 * and compiled before anything else starts.
 *
 * It does not touch process warnings: they are Node's business, and
 * `NODE_OPTIONS=--no-warnings` silences them as for any program. (It used to
 * remove the `warning` listeners, because frodo-lib loaded its test recorder at
 * start-up and that printed a warning on every command; the library no longer
 * does, see docs/BUILD-ENV.md section 2.4.)
 *
 * The order of the steps below matters.
 */
const app = fileURLToPath(new URL('./app.cjs', import.meta.url));

// 1. Source maps are opt-in. Node applies them to the code that is loaded after
// the switch, so this has to come before the app loads. Without them a stack
// trace shows lines of the bundle; set FRODO_SOURCE_MAPS=1 (also true, yes,
// on) to get the original TypeScript files back. The test is the one of
// `isTruthyOptInValue` in `src/utils/EnvFlags.ts`, written out here because
// importing it would make the build emit a shared chunk for this file.
if (
  ['1', 'true', 'yes', 'on'].includes(
    (process.env.FRODO_SOURCE_MAPS ?? '').toLowerCase()
  )
) {
  process.setSourceMapsEnabled(true);
}

// 2. Node's compile cache: Node keeps what V8 compiled for every file that is
// loaded after this call and gives it back on the next start, which saves part
// of every start after the first (docs/BUILD-ENV.md section 2.4). Like the
// source maps it applies to code loaded later, so it comes before the app. The
// folder is `compile-cache` in the config folder (FRODO_CONFIG_PATH, else
// `.frodo` in the home folder, as everywhere in the CLI), made for the owner
// only (also every missing folder above it). It is off where it cannot pay: in
// a CI run, in a test run, when FRODO_NO_COMPILE_CACHE asks (the values of the
// source maps switch above), when Node itself is told not to
// (NODE_DISABLE_COMPILE_CACHE) and when the user chose a cache of their own
// (NODE_COMPILE_CACHE, which Node has already switched on). It is an
// optimisation and never a reason not to start: whatever cannot be made or
// used leaves the start as it would be without it, with nothing printed.
//
// Two guards. The config folder has to be an absolute path: an empty home
// folder (HOME set but empty) or a `~` that nobody expanded would put the
// folder into the current directory. And an existing `compile-cache` is used
// only when it is a real directory (not a link) of the current user that
// neither the group nor others can write to, because V8 runs a cache entry as
// code and Node checks an entry for corruption only, not for who wrote it. A
// folder that is not that is left as it is (its mode is never changed) and the
// cache stays off. Windows has no such owner and mode.
const isSet = (value: string | undefined): boolean =>
  !['', '0', 'false'].includes((value ?? '').toLowerCase());
const isTheUsersOwn = (folder: Stats): boolean =>
  folder.isDirectory() &&
  (process.platform === 'win32' ||
    ((folder.mode & 0o022) === 0 &&
      (typeof process.getuid !== 'function' ||
        folder.uid === process.getuid())));
if (
  !isSet(process.env.CI) &&
  !isSet(process.env.FRODO_TEST) &&
  !isSet(process.env.FRODO_MOCK) &&
  !['1', 'true', 'yes', 'on'].includes(
    (process.env.FRODO_NO_COMPILE_CACHE ?? '').toLowerCase()
  ) &&
  process.env.NODE_DISABLE_COMPILE_CACHE === undefined &&
  !process.env.NODE_COMPILE_CACHE
) {
  try {
    const config = process.env.FRODO_CONFIG_PATH || join(homedir(), '.frodo');
    if (isAbsolute(config)) {
      const folder = join(config, 'compile-cache');
      const existing = lstatSync(folder, { throwIfNoEntry: false });
      if (existing === undefined || isTheUsersOwn(existing)) {
        mkdirSync(folder, { recursive: true, mode: 0o700 });
        enableCompileCache(folder);
      }
    }
  } catch {
    // no cache: the start goes on without it
  }
}

// 3. The app saw its own file as `process.argv[1]` when this entry started it
// as a child process, and the library tells a test run from a normal run by
// that name. Keep it that way.
process.argv[1] = app;

// 4. Run the app. A variable, not a string literal, so that the build leaves
// the call alone instead of bundling the app into this file. `require` is the
// one call here that has to be synchronous and has to load a CommonJS file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require(app);
