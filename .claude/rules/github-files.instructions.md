---
paths:
  - ".github/**"
---
<!-- Generated: do not edit. Source: .github/instructions/github-files.instructions.md. Regenerate with: node tools/generate-claude-rules.mjs -->

# Files under `.github/`

- **Do not edit the Issue Concierge's files**: `.github/workflows/*.lock.yml` and the `.md` workflow sources beside them, `janitor.yml`, `check-deployment.yml`, `issue-concierge-updater.yml`, `dependency-watch.yml`, `plan-approval-resume.yml`, `pr-ready-signal.yml`, `.github/scripts/`, `.github/aw/` and the pin in `.github/issue-concierge.yml`. An updater overwrites them. `pipeline.yml`, `core-records-drift.yml`, `dependabot*.yml`, `.github/issue-concierge/scope.md` and `related-repos.md` belong to this repository.
- **Required checks stay stable** ([core 0012](../../docs/decisions/core/0012-merging-is-gated-by-a-stable-set-of-required-checks.md), [core 0016](../../docs/decisions/core/0016-changes-that-are-not-code-still-run-the-checks-that-validate-them.md)): never rename `Build`, `Test gate` or the platform check; guidance changes still run `npm run test:guidance`. A change to `pipeline.yml` is read by a maintainer: [the skill](../../.claude/skills/change-the-ci-pipeline/SKILL.md) says how.
- **`.github/instructions/*.instructions.md` is the source of the scoped rules, and `.claude/rules/` is generated from it** ([core 0026](../../docs/decisions/core/0026-agent-guidance-has-one-source-and-per-tool-copies-are-generated-from-it.md)). After you change an instruction file, run `npm run generate:claude-rules` and commit the result; never edit a file of `.claude/rules/` by hand. `test/unit/ClaudeRules.test.js` fails when the two folders differ.
