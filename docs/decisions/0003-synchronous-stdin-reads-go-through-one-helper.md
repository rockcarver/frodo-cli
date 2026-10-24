---
status: accepted
date: 2026-10-23
decision-makers: maintainers
applies-to:
  - src/utils/StdinSync.ts
  - src/utils/Prompt.ts
  - src/configManagerOps/**
issues:
  - rockcarver/frodo-cli#887
  - rockcarver/frodo-cli#896
  - rockcarver/frodo-cli#898
---

# Synchronous standard input reads go through one helper

## Context and problem statement

The first time anything touches `process.stdin`, even `process.stdin.isTTY`, Node switches file descriptor 0 to non-blocking mode. A synchronous `readSync(0)` then throws `EAGAIN: resource temporarily unavailable, read` whenever input has not arrived yet. The multi-factor code prompt failed this way in 5.0.0-12 (frodo-cli#887), after the `readline-sync` dependency, which opened the terminal device itself, was replaced by a direct read of fd 0. `config-manager push raw --stdin` failed the same way when the producer of the pipe was slower than the CLI.

## Decision

- Every synchronous read of standard input goes through `src/utils/StdinSync.ts`: `readStdinChunkSync` for a prompt and `readStdinToEndSync` for piped input.
- The helper treats `EAGAIN` as "no input yet" and retries after a short sleep, never a busy wait. It treats an `EOF` error code as end of input and rethrows every other error.
- No other module reads fd 0 directly. ESLint rejects `process.stdin.fd`, `readSync(0, ...)`, `readFileSync(0, ...)` and `/dev/stdin` outside the helper.
- Prompts are asynchronous widgets. The one synchronous prompt, the multi-factor code in `src/utils/Prompt.ts`, exists because frodo-lib's callback handler cannot wait for a promise. Do not add another.

## Consequences

- The lint rule cannot see a descriptor held in a variable. Review has to.
- The behaviour on Windows is untested.
- A library change that lets the callback handler return a promise (frodo-lib#783) would remove the synchronous prompt and this exception.
