---
status: accepted
date: 2026-10-13
decision-makers: maintainers
applies-to:
  - src/utils/interactive/**
---

# Every interactive surface speaks one key language

## Context and problem statement

A user who learns the keys of one picker should not have to relearn them in the next. The menus also had to stay distinguishable from command output. The design is in `docs/INTERACTIVE-COMMANDS.md` ("Panel per surface", "Key language"); the frame width and integrity rules are record 0004. Recorded retroactively (decided 2026-10-12 to 2026-10-14) and checked against the code on `main` (02a74335).

## Decision

- A permanent Navigate box sits at the top of every prompt, in the same slot. When another surface becomes active (the inline value editor), the box swaps its hints; the layout never jumps and the keys never lie. Only keys that apply are shown, in their role's theme colour.
- Keys: up and down move, clamp at the first and last row (no endless loop), and type-to-filter narrows the list. `[ENTER]` concludes or advances. `[space]` is for multi-select only; marking an option that needs a value opens its value box, and the option joins the selection only when a value is committed. Left and right move between editor segments only where a counted hint is shown and only when the filter is empty. `[ESC]` backs out one level; with an active filter the first press clears the query.
- Uncommitted selections block back-navigation: the panel shows the count and the way out ("N options not committed: [ESC] resets, [ENTER] commits"); `[ESC]` then resets them and backs out.
- Pressing `[ESC]` twice within 400 ms exits everything: the first press opens a grace window with a hint, a second press throws the exit-all signal that every intermediate catch must rethrow until `app.ts` ends the session cleanly. A single `[ESC]` at the root picker still prints help and exits. Readline's escape-sequence timeout is lowered to 50 ms at startup, because the default 500 ms makes a fast double press physically impossible.
- The invocation editor groups options like `-h` and `-hh` do (the command's own options flat on top; each shared help group as a collapsible section; a group with a user-set option starts expanded; typing a filter flattens the list). The cursor carries a glyph, not only a colour.
- Every prompt erases its frame when it concludes. The only trace of an interactive session is the final command line (record 0019) and the action's own output.
- Never nest a second inquirer prompt inside a keypress handler: two readlines on one input freeze the screen. Values are edited inline.

## Consequences

- Measured: the exit-all signal is a symbol (`EXIT_ALL_SIGNAL`, `ExitAll.ts`) and the escape timeout is patched in `EscapeSequenceTimeout.ts`; PTY tests cover the double press and the erase on conclude (`exit-all.pty.test.js`, `prompt-erase.pty.test.js`).
- A new prompt reuses the shared components; it does not invent keys. A catch-all handler between a throw site and `app.ts` rethrows the exit-all signal before reporting an error.
