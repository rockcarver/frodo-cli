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

- Node.js 18 or later, 20 or 22 recommended
- npm (included with Node.js)
- A GUI editor is highly recommended. The current developers use [VSCode](https://code.visualstudio.com/), but you are welcome to others, like [Atom](https://atom.io/) or [Sublime](https://www.sublimetext.com/) too. The repository contains configuration files for VSCode's [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) and [prettier](https://prettier.io/) add-ons, which will automatically lint the code and apply coding styles when using VSCode. The same files may work for other editors with similar add-ons, but this has not been tested.

### Clone the repo and install dependencies

```console
git clone https://github.com/rockcarver/frodo-cli.git
cd frodo-cli
npm ci
```

### Build and install

#### Build and create platform binary

The following command builds the CLI and creates the binary for your platform:

```console
npm run build
```

#### Build only, don't create platform binary

The following commands builds the CLI but does not create a binary:

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

The `frodo` binary (`frodo.exe` on Windows) is self contained and statically linked, so no dependencies are needed. It can be run as:

```console
/path/to/frodo/frodo-cli/frodo
```

Add the binary to your system path to make it easier to call from your terminal without switching directories

### Before submitting a PR

Before you submit a PR, make sure your code follows the frodo code formatting conventions and all the existing and your new unit tests are passing.

```console
npm run lint
npm test
```

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
