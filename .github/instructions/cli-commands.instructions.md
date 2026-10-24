---
applyTo: 'src/cli/**/*.ts'
---

# Writing or changing a CLI command

**New capability goes into frodo-lib behind the `frodo` facade first; the CLI only wraps it for the terminal** (parsing, prompts, output, files and stdin, exit codes). Decision: [0001 The library is the brain, the CLI is a thin wrapper](https://github.com/rockcarver/frodo/blob/main/docs/decisions/0001-library-is-the-brain-cli-is-a-thin-wrapper.md).

The full guide is [docs/CONTRIBUTE.md, "Writing a command"](../../docs/CONTRIBUTE.md#writing-a-command).

- **Start from `src/cli/_template/`.** Copy `something.ts` (the group) and the verb files you need, rename them and delete the rest.
- **Register the command.** In the group file add `program.addCommand(XxxCmd().name('xxx'))` (see `src/cli/journey/journey.ts`). A new group is imported and added in `src/app.ts`.
- **One kind of artifact is one group with the usual verbs:** `list`, `describe`, `export`, `import`, `delete`. Export commands almost all share their options: `-i, --<thing>-id`, `-f, --file`, `-a, --all`, `-A, --all-separate`, `-N, --no-metadata`. Copy a neighbour, do not invent new spellings.
- **A command is a `FrodoCommand('frodo <group> <verb>')`.** Its action starts with `command.handleDefaultArgsAndOpts(...)`, logs in with `getTokens()` and sets `process.exitCode = 1` when the operation fails.
- **The work lives in `src/ops/<Thing>Ops.ts`.** The command file parses options and reports the outcome.
- **Print through `printMessage`, `verboseMessage` and `printError` from `src/utils/Console.ts`,** not `console.log`.
- **Name functions with CRUDQ verbs** (`createX`, `readX`, `updateX`, `deleteX`, `queryX`; `getX`/`setX` for one property; `enableX`/`disableX` for status). See CONTRIBUTE.md.

## Usage examples: required, correct, and no prompts

Every command has a `Usage Examples:` block, shown by `-hhh`. Model it on `src/cli/info/info.ts` and `src/cli/conn/conn-save.ts`:

```ts
.addHelpText('after', `Usage Examples:\n` +
  `  List the journeys of a realm and log in with AM base URL, username, and password:\n` +
  c.command(`  $ frodo journey list ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`) +
  `  List them with all fields using a connection profile:\n` +
  c.command(`  $ frodo journey list --long ${s.connId}\n`))
```

- One sentence, then the command. One example per mode or option that matters, with a login variant. Values come from `src/help/SampleData.ts`. Run every example against a build (`npx tsdown`) before you finish.
- **An example runs as written and opens no picker or editor.** Operands are positional: with a user name the realm comes second (`<amBaseUrl> <realm> <username> '<password>'`), otherwise the user name is read as the realm and the password as the user name. Name the target (`-i`, `-a`, ...) of a command that picks an entity and one member of every `requireOneOf` group, use only flags the command defines, and close every quote.
- **Interactive by design is the one exception:** `frodo journey prune` asks to confirm with `@inquirer/confirm` directly, so no flag and no `--no-prompt` skips it; the sentence above its example says so.
- `test/unit/UsageExamples.test.js` fails for a command without examples; `test/unit/UsageExampleOperands.test.js` fails for an example that breaks the rules above. Never add to `UsageExamplesLegacyExceptions.js` or `UsageExampleOperandsLegacyExceptions.js`: they only shrink, so delete a line when you fix its entry.

Decisions behind these rules: [0002 examples run as written and open no prompt](../../docs/decisions/0002-usage-examples-run-as-written-and-open-no-prompt.md), [0006 every new command ships usage examples](../../docs/decisions/0006-every-new-command-ships-usage-examples.md).

## Tests for a new command

Add `test/client_cli/en/<group>-<verb>.test.js` (the `-h` snapshot) and, for a command that talks to a tenant, `test/e2e/<group>-<verb>.e2e.test.js`. See [tests.instructions.md](tests.instructions.md).
