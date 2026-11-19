---
status: accepted
date: 2026-11-10
decision-makers: maintainers
applies-to:
  - src/cli/ResolveInteractiveInputs.ts
  - src/utils/interactive/**
---

# The interactive prompting framework never changes a complete command line, and is invisible when it is off

## Context and problem statement

On 2026-10-24 and 2026-10-28, records 0030 and 0034 tied the rule for prompts to what 4.x accepted. At that time 4.x had no prompts and 5.x has, so the version looked like the line between a command line that must not prompt and one that may. That was an accident of history: the line is whether the command line is complete. Read that way, both records were quoted as a promise that command lines keep working from one major version to the next. That was never their purpose, and a rule about prompts cannot give it. This record keeps what is true of prompting, drops the version as the yardstick, and leaves what a release may change to record 0048.

## Decision

- **Scope.** This record governs the interactive prompting framework (records 0014 and 0015) and nothing else. It says nothing about whether a command, an option or an output may change between releases: record 0048 does. A confirmation that guards a destructive action (record 0037) asks for consent, not for missing input, and is outside it.
- **A complete command line never prompts.** A command line that is complete under the command's current declaration (every mandatory input given, no invalid combination) opens no prompt, unless the user asks for one with `--prompt` or guided mode (record 0014).
- **An incomplete or invalid command line may prompt for exactly what is missing.** That is the purpose of the framework. A prompt never fills in what the command line already says.
- **With prompting off the framework adds nothing.** With no terminal, with `--no-prompt` or `FRODO_NO_PROMPT`, in a script or in a piped run, output, errors and exit codes are those of the command without the framework (record 0014 says when the framework may act).
- **The realm is never counted as missing,** because it has a default. Record 0001 is an instance of this rule.
- **A command line that names a credential source is complete** and does not open the Connection page: a service account id and its key file, the Amster key file, `--browser` or `--device`, `FRODO_USERNAME` and `FRODO_PASSWORD`, or a saved profile for the host (record 0031).
- **Which incomplete command lines get a prompt** stays a choice per command and per resolution step (record 0015).

## Consequences

- A test for a new prompt names the incomplete command line it fills. A test for a case that must not prompt names the complete one.
- A reference to record 0030 in another record, in a comment or in a test reads as a reference to these rules. A reference to record 0034 reads as a reference to the rule on defects in record 0048.
- Record 0032 (mutually exclusive options) and record 0037 keep their own rules. The exceptions they state to the first rule of record 0030 need no successor, because this record says nothing about what a release may change.
- A change to a command between releases is governed by record 0048. Reviewers and gates do not cite this record for it.
- `docs/INTERACTIVE-COMMANDS.md` states the same rules.

## Alternatives considered

- Keep record 0030 and add a note that narrows it: accepted records are not edited, and the note would leave the version wording in place.
- Narrow only how the gates quote the old records: the records themselves would still mislead.
- Prompt for every optional input that is unset: rejected, it would prompt on command lines that are complete.
