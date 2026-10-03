# Frodo CLI — Toolchain and Build Environment

This document explains every piece of the CLI's toolchain: what it does, why
it is the way it is, and the details you need when something breaks. It is
the companion to [PIPELINE.md](PIPELINE.md), which describes the release
pipeline's jobs and flow; here we go one level deeper — the tools themselves.

The library repo ([frodo-lib](https://github.com/rockcarver/frodo-lib)) shares
most of this toolchain and keeps its own copy of this document
(`BUILD-ENV.md` there) for the pieces that differ.

_Last updated: 2026-10-03 (tooling modernization, phases 0-6)._

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
  ├─ @yao-pkg/pkg ......... dist/app.cjs -> single binaries (5 platforms)   [Phase 7 replaces with native SEA]
  │
  └─ eslint + prettier .... lint & format (currently ESLint 8/9 configs; Phase 5 migrates to 10 + Prettier-owns-imports)

Release automation:
  ├─ dependabot.yml ....... weekly grouped dependency PRs
  ├─ dependabot-auto-merge.yml  arms auto-merge on green patch/minor PRs
  ├─ ruleset "main-branch-protection"  Build + Test gate + linux-x64-binary-release required
  └─ pipeline.yml ......... version bump -> build -> test -> 5 binaries -> npm publish -> GitHub release -> Homebrew
```

---

## 2. Bundler: tsdown (replaced tsup 2026-10)

**What it does**: bundles the three TypeScript entries into CJS outputs:

| Entry | Output | Role |
|---|---|---|
| `src/launch.ts` | `dist/launch.cjs` | npm `bin` entry; spawns `app.cjs` with the module-resolution loader and forwards signals |
| `src/loader.ts` | `dist/loader.cjs` | module-resolution loader for the app |
| `src/app.ts` | `dist/app.cjs` | the CLI itself (~10 MB, self-contained) |

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
  glob. Phase 7's SEA config turns splitting **off** (single file).
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

## 4. Tests: jest 30 + Polly

- jest 30.5.2, `--experimental-vm-modules` (ESM-mode TS via ts-jest).
- `FRODO_TEST=1 NO_COLOR=1` normalize the environment; `testResults.json` is
  written by `test:debug` only.
- HTTP traffic is mocked with the Polly.js stack (`@pollyjs/*` +
  `setup-polly-jest` + cassettes under `test/`). Record new cassettes with
  `test:record:cloud`. NOTE (2026-10): the Polly stack is unmaintained (last
  release 2023); migration to nock is planned (Phase 4d) but is no longer
  security-driven — the `qs` advisory that motivated it is closed (Polly's
  tree now resolves patched `qs@6.16.0`).
- Two stale assertions in `src/mcp/server/mcp-server.test.js` fail on `main`
  with jest 29 too — pre-existing, tracked, do not block on them.
- Full suite: ~636 suites / ~1,950 tests / ~8,500 snapshots; CI runs the
  serial variant across Node 22/24/26 (38 min on Node 22).

---

## 5. Lint and format (today, and the Phase 5 plan)

**Today**: ESLint 8.57 flat config via `FlatCompat` (`eslint.config.mjs`),
plugins: `@typescript-eslint`, `prettier` (as a lint rule — slow, ~38 s),
`jest`, `simple-import-sort`, `import`. Prettier 3.8 with a plain config
(no import sorting plugin). Known pain: import-order errors are flagged in CI
but `lint:fix` cannot always fix them — the sorter (`simple-import-sort`) and
Prettier disagree, and the fix must be applied by the editor's
"organize imports" action.

**Phase 5 (planned)**: ESLint 10 native flat config, `eslint-plugin-import-x`,
**Prettier owns import order** via `@ianvs/prettier-plugin-sort-imports`
(the lib's `.prettierrc` already declares its `importOrder`), drop
`eslint-plugin-prettier` and the redundant sorters, scripts become
`fix = eslint --fix && prettier --write` (prettier last) and
`check = eslint && prettier --check`. One reformat commit recorded in
`.git-blame-ignore-revs`. ESLint 10's new findings (~51 in CLI) get fixed in
the migration PR.

---

## 6. Binary packaging: pkg today, native SEA next (Phase 7)

**Today**: `npm run build:binary` = tsdown build + `pkg -C Gzip -t node24
--config package.json -o frodo dist/app.cjs`. The `pkg` block in
`package.json` lists `_scripts`/`_assets`; the templates are bundled into
`dist/app.cjs` by tsdown, so the asset list is belt-and-suspenders.
Five release binaries: linux-x64, linux-arm64, macos-intel, macos-arm64,
windows-x64. Homebrew formulas install prebuilt release binaries.

**Phase 7 (spiked 2026-10, ready to implement)**: native Node.js SEA via
`node --build-sea` (needs Node ≥ 25.5; we use 26):

- Single-entry tsdown config, `outputOptions: { codeSplitting: false }` →
  one self-contained `app.cjs`.
- `sea-config.json`: `execArgv: ["--no-warnings"]` (silences Node 26's
  spurious `localStorage` ExperimentalWarning), `execArgvExtension: "none"`
  (user flags like `--inspect` reach the app, not Node), `useCodeCache: false`,
  `useSnapshot: false` (required for cross-builds).
- All five targets cross-build from one arm64 macOS runner via the
  `executable` field pointing at official per-target Node 26 binaries;
  macos-intel verified under Rosetta. Upstream caveat: `--build-sea` is
  broken on macOS **x64 hosts** (nodejs/node#65479, open) — does not affect
  our arm64-host/x64-target path.
- **macOS signing (mandatory, sign LAST)**: `--build-sea` output is unsigned
  (the injector strips the signature); unsigned arm64 binaries are SIGKILLed
  (rc=137) and quarantined ones get the "Apple could not verify" dialog.
  Sign with Developer ID + `--options runtime --timestamp` +
  entitlements `com.apple.security.cs.allow-jit` **only** (no entitlements at
  all = V8 CodeRange fatal; `allow-unsigned-executable-memory` works but is
  the broader legacy exception). Then `ditto` zip + `notarytool submit
  --wait` (zips cannot be stapled).
- Linux SEAs need `libatomic1` (present in debian:stable-slim; alpine is not
  a supported SEA platform).
- Size: zipped SEA ~44 MB vs zipped pkg ~30 MB (+14 MB); uncompressed ~148 MB
  vs ~74 MB. Accepted.
- Full signed-and-notarized flow: see `SEA-SIGNING-SPEC.md` in the
  frodo tooling workspace; CI keeps a Rosetta smoke test for the intel
  artifact.

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

Jobs: Build (version bump, manifest update, tsdown+tsc) → Test (Node
22/24/26 matrix + cross-platform credential-file tests + live-tenant smoke)
→ 5 binary-release jobs → npm trusted publish → GitHub release → Homebrew
formula bump.

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
pkg→SEA migration.

---

## 11. Maintenance history (what changed when)

| Date | Change | PR |
|---|---|---|
| 2026-10-02 | Dependabot configs fixed (were empty template); security updates + secret scanning on | #712 |
| 2026-10-02 | Unmaintained deps replaced: esprima→acorn, jwk-to-pem→node:crypto, replaceall→String.replaceAll, dead deps removed | #671 (lib) |
| 2026-10-02 | node-jose→jose; tsup sucrase workaround | #672 (lib) |
| 2026-10-02 | node-forge→@peculiar/x509 (test-only certs) | #673 (lib) |
| 2026-10-03 | jest 29→30 + snapshot header migration | #729 |
| 2026-10-03 | paths-ignore removed from PR trigger; Test gate aggregator added | #728 |
| 2026-10-03 | tsup→tsdown | #730 |
| 2026-10-03 | Branch protection rulesets active; admin bypass via repository role | (repo settings) |
| 2026-10-03 | Dependabot auto-merge workflow | #731 |
| 2026-10-03 | TypeScript aligned to ^5.9.3 | #732 |
| 2026-10-03 | npm `files` allowlist; Dockerfile tsup→tsdown fix | this PR |
| planned | ESLint 10 + Prettier-owns-imports (Phase 5); pkg→SEA (Phase 7); Polly→nock (Phase 4d) | — |
