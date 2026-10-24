---
status: accepted
date: 2026-10-23
decision-makers: maintainers
applies-to:
  - src/cli/**
issues:
  - rockcarver/frodo-cli#900
  - rockcarver/frodo-cli#904
---

# Usage examples run as written and open no prompt

## Context and problem statement

Usage examples are copied into terminals and scripts. In a terminal, a missing `[realm]` can open the realm picker, a missing target option opens an entity picker, and a misordered operand is read as something else. Commands such as `frodo journey list` take `[host] [realm] [username] [password]`, so `<host> <user> <password>` makes the user name the realm and the password the user name, and the login then fails with "No connection profile found". When this was checked, 114 of 201 examples were wrong or would have opened a prompt (frodo-cli#900).

## Decision

- Every usage example runs as written and opens no picker, editor or prompt.
- With credentials, the realm comes right after the host: `<host> <realm> <username> '<password>'`.
- Name the target (`-i`, `-a`, and so on) of every command that picks an entity, and one member of every one-of option group.
- Use only flags the command defines, and close every quote.
- The one exception is a command that asks for confirmation by design. `frodo journey prune` calls the confirm widget directly, so no flag skips it; the sentence above its example says so.

## Consequences

- `test/unit/UsageExampleOperands.test.js` checks that the command and its flags exist, that the second operand is a realm, entity pickers, option groups and quotes. Its list of known violations is empty and only ever shrinks.
- The check does not judge an omitted realm. Whether an example with a connection profile may leave the realm out follows record 0001: once that is implemented, a complete command with the realm omitted opens no picker.
- Authors run every example against a build before finishing.
