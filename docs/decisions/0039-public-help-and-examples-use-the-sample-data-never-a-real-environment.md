---
status: accepted
date: 2026-11-07
decision-makers: maintainers
applies-to:
  - src/cli/**
  - src/help/**
  - test/unit/HelpHostsAreSamples.test.js
---

# Public help and examples use the sample data, never a real environment

## Context and problem statement

The help of a command, its usage examples and its extra help are public, and people copy their examples. When this was decided, on 2026-11-07, a check of the rendered help of all commands found the sample tenants almost everywhere, one real tenant host in an example, and examples that used the alias of a developer's own tenant. Nothing stopped a new command from naming the environment its author happened to work against.

## Decision

- **Sample data only.** Help text, usage examples and extra help use the values of `src/help/SampleData.ts` (the sample tenants, users and URLs). They never name the host, the tenant alias, a user or a company of a real environment.
- **Show where a name comes from.** A name that is derived from a URL (a proxy named after the tenant it reaches, an alias made from a host) is shown with a full sample URL and the name taken from it.
- **A test checks the hosts.** A unit test renders the full help of every command and fails for any host in an `http` or `https` URL that is not a host of the sample data, a host reserved for examples, the local machine or an entry in the test's short list of placeholder hosts. That list holds only hosts that are not environments, each with a comment, and there is no list of exceptions.
- **Reviewers check the names.** A name that is not part of a URL cannot be checked by a test: a deny-list would have to spell the names out. The review checklist for agent pull requests and the skill for adding a command say so.
- **Out of scope.** The recorded sessions that the end-to-end tests replay are not help text and are not covered.

## Consequences

- A new command takes its tenant, user and URL examples from the sample data; a new sample is added there, once.
- To keep in sync: `test/unit/HelpHostsAreSamples.test.js`, the `add-a-cli-command` skill and the review checklist in the skill for reviewing agent pull requests.
- Not covered: commit messages, pull request and issue text, and comments. The same rule applies to them, and reviewers check it.

## Alternatives considered

- A deny-list of known private names: it publishes the names, and it is never complete.
- Scanning every file of the repository: the recordings hold real sessions in very large numbers, so the check would need a baseline that never shrinks.
- Review only: a real host reached the help that way.
