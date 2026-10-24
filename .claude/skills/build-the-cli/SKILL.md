---
name: build-the-cli
description: Use when you need to get frodo-cli from a fresh clone to a running `frodo` built from source, rebuild it after a change, link a local frodo-lib clone, or run the lint, type and test checks. Covers Node and npm requirements, npm ci, the bundle build (tsdown plus tsc), running dist/launch.cjs, the sibling frodo-lib layout, and the rule that tests run the old code until you rebuild.
---

# Build the CLI

How the toolchain works and why is in [docs/BUILD-ENV.md](../../../docs/BUILD-ENV.md); the contributor guide is [docs/CONTRIBUTE.md](../../../docs/CONTRIBUTE.md). This is the shortest path that works. The native binary has its own skill, `build-the-binary`.

## Requirements

- **Node.js 26 or later** (`engines.node` in `package.json`; cli record 0013) and npm. Check with `node --version`.
- Python 3 with the `pty` module, only for the terminal (PTY) tests (macOS, Linux).
- Nothing else. The tests need no network and no credentials, and the build writes only to `dist/` (gitignored).

## From a fresh clone to a running `frodo`

```console
git clone https://github.com/rockcarver/frodo-cli.git
cd frodo-cli
npm ci
npm run build:only                 # tsdown (bundle to dist/) then tsc (type check), about 5 seconds
node dist/launch.cjs -v            # prints the cli, lib and node versions
```

`node dist/launch.cjs <arguments>` is `frodo <arguments>` for your checkout. To get a `frodo` command on your PATH from it, `npm i -g` in the checkout; skip that when you are only testing.

Expected: `-v` starts with `You are running the NPM package.` and shows `cli: v<version>`, `lib: v<version>` and `node: v26...`.

Notes:

- **npm 12 prints "install scripts blocked" warnings** after `npm ci` (the repository's `allowScripts` in `package.json` lists what may run). The build and the type check pass anyway.
- **`npx tsdown` alone rebuilds the bundle in about 2 seconds** and skips the type check. Use it in the edit loop, and `npm run build:only` (or `npx tsc --noEmit`) before you finish. `npm run dev` rebuilds on every change to `src/`.

## Rebuild before you test

**The test scripts do not rebuild `dist/`.** Client_cli, e2e and PTY tests run `dist/launch.cjs` (through the shim in `test/e2e/shims/`) and build it only when it is missing. After every change to `src/`, run `npx tsdown`, or the tests exercise the old code and pass or fail for the wrong reason.

Do not edit `src/` or rebuild `dist/` while a test run is in progress: the test workers read files mid-run and report failures that are not real.

## Check before you finish

```console
npm run check                      # ESLint + Prettier check on src/**/*.ts (npm run fix writes)
npx tsc --noEmit
npx tsdown
npm test                           # the whole suite, replays recordings, no network
npm run test:only -- test/unit/UsageExamples.test.js     # one file; the argument is a Jest path pattern
```

- ESLint can print warnings; only errors fail the check.
- **Prettier and ESLint cover `src/**/*.ts` only. Never run Prettier over `test/e2e/`:** the exports and recordings there are compared byte for byte.
- A failing snapshot is an expected output change or a regression. Decide which before touching it, and never update snapshots just to turn a run green.
- A few suites (the master-key ones) skip without a usable key; that is expected on a fresh clone. Never create or commit a master key.

## Developing against a local frodo-lib

Needed when your change also needs a library change (the library goes first, [core 0001](../../../docs/decisions/core/0001-library-is-the-brain-cli-is-a-thin-wrapper.md); see the `add-a-cli-command` skill). Clone both repositories side by side. **The library directory must be named `frodo-lib`**: `npm run link` points at `../frodo-lib`, and the library's recording tests find their recordings by that path segment.

```console
git clone https://github.com/rockcarver/frodo-lib.git
cd frodo-lib && npm ci && npm run build     # generates help, bundles, emits the types
cd ../frodo-cli && npm ci && npm run link   # npm link ../frodo-lib
npx tsdown
node dist/launch.cjs -v                     # the lib line now shows the time of your local lib build
```

- **After every library change, rebuild the library (`npm run build` there) and then the CLI (`npx tsdown`).** `npm run dev` does not pick up library rebuilds.
- **`npm ci` or `npm install` removes the link.** Run `npm run link` again.
- The CLI pins an exact `@rockcarver/frodo-lib` version in `package.json` (cli record 0012). A pull request that needs an unreleased library change cannot merge until that library is released and the pin updated; say so in the pull request instead of working around it.

## Pitfalls

- A **stale `dist/`** is the usual reason for a test that fails or passes unexpectedly. Rebuild first.
- **Never add a package to `dependencies`.** Packages imported by shipped code go in `devDependencies`; `dependencies` stays empty (core 0006, [published packages have no runtime dependencies](../../../docs/decisions/core/0006-published-packages-have-no-runtime-dependencies.md); the check is in BUILD-ENV.md section 2.2.1).
- Do not edit `CHANGELOG.md`; it is generated at release time.

Verified with Node 26.5.0 and npm 12.0.2 on macOS (arm64): `npm ci`, `npm run build:only`, running `dist/launch.cjs`, linking a sibling `frodo-lib`. Not verified: Windows and Linux.
