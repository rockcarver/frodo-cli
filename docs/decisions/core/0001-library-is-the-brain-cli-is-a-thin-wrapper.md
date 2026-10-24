---
status: accepted
date: 2026-10-24
decision-makers:
  - maintainers
applies-to:
  - src/ops/**
repos:
  - rockcarver/frodo-lib
  - rockcarver/frodo-cli
---

# The library is the brain, the CLI is a thin wrapper

Recorded in the umbrella repository rockcarver/frodo (archived 2026-10) until 2026-10-24; this copy is the record.

## Context and problem statement

Frodo is two repositories that must behave as one product. frodo-lib is the library; frodo-cli is the command line on top of it; scripts, MCP clients and other tools use the library directly. Logic that lives only in the CLI cannot be reused by them, drifts from the library and has to be written twice. This is the principle the project was built on, recorded retroactively.

## Decision

- **Business logic, API calls, data handling and configuration management belong in frodo-lib**, behind the `frodo` facade. Anything a script, an MCP server or another tool needs must be reachable through the facade.
- **frodo-lib is free of anything that ties it to one interface** (a terminal, a shell, a protocol front-end): no prompts, no console, stdin or stdout handling, no ANSI or terminal detection. Where it needs a person or a place to write, it takes a callback or handler from the caller.
- **For most commands the CLI is a thin wrapper.** Its ops layer (`src/ops/`) only adapts the library's ops for the CLI: argument mapping, output, files, stdin and exit codes. A command file parses, calls an ops function and sets the exit code.
- **Interface-specific stacks live in the CLI and are heavy there by design.** They are exceptions, not deviations: the interactive mode (prompts, pickers, frames, the input-resolution pass), the frodo shell, and the MCP server stack (how it divides with the library's `src/mcp` is left open for now).
- **A new capability is built library first**: add it to frodo-lib and the facade, release it, then wrap it in the CLI. The CLI never reimplements or works around a library function.

## Consequences

- A contributor adding a feature that needs data or tenant behaviour starts in frodo-lib (a facade method with tests there), then adds the command, its prompts and its output in frodo-cli.
- To tell an exception from a deviation, a reviewer asks of any substantial CLI code: would a script, an MCP client or another front-end need this? If yes, it is business logic and belongs in the library: reject it or ask for it to move. If it exists only because of how a terminal, a shell or a protocol front-end works (reading keys, drawing frames, parsing arguments, wiring a transport), it is an exception and stays.
- A reviewer rejects code in frodo-lib that prompts, reads or writes a terminal, or detects terminal capabilities.
- The library's public surface is only the facade (see 0007), so the CLI can rely on it as the one way in.

## Known deviations

The project does not follow this everywhere yet. Config-manager keeps substantial logic in the CLI, in a separate `configManagerOps` layer outside `src/ops`. frodo-lib still holds terminal-specific code (colour theme and terminal detection in `src/utils`); it needs to be revisited and likely should not have gone into the library in the first place. Deviations are recorded in later records that reference this one, not here, so this record stays stable.
