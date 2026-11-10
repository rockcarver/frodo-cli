---
status: accepted
date: 2026-11-10
decision-makers: maintainers
applies-to:
  - src/cli/ResolveInteractiveInputs.ts
  - src/ops/AuthenticateOps.ts
  - src/utils/interactive/**
issues:
  - rockcarver/frodo-cli#1207
---

# The realm is a row of the connection page

## Context and problem statement

Record 0001 lets the realm picker open only where a connection prompt was shown, and record 0044 runs it in the resolution pass after a login. Read together they gave a host prompt, a login nobody saw, and a realm prompt on another screen, and other prompts could sit between them. The realm belongs with the host and the credentials, and a login can happen as soon as those are settled.

## Decision

- **The realm is a row of the connection page.** Where a realm picker may open (record 0001: prompting is allowed, the command declares a realm, the realm was left at its default, and a connection prompt is on screen, which the page is) Done logs in, and when the system then has more than one realm the page shows a Realm row. It shows the deployment's default with the note `default` until the user chooses. Enter on it opens the realms in a box under the page; Enter picks, Escape keeps what the row had. The page stays open until Done is pressed again. The standalone realm prompt is not shown in the pass when the page carries the row.
- **Done logs in, and the page says so.** Done on a complete page that may be followed by a realm picker starts the login on the page: the frame says `Logging in...`, then `Connected as <who>`. Anything the login asks for or prints (a second factor, a browser address) appears as before and takes the frame away; the page opens again with the outcome. Enter on Done says `connect` while a login is still to be made, `next` after it.
- **Nothing to choose, nothing to press.** With one realm, or realms that cannot be read, the page concludes as soon as the login succeeded. The default is kept (record 0001).
- **A failed login ends the command.** The page shows the failure in its frame; Enter or Escape closes it, the error and its hint are printed, the exit code is 1. There is no retry loop.
- **Editing the connection drops the session.** A change to the host or a credential after a login removes the login and the realm choice; the next Done logs in again. Escape on the page cancels the command, with exit code 0, also after a login.
- **A saved connection that needs no page** logs in as record 0044 says. If the system has several realms the page is shown then, with the resolved host and the Realm row, so the host and the realm are on one screen. With one realm no screen appears.
- **Unchanged:** a complete command line, a realm named by argument or `FRODO_REALM`, a script and `--no-prompt` show no page and make no login in the pass. A command that no realm picker can follow does not log in on the page. The picked realm lands where the picker put it: the realm positional, the library state, the command preview and the authoring print.

## Consequences

- This refines records 0001 and 0044 without superseding them: the conditions of 0001 and the login of 0044 are the same, and the realm is asked on the page. The Ready step stays the last prompt.
- `ConnectionPagePrompt.ts` carries the row and the status line; `ConnectionPageState.ts` holds the decisions, `TransientFrame.ts` the frame drawn while the login runs. `docs/INTERACTIVE-COMMANDS.md` describes the page and the pickers that need a login.
- Terminal tests of a flow that chooses a realm answer the page, not a realm prompt.
- Not decided: whether the page logs in for every command, not only for those a realm picker can follow.

## Alternatives considered

- Show the Realm row from the start, inactive until the login: a system with one realm would show a row that then disappears.
- Open the realm picker as a prompt over the page: two screens again, and the row would not show the choice.
- Log in on Done for every command: commands that log in themselves (with other arguments or a browser) would log in twice.
