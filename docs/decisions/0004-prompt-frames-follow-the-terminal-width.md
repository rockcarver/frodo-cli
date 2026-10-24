---
status: accepted
date: 2026-10-23
decision-makers: maintainers
applies-to:
  - src/utils/interactive/**
  - src/utils/TextLayout.ts
issues:
  - rockcarver/frodo-cli#882
  - rockcarver/frodo-cli#890
  - rockcarver/frodo-cli#894
  - rockcarver/frodo-cli#902
---

# Prompt frames follow the terminal width

## Context and problem statement

Prompt frames were drawn at a fixed 120 columns. On other terminals they wrapped, broke, or left space unused. Raw log and tenant text with line breaks or tabs, such as a Java stack trace, also broke the frame (frodo-cli#882), and the same defect was reachable in every prompt that drew a box.

## Decision

- Every prompt takes its width from `useTerminalWidth()` (`src/utils/interactive/TerminalWidth.ts`): the terminal's columns, never below 40, and 120 when stdout is not a terminal.
- Frames are drawn only through `renderFramedBox`, `renderNavigationMenu` and `wrapLine` (`src/utils/interactive/NavigationMenu.ts`), never by assembling box characters in a prompt. They split on line breaks, expand tabs, re-wrap rows that do not fit and cut an over-wide title.
- The width is passed to those helpers and to `descriptionPanelLines`; rows are sized with `frameInnerWidth(width)`. ESLint rejects a call that leaves the width out.
- A single-line cell, such as a list column, is flattened and cut with the helpers in `src/utils/TextLayout.ts`. Text helpers live there, never in a prompt file.
- At 120 columns and for output that is not a terminal, the frames stay identical to the old fixed layout.

## Consequences

- Every prompt's tests assert the frame at several widths with hostile text, using the shared helpers in `test/utils/`.
- Wide characters (CJK, emoji) are measured by character count, so their frames can misalign.
- Whether shrinking the window leaves stale rows in a real terminal is a manual check.
