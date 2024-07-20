<!-- README.md for GitHub; the one for NPM is ../README.md. -->

# Frodo CLI (@rockcarver/frodo-cli) - Export, import, and manage PingOne Advanced Identity Cloud configuration

A command line interface to manage PingOne Advanced Identity Cloud environments, ForgeOps deployments, and classic deployments. Frodo-cli is powered by [frodo-lib](https://github.com/rockcarver/frodo-lib), a hybrid (ESM and CJS) library to manage PingOne Advanced Identity Cloud environments, ForgeOps deployments, and classic deployments.

## Quick Nav

- [Quick start](#quick-start)
- [New in 2.x](#new-in-2x)
- [Considerations](#considerations)
- [Installing](#installing)
- [Usage](#usage)
- [Request features or report issues](#feature-requests)
- [Contributing](#contributing)
- [Maintaining](#maintaining)

## Quick start

### For the impatient

#### MacOS and Linux

The below steps install the latest unstable (next) version of the cli using homebrew:

```console
$ brew tap rockcarver/frodo-cli
$ brew install frodo-cli-next
$ frodo conn add https://openam-my-tenant.forgeblocks.com/am john.doe@company.com '5uP3r-53cr3t!'
$ frodo info my-tenant
$ frodo journey export .... # or whatever you need to use frodo for
```

#### Windows, MacOS, Linux

Download the platform specific binary archive from the [release page](https://github.com/rockcarver/frodo-cli/releases).

Detailed [Installation](#installing) instructions below.

## New In 2.x

### Based on Frodo Library 2.x

[Frodo Library 2.x](https://github.com/rockcarver/frodo-lib?tab=readme-ov-file#frodo-library-2x---rockcarverfrodo-lib) greatly improves on its 1.x branch with more stabilty, more modules, token caching, automatic token refresh, better error handling, and more.

### New and updated commands

| Command                                          |  Since  | Description                                                            |
| ------------------------------------------------ | :-----: | ---------------------------------------------------------------------- |
| frodo admin                                      |  1.0.0  | Platform admin tasks.                                                  |
| &emsp;add-autoid-static-user-mapping             |  1.0.0  | Add AutoId static user mapping to enable dashboards.                   |
| &emsp;create-oauth2-client-with-admin-privileges |  1.0.0  | Create an oauth2 client with admin privileges.                         |
| &emsp;execute-rfc7523-authz-grant-flow           | `2.0.0` | Execute RFC7523 authorization grant flow.                              |
| &emsp;federation                                 |  1.0.0  | Manages admin federation configuration.                                |
| &emsp;generate-rfc7523-authz-grant-artefacts     | `2.0.0` | Generate RFC7523 authorization grant artefacts.                        |
| &emsp;get-access-token                           |  1.0.0  | Get an access token using client credentials grant type.               |
| &emsp;grant-oauth2-client-admin-privileges       |  1.0.0  | Grant an oauth2 client admin privileges.                               |
| &emsp;hide-generic-extension-attributes          |  1.0.0  | Hide generic extension attributes.                                     |
| &emsp;list-oauth2-clients-with-admin-privileges  |  1.0.0  | List oauth2 clients with admin privileges.                             |
| &emsp;list-oauth2-clients-with-custom-privileges |  1.0.0  | List oauth2 clients with custom privileges.                            |
| &emsp;list-static-user-mappings                  |  1.0.0  | List all subjects of static user mappings that are not oauth2 clients. |
| &emsp;remove-static-user-mapping                 |  1.0.0  | Remove a subject's static user mapping.                                |
| &emsp;repair-org-model                           |  1.0.0  | Repair org model.                                                      |
| &emsp;revoke-oauth2-client-admin-privileges      |  1.0.0  | Revoke admin privileges from an oauth2 client.                         |
| &emsp;show-generic-extension-attributes          |  1.0.0  | Show generic extension attributes.                                     |
|                                                  |         |                                                                        |
| frodo agent                                      |  1.0.0  | Manage agents.                                                         |
| &emsp;delete                                     |  1.0.0  | Delete agents.                                                         |
| &emsp;describe                                   |  1.0.0  | Describe agents.                                                       |
| &emsp;export                                     |  1.0.0  | Export agents.                                                         |
| &emsp;gateway / ig                               |  1.0.0  | Manage gateway agents.                                                 |
| &emsp;&emsp;delete                               |  1.0.0  | Delete identity gateway agents.                                        |
| &emsp;&emsp;describe                             |  1.0.0  | Describe gateway agents.                                               |
| &emsp;&emsp;export                               |  1.0.0  | Export gateway agents.                                                 |
| &emsp;import                                     |  1.0.0  | Import gateway agents.                                                 |
| &emsp;list                                       |  1.0.0  | List gateway agents.                                                   |
| &emsp;import                                     |  1.0.0  | Import agents.                                                         |
| &emsp;java                                       |  1.0.0  | Manage java agents.                                                    |
| &emsp;&emsp;delete                               |  1.0.0  | Delete java agents.                                                    |
| &emsp;&emsp;describe                             |  1.0.0  | Describe java agents.                                                  |
| &emsp;&emsp;export                               |  1.0.0  | Export java agents.                                                    |
| &emsp;&emsp;import                               |  1.0.0  | Import java agents.                                                    |
| &emsp;&emsp;list                                 |  1.0.0  | List java agents.                                                      |
| &emsp;list                                       |  1.0.0  | List agents.                                                           |
| &emsp;web                                        |  1.0.0  | Manage web agents.                                                     |
| &emsp;&emsp;delete                               |  1.0.0  | Delete web agents.                                                     |
| &emsp;&emsp;describe                             |  1.0.0  | Describe web agents.                                                   |
| &emsp;&emsp;export                               |  1.0.0  | Export web agents.                                                     |
| &emsp;&emsp;import                               |  1.0.0  | Import web agents.                                                     |
| &emsp;&emsp;list                                 |  1.0.0  | List web agents.                                                       |
|                                                  |         |                                                                        |
| frodo authn                                      | `2.0.0` | Manage authentication settings.                                        |
| &emsp;describe                                   | `2.0.0` | Describe authentication settings.                                      |
| &emsp;export                                     | `2.0.0` | Export authentication settings.                                        |
| &emsp;import                                     | `2.0.0` | Import authentication settings.                                        |
|                                                  |         |                                                                        |
| frodo authz                                      |  1.0.0  | Manage authorization policies, policy sets, and resource types.        |
| &emsp;policy                                     |  1.0.0  | Manages authorization policies.                                        |
| &emsp;&emsp;delete                               |  1.0.0  | Delete authorization policies.                                         |
| &emsp;&emsp;describe                             |  1.0.0  | Describe authorization policies.                                       |
| &emsp;&emsp;export                               |  1.0.0  | Export authorization policies.                                         |
| &emsp;&emsp;import                               |  1.0.0  | Import authorization policies.                                         |
| &emsp;&emsp;list                                 |  1.0.0  | List authorization policies.                                           |
| &emsp;set / policyset                            |  1.0.0  | Manage authorization policy sets.                                      |
| &emsp;&emsp;delete                               |  1.0.0  | Delete authorization policy sets.                                      |
| &emsp;&emsp;describe                             |  1.0.0  | Describe authorization policy sets.                                    |
| &emsp;&emsp;export                               |  1.0.0  | Export authorization policy sets.                                      |
| &emsp;&emsp;import                               |  1.0.0  | Import authorization policy sets.                                      |
| &emsp;&emsp;list                                 |  1.0.0  | List authorization policy sets.                                        |
| &emsp;type                                       |  1.0.0  | Manage authorization resource types.                                   |
| &emsp;&emsp;delete                               |  1.0.0  | Delete authorization resource types.                                   |
| &emsp;&emsp;describe                             |  1.0.0  | Describe authorization resource types.                                 |
| &emsp;&emsp;export                               |  1.0.0  | Export authorization resource types.                                   |
| &emsp;&emsp;import                               |  1.0.0  | Import authorization resource types.                                   |
| &emsp;&emsp;list                                 |  1.0.0  | List authorization resource types.                                     |
|                                                  |         |                                                                        |
| frodo app / application                          | `2.0.0` | Old `app` renamed to `oauth`! Manage applications.                     |
| &emsp;delete                                     | `2.0.0` | Delete applications.                                                   |
| &emsp;export                                     | `2.0.0` | Export applications.                                                   |
| &emsp;import                                     | `2.0.0` | Import applications.                                                   |
| &emsp;list                                       | `2.0.0` | List applications.                                                     |
| frodo config                                     | `2.0.0` | Manage full cloud configuration.                                       |
| &emsp;export                                     | `2.0.0` | Export full cloud configuration.                                       |
| &emsp;import                                     | `2.0.0` | Import full cloud configuration.                                       |
|                                                  |         |                                                                        |
| frodo conn / connection                          |  1.0.0  | Manage connection profiles.                                            |
| &emsp;delete                                     |  1.0.0  | Delete connection profiles.                                            |
| &emsp;describe                                   |  1.0.0  | Describe connection profile.                                           |
| &emsp;list                                       |  1.0.0  | List connection profiles.                                              |
| &emsp;save / add                                 |  1.0.0  | Save connection profiles.                                              |
|                                                  |         |                                                                        |
| frodo email                                      |  1.0.0  | Manage email templates and configuration.                              |
| &emsp;template                                   |  1.0.0  | Manage email templates.                                                |
| &emsp;&emsp;export                               |  1.0.0  | Export email templates.                                                |
| &emsp;&emsp;import                               |  1.0.0  | Import email templates.                                                |
| &emsp;&emsp;list                                 |  1.0.0  | List email templates.                                                  |
|                                                  |         |                                                                        |
| frodo esv                                        |  1.0.0  | Manage environment secrets and variables (ESVs).                       |
| &emsp;apply                                      |  1.0.0  | Apply pending changes to secrets and variables.                        |
| &emsp;secret                                     |  1.0.0  | Manages secrets.                                                       |
| &emsp;&emsp;create                               |  1.0.0  | Create secrets.                                                        |
| &emsp;&emsp;delete                               |  1.0.0  | Delete secrets.                                                        |
| &emsp;&emsp;describe                             |  1.0.0  | Describe secrets.                                                      |
| &emsp;&emsp;export                               | `2.0.0` | Export secrets.                                                        |
| &emsp;&emsp;import                               | `2.0.0` | Import secrets.                                                        |
| &emsp;&emsp;list                                 |  1.0.0  | List secrets.                                                          |
| &emsp;&emsp;set                                  |  1.0.0  | Set secret description.                                                |
| &emsp;&emsp;version                              |  1.0.0  | Manage secret versions.                                                |
| &emsp;variable                                   |  1.0.0  | Manage variables.                                                      |
| &emsp;&emsp;create                               |  1.0.0  | Create variables.                                                      |
| &emsp;&emsp;delete                               |  1.0.0  | Delete variables.                                                      |
| &emsp;&emsp;describe                             |  1.0.0  | Describe variables.                                                    |
| &emsp;&emsp;export                               | `2.0.0` | Export variables.                                                      |
| &emsp;&emsp;import                               | `2.0.0` | Import variables.                                                      |
| &emsp;&emsp;list                                 |  1.0.0  | List variables.                                                        |
| &emsp;&emsp;set                                  |  1.0.0  | Set variable description.                                              |
|                                                  |         |                                                                        |
| frodo idm                                        |  1.0.0  | Manage IDM configuration.                                              |
| &emsp;count                                      |  1.0.0  | Count managed objects.                                                 |
| &emsp;export                                     |  1.0.0  | Export IDM configuration objects.                                      |
| &emsp;import                                     |  1.0.0  | Import IDM configuration objects.                                      |
| &emsp;list                                       |  1.0.0  | List IDM configuration objects.                                        |
|                                                  |         |                                                                        |
| frodo idp                                        |  1.0.0  | Manage (social) identity providers.                                    |
| &emsp;export                                     |  1.0.0  | Export (social) identity providers.                                    |
| &emsp;import                                     |  1.0.0  | Import (social) identity providers.                                    |
| &emsp;list                                       |  1.0.0  | List (social) identity providers.                                      |
|                                                  |         |                                                                        |
| frodo info                                       |  1.0.0  | Print versions and tokens.                                             |
|                                                  |         |                                                                        |
| frodo journey                                    |  1.0.0  | Manage journeys/trees.                                                 |
| &emsp;delete                                     |  1.0.0  | Delete journeys/trees.                                                 |
| &emsp;describe                                   |  1.0.0  | Describe journeys/trees.                                               |
| &emsp;disable                                    |  1.0.0  | Disable journeys/trees.                                                |
| &emsp;enable                                     |  1.0.0  | Enable journeys/trees.                                                 |
| &emsp;export                                     |  1.0.0  | Export journeys/trees.                                                 |
| &emsp;import                                     |  1.0.0  | Import journey/tree.                                                   |
| &emsp;list                                       |  1.0.0  | List journeys/trees.                                                   |
| &emsp;prune                                      |  1.0.0  | Prune orphaned configuration artifacts.                                |
|                                                  |         |                                                                        |
| frodo log / logs                                 |  1.0.0  | List/View Identity Cloud logs                                          |
| &emsp;fetch                                      |  1.0.0  | Fetch Identity Cloud logs.                                             |
| &emsp;key                                        |  1.0.0  | Manage Identity Cloud log API keys.                                    |
| &emsp;list                                       |  1.0.0  | List available ID Cloud log sources.                                   |
| &emsp;tail                                       |  1.0.0  | Tail Identity Cloud logs.                                              |
|                                                  |         |                                                                        |
| frodo mapping                                    | `2.0.0` | Manage IDM mappings.                                                   |
| &emsp;delete                                     | `2.0.0` | Delete IDM mappings.                                                   |
| &emsp;export                                     | `2.0.0` | Export IDM mappings.                                                   |
| &emsp;import                                     | `2.0.0` | Import IDM mappings.                                                   |
| &emsp;list                                       | `2.0.0` | List IDM mappings.                                                     |
| &emsp;rename                                     | `2.0.0` | Renames mappings from legacy to new naming scheme.                     |
|                                                  |         |                                                                        |
| frodo oauth                                      | `2.0.0` | Renamed from `app`! Manage OAuth2 clients and providers.               |
| &emsp;client                                     | `2.0.0` | Manage OAuth2 clients.                                                 |
| &emsp;&emsp;export                               | `2.0.0` | Export OAuth2 clients.                                                 |
| &emsp;&emsp;import                               | `2.0.0` | Import OAuth2 clients.                                                 |
| &emsp;&emsp;list                                 | `2.0.0` | List OAuth2 clients.                                                   |
|                                                  |         |                                                                        |
| frodo realm                                      |  1.0.0  | Manage realms.                                                         |
| &emsp;add-custom-domain                          |  1.0.0  | Add custom domain (realm DNS alias).                                   |
| &emsp;describe / details                         |  1.0.0  | Describe realms.                                                       |
| &emsp;list                                       |  1.0.0  | List realms.                                                           |
| &emsp;remove-custom-domain                       |  1.0.0  | Remove custom domain (realm DNS alias).                                |
|                                                  |         |                                                                        |
| frodo saml                                       |  1.0.0  | Manage SAML entity providers and circles of trust.                     |
| &emsp;cot                                        |  1.0.0  | Manage circles of trust.                                               |
| &emsp;&emsp;export                               |  1.0.0  | Export SAML circles of trust.                                          |
| &emsp;&emsp;import                               |  1.0.0  | Import SAML circles of trust.                                          |
| &emsp;&emsp;list                                 |  1.0.0  | List SAML circles of trust.                                            |
| &emsp;delete                                     |  1.0.0  | Delete SAML entity providers.                                          |
| &emsp;describe                                   |  1.0.0  | Describe the configuration of an entity provider.                      |
| &emsp;export                                     |  1.0.0  | Export SAML entity providers.                                          |
| &emsp;import                                     |  1.0.0  | Import SAML entity providers.                                          |
| &emsp;list                                       |  1.0.0  | List SAML entity providers.                                            |
| &emsp;metadata                                   |  1.0.0  | SAML metadata operations.                                              |
| &emsp;&emsp;export                               |  1.0.0  | Export metadata.                                                       |
|                                                  |         |                                                                        |
| frodo script                                     |  1.0.0  | Manage scripts.                                                        |
| &emsp;delete                                     |  1.0.0  | Delete scripts.                                                        |
| &emsp;export                                     |  1.0.0  | Export scripts.                                                        |
| &emsp;import                                     |  1.0.0  | Import scripts.                                                        |
| &emsp;list                                       |  1.0.0  | List scripts.                                                          |
|                                                  |         |                                                                        |
| frodo service                                    |  1.0.0  | Manage AM services.                                                    |
| &emsp;delete                                     |  1.0.0  | Delete AM services.                                                    |
| &emsp;export                                     |  1.0.0  | Export AM services.                                                    |
| &emsp;import                                     |  1.0.0  | Import AM services.                                                    |
| &emsp;list                                       |  1.0.0  | List AM services.                                                      |
|                                                  |         |                                                                        |
| frodo shell                                      | `2.0.0` | Launch the frodo interactive shell.                                    |
|                                                  |         |                                                                        |
| frodo theme                                      |  1.0.0  | Manage themes.                                                         |
| &emsp;delete                                     |  1.0.0  | Delete themes.                                                         |
| &emsp;export                                     |  1.0.0  | Export themes.                                                         |
| &emsp;import                                     |  1.0.0  | Import themes.                                                         |
| &emsp;list                                       |  1.0.0  | List themes.                                                           |
|                                                  |         |                                                                        |
| frodo help                                       |  1.0.0  | display help for command                                               |

### Global support for `-D`, `--directory` to set the working directory

2.x globally supports `-D`, `--directory` to specify the working directory for any command that interacts with the file system, typically `export` and `import` sub-commands. 1.x did only allow to specify a working directory for the `idm` command. Frodo combines `-D` and `-f` into a single path, assuming `-f` to be a relative path to `-D` and `-D` defaulting to `.`, the current directory:

To import the file `/absolute/path/to/working/directory/relative/path/to/file.variable.json`, one could construct any of the following commands:

```console
frodo esv variable export -f /absolute/path/to/working/directory/sub-path/to/file.variable.json <my-env>
frodo esv variable export -D /absolute/path/to/working/directory/sub-path/to  -f file.variable.json <my-env>
frodo esv variable export -D /absolute/path/to/working/directory -f sub-path/to/file.variable.json <my-env>
```

Alternatively, to import the file `/relative/path/to/working/directory/relative/path/to/file.variable.json`, one could construct any of the following commands:

```console
frodo esv variable export -f relative/path/to/working/directory/sub-path/to/file.variable.json <my-env>
frodo esv variable export -D relative/path/to/working/directory/sub-path/to  -f file.variable.json <my-env>
frodo esv variable export -D relative/path/to/working/directory -f sub-path/to/file.variable.json <my-env>
```

### Secure Token Caching

Frodo CLI 2.x uses a secure token cache, which is active by default. The cache is tokenized and encrypted on disk, so it persists across CLI executions, dramatically decreasing authentication and token requests. You can disable the cache by either using the `--no-cache` option or by setting the `FRODO_NO_CACHE` environment variable.
You can change the default location of the cache file (`~/.frodo/TokenCache.json`) by setting the `FRODO_TOKEN_CACHE_PATH` environment variable.

### Automatic Token Refresh

Frodo CLI 2.x automatically refreshes session and access tokens before they expire. Combined with the new token cache, the CLI maintains a set of valid tokens at all times.

## Considerations

### Platform Passwords And Secrets

Platform passwords and secrets are configuration values that are stored encrypted as part of platform configuration. Examples are oauth2 client secrets or service account passwords.

Frodo generally doesn't export platform passwords and secrets. The platform supports configuration placeholders and environment secrets and variables allowing administrators to separate the functional configuration from sensitive secrets and variable configuration values. `frodo` assumes administrators take full advantage of these capabilities so that there is no need or expectation that exports include passwords and secrets. However, where the APIs support it, administrators can seed import data with raw secrets and `frodo` will import them.

### Advanced Identity Cloud Environment Secrets And Variables (ESVs)

Frodo supports exporting and importing of ESV secret values. To leave stuartship of secret values with the cloud environment where they belong, frodo always encrypts values using either encryption keys from the source environment (default) or the target environment. Frodo never exports secrets in the clear.

## Installing

### Download executable binaries (all supported platforms)

Download the platform specific binary archive from the [release page](https://github.com/rockcarver/frodo-cli/releases).

### Homebrew (preferred for MacOS [x86 and M1] and Linux)

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

### NPM package

If you are a node developer and want to use frodo as a cli tool or as a library for your own applications, you can install the npm package:

- To install (or update to) the latest version as a cli tool:
  ```console
  npm i -g @rockcarver/frodo-cli
  ```
- To install (or update to) the latest pre-release:
  ```console
  npm i @rockcarver/frodo-cli@next
  ```

## Usage

### Connection Profiles

A connection profile is a set of ForgeRock environment URL (Access Management base URL) and login credentials. For PingOne Advanced Identity Cloud connections, the profile also contains log API key and secret and service account id and jwk. Connection profiless are stored in `~/.frodo/.frodorc`. Passwords, secrets, and keys are encrypted.

Connection profiles make it super easy to access your different environments securely. Follow these steps to get started:

1. Run `frodo conn add` (example below) to setup `frodo` for your ForgeRock environment. If all parameters are correct, `frodo` creates a new [connection profile](#connection-profiles). If you are offline and don't want to validate the data you enter, you can use the --no-validate paramter and frodo stores the [connection profile](#connection-profiles) without validating it.

   ```console
   $ frodo conn add https://openam-my-tenant.forgeblocks.com/am john.doe@company.com '5uP3r-53cr3t!'
   Connected to https://openam-my-tenant.forgeblocks.com/am [alpha] as user john.doe@company.com
   Created and added service account Frodo-SA-1677517618855 with id af5eadc7-d59a-450a-967d-090b377b4eaf to profile.
   Created log API key 7683791888e2c7740eb91abd988b65f7 and secret.
   Saved connection profile https://openam-my-tenant.forgeblocks.com/am
   ```

2. Test your connection profile using the `frodo info` command:

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

Use the `frodo conn` sub-commands to manage connections:

- `frodo conn list` to list all the connections frodo currently knows about for the current machine and user.
- `frodo conn save` or `frodo conn add` to save a new or update an existing connection profile.
- `frodo conn describe` to see all the details of a connection profile.
- `frodo conn delete` to remove a connection profile.

Once `frodo` saves a connection, you don't have to provide the full `host` or `username` and `password` arguments. You can reference your connection using any unique substring of your host URL. This is the most common way users would run frodo. For example, if `https://openam-example-use1-dev.id.forgerock.io/am` and `https://openam-example-use1-staging.id.forgerock.io/am` are two saved ForgeRock connections from previous commands, one would simply use:

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
Usage: frodo [options] [command]

Options:
  -v, --version                                         output the version number
  -h, --help                                            display help for command

Commands:
  admin                                                 Platform admin tasks.
  agent                                                 Manage agents.
  authn                                                 Manage authentication settings.
  authz                                                 Manage authorization policies, policy sets, and resource types.
  app                                                   Manage applications.
  config                                                Manage full cloud configuration.
  conn|connection                                       Manage connection profiles.
  email                                                 Manage email templates and configuration.
  esv                                                   Manage environment secrets and variables (ESVs).
  idm                                                   Manage IDM configuration.
  idp                                                   Manage (social) identity providers.
  info [options] [host] [username] [password]           Print versions and tokens.
  journey                                               Manage journeys/trees.
  log|logs                                              List/View Identity Cloud logs
  mapping                                               Manage IDM mappings.
  oauth                                                 Manage OAuth2 clients and providers.
  realm                                                 Manage realms.
  saml                                                  Manage SAML entity providers and circles of trust.
  script                                                Manage scripts.
  service                                               Manage AM services.
  shell [options] [host] [realm] [username] [password]  Launch the frodo interactive shell.
  theme                                                 Manage themes.
  help [command]                                        display help for command
```

Or to view options for a specific command

```console
frodo journey help
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
Usage: frodo journey export [options] [host] [realm] [username] [password]

Export journeys/trees.

Arguments:
  host                         Access Management base URL, e.g.: https://cdk.iam.example.com/am. To use a connection profile, just specify a unique substring.
  realm                        Realm. Specify realm as '/' for the root realm or 'realm' or '/parent/child' otherwise. (default: "alpha" for Identity Cloud tenants, "/" otherwise.)
  username                     Username to login with. Must be an admin user with appropriate rights to manage authentication journeys/trees.
  password                     Password.

Options:
  -a, --all                    Export all the journeys/trees in a realm. Ignored with -i.
  -A, --all-separate           Export all the journeys/trees in a realm as separate files <journey/tree name>.json. Ignored with -i or -a.
  --curlirize                  Output all network calls in curl format.
  -D, --directory <directory>  Set the working directory.
  --debug                      Debug output during command execution. If specified, may or may not produce additional output helpful for troubleshooting.
  -f, --file <file>            Name of the file to write the exported journey(s) to. Ignored with -A.
  --flush-cache                Flush token cache.
  -h, --help                   Help
  -i, --journey-id <journey>   Name of a journey/tree. If specified, -a and -A are ignored.
  -k, --insecure               Allow insecure connections when using SSL/TLS. Has no effect when using a network proxy for https (HTTPS_PROXY=http://<host>:<port>), in that case the proxy must provide this capability. (default: Don't
                               allow insecure connections)
  -m, --type <type>            Override auto-detected deployment type. Valid values for type:
                               classic:  A classic Access Management-only deployment with custom layout and configuration.
                               cloud:    A ForgeRock Identity Cloud environment.
                               forgeops: A ForgeOps CDK or CDM deployment.
                               The detected or provided deployment type controls certain behavior like obtaining an Identity Management admin token or not and whether to export/import referenced email templates or how to walk through the
                               tenant admin login flow of Identity Cloud and handle MFA (choices: "classic", "cloud", "forgeops")
  -N, --no-metadata            Does not include metadata in the export file.
  --no-cache                   Disable token cache for this operation.
  --no-coords                  Do not include the x and y coordinate positions of the journey/tree nodes.
  --no-deps                    Do not include any dependencies (scripts, email templates, SAML entity providers and circles of trust, social identity providers, themes).
  --sa-id <sa-id>              Service account id.
  --sa-jwk-file <file>         File containing the JSON Web Key (JWK) associated with the the service account.
  --use-string-arrays          Where applicable, use string arrays to store multi-line text (e.g. scripts). (default: off)
  --verbose                    Verbose output during command execution. If specified, may or may not produce additional output.

Environment Variables:
  FRODO_HOST: Access Management base URL. Overrides 'host' argument.
  FRODO_REALM: Realm. Overrides 'realm' argument.
  FRODO_USERNAME: Username. Overrides 'username' argument.
  FRODO_PASSWORD: Password. Overrides 'password' argument.
  FRODO_SA_ID: Service account uuid. Overrides '--sa-id' option.
  FRODO_SA_JWK: Service account JWK. Overrides '--sa-jwk-file' option but takes the actual JWK as a value, not a file name.
  FRODO_NO_CACHE: Disable token cache. Same as '--no-cache' option.
  FRODO_TOKEN_CACHE_PATH: Use this token cache file instead of '~/.frodo/TokenCache.json'.
  FRODO_CONNECTION_PROFILES_PATH: Use this connection profiles file instead of '~/.frodo/Connections.json'.
  FRODO_AUTHENTICATION_SERVICE: Name of a login journey to use.
  FRODO_DEBUG: Set to any value to enable debug output. Same as '--debug'.
  FRODO_MASTER_KEY_PATH: Use this master key file instead of '~/.frodo/masterkey.key' file.
  FRODO_MASTER_KEY: Use this master key instead of what's in '~/.frodo/masterkey.key'. Takes precedence over FRODO_MASTER_KEY_PATH.
```

## Feature requests

Please use the repository's [issues](https://github.com/rockcarver/frodo-cli/issues) to request new features/enhancements or report bugs/issues.

## Contributing

If you would like to contribute to frodo, please refer to the [contributing instructions](../docs/CONTRIBUTE.md).

## Maintaining

If you are a maintainer of this repository, please refer to the [pipeline and release process instructions](../docs/PIPELINE.md).
