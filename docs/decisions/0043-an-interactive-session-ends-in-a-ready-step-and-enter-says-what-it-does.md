---
status: superseded by 0044
date: 2026-11-10
decision-makers: maintainers
applies-to:
  - src/cli/ResolveInteractiveInputs.ts
  - src/utils/interactive/**
---

# An interactive session ends in a Ready step, and Enter says what it does

## Context and problem statement

The resolution pass (record 0015) fills what a command line lacks and then lets the command run. The last prompt of the pass therefore ran the command: on the host picker of a command that needed nothing else, Enter chose the host and started the command. Every prompt labelled Enter `select`, whether or not Enter would run anything, so a user could not tell a step in a flow from the end of it. This was found when `frodo journey validate` ran at once after the host was chosen. Record 0030 says the interactive mode never prompts for what a complete command line already says. It does not say how an interactive session ends.

## Decision

- When the resolution pass has put at least one prompt on the screen, it ends with the Ready step: the command as it will run (the usual footer) and the rows Run (the default), Edit options and Cancel. Edit options opens the invocation editor and returns to the step; it is left out when there is nothing to edit.
- Escape on the Ready step cancels. Cancel and Escape run nothing, print nothing and end the session quietly through the exit-all signal, with exit code 0.
- A pass that rendered no prompt never asks it. A complete command line, a script, `--no-prompt`, `FRODO_NO_PROMPT` and a run without a terminal behave as without interactive mode (records 0014 and 0030). A prompt that came before the pass, such as the sub-command picker of a container, does not count; the editor opened by `--prompt` does.
- The Navigate menu says what Enter does to the command, and never more. Every picker of the resolution pass says `next`, because at least the Ready step follows. Only the Ready step's Run row says `run`. A prompt of typed text, the Connection page and the invocation editor name what Enter does to their own input (`commit`, `edit / done`); none of them runs the command. Prompts where nothing can be promised keep `select`: the container pickers, and the pickers that open after login.
- Pickers that need a login (the realm picker, record 0001, and the entity pickers, record 0038) run after Run, because their loaders need tokens. The Ready step does not guess what a login will offer.
- The label is part of the prompt's configuration (`enterLabel`). A new picker in the pass gets `next` from the pass's picker helper and declares nothing.

## Consequences

- An interactive run takes one more Enter. A user who wants none uses the complete command line, which is also what the footer shows.
- The terminal tests of the interactive flows answer the Ready step. A test that proves the step must fail without it, and one that proves the label must fail on the wrong word.
- `docs/INTERACTIVE-COMMANDS.md` ("The resolution pass", "Key language") describes the step and the labels.
- This refines record 0030 and record 0015 without superseding them: the step is a prompt after the prompts, never one for a complete command line.
- Not decided: a Change host row, and a step after the pickers that open after login.

## Alternatives considered

- A run key in the Navigate menu with no extra screen: it leaves no place to edit options or to cancel, and the ambiguity of Enter remains.
- Keeping Enter as it was and only relabelling it: the label would have to guess whether more prompts follow, and it cannot know.
- Putting the Ready step after the pickers that need a login: the step would open after a login the user may want to avoid.
