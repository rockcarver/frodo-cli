---
name: change-the-ci-pipeline
description: Use when a maintainer asks to change how pull requests are checked in CI, for example which files skip the long test matrix, what runs for a pull request that only changes docs or guidance files, the Validate guidance job, the Test gate, or anything in .github/workflows/pipeline.yml. Covers the change classifier and the rule that it is read from the base commit, how to add a path together with its test case, how to prove a change live, and the rules that must stay true (no paths-ignore on pull requests, a filter may skip work but never hide it, required checks keep their names). Maintainer only, coding agents stop and ask.
---

# Change the CI pipeline

**Only change workflow files when a maintainer asks. If you are a coding agent, stop and say so in the issue or pull request.** A pull request controls its own workflow file, so a change here is read line by line by a maintainer, and nothing in it may weaken what judges the pull requests after it.

The rules this skill follows are core record 0012, [merging is gated by a stable set of required checks](../../../docs/decisions/core/0012-merging-is-gated-by-a-stable-set-of-required-checks.md), and core record 0016, [changes that are not code still run the checks that validate them](../../../docs/decisions/core/0016-changes-that-are-not-code-still-run-the-checks-that-validate-them.md). The mechanics, with the diagram, are in [docs/PIPELINE.md](../../../docs/PIPELINE.md) ("Detect code changes", "Validate guidance", "Test gate"); the history is in [docs/BUILD-ENV.md](../../../docs/BUILD-ENV.md). This skill is the order to work in; it does not restate them.

## How a pull request is classified

1. The `Detect code changes` job lists the files of the pull request (a rename lists both names) and pipes them to `.github/scripts/classify-changes.sh`, which prints `code=` and `guidance=`.
2. `code=false` (no long test matrix) only when every file is on the non-code list. The pipeline and the classifier themselves count as code. Anything unknown, an empty list, 3000 or more lines, an API error, a push or a release run is code.
3. `guidance=true` when a file that a guidance test reads changed (`GUIDANCE` in the script). Then the `Validate guidance` job runs `npm run test:guidance` ([tools/run-guidance-tests.mjs](../../../tools/run-guidance-tests.mjs)): the decision-record and skill tests, no build. With code, the `Test` job runs them anyway.
4. `Test gate` (required) waits for all of it and fails if the guidance job was needed and did not succeed. The required checks are `Build`, `Test gate` and `linux-x64-binary-release`; none of them changes name.

The script is fetched from the **base** commit of the pull request, never the head, so a pull request cannot choose the rules that judge it. A base without the script falls back to code.

## Add a path to a list

1. Decide which list. Cannot change what the tests build or test: the non-code list. A test reads it (a record, skill or entry point): also `GUIDANCE`. Everything else stays code, which is the safe answer.
2. Edit the one regular expression in `.github/scripts/classify-changes.sh`.
3. Add the case to the matching table in `test/unit/ClassifyChanges.test.js`, and a case for the nearby path that must stay code.
4. If a test starts to read a new kind of file, list the test in `tools/run-guidance-tests.mjs` and the file in `GUIDANCE`, in the same pull request.
5. Update the lists in `docs/PIPELINE.md` and add a row to the history table in `docs/BUILD-ENV.md`.

Your pull request changes the classifier and the pipeline, so it is classified as code and runs everything. That is expected.

## Change a job or the gate

- A new job that the gate must respect goes into the gate's `needs` and its expected result; `test/unit/PipelineClassification.test.js` runs the gate's bash for every combination of results, so extend its table.
- Renaming, adding or removing a required check, a new secret or permission, or a change to a release job is not this skill: stop and ask the maintainer (rulesets are settings, not code).
- Keep `paths-ignore` off the `pull_request` trigger. A required check that never runs blocks the merge for good. The `push` trigger keeps its own `paths-ignore`, which is fine.

## Check it

```console
FRODO_TEST=1 NODE_OPTIONS='--no-warnings --experimental-vm-modules' npx jest test/unit/ClassifyChanges.test.js test/unit/PipelineClassification.test.js
npm run test:guidance
shellcheck -s bash .github/scripts/classify-changes.sh
```

- The two test files run the classifier and the two workflow steps as real bash, against a stand-in for `gh`. They need `bash` and skip on Windows.
- Mutate before you trust new tests: flip one entry of a list, drop a fallback, change a `needs`, and see a test fail. Restore the file each time.
- `actionlint`, if you have it, catches workflow syntax. The first run of the pull request also fails fast on a broken file.
- Read your own diff of `pipeline.yml` for anything that lets a pull request skip a check it should run.

## Run everything by hand

A pull request that the classifier skips gets no long test jobs. To run them anyway, dispatch the pipeline on its branch with `ci-only`, which publishes nothing (`docs/PIPELINE.md`, "Full CI by hand"):

```console
gh workflow run pipeline.yml -R rockcarver/frodo-cli --ref <branch> -f release-type=ci-only -f dry-run=false
```

## Prove it live

The pull request that changes the pipeline cannot show the skip, because it is code. After it is merged, open a draft pull request that changes one skill file and expect `Test` skipped, `Validate guidance` green and `Test gate` green. Break the front matter of that skill on the same pull request and expect `Validate guidance` and `Test gate` red. Close it and delete the branch. A scratch branch cut from the unmerged change lists the whole change and is code too.

## Pitfalls

- The base version of the script judges your pull request. A new rule only takes effect for pull requests opened after yours merges.
- `.github/scripts/` is on the non-code list; only the classifier files in it are code. Do not remove that exception.
- Deleting or renaming a file that a record or skill only cites (for example `docs/PIPELINE.md`) changes no guidance file, so no guidance test runs. Change the citing record or skill in the same pull request.
- A superseded run is cancelled when you push again. A red check on an old run is not a result; read the newest run.
- The classifier and the workflow steps agree on two outputs and exactly `true` or `false`. Any other answer is treated as code.

## When to stop and ask

A required check changes, a release or signing job is involved, a secret or permission is added, or you cannot tell which list a path belongs on. Say so in the issue or pull request.
