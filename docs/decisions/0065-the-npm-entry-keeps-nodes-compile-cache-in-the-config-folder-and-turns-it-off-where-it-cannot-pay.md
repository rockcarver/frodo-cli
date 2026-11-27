---
status: accepted
date: 2026-11-26
decision-makers: maintainers
applies-to:
  - src/launch.ts
  - Dockerfile
  - global-jest-setup.js
  - test/unit/LauncherCompileCache.test.js
---

# The npm entry keeps Node's compile cache in the config folder and turns it off where it cannot pay

## Context and problem statement

Node can keep what V8 compiled for every file a program loads and hand it back on the next start. On 2026-11-26, once the entry of the npm package ran the app in one process with no loader and with source maps off, this saved about 60 ms of CPU time (about a fifth of a start) on every start after the first, and cost about 35 ms once, on the first start after a Node or CLI update (measured on one machine; `docs/BUILD-ENV.md` section 2.4 has the table). Node's default folder is a shared one in the temporary folder of the machine, which is the wrong place for two reasons: on a machine with several users another user could plant an entry that this user's process then loads, and the operating system cleans that folder. A cache also pays only where a second start follows the first, so a fresh container or a test run with a new HOME would pay for it and never get it back.

## Decision

- **The entry (`src/launch.ts`) turns the cache on before the app loads**, with the folder `compile-cache` in the config folder: `FRODO_CONFIG_PATH`, else `.frodo` in the home folder, the same folder as the rest of the CLI. It is never the temporary folder, and never a folder next to the installed files. The folder is made for its owner only (mode `0700`); so is every missing folder above it, which is what the app does for `.frodo` too.
- **Only an absolute config folder is used.** An empty or relative home folder, or a `FRODO_CONFIG_PATH` such as `~/x`, `./x` or `x`, leaves the cache off, so that the entry never makes a folder in the current directory.
- **An existing `compile-cache` is used only when it is the user's own**: a real directory (not a link) that belongs to the current user and that neither the group nor others can enter at all (mode `0700`, which is what the entry makes; on Windows, which has neither owner nor mode bits here, a directory is enough). Otherwise the cache stays off and nothing is printed, made or changed; the entry never changes the mode of a folder that exists. The reason is that V8 runs a cache entry as code and Node checks an entry for corruption only, not for who wrote it, and that Node makes its version folder inside the cache folder with the umask of the process, so a folder that others can enter could get a group-writable one (a folder that the entry makes itself is `0700` and is not affected). The trust assumption: the config folder is as trusted as `Connections.json` in it, because whoever can write the config folder can already point that file at a host of their own and take the credentials. The guard looks at the type, owner and mode of the cache folder, not at the folders above it, and it checks before it uses, so it does not stop a swap between the check and the use: it is defence in depth and does not make a writable config folder safe.
- **It is off, and makes no folder, when** the `CI` variable is set (not empty, not `0`, not `false`), `FRODO_TEST` or `FRODO_MOCK` is set the same way, `FRODO_NO_COMPILE_CACHE` has an opt-in value (`1`, `true`, `yes` or `on`, as every opt-in), `NODE_DISABLE_COMPILE_CACHE` is set (any value, as Node reads it), or `NODE_COMPILE_CACHE` is not empty (the user's own cache is used and none is made beside it).
- **It never changes a start.** If the folder cannot be made or used (a read-only home, a file where a folder should be) the CLI starts as it would without the cache: same output, same exit code, and the entry prints and throws nothing.
- **Nothing deletes the cache.** Node keeps one sub-folder for each Node version and the entries of an old CLI build stay, so the folder grows by about one bundle for every build that ran. The entry has no pruning code; removing `compile-cache` is always safe, and the docs say so.
- **A test that starts the CLI runs it with the cache off.** The global setup of the tests sets `FRODO_NO_COMPILE_CACHE=1`, and the tests of the cache build their own environment. The Docker image sets `FRODO_NO_COMPILE_CACHE=1` too, because its config folder is an anonymous volume that a new container does not share; `-e FRODO_NO_COMPILE_CACHE=0` turns the cache back on for a container that mounts its config folder. The native binary is not covered: it starts the app itself and carries a code cache of its own.

## Consequences

- `test/unit/LauncherCompileCache.test.js` pins the folder, the mode, every off switch, the guards and the unusable-folder cases; `test/unit/LauncherCommandLine.test.js` pins the order of the steps (source maps, cache, `process.argv[1]`, the app) and that the entry stays standalone.
- A new off switch, a new place for the folder or a change of the guards changes this record, the entry and the tests together, and `docs/BUILD-ENV.md` section 2.4 and `MIGRATION.md` say what a user sees.
- A config folder that sits inside a repository (an absolute `FRODO_CONFIG_PATH`) gets about 5 MB of binary files per Node version and build: the ignore file of that repository should list `compile-cache`.
- Not covered: pruning old entries, a cache for the commands of the shell console or for child processes, and a config folder that others can write to.

## Alternatives considered

- **Node's default folder in the temporary folder**: shared between users and cleaned by the system.
- **Always on**: a CI job, a test run and a container that lives for one command pay the first-start cost for nothing.
- **Pruning code in the entry**: a delete in a start path, for a few megabytes, against a guard that keeps deletes out of `src`.
