---
status: proposed
date: 2026-10-29
decision-makers: maintainers
applies-to:
  - src/utils/interactive/**
  - test/unit/PromptsAreFramed.test.js
---

# Every prompt is drawn as the framed prompt

## Context and problem statement

Record 0018 gives every prompt a permanent Navigate box and one key language, and record 0019 puts the command being authored under it. That describes the frame, but nothing made a new prompt use it. The free-text prompt that asks for a missing option value was built outside the shared frame helpers and drew one bare line between two framed pickers: on 2026-10-29 a missing issuer was asked for that way, after the host picker and before the realm picker, and the break in the sequence read as a bug. A rule that only a record states is forgotten by the next author or agent; it holds when a test states it too. "Prompt" here means a step in authoring a command: asking for a missing value, choosing an entity, editing options.

## Decision

- Every prompt that authors a command is drawn as one frame of three parts: the Navigate menu on top, the question in a box, and the command footer underneath. This holds for lists, free text, hidden text and pages alike.
- Free text is the shared text prompt, which draws the frame. Its caller passes the footer: the command with the typed text shadowed in when the text is the value of an option or a positional argument, the command as it stands otherwise. The text of a hidden prompt never reaches a footer.
- What a prompt needs to say beyond its question goes inside its box, as a hint. A note about the prompt (no match, too many matches) stays in its frame and is not printed as a line between frames.
- A new prompt component draws through the shared frame helpers (menu, box, terminal width), takes a footer option, and has a render test at several widths. Such a prompt does not use a packaged prompt component and does not ask its question with a plain printed line.
- A live dashboard of a running command has no command to show and needs no footer, but keeps the menu, the box and the width. It is named in `test/unit/PromptsAreFramed.test.js`, and the list only shrinks.
- A yes or no confirmation is not covered. It is asked once the command is complete, as a consent check before something is deleted or applied, so there is nothing left to author and a footer would repeat the command that is already running. How confirmations are drawn, and whether they follow `--prompt` and `--yes`, is not decided here.

## Consequences

- `test/unit/PromptsAreFramed.test.js` scans the source for prompt components and for packaged prompts. A component without all three parts fails the build, and so does an exemption whose file now complies.
- The existing confirmations are listed in the test as an inventory. A new use of a packaged prompt fails until a maintainer decides how confirmations are drawn; the list does not grow.
- The interactive guide ("Every prompt is framed") and the interactive layering instructions tell authors and agents how; they are kept in step with this record.
- This record does not change the keys (0018) or what a footer shows (0019).

## Alternatives considered

- A note in the guide only. Rejected: the unframed prompt existed while the guide and record 0018 already described the frame.
- Frame the confirmations too. Rejected: they are consent checks after the command is complete, not steps in authoring it, and the footer has nothing to show.
- A lint rule on the prompt library import. Rejected for now: the test also checks what a component draws, which a lint rule cannot see.
