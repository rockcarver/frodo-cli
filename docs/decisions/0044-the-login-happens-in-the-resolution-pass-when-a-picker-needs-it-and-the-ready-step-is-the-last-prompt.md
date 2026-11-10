---
status: accepted
date: 2026-11-10
decision-makers: maintainers
applies-to:
  - src/cli/ResolveInteractiveInputs.ts
  - src/ops/AuthenticateOps.ts
  - src/utils/interactive/**
---

# The login happens in the resolution pass when a picker needs it, and the Ready step is the last prompt

## Context and problem statement

Record 0043 ended the resolution pass in the Ready step and let the pickers that need a login (the realm picker, record 0001, and the entity pickers, record 0038) run after Run, because their loaders read the target system. In use the step sat in the middle of the flow: Run was followed by more prompts, and the command line it showed was not yet the one that ran. A user expects to choose a host, to be logged in as soon as a picker needs it, to answer the pickers, to confirm once and to see no more prompts.

## Decision

- **The pass logs in when a picker needs it, and only then.** A login is made when the realm picker can open (record 0001: prompting is allowed, the command declares a realm, the realm was left at its default, and a connection prompt was shown in this pass) or when an entity pick will open whose loader needs tokens (record 0038). With neither, the pass makes no login and the command logs in after the Ready step, as before. A command that never logs in never does so in the pass.
- **The order of the pass:** persisted defaults; the connection page; the login, if a picker needs it; the realm picker; the mandatory options and the option groups; the entity pickers; the secrets; the invocation editor; the Ready step. After Run nothing in the pass prompts. The prompts that remain belong to the command, such as the confirmation of record 0037.
- **The login is the command's login:** the same machinery as `getTokens` (second factor, browser or device login, service account, saved credentials, the credential option, the force-login-as-user override), with the default arguments and the deployment types the command registers. A tenant of another type is refused with the library's own error, after the login and before any picker. A failed login or a refused type ends the command with the error and its hint and the exit code of a failed login, 1; there is no Ready step and no retry in the pass.
- **One login, and each picker once.** The first `getTokens()` call of the command uses the login of the pass when it asks for the same `forceLoginAsUser` and `autoRefresh`, and still enforces its own list of deployment types with the library's error. Other arguments, and later calls, log in as usual. The realm picker and each entity pick run once: the wrapper and the action skip those the pass ran. A declined or failed pick ends the command with exit code 1, as after Run.
- **The Ready step stays as record 0043 decided:** asked only when the pass put a prompt on the screen, the rows Run, Edit options and Cancel, Escape cancels, nothing is printed and the exit code is 0, and the Enter label comes from `enterLabel`. It says nothing about input chosen later, because none is. Cancelling after the pass logged in runs nothing and prints nothing.
- **Enter says `next`** on the realm picker and the entity pickers when they run in the pass. One that runs outside a pass, from the `getTokens` wrapper of a command whose pass made no login, keeps `select`.
- **Edit options returns to the Ready step.** The login and the pickers are kept unless the host, the credentials or an option of the Authentication or Connection groups changed. Then they are dropped, the pickers log in and ask again, and the values already chosen stay.
- A complete command line, a script, `--no-prompt`, `FRODO_NO_PROMPT` and a run without a terminal never log in in the pass (records 0014 and 0030).

## Consequences

- A login can fail, or ask for a second factor or a browser, in the middle of the prompts instead of after the last one. The failure is reported where it happens.
- The list the pass logs in with is the one the command registers, which `handleDefaultArgsAndOpts` enforces too. A command whose action passes a wider list to `getTokens()` than it registers would be refused by the pass first, so a new command registers the list it passes.
- Terminal tests of the interactive flows answer the Ready step last, and a test that proves the order must fail with the step before the pickers. `docs/INTERACTIVE-COMMANDS.md` ("The resolution pass", "Pickers that need a login", "Key language") describes the order and the labels.
- This supersedes record 0043, whose Ready step it restates. It refines records 0001, 0015 and 0038 without superseding them: where they say the realm and entity pickers run after login from the `getTokens` wrapper, they now run in the pass, right after the login the pass makes.
- Not decided: the realm as a row of the connection page, and a Change host row on the Ready step.

## Alternatives considered

- Keep the Ready step before the pickers (record 0043): the step confirms a command that is still incomplete and is followed by more prompts.
- Log in as soon as a host is chosen, whatever the command needs: a command line that needs no picker would log in before its user confirmed it, and a failed login would end a session that needed none.
- Ask the pickers after Run but show their rows on the Ready step: the step cannot list what a login will offer.
