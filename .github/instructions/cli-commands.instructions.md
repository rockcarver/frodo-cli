---
applyTo: 'src/cli/**/*.ts'
---

# Writing or changing a CLI command

The full guide is [docs/CONTRIBUTE.md, "Writing a command"](../../docs/CONTRIBUTE.md#writing-a-command).

- **Start from `src/cli/_template/`.** Copy `something.ts` (the group) and the verb files you need, rename them and delete the rest.
- **Register the command.** In the group file add `program.addCommand(XxxCmd().name('xxx'))` (see `src/cli/journey/journey.ts`). A new group is imported and added in `src/app.ts`.
- **One kind of artifact is one group with the usual verbs:** `list`, `describe`, `export`, `import`, `delete`. Export commands almost all share their options: `-i, --<thing>-id`, `-f, --file`, `-a, --all`, `-A, --all-separate`, `-N, --no-metadata`. Copy a neighbour, do not invent new spellings.
- **A command is a `FrodoCommand('frodo <group> <verb>')`.** Its action starts with `command.handleDefaultArgsAndOpts(...)`, logs in with `getTokens()` and sets `process.exitCode = 1` when the operation fails.
- **The work lives in `src/ops/<Thing>Ops.ts`.** The command file parses options and reports the outcome.
- **Print through `printMessage`, `verboseMessage` and `printError` from `src/utils/Console.ts`,** not `console.log`.
- **Name functions with CRUDQ verbs** (`createX`, `readX`, `updateX`, `deleteX`, `queryX`; `getX`/`setX` for one property; `enableX`/`disableX` for status). See CONTRIBUTE.md.

## Usage examples are required

Every command has a `Usage Examples:` block, shown by `-hhh`. Model it on `src/cli/info/info.ts` and `src/cli/conn/conn-save.ts`:

```ts
.addHelpText(
  'after',
  `Usage Examples:\n` +
    `  List every scripting context:\n` +
    c.command(`  $ frodo script type list ${s.amBaseUrl}\n`) +
    `  List them with all fields:\n` +
    c.command(`  $ frodo script type list --long ${s.connId}\n`)
)
```

- One sentence on what the example does, then the command. One example per mode or option that matters, with a login variant (credentials, connection profile).
- Values come from `src/help/SampleData.ts` (`import * as s from '../../help/SampleData'`). Add a constant there if you need one.
- Run every example against a build (`npx tsdown`) before you finish. File-based modes can run against fixtures in `test/e2e/exports`.
- `test/unit/UsageExamples.test.js` fails for a command without examples. Never add a command to `test/unit/UsageExamplesLegacyExceptions.js`; that list only shrinks. When you add examples to a command on it, delete its line.

## Tests for a new command

Add `test/client_cli/en/<group>-<verb>.test.js` (the `-h` snapshot) and, for a command that talks to a tenant, `test/e2e/<group>-<verb>.e2e.test.js`. See [tests.instructions.md](tests.instructions.md).
