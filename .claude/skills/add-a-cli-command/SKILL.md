---
name: add-a-cli-command
description: Use when adding a new frodo-cli command, command group or verb (for example `frodo widget list`). Covers checking that frodo-lib already has the capability, copying the template, registering the command, keeping the command and its ops function thin, usage examples that run as written and open no prompt, the `-h` snapshot and e2e tests, MIGRATION.md, and the checks to run before a pull request.
---

# Add a CLI command

The rules live in other files; this skill is the order to do things in. Read them as you go, and do not restate them in your pull request.

- [.github/instructions/cli-commands.instructions.md](../../../.github/instructions/cli-commands.instructions.md) and "Writing a command" in [docs/CONTRIBUTE.md](../../../docs/CONTRIBUTE.md)
- cli records [0007](../../../docs/decisions/0007-layers-and-the-thin-wrapper-in-the-cli.md) (layers), [0008](../../../docs/decisions/0008-every-command-is-a-thin-frodocommand-file-with-the-usual-verbs.md) (a command is a thin `FrodoCommand` file), [0009](../../../docs/decisions/0009-ops-functions-are-named-after-the-command-verb.md) (ops names), [0010](../../../docs/decisions/0010-output-goes-through-console-and-colours-through-colortheme.md) (output), [0016](../../../docs/decisions/0016-option-requirements-are-declared-not-coded.md) (option requirements), [0002](../../../docs/decisions/0002-usage-examples-run-as-written-and-open-no-prompt.md) and [0006](../../../docs/decisions/0006-every-new-command-ships-usage-examples.md) (usage examples)
- umbrella 0001, [the library is the brain, the CLI is a thin wrapper](https://github.com/rockcarver/frodo/blob/main/docs/decisions/0001-library-is-the-brain-cli-is-a-thin-wrapper.md), and umbrella 0007, [the public API is only the frodo facade](https://github.com/rockcarver/frodo/blob/main/docs/decisions/0007-public-api-only-through-the-frodo-facade.md)

## 1. Check the library has what the command needs

A command wraps a method of the `frodo` facade. Look for it in the `@rockcarver/frodo-lib` version pinned in `package.json`: search the installed typings (`node_modules/@rockcarver/frodo-lib/types/lib/`), or the lib source, where facade methods are registered in the library's `FrodoLib.ts` (link your own lib clone as described in the `build-the-cli` skill).

- **It exists:** go on.
- **It does not:** stop. New capability is built in frodo-lib first, released, then wrapped here (umbrella 0001). Say so in the issue or pull request. Do not reimplement the logic in `src/ops/`, and do not import anything from the library except `frodo`, `state`, `FrodoError` and types (ESLint rejects it).

## 2. Copy the template

`src/cli/_template/` holds a group file (`something.ts`) and one file per verb. Copy what you need and rename it; a group is one folder, one file per verb, named `<group>-<verb>.ts`.

```console
mkdir src/cli/widget
cp src/cli/_template/something.ts src/cli/widget/widget.ts
cp src/cli/_template/something-list.ts src/cli/widget/widget-list.ts
```

Then edit: the group's `FrodoStubCommand('widget')` and description, the imports of the verbs you kept, and in each verb `new FrodoCommand('frodo widget list')`. Delete the `something-else*` and `something-other*` files unless you need a nested sub-group. A verb that only works on some deployment types lists them as the third constructor argument, as the template does.

Use the usual verbs (`list`, `describe`, `export`, `import`, `delete`) and copy the options of a neighbouring command instead of inventing spellings (`-i, --<thing>-id`, `-f, --file`, `-a, --all`, `-A, --all-separate`, `-N, --no-metadata`). `src/cli/journey/` is a complete example.

## 3. Keep the command file thin

A verb file exports `setup()` as its default. Its action does four things, in this order: `command.handleDefaultArgsAndOpts(host, realm, user, password, options, command)`, `await getTokens()`, one call to an ops function, and `process.exitCode = 1` when login or the operation fails. Read `src/cli/journey/journey-list.ts` for the shape. Print through `printMessage`, `verboseMessage` and `printError` from `src/utils/Console.ts`, colours from `src/utils/ColorTheme.ts`, never `console.log` (cli record 0010).

Declare what the command needs instead of coding it (cli record 0016): `requireOneOf({ options, purpose })` for "at least one of" and `requireAllOf(...)` for "all together". A new command needs no "unrecognized combination" branch, and a command file contains no prompt code: interactivity attaches to the command by itself (cli record 0014).

## 4. Write the ops function

Put it in `src/ops/<Thing>Ops.ts`. It adapts the library for the terminal: map arguments, call the `frodo` facade, format the output, handle files and stdin, return `true` on success and `false` after printing the error (see `listJourneys` in `src/ops/JourneyOps.ts`). Business logic does not belong here.

- **Naming (cli record 0009):** an ops function that implements a command is named after the command's verb (`listJourneys`, `describeJourney`, `exportJourneyToFile`, `deleteJourney`). Any other ops function follows CRUDQ (`createX`, `readX`, `updateX`, `deleteX`, `queryX`; `getX`/`setX` for one property; `enableX`/`disableX` for status, see CONTRIBUTE.md, "Code conventions") or has a meaningful name.
- **Do not copy the config-manager commands as a model.** Their separate `src/configManagerOps/` layer is deprecated and not extended (cli record 0023): new behaviour goes library first and is wrapped in `src/ops/`.
- An ops module does not prompt and does not import from `src/utils/interactive/`. If the command needs a prompt of its own, read "Layering: where interactive code lives" in [docs/INTERACTIVE-COMMANDS.md](../../../docs/INTERACTIVE-COMMANDS.md) first (cli record [0005](../../../docs/decisions/0005-interactive-layering.md)).
- Read standard input only through `src/utils/StdinSync.ts` (cli record [0003](../../../docs/decisions/0003-synchronous-stdin-reads-go-through-one-helper.md)).
- Do not add a package to `dependencies`: shipped code's packages go in `devDependencies`.

## 5. Register it

Add `program.addCommand(ListCmd().name('list'))` (with `import ListCmd from './widget-list.js';`) to the group file. A new group is imported and added in `src/app.ts` (`program.addCommand(widget())`, next to the others; `.helpGroup(...)` only for the "Utilities" or "Continuous integration" headings).

```console
npx tsdown
node dist/launch.cjs widget list -h
```

## 6. Add usage examples

Every command has a `Usage Examples:` block, shown by `-hhh`; the shape is in the instruction file above. Values come from `src/help/SampleData.ts`.

**Do not keep the template's example text.** It says `frodo something ...` and leaves out the realm, and the check in `test/unit/UsageExampleOperands.test.js` fails it (renaming only the constructor gives `unknown-command` findings). Per cli record 0002 an example runs as written and opens no picker or editor:

- With a user name the realm comes second: `<amBaseUrl> <realm> <username> '<password>'`. Otherwise the user name is read as the realm and the password as the user name.
- Name the target (`-i`, `-a`, ...) of a command that picks an entity, and one member of every one-of option group.
- Only flags the command defines; close every quote.

Then run the examples. Run each against a build, with the fake tenant `test/utils/FakeAm.mjs` if you have no tenant (see the `review-a-copilot-pr` skill for a recipe), and check that none waits for input.

Never add an entry to `test/unit/UsageExamplesLegacyExceptions.js` or `test/unit/UsageExampleOperandsLegacyExceptions.js`. Those lists only shrink.

## 7. Add tests

- **`-h` snapshot:** copy `test/client_cli/en/journey-list.test.js` to `test/client_cli/en/<group>-<verb>.test.js`, change the command, run it. The first run writes `test/client_cli/en/__snapshots__/<group>-<verb>.test.js.snap`; read it before you commit it.
- **Unit test** for ops logic that needs no tenant, in `test/unit/`.
- **e2e test** `test/e2e/<group>-<verb>.e2e.test.js` for a command that talks to a tenant. It needs recordings, which only a maintainer with tenant access can make. If you cannot record, leave the e2e test out and say in the pull request that recordings are missing. How to write and record one: the `create-test-recordings` skill and [test/e2e/README.md](../../../test/e2e/README.md).

## 8. Run the checks

```console
npm run check                  # ESLint + Prettier on src/**/*.ts (npm run fix writes)
npx tsc --noEmit
npx tsdown                     # rebuild dist/: the test scripts do not
npm run test:only -- test/unit/UsageExample test/client_cli/en/<group>-<verb>
npm test                       # the whole suite, before you open the pull request
```

Run `npx tsdown` again after every change to `src/`, or client_cli, e2e and PTY tests run the old code. Do not run Prettier over `test/e2e/`.

## 9. Pull request

- A removed or renamed command, alias or option goes into [MIGRATION.md](../../../MIGRATION.md).
- Do not edit `CHANGELOG.md`; it is generated from merged pull requests, so write a clear title and description.
- Never update a snapshot to turn a run green. A changed snapshot is an expected output change or a regression; say which.

## Stop and ask when

- the facade lacks the method (step 1);
- your change conflicts with an accepted record in `docs/decisions/`;
- the command needs a package that cannot be bundled, or a library change that is not released yet.
