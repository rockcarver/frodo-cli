---
status: accepted
date: 2026-10-27
decision-makers:
  - maintainers
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
---

# Experimental features are not bound by compatibility records

## Context and problem statement

Some rules promise compatibility: a command line that ran under 4.x keeps running under 5.x ([frodo-cli record 0030, interactive mode never prompts for what 4.x accepted](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0030-interactive-mode-never-prompts-for-what-4x-accepted.md)), and a removed or renamed command, option or alias goes into MIGRATION.md. A feature that is still being shaped cannot keep those promises and also be shaped. frodo-cli already marks such features: a command group declared experimental, an `[Experimental]` label in the README command table, and a notice at run time that the feature "may change without notice". Nothing said what that label releases a feature from. When this was decided, on 2026-10-27, a pull request removed the `-r` option from the config-manager pull commands, an experimental group, and a reviewer could not tell whether the 4.x promise and the migration guide applied to it.

## Decision

- A feature is experimental only if it says so to its users before it is released. In frodo-cli the command group is declared with `withStability('experimental')`, the README command table marks it `[Experimental]`, and a run prints the experimental notice. A frodo-lib API is experimental only if its documentation carries the tag `@experimental`. A feature that is merely new or unfinished is not experimental.
- An experimental feature may change or lose commands, options, arguments, output and file layouts in any release, prereleases included.
- No compatibility rule binds it: not the rule that a 4.x command line keeps running, and not the rule that a removal goes into MIGRATION.md. A migration entry for a widely used change is welcome, not required.
- Every other rule still binds it, among them security, secrets, usage examples, tests and option conflicts.
- Experimental status never excuses breaking a stable feature: code shared with a stable command, option or API keeps that feature's behaviour.
- Removing the label is a decision. From the release that drops it the feature is bound like any other; the pull request names that release and records it, as [frodo-cli record 0022 does for the config-manager commands](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0022-config-manager-commands-move-to-the-root.md).

## Consequences

- Reviewers, agents and the Repo Concierge's gates must not hold a change to an experimental feature to a compatibility record. They still check that the marker, the README entry and the run-time notice agree.
- A feature released without all three is bound like a stable one.
- frodo-lib has no tooling for the marker: `@experimental` is a documentation convention, and a lib API that backs an experimental CLI feature stays bound until its documentation carries the tag.
- Users get no promise from an experimental feature, so scripts that depend on one should expect to be edited between releases.

## Alternatives considered

Bind experimental features like stable ones: nothing could be reshaped after its first release. Write an exception into each compatibility record: the exceptions drift apart, and a new compatibility rule would forget to add one.
