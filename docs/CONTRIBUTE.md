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

Before you submit a PR, make sure your code follows the frodo code formatting conventions and all the existing and your new unit tests are passing.

```console
npm run lint
npm test
```

`npm test` runs the full test suite against the npm build of this checkout
(`node dist/launch.cjs`), building it on demand if missing — no platform
binary or macOS signing step needed. CI additionally runs the same suite
against the platform binary (`npm run test:binary`); if your change touches
the binary packaging or startup path, you can run that locally too:

```console
npm run test:binary
```

## Merging

PRs merge into `main` through ordinary pull requests once the required CI checks pass; the previous `integration` batch-merge workflow has been retired.

### Code structure and conventions

Frodo CLI adheres to the following folder and file structure:

```preformated
├── dist                      Build output. CommonJS files go here.
├── docs                      Documentation files.
├── resources                 Resource files.
├── src                       Source files.
│   ├── cli                   CLI command files.
│   │   ├── _template         Templates for new CLI commands.
│   ├── help                  Help data files.
│   ├── ops                   Ops layer modules. This is the library wrapper.
│   │   │                     Business logic goes here.
│   │   ├── cloud             Cloud ops layer modules.
│   │   ├── templates         Templates of different object types and schema.
│   │   └── utils             Ops layer utility modules.
│   ├── storage               Global constants.
│   └── utils                 Shared utility modules.
├── test                      Tests and test resources.
│   ├── client_cli            CLI output tests.
│   │   └── en                English output tests.
│   │       ├── __snapshots__ English output test snapshots.
│   ├── e2e                   End-to-end tests.
│   │   ├── __snapshots__     End-to-end test snapshots.
│   │   ├── env               Test environment files.
│   │   ├── exports           Export data for import tests.
│   │   ├── mocks             Mock recordings (Polly.js).
│   │   ├── test-data         Test data files.
│   │   └── utils             Test utilities.
│   ├── fs_tmp                Temp file directory for running tests.
│   └── unit                  Unit tests.
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
