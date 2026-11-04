---
status: accepted
date: 2026-11-04
decision-makers:
  - maintainers
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
applies-to:
  - src/api/**
  - src/cli/**
  - src/ops/**
  - src/utils/**
issues:
  - rockcarver/frodo-cli#1013
  - rockcarver/frodo-cli#1038
---

# Time spans are seconds on the command line and milliseconds in the library

## Context and problem statement

The library is for developers, who work with JavaScript timers and `Date.now()` in milliseconds. The CLI is for users, who type command lines. When this was decided, on 2026-11-04, every time-span parameter of a library function (a timeout, a polling interval, a delay) was in milliseconds and documented as such, and every time-span option of the CLI (for example `frodo esv apply --timeout` and `--llt-ttl` of the admin command that creates an OAuth2 client) was in seconds. The first version of the `--wait` option for the config-manager promote commands took minutes, which raised the question.

## Decision

- A parameter of a library function that takes a time span takes milliseconds, and its documentation says "in milliseconds". Fields of configuration objects keep the unit the server defines, for example token lifetimes in seconds.
- A CLI option that takes a time span takes seconds, and its help says so, for example `--timeout <seconds>`. Not minutes, not milliseconds.
- The two units differ on purpose, because the two audiences differ. The CLI converts in the operation that calls the library. When the user gave no value it passes none, so the default of the library applies and is not copied into the CLI.
- An existing option or parameter keeps its unit. Changing it breaks command lines or callers without an error.

## Consequences

- A new time-span option or parameter uses the unit of its layer. A reviewer or agent that finds minutes on the command line, or seconds in a library function parameter, asks for a change.
- A user who wants half an hour types `--timeout 1800`. That is the price of one unit on the command line.
- Unit suffixes such as `30m` are not part of this decision. They could be added later as a new record without breaking a plain number.

## Alternatives considered

Minutes on the command line: closer to how long a promotion takes, but `esv apply` ships seconds and cannot change, and two units for users are worse than a larger number. One unit for both layers: the library would break the callers of its public API, or the CLI would break existing command lines.
