<!-- README.md for GitHub; the one for NPM is ../README.md. -->

# Frodo CLI (@rockcarver/frodo-cli) - Export, import, and manage PingOne Advanced Identity Cloud configuration
A command line interface to manage ForgeRock platform deployments supporting PingOne Advanced Identity Cloud environments, ForgeOps deployments, and classic deployments. Frodo-cli is powered by [frodo-lib](https://github.com/rockcarver/frodo-lib), a hybrid (ESM and CJS) library to manage ForgeRock deployments.
## Quick Nav

- [Quick start](#quick-start)
- [Installing](#installing)
- [Usage](#usage)
- [Request features or report issues](#feature-requests)
- [Contributing](#contributing)
- [Maintaining](#maintaining)

## Quick start

### For the impatient
The below steps install the latest unstable (next) version of the cli using homebrew (only for MacOS and linux):
```console
$ brew tap rockcarver/frodo-cli
$ brew install frodo-cli-next
$ frodo conn add https://openam-my-tenant.forgeblocks.com/am john.doe@company.com '5uP3r-53cr3t!'
$ frodo info my-tenant
$ frodo journey export .... # or whatever you need to use frodo for
```

Detailed quick-start follows.

### Install

#### Homebrew (preferred for Mac OS [x86 and M1] and linux)
1. Make sure you have a working [homebrew](https://brew.sh/). 
2. [Tap](https://docs.brew.sh/Taps) the custom formula as below:
```console
$ brew tap rockcarver/frodo-cli
==> Tapping rockcarver/frodo-cli
Cloning into '/opt/homebrew/Library/Taps/rockcarver/homebrew-frodo-cli'...
remote: Enumerating objects: 8, done.
.
.
```
3. Once its tapped, you can install either the STABLE major version or the latest/unstable (next) version, as below

STABLE

```console
$ brew install frodo-cli
==> Fetching rockcarver/frodo-cli/frodo-cli
==> Cloning https://github.com/rockcarver/frodo-cli.git
.
.
```

Or latest/unstable (next)

```console
$ brew install frodo-cli-next
==> Fetching rockcarver/frodo-cli/frodo-cli-next
==> Cloning https://github.com/rockcarver/frodo-cli.git
.
.
```
To verify the installation, run `frodo -v`, it should print something like:
```console
$ frodo -v
You are running the binary release.
Installed versions:
cli: v2.0.0-43
lib: v2.0.0-59
node: v18.18.2
```

If you have the STABLE version installed and you want to get the latest, do:
```console
$ brew uninstall frodo-cli
$ brew install frodo-cli-next
```
Or vice-versa.

To upgrade to latest frodo
```console
$ brew upgrade frodo-cli
==> Upgrading 1 outdated package:
rockcarver/frodo-cli/frodo-cli-next 2.0.0-43 -> 2.0.0-44
==> Fetching rockcarver/frodo-cli/frodo-cli-next
==> Cloning https://github.com/rockcarver/frodo-cli.git
Updating /Users/sandeep.chaturvedi/Library/Caches/Homebrew/frodo-cli-next--git
From https://github.com/rockcarver/frodo-cli
 * [new tag]           v2.0.0-44  -> v2.0.0-44
==> Checking out tag v2.0.0-44
Previous HEAD position was 9a968346 Updated changelog and version for release v2.0.0-43
HEAD is now at e687fdf6 Updated changelog and version for release v2.0.0-44
HEAD is now at e687fdf6 Updated changelog and version for release v2.0.0-44
==> Upgrading rockcarver/frodo-cli/frodo-cli-next
  2.0.0-43 -> 2.0.0-44
```

#### Alternate method - download precompiled binary
Alternatively, for MacOS (x86 only), linux and Windows, you can also download the platform specific binary archive from the [release page](https://github.com/rockcarver/frodo-cli/releases) and unzip it to a directory. For MacOS (x86 only) and Windows, you may have to allow running unsigned binaries on those platforms. How to do that is out of scope for this README.

### Using / running

You can either run with a saved connection profile (most common way) or not. To run with a connection profile, you need to create one:
1. Run `frodo conn add` (example below) to setup `frodo` for your ForgeRock environment. If all parameters are correct, `frodo` creates a new [connection profile](#connection-profiles). If you are offline and don't want to validate the data you enter, you can use the --no-validate paramter and frodo stores the [connection profile](#connection-profiles) without validating it.

   ```console
   $ frodo conn add https://openam-my-tenant.forgeblocks.com/am john.doe@company.com '5uP3r-53cr3t!'
   Connected to https://openam-my-tenant.forgeblocks.com/am [alpha] as user john.doe@company.com
   Created and added service account Frodo-SA-1677517618855 with id af5eadc7-d59a-450a-967d-090b377b4eaf to profile.
   Created log API key 7683791888e2c7740eb91abd988b65f7 and secret.
   Saved connection profile https://openam-my-tenant.forgeblocks.com/am
   ```

2. Test your connection profile using a simple convenience feature in frodo:

   ```console
   $ frodo info my-tenant
   Connected to https://openam-my-tenant.forgeblocks.com/am [alpha] as service account Frodo-SA-1677517618855 [af5eadc7-d59a-450a-967d-090b377b4eaf]

   Host URL       │https://openam-my-tenant.forgeblocks.com/am
   AM Version     │7.3.0-SNAPSHOT Build 3cee5f270ed80b0354b709e8685e2681617e9c5a (2023-February-06 13:57)
   Subject (Type) │Frodo-SA-1677517618855 [af5eadc7-d59a-450a-967d-090b377b4eaf] (Service Account)       
   Deployment Type│cloud                                                                                 
   Cookie Name    │27e1d6427df2a07                                                                       
   Immutable      │false                                                                                 
   Locked         │false                                                                                 
   Region         │us-west1                                                                              
   Tier           │other                                                                                 

   Bearer token:
   eyJ0eXAiOiJKV......
   ```

   Note how the command does not specify the complete tenant URL nor username nor password. It only needs a unique substring that matches the tenant URL and frodo looks up and uses the right [connection profile](#connection-profiles).

3. Now you can use other frodo commands, like `journey`, `logs`, `applications` etc. as desired. **For detailed usage, refer to [this](#usage)**

## Installing

### User Mode

Individuals who do not intend to develop or contribute to frodo should use this method. Please refer to [Quick Start](#quick-start)

### Developer Mode

For those who want to contribute or are just curious about the build process.

- Make sure you have Node.js v14, v16, or v18 installed ([support for node 19](https://github.com/rockcarver/frodo-cli/issues/186) is pending).
- Clone this repo
  ```console
  git clone https://github.com/rockcarver/frodo-cli.git
  ```
- Install via NPM
  ```console
  cd frodo-cli
  npm install
  npm i -g
  ```

### NPM package

If you are a node developer and want to use frodo as a cli tool or as a library for your own applications, you can install the npm package:

- To install (or update to) the latest version as a cli tool:
  ```console
  npm i -g @rockcarver/frodo-cli
  ```
- To install (or update to) the latest version as a dependency for you own application:
  ```console
  npm i --save @rockcarver/frodo-cli
  ```
- To install (or update to) the latest pre-release:
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
  -v, --version                                output the version number
  -h, --help                                   display help for command

Commands:
  admin                                        Platform admin tasks.
  agent                                        Manage agents.
  app|application                              Manage OAuth2 applications.
  conn|connection                              Manage connection profiles.
  email                                        Manage email templates and configuration.
  esv                                          Manage environment secrets and variables (ESVs).
  idm                                          Manage IDM configuration.
  idp                                          Manage (social) identity providers.
  info [options] [host] [username] [password]  Print versions and tokens.
  journey                                      Manage journeys/trees.
  logs                                         List/View Identity Cloud logs
  realm                                        Manage realms.
  saml                                         Manage SAML entity providers and circles of trust.
  script                                       Manage scripts.
  service                                      Manage AM services.
  theme                                        Manage themes.
  help [command]                               display help for command
```

Or to view options for a specific command

```console
frodo journey help
```

```console
Usage: frodo journey [options] [command]

Manage journeys/trees.

Options:
  -h, --help      Help

Commands:
  delete          Delete journeys/trees.
  describe        If host argument is supplied, describe the journey/tree indicated by -t, or all journeys/trees in the realm if no
                  -t is supplied, otherwise describe the journey/tree export file indicated by -f.
  disable         Disable journeys/trees.
  enable          Enable journeys/trees.
  export          Export journeys/trees.
  help [command]  display help for command
  import          Import journeys/trees.
  list            List journeys/trees.
  prune           Prune orphaned configuration artifacts left behind after deleting authentication trees. You will be prompted
                  before any destructive operations are performed.
```

```console
frodo journey help export
```

```console
Usage: frodo journey export [options] [host] [realm] [username] [password]

Export journeys/trees.

Arguments:
  host                         Access Management base URL, e.g.: https://cdk.iam.example.com/am. To use a connection profile, just
                               specify a unique substring.
  realm                        Realm. Specify realm as '/' for the root realm or 'realm' or '/parent/child' otherwise. (default:
                               "alpha" for Identity Cloud tenants, "/" otherwise.)
  username                     Username to login with. Must be an admin user with appropriate rights to manage authentication
                               journeys/trees.
  password                     Password.

Options:
  -a, --all                    Export all the journeys/trees in a realm. Ignored with -i.
  -A, --all-separate           Export all the journeys/trees in a realm as separate files <journey/tree name>.json. Ignored with -i
                               or -a.
  --curlirize                  Output all network calls in curl format.
  -D, --directory <directory>  Destination directory.
  --debug                      Debug output during command execution. If specified, may or may not produce additional output helpful
                               for troubleshooting.
  -f, --file <file>            Name of the file to write the exported journey(s) to. Ignored with -A.
  -h, --help                   Help
  -i, --journey-id <journey>   Name of a journey/tree. If specified, -a and -A are ignored.
  -k, --insecure               Allow insecure connections when using SSL/TLS. Has no effect when using a network proxy for https
                               (HTTPS_PROXY=http://<host>:<port>), in that case the proxy must provide this capability. (default:
                               Don't allow insecure connections)
  -m, --type <type>            Override auto-detected deployment type. Valid values for type:
                               classic:  A classic Access Management-only deployment with custom layout and configuration.
                               cloud:    A ForgeRock Identity Cloud environment.
                               forgeops: A ForgeOps CDK or CDM deployment.
                               The detected or provided deployment type controls certain behavior like obtaining an Identity
                               Management admin token or not and whether to export/import referenced email templates or how to walk
                               through the tenant admin login flow of Identity Cloud and handle MFA (choices: "classic", "cloud",
                               "forgeops")
  --no-deps                    Do not include any dependencies (scripts, email templates, SAML entity providers and circles of
                               trust, social identity providers, themes).
  -O, --organize <method>      Organize exports into folders using the indicated method. Valid values for method:
                               id: folders named by id of exported object
                               type: folders named by type (e.g. script, journey, idp)
                               type/id: folders named by type with sub-folders named by id
  --sa-id <sa-id>              Service account id.
  --sa-jwk-file <file>         File containing the JSON Web Key (JWK) associated with the the service account.
  --use-string-arrays          Where applicable, use string arrays to store multi-line text (e.g. scripts). (default: off)
  --verbose                    Verbose output during command execution. If specified, may or may not produce additional output.
```

## Feature requests

Please use the repository's [issues](https://github.com/rockcarver/frodo/issues) to request new features/enhancements or report bugs/issues.

## Contributing

If you would like to contribute to frodo, please refer to the [contributing instructions](../docs/CONTRIBUTE.md).

## Maintaining

If you are a maintainer of this repository, please refer to the [pipeline and release process instructions](../docs/PIPELINE.md).

