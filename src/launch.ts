#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

/*
 * The entry of the npm package (`bin`, `main`, the Docker entrypoint). It runs
 * the app, `app.cjs`, in THIS process: no second Node process, no signal
 * forwarding, and the exit status of the app is the exit status of the
 * command. Keep it standalone: it may import only Node built-ins and it
 * requires `./app.cjs`, so that tsdown emits one small file that has to be read
 * and compiled before anything else starts.
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

// 2. No process warnings (the effect of `node --no-warnings`, which the
// launcher used to pass to its child process).
process.removeAllListeners('warning');

// 3. The app saw its own file as `process.argv[1]` when this entry started it
// as a child process, and the library tells a test run from a normal run by
// that name. Keep it that way.
process.argv[1] = app;

// 4. Run the app. A variable, not a string literal, so that the build leaves
// the call alone instead of bundling the app into this file. `require` is the
// one call here that has to be synchronous and has to load a CommonJS file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require(app);
