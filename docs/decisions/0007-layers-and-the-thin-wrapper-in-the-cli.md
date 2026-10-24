---
status: accepted
date: 2026-10-24
decision-makers: maintainers
applies-to:
  - src/cli/**
  - src/ops/**
  - src/utils/**
---

# The CLI has command files, an ops layer and utilities, and wraps the library thinly

## Context and problem statement

Umbrella record 0001 says the library is the brain and the CLI a thin wrapper for terminal access; 0007 says the library's only public surface is the `frodo` facade. This record states what that means inside frodo-cli, where each kind of code lives, and measures how thin the wrapper really is. Interactive code has its own layering rule (cli record 0005). Recorded retroactively and measured on `main` (02a74335, 2026-10-24) with a syntax-tree analysis of imports and of every function reachable from a command.

## Decision

- `src/cli/` holds one file per command, one folder per group. A command file parses arguments, logs in, calls an ops function and sets the exit code. It contains no business logic and no prompting (cli 0005, 0008).
- `src/ops/` is the library wrapper: it calls the library through the `frodo` facade and adds the terminal concerns the library must not have: printing, progress, files, standard input, exit conditions. It does not prompt (cli 0005).
- `src/utils/` holds shared utilities; `src/utils/interactive/` holds all prompt code.
- The CLI imports the library only as `frodo`, `state`, `FrodoError` and types from the package root. ESLint rejects deep imports and other value imports.
- Imports point from `cli` to `ops` to `utils`. Nothing in `ops` or `utils` imports a command file.
- Interface-specific stacks live in the CLI and are not deviations from the thin-wrapper rule: the interactive mode (prompts, pickers, frames, the resolution pass), the MCP server stack (HTTP and stdio transport, authentication, lifecycle), the frodo shell, and terminal theming, colour, progress and output formatting.
- A feature that other consumers (scripts, the MCP server, another tool) would also need is built library first (umbrella 0001).

## Consequences

Measured on `main`:

| What | Result |
| - | - |
| modules and lines (non-blank, non-comment) | 565 files, 66,177 lines |
| interface-specific stacks | interactive 4,189 lines (24 files), MCP server 4,587 (17), shell 881 (4), theming, console and help 1,179 (5), `FrodoCommand` 2,434 (1): 13,270 lines, 20.1% |
| login and connection setup (terminal and profile concerns) | 1,892 lines (21 files), 2.9% |
| config-manager (record 0024) | 8,324 lines (130 files), 12.6% |
| promote (0025) | 1,226 lines (2 files), 1.9% |
| imports | cli to ops 560, cli to utils 399, ops to utils 75, ops to ops 59; no ops or utils edge to a command file except four dynamic imports from the interactive layer (record 0029) |
| deep imports of the library | none |
| runtime import cycles (value imports only) | one of 8 files (`IdmOps`, `MappingOps`, `NodeOps`, `ScriptOps`, `ThemeOps`, `classic/ServerOps`, `IgaWorkflowOps` and `utils/Config.ts`) and one of 3 files; eight edges go from `utils/Config.ts` up into ops (record 0027) |

How thin the wrapper is, over the 339 command files (a further 8 MCP server commands use plain Commander and belong to the interface stack):

| Measure | Result |
| - | - |
| logic indicators (loops, array transforms, switches, string and object processing, not counting the terminal output around them) in the code a command reaches, two call levels deep | 247 thin (72.9%), 59 light (17.4%), 33 substantial (9.7%); between 6.5% and 15.6% substantial when the thresholds move |
| the 33 substantial, read by hand | 9 config-manager, about 10 display or option parsing, about 10 reading and writing directory layouts, about 5 domain logic (promote, where-used search) |
| share of function lines in ops and utils with at most 2 logic indicators | 84.1%; a further 9.4% has 3 to 5 |
| by what the code is, not how complex: commands whose behaviour rests on logic that the library has no counterpart for | config-manager 83 (24.5%), admin 11 (3.2%), promote 1 (0.3%): 95, about 28% of the commands |

So the claim that about 90% of the commands are thin wrappers holds for the logic in each command (90.3% thin or light). It does not hold by what the code is: about 28% of the commands sit on logic that lives only in the CLI, mostly config-manager. Those clusters are the known deviations 0023 to 0028; none is scheduled.

- A reviewer rejects a CLI change that adds API calls, data transformation or configuration logic that another consumer would need, and asks for it to move into the library.
- The interface-specific stacks are the reason the CLI is large; they are not counted as deviations.
