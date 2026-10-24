# Contribute to Frodo CLI (frodo-cli)

Any direct commits to the repository are not allowed. Pull requests (PR) are most welcome. Please fork this repo and develop and test in that fork. Once you feel ready, please create a PR. For any major changes, please open an [issue](https://github.com/rockcarver/frodo-cli/issues) first to discuss what and why you'd like to change.

## Developing

### Forking this repo

Please refer to these couple of excellent resources for getting started with forking the repo and contributing to github open source projects in general. These are great reads not only for someone new to this, even regular github contributors may find some great tidbits of information.

- [https://github.com/firstcontributions/first-contributions](https://github.com/firstcontributions/first-contributions)
  Also take a look at [Additional material](https://github.com/firstcontributions/first-contributions/blob/master/additional-material/git_workflow_scenarios/additional-material.md) towards the end, as there are some good tips on that page.

OR

- [https://www.dataschool.io/how-to-contribute-on-github/](https://www.dataschool.io/how-to-contribute-on-github/)

### Prerequisites

- Node.js 26 or later. Developing this CLI requires Node.js 26: the full
  build (`npm run build`) produces the platform binary, which needs Node 26
  for the SEA packaging step (`--build-sea`), and `package.json` declares
  `engines.node >= 26`.
- npm (included with Node.js)
- A GUI editor is highly recommended. The current developers use [VSCode](https://code.visualstudio.com/), but you are welcome to others, like [Atom](https://atom.io/) or [Sublime](https://www.sublimetext.com/) too. The repository contains configuration files for VSCode's [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) and [prettier](https://prettier.io/) add-ons, which will automatically lint the code and apply coding styles when using VSCode. The same files may work for other editors with similar add-ons, but this has not been tested.

### Clone the repo and install dependencies

```console
git clone https://github.com/rockcarver/frodo-cli.git
cd frodo-cli
npm ci
```

### Build and install

For how the build toolchain works — what each tool does and why, bundler
configuration details, binary packaging and signing — see
[BUILD-ENV.md](BUILD-ENV.md).

> **Adding a package? Read this first.** This CLI ships as a
> zero-dependency package: package.json's `dependencies` field stays
> empty on purpose, and every package imported by shipped code —
> including runtime prompt/library code — goes in **`devDependencies`**.
> The bundler (tsdown; tsup had the same default) inlines
> devDependencies into the bundle and externalizes anything listed under
> `dependencies` — which breaks the SEA binary at runtime (no
> `node_modules` inside the binary) and reopens the npm audit surface we
> deliberately keep empty. Details and the verification one-liner:
> [BUILD-ENV.md §2.2.1](BUILD-ENV.md).

#### Full build (npm bundle + platform binary)

The following command builds the CLI and creates a native SEA binary for
your platform (requires Node.js 26; on macOS the binary is automatically
signed with an ad-hoc certificate so it runs immediately):

```console
npm run build
```

#### Build only, don't create platform binary

The following command builds the CLI but does not create a binary. It is
faster (and helpful when you only need the npm/Docker build — but it still
expects Node.js 26, per `engines`):

```console
npm run build:only
```

### Develop

#### Frodo CLI-only Development

To automatically build as you develop, use:

```console
npm run dev
```

#### Frodo Library & CLI Development

If you are adding new capabilities to the CLI, chance are you will also need to extend the library. In that case, you will want to link your local develipment version of the library to your development version of the CLI. The Frodo team assumes that you will have cloned both projects into the same parent folder, thus `frodo-lib` and `frodo-cli` folders being siblings in the same location.

In this setup, link your frodo-cli to your frodo-lib:

```console
npm run link
npm run dev
```

Please note that in case you make library changes, you will need to manually rebuild the CLI, as the `npm run dev` command will NOT pick up on compiles of the library.

#### Run Frodo CLI

##### Running the npm version

You can run frodo from anywhere on your system if you install it globally after building:

```console
npm i -g
```

##### Running the binary version

The `frodo` binary (`frodo.exe` on Windows) is self contained and statically linked, so no dependencies are needed. After a full build (`npm run build`), it is at `dist-sea/frodo` and can be run as:

```console
/path/to/frodo-cli/dist-sea/frodo
```

Add the binary to your system path to make it easier to call from your terminal without switching directories

### Before submitting a PR

Before you submit a PR, make sure your code follows the frodo code formatting conventions, type checks, and all the existing and your new tests are passing.

```console
npm run lint
npx tsc --noEmit
npm run build:only
npm test
```

`npm test` runs the full test suite against the npm build of this checkout
(`node dist/launch.cjs`, started through the shim in `test/e2e/shims`). The
test scripts do not build or rebuild it: run `npm run build:only` (or
`npx tsdown`, about 2 seconds) first, and again after every change to
`src/`, or the CLI-level tests (client_cli, e2e, PTY) run the old code. CI
additionally runs the same suite against the platform binary
(`npm run test:binary`, which builds `dist-sea/frodo` if it is missing); if
your change touches the binary packaging or startup path, you can run that
locally too:

```console
npm run test:binary
```

## Merging

PRs merge into `main` through ordinary pull requests once the required CI checks pass; the previous `integration` batch-merge workflow has been retired.

Do not edit `CHANGELOG.md` in a PR. It is generated at release time from what merged since the last release (the `Generate and promote AI changelog` step of `.github/workflows/pipeline.yml`), so give the PR a clear title and description. When a change removes or renames a command, alias or option, add it to [MIGRATION.md](../MIGRATION.md) (see "Maintaining This Guide" there).

### Code structure and conventions

Frodo CLI adheres to the following folder and file structure:

```preformated
├── dist                      Build output (generated, gitignored). The bundled
│                             CommonJS files; the entry point is dist/launch.cjs.
├── dist-sea                  The native binary (generated, gitignored; npm run build).
├── docs                      Documentation files.
├── resources                 Resource files.
├── scripts                   Build scripts (the native binary build).
├── src                       Source files.
│   ├── app.ts                The root program: registers the command groups.
│   ├── cli                   CLI command files, one folder per command group.
│   │   ├── _template         Templates for new CLI commands.
│   ├── configManagerOps      Operations behind the config-manager commands.
│   ├── help                  Sample values for the usage examples (SampleData.ts).
│   ├── ops                   Ops layer modules. This is the library wrapper.
│   │   │                     Business logic goes here.
│   │   ├── classic           Ops modules for classic deployments only.
│   │   ├── cloud             Ops modules for cloud deployments only.
│   │   ├── templates         Templates of different object types and schema.
│   │   └── utils             Ops layer utility modules.
│   └── utils                 Shared utility modules.
│       └── interactive       Prompt components and pickers (the interactive layer).
├── test                      Tests and test resources.
│   ├── client_cli            CLI output tests.
│   │   └── en                English output tests.
│   │       ├── __snapshots__ English output test snapshots.
│   ├── e2e                   End-to-end tests.
│   │   ├── __snapshots__     End-to-end test snapshots.
│   │   ├── env               Test environment files.
│   │   ├── exports           Export data for import tests.
│   │   ├── mocks             Mock recordings (Polly.js).
│   │   ├── shims             The frodo launcher the tests put on PATH (runs dist/).
│   │   ├── test-data         Test data files.
│   │   └── utils             Test utilities.
│   ├── fs_tmp                Temp file directory for running tests.
│   ├── unit                  Unit tests, PTY tests and the usage-examples check.
│   └── utils                 Test harness for PTY tests.
└── tools                     Test and release tooling.
```

#### Code conventions

Most of Frodo CLI's functionality is manipulating configuration of a Ping (formerly: ForgeRock) Identity Platform instance. Most of the configuration is stored in configuration and other objects, which can be managed individually.

To create a good and consistent developer experience for other CLI developers, follow these conventions:

##### Managing objects - CRUDQ

Adopt CRUDQ naming for object manipulation:

| Action | Examples                      | Comments                                                 |
| ------ | ----------------------------- | -------------------------------------------------------- |
| create | createJourney                 | Create should fail if object already exists.             |
| read   | readJourney readJourneys      | Read one or all objects of a kind.                       |
| update | updateJourney                 | Update object if it already exists, create it otherwise. |
| delete | deleteJourney, deleteJourneys | Delete one or all objects of a kind.                     |
| query  | queryJourneys                 | Query objects.                                           |

##### Managing properties

Use getters and setters for property manipulation.

| Action | Examples              | Comments                                              |
| ------ | --------------------- | ----------------------------------------------------- |
| get    | getJourneyDescription | Retrieve an individual property of an object.         |
| set    | setJourneyDescription | Set the value of an individual property of an object. |

##### Managing status

Some objects support status. Avoid using getters and setters for status if possible.

| Action  | Examples       | Comments                |
| ------- | -------------- | ----------------------- |
| enable  | enableJourney  | Enable a configuration. |
| disable | disableJourney | Disable a configuration |

##### Everything else

Pick meaningful function names. It's OK for them to be long, as long as they convey their purpose.

### Writing a command

1. **Start from the template.** Copy `src/cli/_template/something.ts` (the command group) and the verb files you need (`something-list.ts`, `-describe`, `-export`, `-import`, `-delete`), rename them and delete what you do not need.
2. **Use the usual verbs and options.** One kind of configuration artifact is one group with `list`, `describe`, `export`, `import` and `delete`. Export commands almost all use `-i, --<thing>-id`, `-f, --file`, `-a, --all`, `-A, --all-separate` and `-N, --no-metadata`; copy a neighbouring command rather than inventing new spellings.
3. **Keep the command file thin.** A command is a `FrodoCommand('frodo <group> <verb>')`. Its action calls `command.handleDefaultArgsAndOpts(...)`, logs in with `getTokens()`, calls an ops function in `src/ops/` and sets `process.exitCode = 1` when the operation fails. Print through `src/utils/Console.ts` (`printMessage`, `verboseMessage`, `printError`) and take colors from `src/utils/ColorTheme.ts`.
4. **Register it.** Add `program.addCommand(XxxCmd().name('xxx'))` to the group file (see `src/cli/journey/journey.ts`). A new group is imported and added in `src/app.ts`.
5. **Add usage examples.** Every command has a `Usage Examples:` block, which `-hhh` shows. Add it with `.addHelpText('after', ...)` in the style of `frodo info` (`src/cli/info/info.ts`) and `frodo conn save` (`src/cli/conn/conn-save.ts`): one sentence saying what the example does, then the command, with one example per mode or option that matters and login variants (credentials, connection profile). Take the values from `src/help/SampleData.ts` and add constants there when you need them. Run every example against a build before you submit. An example must run as written and open no picker or editor: operands are positional, so with a user name the realm comes second (`<amBaseUrl> <realm> <username> '<password>'`; otherwise the user name is read as the realm and the password as the user name); name the target (`-i`, `-a`, ...) of a command that picks an entity and one member of every `requireOneOf` group; use only flags the command defines and close every quote. A command that asks for confirmation by design (`frodo journey prune`) is the one exception, and the sentence above its example says so. `test/unit/UsageExamples.test.js` fails for a command without examples and `test/unit/UsageExampleOperands.test.js` for an example that breaks these rules; what predates them is frozen in `test/unit/UsageExamplesLegacyExceptions.js` and `test/unit/UsageExampleOperandsLegacyExceptions.js`, lists that only shrink: never add to them, and delete the line of what you fix.
6. **Add tests.** `test/client_cli/en/<group>-<verb>.test.js` snapshots the `-h` output. A command that talks to a tenant also gets `test/e2e/<group>-<verb>.e2e.test.js` with recordings; see [test/e2e/README.md](../test/e2e/README.md). Logic in `src/ops/` that can be tested without a tenant gets a unit test in `test/unit`.
7. **Document breaking changes** in [MIGRATION.md](../MIGRATION.md).

If your command prompts the user, read "Layering: where interactive code lives" in [INTERACTIVE-COMMANDS.md](INTERACTIVE-COMMANDS.md) first.

### Recording decisions

When you decide something that will outlive your change (a rule contributors must follow, a behaviour users rely on, a design principle), record it in `docs/decisions/` in the same pull request. Accepted records are binding until a newer record supersedes them, and a pull request that changes a decided behaviour adds or supersedes one. How to write a record, and the index of the existing ones, is in [docs/decisions/README.md](decisions/README.md).

### Working with coding agents

`AGENTS.md` at the repository root and the files in `.github/instructions/` give coding agents (GitHub Copilot and others) the short version of this guide: build and test commands, the hard rules, and checklists that load when a matching file is edited. They link back here; when a convention changes, change it here first and keep those files short.
