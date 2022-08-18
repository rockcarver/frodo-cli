<!-- README.md for GitHub; the one for NPM is ../README.md. -->

# Frodo CLI - @rockcarver/frodo-cli

ForgeROck DO Command Line Interface, frodo-cli, a CLI to manage ForgeRock platform deployments supporting Identity Cloud tenants, ForgeOps deployments, and classic deployments.

## Quick Nav

- [Quick start](#quick-start)
- [Installing](#installing)
- [Usage](#usage)
- [Request features or report issues](#feature-requests)
- [Contributing](#contributing)
- [Maintaining](#maintaining)

## Quick start

1. Download the platform specific binary archive from the [release page](https://github.com/rockcarver/frodo-cli/releases) and unzip it to a directory.
2. Open a terminal and change to the above directory.
3. Run `frodo conn add` (example below) to setup `frodo` for your ForgeRock environment. If all parameters are correct, `frodo` creates a new [connection profile](#connection-profiles). If you are offline and don't want to validate the data you enter, you can use the --no-validate paramter and frodo stores the [connection profile](#connection-profiles) without validating it.

   ```console
   $ frodo conn add https://openam-tenant-name.forgeblocks.com/am john.doe@company.com '5uP3r-53cr3t!'
   ForgeRock Identity Cloud detected.
   Connected to ForgeRock Access Management 7.2.0-2022-6-SNAPSHOT Build ee394dde039e790642653a516d498c16759876c1 (2022-July-07 19:49)
   Saving creds in /Users/john.doe/.frodo/.frodorc...
   ```

   **NOTE: MacOS and Windows may not let you run `frodo` right after you download (and unzip) and execute it for the very first time. Please refer to [this page](../docs/BINARIES.md) if this happens.**

4. Test your connection profile using a simple convenience feature in frodo:

   ```console
   $ frodo info tenant-name
   Printing versions and tokens...
   ForgeRock Identity Cloud detected.
   Connected to ForgeRock Access Management 7.2.0-2022-6-SNAPSHOT Build ee394dde039e790642653a516d498c16759876c1 (2022-July-07 19:49)
   Cookie name: 6ac6499e9da2071
   Session token: g9CMhj7k9Asq...
   Bearer token: eyJ0eXAiOiJKV...
   ```

   Note how the command does not specify the complete tenant URL nor username nor password. I only uses a unique substring that matches the tenant URL and frodo looks up and uses the right [connection profile](#connection-profiles).

5. Now you can use other frodo commands, like `journey`, `logs`, `applications` etc. as desired. **For detailed usage, refer to [this](#usage)**

## Installing

### User Mode

Individuals who do not intend to develop or contribute to frodo should use this method. Please refer to [Quick Start](#quick-start)

### Developer Mode

For those who want to contribute or are just curious about the build process.

- Make sure you have Node.js v14 or newer installed.
- Clone this repo
  ```console
  git clone https://github.com/rockcarver/frodo-cli.git
  ```
- Install via NPM
  ```console
  cd frodo
  npm install
  npm i -g
  ```

### NPM package

If you are a node developer and want to use frodo as a cli tool or as a library for your own applications, you can install the npm package:

- To install the latest version as a cli tool:
  ```console
  npm i -g @rockcarver/frodo-cli
  ```
- To install the latest version as a dependency for you own application:
  ```console
  npm i --save @rockcarver/frodo-cli
  ```
- To install the latest pre-release:
  ```console
  npm i @rockcarver/frodo-cli@next
  ```

## Usage

You can invoke `frodo` from the terminal as long as you're in the directory or sourced/added it to the path.

To get started, refer to [Quick Start](#quick-start).

### Connection Profiles

A connection profile is a set of ForgeRock environment URL (Access Management base URL), admin username and admin password. It can optionally contain log API key and secret for a ForgeRock Identity Cloud environment. All connection profiless are stored in `~/.frodo/.frodorc`. Passwords are stored encrypted. `.frodorc` can house information for multiple connections.

Use the `frodo conn` sub-commands to manage connections:

- `frodo conn list` to list all the connections frodo currently knows about for the current machine and user.
- `frodo conn add` to add a new connection profile.
- `frodo conn describe` to see all the details of a connection profile.
- `frodo conn delete` to remove a connection profile.

Once `frodo` saves a connection, you don't have to provide the `host`, `username`, and `password` arguments. You can reference your connection using any unique substring from your host. This is the most common way users would run frodo. For example, if `https://openam-example-use1-dev.id.forgerock.io/am` and `https://openam-example-use1-staging.id.forgerock.io/am` are two saved ForgeRock connections from previous commands, one would simply use:

```console
frodo info example-use1-dev
```

OR

```console
frodo info example-use1-staging
```

### cli options

You interact with `frodo` using commands and options. You can see the list of options by using the `help` command

```console
frodo help
```

```console
Usage: frodo [options] [command]

Options:
  -v, --version                            output the version number
  -h, --help                               display help for command

Commands:
  admin                                    Platform admin tasks.
  application                              Manage applications.
  conn|connection                          Manage connection profiles.
  email                                    Manage email templates and configuration.
  esv                                      Manage Environment-Specific Variables (ESVs).
  idm                                      Manage IDM configuration.
  idp                                      Manage (social) identity providers.
  info [options] <host> [user] [password]  Print versions and tokens.
  journey                                  Manage journeys/trees.
  logs                                     List/View Identity Cloud logs
  realm                                    Manage realms.
  saml                                     Manage SAML entity providers and circles of trust.
  script                                   Manage scripts.
  theme                                    Manages themes.
  help [command]                           display help for command
```

Or to view options for a specific command

```console
frodo help journey
```

```console
Usage: frodo journey [options] [command]

Manage journeys/trees.

Options:
  -h, --help      Help

Commands:
  list            List journeys/trees.
  describe        If host argument is supplied, describe the journey/tree indicated by -t, or all journeys/trees in the realm if no -t is supplied, otherwise describe the journey/tree export file indicated by -f.
  export          Export journeys/trees.
  import          Import journeys/trees.
  delete          Delete journeys/trees.
  prune           Prune orphaned configuration artifacts left behind after deleting authentication trees. You will be prompted before any destructive operations are performed.
  help [command]  display help for command
```

```console
frodo journey help export
```

```console
Usage: frodo journey export [options] <host> [realm] [user] [password]

Export journeys/trees.

Arguments:
  host                        Access Management base URL, e.g.: https://cdk.iam.example.com/am. To use a connection profile, just specify a unique substring.
  realm                       Realm. Specify realm as '/' for the root realm or 'realm' or '/parent/child' otherwise. (default: "alpha" for Identity Cloud tenants, "/" otherwise.)
  user                        Username to login with. Must be an admin user with appropriate rights to manage authentication journeys/trees.
  password                    Password.

Options:
  -m, --type <type>           Override auto-detected deployment type. Valid values for type:
                              classic:  A classic Access Management-only deployment with custom layout and configuration.
                              cloud:    A ForgeRock Identity Cloud environment.
                              forgeops: A ForgeOps CDK or CDM deployment.
                              The detected or provided deployment type controls certain behavior like obtaining an Identity Management admin token or not and whether to export/import referenced email templates or how to
                              walk through the tenant admin login flow of Identity Cloud and handle MFA (choices: "classic", "cloud", "forgeops")
  -k, --insecure              Allow insecure connections when using SSL/TLS (default: Don't allow insecure connections)
  -i, --journey-id <journey>  Name of a journey/tree. If specified, -a and -A are ignored.
  -f, --file <file>           Name of the file to write the exported journey(s) to. Ignored with -A.
  -a, --all                   Export all the journeys/trees in a realm. Ignored with -i.
  -A, --all-separate          Export all the journeys/trees in a realm as separate files <journey/tree name>.json. Ignored with -i or -a.
  --use-string-arrays         Where applicable, use string arrays to store multi-line text (e.g. scripts). (default: off)
  -h, --help                  Help
```

## Feature requests

Please use the repository's [issues](https://github.com/rockcarver/frodo/issues) to request new features/enhancements or report bugs/issues.

## Contributing

If you would like to contribute to frodo, please refer to the [contributing instructions](../docs/CONTRIBUTE.md).

## Maintaining

If you are a maintainer of this repository, please refer to the [pipeline and release process instructions](../docs/PIPELINE.md).
