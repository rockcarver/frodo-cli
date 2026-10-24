---
status: accepted
date: 2026-10-24
decision-makers: maintainers
applies-to:
  - src/**/*.ts
---

# The CLI prints through Console.ts and takes colours from ColorTheme.ts

## Context and problem statement

Terminal output, progress and colour are the CLI's own concerns (0007; the library keeps only an output seam). A command that prints with `console.log` or picks a colour by hand escapes the output handlers, the verbose and debug switches and the user's colour theme. The rules are in `docs/CONTRIBUTE.md` ("Writing a command", step 3), `.github/instructions/cli-commands.instructions.md` and `AGENTS.md`. Recorded retroactively and measured on `main` (02a74335, 2026-10-24).

## Decision

- Output goes through `src/utils/Console.ts` (`printMessage`, `verboseMessage`, `debugMessage`, `printError`, the progress and table helpers), not through `console.log`.
- Colours come from `src/utils/ColorTheme.ts`, which layers the CLI's own intents (`heading`, `positive`, `negative`, `muted`, `debug`) on the library's base set. It is the only file allowed to import `tinyrainbow`; ESLint enforces that.
- The CLI installs these functions as the library's print, error, debug, verbose, curlirize and progress handlers (`app.ts`, `FrodoCommand.ts`), so output from the library follows the same rules.
- The user's theme (`frodo settings theme`, `FRODO_COLOR_THEME`) and the terminal's colour support are respected in one place.

## Consequences

Measured:

| Rule | Result |
| - | - |
| files that import `Console.ts` | 318 |
| files that import `ColorTheme.ts` | 110 |
| `tinyrainbow` imported outside `ColorTheme.ts` | none |
| `console.*` in non-test source | 69 calls in 3 files: `ops/ShellHelpOps.ts` (38) and `cli/shell/shell.ts` (21), both the interactive shell, and `utils/Console.ts` (10), the seam itself |

- The shell prints directly because it renders into its own screen; that is part of its interface-specific stack (0007), not a deviation.
- The CLI's `ColorTheme.ts` currently builds on the library's theme (`frodo.utils.terminal`). When the library's terminal code moves to the CLI (frodo-lib record 0011), this file absorbs it.
