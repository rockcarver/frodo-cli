# Frodo CLI — Toolchain and Build Environment

This document explains every piece of the CLI's toolchain: what it does, why
it is the way it is, and the details you need when something breaks. It is
the companion to [PIPELINE.md](PIPELINE.md), which describes the release
pipeline's jobs and flow; here we go one level deeper — the tools themselves.

The library repo ([frodo-lib](https://github.com/rockcarver/frodo-lib)) shares
most of this toolchain and keeps its own copy of this document
(`BUILD-ENV.md` there) for the pieces that differ.

_Last updated: 2026-10-05 (Batch 2 npm majors + deep-import migration)._

---

## 1. The 30-second map

```
TypeScript sources (src/)
  │
  ├─ jest 30 .............. test (8,500 snapshots, Polly-recorded HTTP)
  │
  ├─ tsdown (rolldown) .... bundle src/{app,launch,loader}.ts -> dist/*.cjs
  ├─ tsc .................. type check gate (no emit)
  │
  ├─ node --build-sea ..... dist-sea/app.cjs + Node 26 -> single binaries (5 platforms)
  │
  └─ eslint + prettier .... lint & format (currently ESLint 8/9 configs; a planned migration will move to ESLint 10 with Prettier owning import order)

Release automation:
  ├─ dependabot.yml ....... weekly grouped dependency PRs
  ├─ dependabot-auto-merge.yml  arms auto-merge on green patch/minor PRs
  ├─ ruleset "main-branch-protection"  Build + Test gate + linux-x64-binary-release required
  └─ pipeline.yml ......... version bump -> build -> test -> 5 binaries -> npm publish -> GitHub release -> Homebrew
```

---

## 2. Bundler: tsdown (replaced tsup 2026-10)

**What it does**: bundles the three TypeScript entries into CJS outputs:

| Entry           | Output            | Role                                                                                     |
| --------------- | ----------------- | ---------------------------------------------------------------------------------------- |
| `src/launch.ts` | `dist/launch.cjs` | npm `bin` entry; spawns `app.cjs` with the module-resolution loader and forwards signals |
| `src/loader.ts` | `dist/loader.cjs` | module-resolution loader for the app                                                     |
| `src/app.ts`    | `dist/app.cjs`    | the CLI itself (~10 MB, self-contained)                                                  |

**Why tsdown and not tsup**: tsup is unmaintained (last release Nov 2025) and
had a real defect we hit in production CI (see §2.1). tsdown is the
rolldown-based successor with the same authorship lineage, builds in ~1.5-2 s
(vs ~3 s), and fixed a long-standing bug in our ESM entry as a side effect.

### 2.1 The tsup defect (why the migration was not optional)

With tsup's default `splitting: true`, its CJS output was produced by building
ESM first and then converting it via **sucrase**. Sucrase's class-field
lowering corrupted comma-sequenced constructor bodies (in jose's error
classes) into syntactically invalid JavaScript — the bundle parsed fine until
loaded, then threw `SyntaxError: Unexpected token ','`. The workaround
(`splitting: false` for CJS) shipped in PR #672; the real fix is tsdown (#730).

### 2.2 tsdown configuration facts (the ones that bite)

- Config lives in `tsdown.config.ts`. In this repo (`"type": "module"`) plain
  `.ts` works; **frodo-lib needs `.mts`** because it is `"type": "commonjs"`
  (a Node 24 config-loader quirk).
- **Code splitting stays on** → `dist/app.cjs` requires the sibling
  `dist/rolldown-runtime-*.cjs` chunk. The chunk hash changes every build;
  the npm `files` allowlist therefore uses a `dist/rolldown-runtime-*.cjs`
  glob. The SEA build config turns splitting **off** (single file).
- `shims: true` is required — `src/launch.ts` uses `import.meta.url`, which
  does not exist in CJS; tsdown shims it.
- `deps.neverBundle` lists every devDependency. tsdown (like tsup before it)
  otherwise bundles devDependencies — which is why our devDependencies are
  effectively the runtime dependency list of the binary.
- JSON imports (`src/ops/templates/*.json`) are inlined at build time; no
  runtime file reads, nothing to ship as assets.
- `define: { __CLI_BUILD_TIMESTAMP__ }` stamps the build time that `-v` prints.

### 2.3 Side effect fixed: the ESM entry

tsup's `index.mjs` threw `Dynamic require of "util" is not supported` the
moment anyone imported it (unnoticed because consumers use CJS). tsdown's
output imports cleanly in both modes (verified: CJS require and ESM namespace
import both expose all 62 exports).

---

## 3. TypeScript

- CLI: `^5.9.3` (aligned with frodo-lib's 5.9 in PR #732).
- Policy: stay on the 5.9.x line. Do **not** adopt TS 6/7 until `typedoc`
  (≤6.0), `typescript-eslint` (<6.1) and `ts-jest` (<7) accept them.
- `npm run build:only` = `tsdown && tsc`: tsdown emits the bundle and the dts
  stubs; `tsc` runs as the **type gate only** (no emit).

---

## 4. Tests: jest 30 + Polly, binary-first runtime

- jest 30.5.2, `--experimental-vm-modules` (ESM-mode TS via ts-jest).
- `FRODO_TEST=1 NO_COLOR=1` normalize the environment; `testResults.json` is
  written by `test:debug` only.
- HTTP traffic is mocked with the Polly.js stack (`@pollyjs/*` +
  `setup-polly-jest` + cassettes under `test/`). Record new cassettes with
  `test:record:cloud`. NOTE (2026-10): the Polly stack is unmaintained (last
  release 2023). A nock/MSW spike (2026-10-03) proved replay fidelity but
  found deep Polly coupling in the record-mode harness; migration deferred
  until Node 28 or a real breakage forces it.
- Two stale assertions in `src/mcp/server/mcp-server.test.js` fail on `main`
  with jest 29 too — pre-existing, tracked, do not block on them.
- **Binary-first test runtime (since #741; dev/sea split since this PR): e2e
  tests always run THIS checkout's build, never a PATH-resolved npm
  install.** All `test:*` scripts run through `tools/with-frodo-bin.mjs`,
  which builds the artifact on demand (`test/e2e/utils/FrodoBinary.cjs`,
  lock-file-guarded) and prepends its directory to `PATH`.
  Two modes:
  - **dev (default; `npm test`)**: shims in `test/e2e/shims/` exec
    `node dist/launch.cjs` — the npm/Docker entry. On-demand build =
    `npm run build:only` (~1.3 s). No SEA build, no macOS signing — the
    developer loop needs nothing but `npm test`.
  - **sea (`npm run test:binary`, what CI's Test job runs)**: the real SEA
    binary at `dist-sea/frodo[.exe]` — exactly the artifact the release
    jobs ship. Selected with `FRODO_TEST_BINARY=sea`; on-demand build =
    `npm run build:binary` (Node 26; the build script auto-signs on macOS
    with an ad-hoc cert so the binary runs immediately).
    Suites that build their own env (`session`, `login-errors`, `log-list`)
    pin the same resolution explicitly. The `npm-entry.smoke.e2e.test.js`
    suite additionally runs `node dist/launch.cjs` directly (it _is_ the dev
    mode entry, so it stays meaningful in both modes).
- Full suite: ~636 suites / ~1,950 tests / ~8,500 snapshots; CI runs the
  suite on Node 26 only (the CLI ships as a Node-26 SEA binary; frodo-lib
  keeps the full 22/24/26 matrix).

---

## 5. Lint and format (since 2026-10)

**ESLint 10** with native flat config in `eslint.config.mjs`
(`typescript-eslint` 8.x, no `FlatCompat` — 10 has no compat layer).
Plugins: `@typescript-eslint` (type-checked rules on `src/**/*.ts` via
`parserOptions.project`), `eslint-plugin-import-x` (successor of the
unmaintained `eslint-plugin-import`). `@eslint/js` recommended as the base.

**Prettier owns import order.** `@ianvs/prettier-plugin-sort-imports` runs as
a Prettier plugin (`plugins` in `.prettierrc`), with
`importOrder: ["^node:", "<BUILTIN_MODULES>", "<THIRD_PARTY_MODULES>", "^[./]"]`.
ESLint no longer checks import order (`import-x/first` and
`import-x/no-duplicates` are the only import rules) — the sorter and the
linter can no longer disagree. Note: in plugin ≥4.7 the old
`importOrderSeparation` / `importOrderSortSpecifiers` options no longer exist;
group separation and specifier sorting are always on.

**Removed plugins**: `eslint-plugin-prettier` (running Prettier as an ESLint
rule made lint slow and turned formatting errors into lint errors),
`eslint-plugin-simple-import-sort`, `eslint-plugin-jest`,
`eslint-plugin-jsx-a11y`, `eslint-plugin-import`.

**Scripts**: `npm run fix` = `eslint --fix && prettier --write "src/**/*.ts"`
(prettier last, so it wins), `npm run check` = `eslint && prettier --check`,
and `lint` / `lint:fix` alias them. CI runs `npm run check`.

**ESLint 10 findings fixed in the migration**: dead initializers on `let`
declarations (`no-useless-assignment`, including two real shadowing bugs
where an inner `const` hid an outer progress-indicator handle so an error
handler could stop an undefined spinner), `preserve-caught-error` (rethrown
errors now carry `{ cause }`), and empty catch blocks got comments.
TypeScript `lib` was bumped to `ES2022` so the two-argument `Error(message,
{ cause })` constructor type-checks (emit target stays ES2020; the CLI runs
on Node ≥ 24 where `cause` is runtime-supported).

---

## 6. Binary packaging: native Node.js SEA (since 2026-10)

`npm run build` = full build (npm bundle + platform binary) — the same
surface as the pkg era. `npm run build:only` = the npm bundle only (any
Node). `build:binary` = `build:only` + `build:sea`; `build:sea` is
`scripts/build-sea.mjs`, which guards the Node version up front (clear
message pointing at `build:only` instead of the cryptic
`node: bad option: --build-sea`).

1. `build:only` — the normal `dist/` bundle (npm package entry points).
2. `build:sea-bundle` — `tsdown --config tsdown.sea.config.mts`: single entry
   (`src/app.ts`), `outputOptions: { codeSplitting: false }` → one
   self-contained `dist-sea/app.cjs` (~10 MB).
3. `node --build-sea sea-config.json` → the `frodo` binary (Node ≥ 25.5;
   the script enforces ≥ 26).
4. Platform finish, inside `scripts/build-sea.mjs`:
   **macOS**: ad-hoc sign with the JIT entitlement (`com.apple.security.cs.
allow-jit`, `--options runtime`) so the binary runs immediately —
   `--build-sea` output is unsigned and an entitlement-less auto-signature
   at first exec kills the process (V8 CodeRange). CI release jobs replace
   the ad-hoc signature with Developer ID + notarization.
   **Windows**: copy `frodo` → `frodo.exe` (CreateProcess cannot execute an
   extensionless file). **Linux**: no finish step needed.

**sea-config.json**: `execArgv: ["--no-warnings"]` silences Node 26's
spurious `localStorage` ExperimentalWarning; `execArgvExtension: "none"`
makes user flags (`--inspect`, `--node-options`) reach the app, not Node;
`useCodeCache: true` (saves ~50 ms of bundle compile at startup for +2.7 MB
uncompressed / ~1 MB zipped; host-arch-specific, so the macos-intel
cross-build forces it back to `false` in `sea-config.build.json`) +
`useSnapshot: false` (startup snapshots are not viable for this app:
`node:http`/`https` API objects cannot be serialized, and module-scope
state would bake at build time);
`output: "frodo"` (`scripts/build-sea.mjs` copies it to `frodo.exe` on
Windows — Version.ts
binary detection keys on `basename(process.execPath)` being `frodo`/
`frodo.exe`).

**The five targets** (same artifact names as the pkg era):

| Target      | Runner           | How                                                                                                                                                                                                                                                                                                                   |
| ----------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| linux-x64   | ubuntu-24.04     | native (`--build-sea` with its own Node 26)                                                                                                                                                                                                                                                                           |
| linux-arm64 | ubuntu-24.04-arm | native, not a container (SEA needs glibc; alpine unsupported)                                                                                                                                                                                                                                                         |
| macos-arm64 | macos-15         | native                                                                                                                                                                                                                                                                                                                |
| macos-intel | macos-15 (arm64) | **cross-build**: downloads the official darwin-x64 Node binary, points `executable` at it; smoke-tested under Rosetta on the runner. Retires `macos-15-intel` (EOL Aug 2027). Upstream caveat: `--build-sea` is broken on macOS x64 _hosts_ (nodejs/node#65479, open) — our arm64-host/x64-target path is unaffected. |
| windows-x64 | windows-2022     | native; `scripts/build-sea.mjs` copies `frodo` → `frodo.exe`; unsigned (as in the pkg era)                                                                                                                                                                                                                            |

**macOS signing (mandatory, sign LAST)**: `--build-sea` output is **unsigned**
(the injector strips the base Node signature and does not re-sign — verified
in node src/node_sea_bin.cc). Unsigned arm64 binaries are SIGKILLed (rc=137);
quarantined ones get the "Apple could not verify" dialog. `scripts/build-sea.mjs`
therefore ad-hoc signs with `--options runtime` + the JIT entitlement right
after the build, so a locally built binary runs immediately; **release**
signing happens in the pipeline: Developer ID + `--options runtime --timestamp`

- entitlements `com.apple.security.cs.allow-jit` **only** (no entitlements at
  all = V8 "Failed to reserve virtual memory for CodeRange" fatal under the
  hardened runtime; `allow-unsigned-executable-memory` also works but is the
  broader legacy exception Electron dropped). Then `codesign --verify
--strict`, `ditto -c -k` zip, `xcrun notarytool submit --wait` (zips cannot
  be stapled; Gatekeeper checks online). `cp` does NOT break a valid
  signature; re-signing does not clear the quarantine xattr.

**Size**: zipped SEA ~44 MB vs zipped pkg ~30 MB (+14 MB); uncompressed
~148 MB vs ~74 MB. Accepted (users download zips).

**Homebrew installs the prebuilt zips (since #742)**: the tap formulas
(`rockcarver/homebrew-frodo-cli`, both `frodo-cli` and `frodo-cli-next`) no
longer build from source — they download the release zip for the user's
OS/arch (`on_macos`/`on_linux` × `Hardware::CPU` blocks, sha256-pinned) and
install the exact CI-tested, signed, notarized binary. This also drops the
formula's `depends_on node@24`. The formulas are generated by
`tools/update-homebrew-formula.mjs <version> <tag>` (fetches each zip to
compute the sha256 — the same bytes brew will download, so the pin is
verified twice) and pushed to the tap by the `homebrew-formula-update`
pipeline job (replacing `mislav/bump-homebrew-formula-action`). The stable/
next install-time collision guard and the `frodo -v` regex checks are kept.

**Removed with the migration**: `@yao-pkg/pkg`, the `pkg` config block in
`package.json`, the `dist-pkg` script. The `files` allowlist's
`dist/rolldown-runtime-*.cjs` glob is unaffected (the runtime chunk only
exists in the npm `dist/` build, not the single-file SEA bundle).

---

## 7. npm package contents

`files` allowlist (2026-10): `dist/*` (with the rolldown-runtime glob),
LICENSE, README.md, CHANGELOG.md — 11 files instead of 47. Previously the
tarball shipped `.eslintcache`, `testResults.json`, `tools/reports/*.json`
(~700 KB of MCP assessment output) and a stray debug log. The allowlist
matters even though consumers use `dist/`: `npm pack` is the supply-chain
surface, and junk in the tarball is junk in every install.

---

## 8. CI/CD pipeline (summary; details in PIPELINE.md)

`pipeline.yml` — pull requests and pushes to `main` validate; releases are
manual `workflow_dispatch` only (prerelease/patch/minor/major).

Jobs: Build (version bump, manifest update, tsdown+tsc) → Test (Node 26
matrix + cross-platform credential-file tests + live-tenant smoke)
→ 5 binary-release jobs → npm trusted publish → GitHub release → Homebrew
prebuilt-formula push (generate + git push via `FRODO_CI_PAT`).

**npm publish review hold**: npm runs automated review on
not-yet-trusted version patterns — a _new major_ version's first publish
(5.0.0-1 was the first) can sit in "Validating" on the npmjs.com versions
tab for hours while the registry 404s it, even though the publish
transaction itself succeeded (npm CLI + action report success, provenance
lands in the sigstore/rekor log). It clears on its own when review
completes; don't re-run the npm-release job. Policy watch: npm restricts
2FA-bypass tokens for direct publishing (Jan 2027) — the pipeline uses
trusted publishing (OIDC provenance), which is the exempt path, but
re-verify that setup before a release day if the policy tightens.

**Branch protection**: ruleset `main-branch-protection` requires
`Build`, `Test gate`, `linux-x64-binary-release` (cli) / `Cross-Platform
Tests (Credential File Permissions)` (lib). The `Test gate` job is a
stable-named aggregator over the versioned test matrix, so Node version
changes never touch the ruleset. Admin-role bypass exists for release bot
commits (`github-actions[bot]` cannot be a ruleset bypass actor — only
org-owned apps or repository roles qualify).

**paths-ignore**: deliberately absent from `pull_request` triggers — a PR
whose required checks never run could never merge.

---

## 9. Dependency automation

- `dependabot.yml` (both repos): weekly npm + github-actions updates; one
  grouped PR for dev minor/patch; prettier/typescript/eslint excluded
  (Prettier minors reformat; TS/ESLint majors need coordinated work); TS
  majors ignored outright. The exact `@rockcarver/frodo-lib` pin updates
  flow through the same group.
- `dependabot-auto-merge.yml`: arms `gh pr merge --auto --squash` on
  Dependabot patch/minor PRs (security updates included) once checks pass.
  Majors and the tooling set stay manual. NOTE: Dependabot "rules" in repo
  settings only triage alerts — they cannot merge PRs; the workflow is the
  mechanism.
- Known GitHub quirk (hit 3× on 2026-10-03): the mergeability service lags
  behind green check-runs — combined commit status shows `pending` with 0
  statuses and `mergeStateStatus` is BLOCKED/UNKNOWN although every check
  run is success. Wait a few minutes and retry; if it persists, all-green is
  verifiable via the check-runs API and admin merge is legitimate.

---

## 10. Docker image

`Dockerfile` builds the MCP HTTP server image: stage 1 runs
`npm run build:only` on `node:24-slim` (needs `tsdown.config.ts` in COPY —
updated from the stale `tsup.config.ts` reference when the allowlist
landed); stage 2 copies only `dist/` and runs `node dist/launch.cjs`
(signal-forwarding wrapper → graceful MCP shutdown on `docker stop`).
The image does not use the release binaries and is unaffected by the
pkg→SEA migration (it builds `dist/` from source).

---

## 11. Maintenance history (what changed when)

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | PR                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 2026-10-02 | Dependabot configs fixed (were empty template); security updates + secret scanning on                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | #712                         |
| 2026-10-02 | Unmaintained deps replaced: esprima→acorn, jwk-to-pem→node:crypto, replaceall→String.replaceAll, dead deps removed                                                                                                                                                                                                                                                                                                                                                                                                                                                  | #671 (lib)                   |
| 2026-10-02 | node-jose→jose; tsup sucrase workaround                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | #672 (lib)                   |
| 2026-10-02 | node-forge→@peculiar/x509 (test-only certs)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | #673 (lib)                   |
| 2026-10-03 | jest 29→30 + snapshot header migration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | #729                         |
| 2026-10-03 | paths-ignore removed from PR trigger; Test gate aggregator added                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | #728                         |
| 2026-10-03 | tsup→tsdown                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | #730                         |
| 2026-10-03 | Branch protection rulesets active; admin bypass via repository role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | (repo settings)              |
| 2026-10-03 | Dependabot auto-merge workflow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | #731                         |
| 2026-10-03 | TypeScript aligned to ^5.9.3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | #732                         |
| 2026-10-03 | npm `files` allowlist; Dockerfile tsup→tsdown fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | #733                         |
| 2026-10-03 | pkg → native Node.js SEA (all 5 targets; macos-intel cross-built on arm64; sign+jit entitlements+notarize; `@yao-pkg/pkg` removed)                                                                                                                                                                                                                                                                                                                                                                                                                                  | #734                         |
| 2026-10-03 | Remaining unmaintained CLI deps replaced: `yesno`→`@inquirer/confirm` (6 confirm-prompt sites; prompts now answer with Enter-as-default-false), `readline-sync`→native `fs.readSync` in `utils/Prompt.ts` (the MFA OTP handler needs a _synchronous_ prompt — frodo-lib's `CallbackHandler` is sync), `deep-diff`→a local `mergeOver` helper in `FrConfigCspOps.ts` (deep-diff's exact `applyDiff`-minus-deletions semantics; frodo-lib's `mergeDeep` was evaluated and rejected — it cannot overwrite a scalar with an object and throws)                          | this PR                      |
| 2026-10-03 | ESLint 8→10 (native flat config), Prettier-owns-imports via `@ianvs/prettier-plugin-sort-imports`; `eslint-plugin-prettier`, `simple-import-sort`, `jest`, `jsx-a11y`, `import` plugins removed; scripts `fix`/`check`; ~40 dead initializers, 1 `preserve-caught-error`, 2 real shadowing bugs fixed; `tsconfig.lib` → `ES2022` for `Error(cause)` typing                                                                                                                                                                                                          | this PR                      |
| 2026-10-04 | Binary-first test runtime: SEA output at `dist-sea/frodo[.exe]`, test scripts wrap `tools/with-frodo-bin.mjs` (on-demand binary build + PATH pin), npm-entry smoke suite, CLI test matrix → Node 26 only, engines ≥26, Docker node:26-slim                                                                                                                                                                                                                                                                                                                          | #741                         |
| 2026-10-04 | Homebrew formulas install prebuilt release zips (per-OS/arch sha256-pinned; `mislav/bump-homebrew-formula-action` replaced by `tools/update-homebrew-formula.mjs` + pipeline git push; `depends_on node@24` dropped; `brew test` implemented)                                                                                                                                                                                                                                                                                                                       | #742                         |
| 2026-10-04 | Developer surface restored to pkg-era shape: `npm run build` = full build incl. SEA binary (auto ad-hoc signed on macOS, frodo.exe copy on Windows, Node-26 guard with clear message via `scripts/build-sea.mjs`); `npm test` (dev mode) runs the suite against `node dist/launch.cjs` via committed shims (`test/e2e/shims/`) — no SEA build or signing needed locally; `npm run test:binary` = SEA mode (what CI's Test job runs); tsdown `deps.onlyBundle: false` silences the dep-bundle hint in both repos' configs; lib silences `INEFFECTIVE_DYNAMIC_IMPORT` | this PR                      |
| 2026-10-04 | Startup performance: theme settings + theme-definition reads cached with mtime validation (the per-command `FrodoStubCommand` re-activated the theme, re-reading `~/.frodo/themes/*.json` ~400× per invocation — 5,600 redundant sync reads, ~200 ms); SEA `useCodeCache: true` for native targets (+~50 ms compile saving); `frodo -v` 560 → ~355 ms. Fixed the Windows binary job missing its `--build-sea` invocation (would have shipped `Copy-Item` of a nonexistent file)                                                                                     | this PR                      |
| 2026-10-04 | Release job pushes via org-wide `FRODO_CI_PAT` (fine-grained PAT, org secret, selected-repo visibility) — required status checks reject `github-actions[bot]` pushes; PAT-as-repo-admin rides the ruleset bypass. `PAT_HOMEBREW_FORMULA_REPO` retired into it                                                                                                                                                                                                                                                                                                       | #746                         |
| 2026-10-05 | npm dev-dependency majors (Batch 2, merged sequentially with rebase discipline): @types/node 26, chokidar 5, uuid 14, commander 15 (SEA-validated on main before merge), properties-reader 3 (`propertiesReader({sourceFile})` object form; `.each` callback value widened to `Value` → env-file values coerced with `String()`)                                                                                                                                                                                                                                    | #740, #725, #720, #739, #738 |
| 2026-10-05 | frodo-lib pinned to exact versions (4.11.1 → 4.12.0-1) after each lib release; lib pin is deliberate (exact, not caret) so cli CI always validates against the version it will ship with                                                                                                                                                                                                                                                                                                                                                                            | #754                         |
| 2026-10-05 | Deep-import type migration: all 110 `@rockcarver/frodo-lib/types/*` statements (62 files) migrated to root-entry imports with inline `type` qualifiers — removes the node10-moduleResolution dependency (`./types/*` subpath is deprecated in TS 6, removed in TS 7) and gives IDEs the standard single-entry type surface. Requires frodo-lib ≥ 4.12 (#687 root type exports)                                                                                                                                                                                      | #755                         |
| planned    | Polly→nock (library repo) — DEFERRED 2026-10-04 (deep record-harness coupling; revisit on Node 28 or real breakage)                                                                                                                                                                                                                                                                                                                                                                                                                                                 | —                            |
