# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.5] - 2025-04-07

### Fixed

- \#494: Frodo CLI now properly imports script from separate files using `frodo script import -A`.

## [3.0.4] - 2025-04-04

### Changed

- Update to frodo-lib 3.0.4

### Fixed

- \#477: Frodo CLI now properly includes the transformation script for both `Social Provider Handler Node` and `Legacy Social Provider Handler Node`.
- \#482: Frodo CLI now properly honors the NO_PROXY environment variable in addition to HTTP_PROXY and HTTPS_PROXY.
- \#489: MacOS binaries are now provided for both Intel and ARM64 architectures.
- \#490: Linux ARM64 binary now works on Linux running on ARM64 hardware.

## [3.0.4-1] - 2025-04-03

### Fixed

- \#489: MacOS binaries are now provided for both Intel and ARM64 architectures.
- \#490: Linux ARM64 binary now works on Linux running on ARM64 hardware.

## [3.0.4-0] - 2025-04-03

### Changed

- Update to frodo-lib 3.0.4-2

### Fixed

- \#477: Frodo CLI now properly includes the transformation script for both `Social Provider Handler Node` and `Legacy Social Provider Handler Node`.
- \#482: Frodo CLI now properly honors the NO_PROXY environment variable in addition to HTTP_PROXY and HTTPS_PROXY.

## [3.0.3] - 2025-03-11

### Changed

- Update to frodo-lib 3.0.3

### Fixed

- \#479: Fixes issues introduced by a recent PingOne Advanced Identity Cloud release (16747.0 on 27 Feb 2025) which prevented Frodo from correctly determining the deployment type of `cloud` and led to failures in the `frodo conn save` and `frodo conn add` commands when Frodo was attempting to create service accounts with scopes that are not available in an environment.

## [3.0.2] - 2025-03-11

### Changed

- Update to frodo-lib 3.0.2

### Fixed

- \#479: Fixes issues introduced by a recent PingOne Advanced Identity Cloud release (16747.0 on 27 Feb 2025) which prevented Frodo from correctly determining the deployment type of `cloud` and led to failures in the `frodo conn save` and `frodo conn add` commands when Frodo was attempting to create service accounts with scopes that are not available in an environment.
- Updated dependencies with vulnerabilities

## [3.0.1] - 2025-02-06

### Changed

- Update to frodo-lib 3.0.1

## [3.0.0] - 2024-11-05

### Changed

- Update to frodo-lib 3.0.0
- Fixes and improvements to imports and exports:

  - Fixed an issue with file paths on the Windows version of Frodo that was causing errors on imports due to the differences between Windows and Linux file paths.
  - **_BREAKING_**: Updated IDM exports to be formatted the same as normal exports instead of as raw data by putting the raw data into a type object. This included changing the names of the exports to have a type ‘idm’, such as ‘sync.idm.json’ instead of ‘sync.json’, in order to reflect this change.
  - Added option to import an entity from a single file from the full export using the -f flag in the config import command.
  - Added option to do env substitution on single entity IDM exports/imports, and put logic for handling it all in Frodo-Lib
  - Added option to export/import all IDM entities to/from a single file using the -a flag
  - Added option to include or not include metadata in IDM exports
  - **_BREAKING_**: Updated exports for agents, secrets, and variables to have a singular rather than plural type to be more consistent with other exports (see frodo-lib PR for more information on this change)
  - Fixed a bug where the agent list command wouldn’t work if the agent had no status
  - Fixed a bug where oauth2 and managed applications were exported with the wrong type in a full export
  - Fixed a bug where journey imports weren’t working when importing using -D flag
  - Standardized file extraction since it is used in multiple places (namely scripts, sync mappings, and, in a future PR, servers).
  - Removed progress indicators for script, esv variable and esv secret describe commands since they caused Frodo to never terminate.
  - Improved config imports to be able to import individual files based on the file type in the name instead of on directory structure (although directory structure is still used to determine whether to import globally or to know which realm to import to).

## [2.1.0] - 2024-10-10

### Changed

- Update to frodo-lib 2.2.0

### Fixed

- \#445: Frodo now properly saves connection profiles and detects Advanced Identity Cloud deployment type.

## [2.0.6-2] - 2024-09-21

## [2.0.6-1] - 2024-09-09

## [2.0.6-0] - 2024-08-26

### Added

- Improve support for custom platform deployments (non-forgeops or customized forgeops)

  - \#429: Added options to support custom oauth2 clients used to obtain the access token for IDM API calls:

    - `--login-client-id <client-id>` Specify a custom OAuth2 client id to use a your own oauth2 client for IDM API calls in deployments of type "cloud" or "forgeops". Your custom client must be configured as a public client and allow the authorization code grant using the "openid fr:idm:\*" scope. Use the "--redirect-uri" parameter if you have configured a custom redirect uri (default: "<host>/platform/appAuthHelperRedirect.html").
    - `--login-redirect-uri <redirect-uri>` Specify a custom redirect URI to use with your custom OAuth2 client (efault: "<host>/platform/appAuthHelperRedirect.html").

    The above options can also be supplied through environment variables:

    - `FRODO_LOGIN_CLIENT_ID` OAuth2 client id for IDM API calls. Overridden by '--login-client-id' option.
    - `FRODO_LOGIN_REDIRECT_URI` Redirect Uri for custom OAuth2 client id. Overridden by '--login-redirect-uri' option.

  - \#359: Added an option to support custom IDM host URLs for all IDM API calls (e.g. platform deployments hosting AM and IDM on/in different DNS hosts/domains):

    - `--idm-host <idm-host>` IDM base URL, e.g.: <https://cdk.idm.example.com/myidm>. Use only if your IDM installation resides in a different domain and/or if the base path differs from the default "/openidm".

    The above option can also be supplied through an environment variable:

    - `FRODO_IDM_HOST` IDM base URL. Overridden by '--idm-host' option.

  **_Note:_** All the above options are also persisted in connection profiles so they only have to specified once and after that they come out of the connection profile.

### Changed

- Update to frodo-lib 2.1.2-0

## [2.0.5] - 2024-08-20

### Added

- Improvements to the `frodo script` commands:

  - Added the `-i`/`--script-id` option to import and export scripts by id.
  - Added the `--no-deps` option to not include library scripts in exports of single scripts. Similarly adds the option on single script imports using the same flag to not import library dependencies if so desired.

### Changed

- Update to frodo-lib 2.1.0

### Fixed

- Fixes to the handling of scripts in the `frodo script` commands and the `frodo config import` command:

  - Fixing many bugs related to script extraction. For example, there were certain cases where importing wouldn't function correctly due to being unable to find the extracted script(s). For exports, library scripts weren't being extracted correctly either. Therefore, an overhaul was done to try and help simplify the extraction process to that it can work for multiple scripts if dealing with library scripts both on export and import.
  - Fixing many errors in the watch option for script imports. One big one was if there were several scripts for a single json file (e.g. when exporting scripts with library scripts) that only one of the scripts would correctly be watched. This was fixed by creating mappings before watching begins to map extracted script files with their corresponding json files so it functions correctly.
  - Fixing a small bug with config imports where, if the working directory started with `.` or `./` it would usually fail due to being unable to locate the expected files it was looking for.

## [2.0.5-0] - 2024-08-16

## [2.0.4] - 2024-08-14

### Changed

- Better detection of homebrew vs binary vs NPM version

## [2.0.3] - 2024-08-14

### Chagned

- homebrew formula update so `frodo-cli-next` installs the latest (irrespective of stable or prerelease)

## [2.0.2] - 2024-08-06

### Changed

- Update to frodo-lib 2.0.2

### Fixed

- \#428: Frodo CLI now includes the `loglevel` dependency.

## [2.0.1] - 2024-08-05

### Fixed

- \#430: Frodo now properly supports exporting and importing of the email service with secondary configurations.

## [2.0.1-0] - 2024-07-27

## [2.0.0] - 2024-07-20

### Changed

#### Based on Frodo Library 2.x

[Frodo Library 2.x](https://github.com/rockcarver/frodo-lib?tab=readme-ov-file#frodo-library-2x---rockcarverfrodo-lib) greatly improves on its 1.x branch with more stabilty, more modules, token caching, automatic token refresh, better error handling, and more.

#### New and updated commands

| Command                                     |  Since  | Description                                                            |
| ------------------------------------------- | :-----: | ---------------------------------------------------------------------- |
| frodo admin                                 |  1.0.0  | Platform admin tasks.                                                  |
|  add-autoid-static-user-mapping             |  1.0.0  | Add AutoId static user mapping to enable dashboards.                   |
|  create-oauth2-client-with-admin-privileges |  1.0.0  | Create an oauth2 client with admin privileges.                         |
|  execute-rfc7523-authz-grant-flow           | `2.0.0` | Execute RFC7523 authorization grant flow.                              |
|  federation                                 |  1.0.0  | Manages admin federation configuration.                                |
|  generate-rfc7523-authz-grant-artefacts     | `2.0.0` | Generate RFC7523 authorization grant artefacts.                        |
|  get-access-token                           |  1.0.0  | Get an access token using client credentials grant type.               |
|  grant-oauth2-client-admin-privileges       |  1.0.0  | Grant an oauth2 client admin privileges.                               |
|  hide-generic-extension-attributes          |  1.0.0  | Hide generic extension attributes.                                     |
|  list-oauth2-clients-with-admin-privileges  |  1.0.0  | List oauth2 clients with admin privileges.                             |
|  list-oauth2-clients-with-custom-privileges |  1.0.0  | List oauth2 clients with custom privileges.                            |
|  list-static-user-mappings                  |  1.0.0  | List all subjects of static user mappings that are not oauth2 clients. |
|  remove-static-user-mapping                 |  1.0.0  | Remove a subject's static user mapping.                                |
|  repair-org-model                           |  1.0.0  | Repair org model.                                                      |
|  revoke-oauth2-client-admin-privileges      |  1.0.0  | Revoke admin privileges from an oauth2 client.                         |
|  show-generic-extension-attributes          |  1.0.0  | Show generic extension attributes.                                     |
|                                             |         |                                                                        |
| frodo agent                                 |  1.0.0  | Manage agents.                                                         |
|  delete                                     |  1.0.0  | Delete agents.                                                         |
|  describe                                   |  1.0.0  | Describe agents.                                                       |
|  export                                     |  1.0.0  | Export agents.                                                         |
|  gateway / ig                               |  1.0.0  | Manage gateway agents.                                                 |
|   delete                                    |  1.0.0  | Delete identity gateway agents.                                        |
|   describe                                  |  1.0.0  | Describe gateway agents.                                               |
|   export                                    |  1.0.0  | Export gateway agents.                                                 |
|  import                                     |  1.0.0  | Import gateway agents.                                                 |
|  list                                       |  1.0.0  | List gateway agents.                                                   |
|  import                                     |  1.0.0  | Import agents.                                                         |
|  java                                       |  1.0.0  | Manage java agents.                                                    |
|   delete                                    |  1.0.0  | Delete java agents.                                                    |
|   describe                                  |  1.0.0  | Describe java agents.                                                  |
|   export                                    |  1.0.0  | Export java agents.                                                    |
|   import                                    |  1.0.0  | Import java agents.                                                    |
|   list                                      |  1.0.0  | List java agents.                                                      |
|  list                                       |  1.0.0  | List agents.                                                           |
|  web                                        |  1.0.0  | Manage web agents.                                                     |
|   delete                                    |  1.0.0  | Delete web agents.                                                     |
|   describe                                  |  1.0.0  | Describe web agents.                                                   |
|   export                                    |  1.0.0  | Export web agents.                                                     |
|   import                                    |  1.0.0  | Import web agents.                                                     |
|   list                                      |  1.0.0  | List web agents.                                                       |
|                                             |         |                                                                        |
| frodo authn                                 | `2.0.0` | Manage authentication settings.                                        |
|  describe                                   | `2.0.0` | Describe authentication settings.                                      |
|  export                                     | `2.0.0` | Export authentication settings.                                        |
|  import                                     | `2.0.0` | Import authentication settings.                                        |
|                                             |         |                                                                        |
| frodo authz                                 |  1.0.0  | Manage authorization policies, policy sets, and resource types.        |
|  policy                                     |  1.0.0  | Manages authorization policies.                                        |
|   delete                                    |  1.0.0  | Delete authorization policies.                                         |
|   describe                                  |  1.0.0  | Describe authorization policies.                                       |
|   export                                    |  1.0.0  | Export authorization policies.                                         |
|   import                                    |  1.0.0  | Import authorization policies.                                         |
|   list                                      |  1.0.0  | List authorization policies.                                           |
|  set / policyset                            |  1.0.0  | Manage authorization policy sets.                                      |
|   delete                                    |  1.0.0  | Delete authorization policy sets.                                      |
|   describe                                  |  1.0.0  | Describe authorization policy sets.                                    |
|   export                                    |  1.0.0  | Export authorization policy sets.                                      |
|   import                                    |  1.0.0  | Import authorization policy sets.                                      |
|   list                                      |  1.0.0  | List authorization policy sets.                                        |
|  type                                       |  1.0.0  | Manage authorization resource types.                                   |
|   delete                                    |  1.0.0  | Delete authorization resource types.                                   |
|   describe                                  |  1.0.0  | Describe authorization resource types.                                 |
|   export                                    |  1.0.0  | Export authorization resource types.                                   |
|   import                                    |  1.0.0  | Import authorization resource types.                                   |
|   list                                      |  1.0.0  | List authorization resource types.                                     |
|                                             |         |                                                                        |
| frodo app / application                     | `2.0.0` | Old `app` renamed to `oauth`! Manage applications.                     |
|  delete                                     | `2.0.0` | Delete applications.                                                   |
|  export                                     | `2.0.0` | Export applications.                                                   |
|  import                                     | `2.0.0` | Import applications.                                                   |
|  list                                       | `2.0.0` | List applications.                                                     |
| frodo config                                | `2.0.0` | Manage full cloud configuration.                                       |
|  export                                     | `2.0.0` | Export full cloud configuration.                                       |
|  import                                     | `2.0.0` | Import full cloud configuration.                                       |
|                                             |         |                                                                        |
| frodo conn / connection                     |  1.0.0  | Manage connection profiles.                                            |
|  delete                                     |  1.0.0  | Delete connection profiles.                                            |
|  describe                                   |  1.0.0  | Describe connection profile.                                           |
|  list                                       |  1.0.0  | List connection profiles.                                              |
|  save / add                                 |  1.0.0  | Save connection profiles.                                              |
|                                             |         |                                                                        |
| frodo email                                 |  1.0.0  | Manage email templates and configuration.                              |
|  template                                   |  1.0.0  | Manage email templates.                                                |
|   export                                    |  1.0.0  | Export email templates.                                                |
|   import                                    |  1.0.0  | Import email templates.                                                |
|   list                                      |  1.0.0  | List email templates.                                                  |
|                                             |         |                                                                        |
| frodo esv                                   |  1.0.0  | Manage environment secrets and variables (ESVs).                       |
|  apply                                      |  1.0.0  | Apply pending changes to secrets and variables.                        |
|  secret                                     |  1.0.0  | Manages secrets.                                                       |
|   create                                    |  1.0.0  | Create secrets.                                                        |
|   delete                                    |  1.0.0  | Delete secrets.                                                        |
|   describe                                  |  1.0.0  | Describe secrets.                                                      |
|   export                                    | `2.0.0` | Export secrets.                                                        |
|   import                                    | `2.0.0` | Import secrets.                                                        |
|   list                                      |  1.0.0  | List secrets.                                                          |
|   set                                       |  1.0.0  | Set secret description.                                                |
|   version                                   |  1.0.0  | Manage secret versions.                                                |
|  variable                                   |  1.0.0  | Manage variables.                                                      |
|   create                                    |  1.0.0  | Create variables.                                                      |
|   delete                                    |  1.0.0  | Delete variables.                                                      |
|   describe                                  |  1.0.0  | Describe variables.                                                    |
|   export                                    | `2.0.0` | Export variables.                                                      |
|   import                                    | `2.0.0` | Import variables.                                                      |
|   list                                      |  1.0.0  | List variables.                                                        |
|   set                                       |  1.0.0  | Set variable description.                                              |
|                                             |         |                                                                        |
| frodo idm                                   |  1.0.0  | Manage IDM configuration.                                              |
|  count                                      |  1.0.0  | Count managed objects.                                                 |
|  export                                     |  1.0.0  | Export IDM configuration objects.                                      |
|  import                                     |  1.0.0  | Import IDM configuration objects.                                      |
|  list                                       |  1.0.0  | List IDM configuration objects.                                        |
|                                             |         |                                                                        |
| frodo idp                                   |  1.0.0  | Manage (social) identity providers.                                    |
|  export                                     |  1.0.0  | Export (social) identity providers.                                    |
|  import                                     |  1.0.0  | Import (social) identity providers.                                    |
|  list                                       |  1.0.0  | List (social) identity providers.                                      |
|                                             |         |                                                                        |
| frodo info                                  |  1.0.0  | Print versions and tokens.                                             |
|                                             |         |                                                                        |
| frodo journey                               |  1.0.0  | Manage journeys/trees.                                                 |
|  delete                                     |  1.0.0  | Delete journeys/trees.                                                 |
|  describe                                   |  1.0.0  | Describe journeys/trees.                                               |
|  disable                                    |  1.0.0  | Disable journeys/trees.                                                |
|  enable                                     |  1.0.0  | Enable journeys/trees.                                                 |
|  export                                     |  1.0.0  | Export journeys/trees.                                                 |
|  import                                     |  1.0.0  | Import journey/tree.                                                   |
|  list                                       |  1.0.0  | List journeys/trees.                                                   |
|  prune                                      |  1.0.0  | Prune orphaned configuration artifacts.                                |
|                                             |         |                                                                        |
| frodo log / logs                            |  1.0.0  | List/View Identity Cloud logs                                          |
|  fetch                                      |  1.0.0  | Fetch Identity Cloud logs.                                             |
|  key                                        |  1.0.0  | Manage Identity Cloud log API keys.                                    |
|  list                                       |  1.0.0  | List available ID Cloud log sources.                                   |
|  tail                                       |  1.0.0  | Tail Identity Cloud logs.                                              |
|                                             |         |                                                                        |
| frodo mapping                               | `2.0.0` | Manage IDM mappings.                                                   |
|  delete                                     | `2.0.0` | Delete IDM mappings.                                                   |
|  export                                     | `2.0.0` | Export IDM mappings.                                                   |
|  import                                     | `2.0.0` | Import IDM mappings.                                                   |
|  list                                       | `2.0.0` | List IDM mappings.                                                     |
|  rename                                     | `2.0.0` | Renames mappings from legacy to new naming scheme.                     |
|                                             |         |                                                                        |
| frodo oauth                                 | `2.0.0` | Renamed from `app`! Manage OAuth2 clients and providers.               |
|  client                                     | `2.0.0` | Manage OAuth2 clients.                                                 |
|   export                                    | `2.0.0` | Export OAuth2 clients.                                                 |
|   import                                    | `2.0.0` | Import OAuth2 clients.                                                 |
|   list                                      | `2.0.0` | List OAuth2 clients.                                                   |
|                                             |         |                                                                        |
| frodo realm                                 |  1.0.0  | Manage realms.                                                         |
|  add-custom-domain                          |  1.0.0  | Add custom domain (realm DNS alias).                                   |
|  describe / details                         |  1.0.0  | Describe realms.                                                       |
|  list                                       |  1.0.0  | List realms.                                                           |
|  remove-custom-domain                       |  1.0.0  | Remove custom domain (realm DNS alias).                                |
|                                             |         |                                                                        |
| frodo saml                                  |  1.0.0  | Manage SAML entity providers and circles of trust.                     |
|  cot                                        |  1.0.0  | Manage circles of trust.                                               |
|   export                                    |  1.0.0  | Export SAML circles of trust.                                          |
|   import                                    |  1.0.0  | Import SAML circles of trust.                                          |
|   list                                      |  1.0.0  | List SAML circles of trust.                                            |
|  delete                                     |  1.0.0  | Delete SAML entity providers.                                          |
|  describe                                   |  1.0.0  | Describe the configuration of an entity provider.                      |
|  export                                     |  1.0.0  | Export SAML entity providers.                                          |
|  import                                     |  1.0.0  | Import SAML entity providers.                                          |
|  list                                       |  1.0.0  | List SAML entity providers.                                            |
|  metadata                                   |  1.0.0  | SAML metadata operations.                                              |
|   export                                    |  1.0.0  | Export metadata.                                                       |
|                                             |         |                                                                        |
| frodo script                                |  1.0.0  | Manage scripts.                                                        |
|  delete                                     |  1.0.0  | Delete scripts.                                                        |
|  export                                     |  1.0.0  | Export scripts.                                                        |
|  import                                     |  1.0.0  | Import scripts.                                                        |
|  list                                       |  1.0.0  | List scripts.                                                          |
|                                             |         |                                                                        |
| frodo service                               |  1.0.0  | Manage AM services.                                                    |
|  delete                                     |  1.0.0  | Delete AM services.                                                    |
|  export                                     |  1.0.0  | Export AM services.                                                    |
|  import                                     |  1.0.0  | Import AM services.                                                    |
|  list                                       |  1.0.0  | List AM services.                                                      |
|                                             |         |                                                                        |
| frodo shell                                 | `2.0.0` | Launch the frodo interactive shell.                                    |
|                                             |         |                                                                        |
| frodo theme                                 |  1.0.0  | Manage themes.                                                         |
|  delete                                     |  1.0.0  | Delete themes.                                                         |
|  export                                     |  1.0.0  | Export themes.                                                         |
|  import                                     |  1.0.0  | Import themes.                                                         |
|  list                                       |  1.0.0  | List themes.                                                           |
|                                             |         |                                                                        |
| frodo help                                  |  1.0.0  | display help for command                                               |

#### Global support for `-D`, `--directory` to set the working directory

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

#### Secure Token Caching

Frodo CLI 2.x uses a secure token cache, which is active by default. The cache is tokenized and encrypted on disk, so it persists across CLI executions, dramatically decreasing authentication and token requests. You can disable the cache by either using the `--no-cache` option or by setting the `FRODO_NO_CACHE` environment variable.
You can change the default location of the cache file (`~/.frodo/TokenCache.json`) by setting the `FRODO_TOKEN_CACHE_PATH` environment variable.

#### Automatic Token Refresh

Frodo CLI 2.x automatically refreshes session and access tokens before they expire. Combined with the new token cache, the CLI maintains a set of valid tokens at all times.

## [2.0.0-70] - 2024-07-17

## [2.0.0-69] - 2024-07-15

### Added

- \#418: Developer: Frodo provides a framework for commands to indicate which deployment types they support.
- \#419: Developer: Updated command template with usage samples

### Changed

- Update to frodo-lib 2.0.0-95

## [2.0.0-68] - 2024-07-12

## [2.0.0-67] - 2024-07-11

### Added

- New commands to manage IDM mappings:

  - `frodo mapping`  Manage IDM mappings.
    - `delete`   Delete IDM mappings.
    - `export`   Export IDM mappings.
    - `import`   Import IDM mappings.
    - `list`     List IDM mappings.
    - `rename`   Renames mappings from the combined/default/legacy naming scheme (sync/\\<name>) to the separate/new naming scheme (mapping/\\<name>). To rename mappings from new back to legacy, use the -l, --legacy flag.

## [2.0.0-66] - 2024-07-10

### Added

- \#404: Frodo now saves the `-k`/`--insecure` option in connection profiles.

### Changed

- Update to frodo-lib 2.0.0-92

### Fixed

- \#400: Frodo now properly honors the `-k`/`--insecure` option and allows connecting to platform instances using self-signed certificates.

## [2.0.0-65] - 2024-07-06

### Add

- rockcarver/frodo-lib#387: Support import of ESVs (variables and secrets). Frodo now supports importing ESV variables and secrets with two new commands:
  - `frodo esv variable import`
  - `frodo esv secret import`

- Frodo now supports exporting (and importing) of ESV secret values. To leave stuartship of secret values with the cloud environment where they belong, frodo will always encrypt values using either encryption keys from the source environment (default) or the target environment (export option). Frodo will never export secrets in the clear. However, frodo supports importing clear values (as well as importing encrypted values). Use these new commands and parameters to export/import variables and secrets including secret values:

  - New parameters for existing `frodo esv secret export` and `frodo config export` commands:

    - `--include-active-values` Include the currently active (and loaded) secret value in the export. By default, secret values are encrypted server-side in the environment they are exported from. Use `--target <host url>` to have another environment perform the encryption.

    - `--target <host url>` Host URL of the environment to perform secret value encryption. The URL must resolve to an existing connection profile. Use this option to generate an export that can be imported into the target environment without requiring admin access to the source environment.

  - New `frodo esv secret import` and updated existing `frodo config import` command and note-worthy parameters:

    - `--include-active-values` Import any secret values contained in the import file. By default, secret values are encrypted server-side in the environment they are exported from. Use `--source <host url>` to import a file exported from another environment than the one you are importing to.

    - `--source <host url>` Host URL of the environment which performed secret value encryption. The URL must resolve to an existing connection profile. Use this option to import a file that was exported from a different source environment than the one you are importing to.

- rockcarver/frodo-lib#394: Support for `base64aes` encoding for ESV secrets

### Changed

- Update to frodo-lib 2.0.0-91

## [2.0.0-64] - 2024-06-21

### Changed

- Update to frodo-lib 2.0.0-88
- Updated binary distribution node.js version to 20
- Pipeline hygiene

## [2.0.0-63] - 2024-06-20

### Changed

- Update to frodo-lib 2.0.0-87

## [2.0.0-62] - 2024-06-19

### Changed

- Update to frodo-lib 2.0.0-86
- rockcarver/frodo-lib#402: Library scripts are now treated as dependencies during script and journey exports and imports.

## [2.0.0-61] - 2024-06-12

### Fixed

- rockcarver/homebrew-frodo-cli#6: Homebrew formula now properly installs frodo

## [2.0.0-60] - 2024-06-11

### Changed

- Update to frodo-lib 2.0.0-85
- Update dependencies

## [2.0.0-59] - 2024-05-21

### Changed

- Update to frodo-lib 2.0.0-83

## [2.0.0-58] - 2024-05-08

## [2.0.0-57] - 2024-05-02

## [2.0.0-56] - 2024-05-01

## [2.0.0-55] - 2024-04-09

### Changed

- Update to frodo-lib 2.0.0-77

### Fixed

- Improved filtering out secrets from recordings
- rockcarver/frodo-lib#392: Implemented error handling pattern for methods with unusual amounts of REST calls like `frodo.config.exportFullConfiguration` and `frodo.config.importFullConfiguration` used in the `frodo config import` and `frodo config export` commands

## [2.0.0-54] - 2024-04-01

### Changed

- Update to frodo-lib 2.0.0-75

### Fixed

- rockcarver/frodo-lib#397: Service accounts now use the proper scopes when created using the `frodo conn save` command

## [2.0.0-53] - 2024-03-24

### Changed

- Update to frodo-lib 2.0.0-74

### Fixed

- rockcarver/frodo-lib#391: Frodo now creates service accounts with all allowed scopes:
  - `fr:am:*`
  - `fr:idc:analytics:*`
  - `fr:autoaccess:*`
  - `fr:idc:certificate:*`
  - `fr:idc:certificate:read`
  - `fr:idc:content-security-policy:*`
  - `fr:idc:custom-domain:*`
  - `fr:idc:esv:*`
  - `fr:idc:esv:read`
  - `fr:idc:esv:restart`
  - `fr:idc:esv:update`
  - `fr:idm:*`
  - `fr:iga:*`
  - `fr:idc:promotion:*`
  - `fr:idc:release:*`
  - `fr:idc:sso-cookie:*`

## [2.0.0-52] - 2024-03-23

### Changed

- Update to frodo-lib 2.0.0-73

### Fixed

- \#378: `--llt` option of `frodo admin create-oauth2-client-with-admin-privileges` now works properly again
- \#377: Frodo CLI now properly handles FrodoErrors thrown by frodo-lib

## [2.0.0-51] - 2024-02-10

## [2.0.0-50] - 2024-02-07

## [2.0.0-49] - 2024-02-05

### Fixed

- \#363: Doing a full export of IDM from FIDC started hanging between v2.0.0.32 and v2.0.0.33

## [2.0.0-48] - 2024-02-01

## [2.0.0-47] - 2024-01-21

### Added

- \#360: Frodo now saves the deployment type in connection profiles.

### Changed

- Update to frodo-lib 2.0.0-67

## [2.0.0-46] - 2024-01-20

## [2.0.0-45] - 2024-01-16

### Added

- pem and base64hmac encoded ESV secret creation

## [2.0.0-44] - 2024-01-11

## [2.0.0-43] - 2024-01-05

## [2.0.0-42] - 2024-01-04

## [2.0.0-41] - 2023-12-23

## [2.0.0-40] - 2023-12-22

## [2.0.0-39] - 2023-12-19

## [2.0.0-38] - 2023-12-16

## [2.0.0-37] - 2023-12-06

## [2.0.0-36] - 2023-12-01

## [2.0.0-35] - 2023-11-30

## [2.0.0-34] - 2023-11-29

## [2.0.0-33] - 2023-11-26

## [2.0.0-32] - 2023-11-21

## [2.0.0-31] - 2023-11-17

## [2.0.0-30] - 2023-11-04

### Added

- \#283: Support for authentication settings:

  - `frodo authn`  Manage authentication setting.
    - `describe` List authentication settings.
    - `export`   Export authentication settings.
    - `import`   Import authentication settings.

  Examples:

  - Describe authentication settings:<br>
    `frodo authn describe <myTenant> <realm>`

    `frodo authn describe --json <myTenant> <realm>`

    `frodo authn describe <myTenant> <username> <password>`

  - Describe authentication settings in machine-readable format (json):<br>
    `frodo authn describe --json <myTenant> <realm>`

    `frodo authn describe --json <myTenant> <realm> <username> <password>`

  - Export authentication settings to file:<br>
    `frodo authn export <myTenant> <realm>`

    `frodo authn export <myTenant> <realm> <username> <password>`

  - Import authentication settings from file:<br>
    `frodo authn import -f alphaRealm.authentication.settings.json <myTenant> <realm>`

    `frodo authn import -f alphaRealm.authentication.settings.json <myTenant> <realm> <username> <password>`<br>

  - \#217: Support `--json` with `frodo esv variable describe`.

## [2.0.0-29] - 2023-11-02

### Added

- rockcarver/frodo-lib#53: Frodo Library now uses a file-based secure token cache to persist session and access tokens for re-use. The cached tokens are protected by the credential that was used to obtain them. Session tokens are encrypted using the hashed password as the master key, access tokens are encrypted using the hashed JWK private key as the master key. Therefore only users and processes with the correct credentials can access the tokens in the cache.

  - The new default behavior is for Frodo CLI to use the new token cache for all applicable commands.
  - A new global option `--no-cache` has been added to all commands to allow disabling the cache for indiviual invocations.
  - A new environment variable `FRODO_NO_CACHE` is available to globally turn off token caching.
  - A new environment variable `FRODO_TOKEN_CACHE_PATH` is available to instruct Frodo Library to use a non-default token cache file.

- rockcarver/frodo-lib#340: Frodo Library now autotomatically refreshes expired session and access tokens.

  - The new default behavior is for Frodo CLI to automatically refresh tokens. This will only ever be noticeable during long-running operations like `frodo journey prune` or `frodo esv apply` that can take longer than 15 mins to complete.

### Fixed

- \#316: Frodo Library now properly exports scripts referenced by the `Device Match` node if the `Use Custom Matching Script` option is selected.

## [2.0.0-28] - 2023-10-25

## [2.0.0-27] - 2023-10-22

## [2.0.0-26] - 2023-10-19

## [2.0.0-25] - 2023-10-19

## [2.0.0-24] - 2023-10-15

## [2.0.0-23] - 2023-10-14

## [2.0.0-22] - 2023-10-12

## [2.0.0-21] - 2023-10-11

## [2.0.0-20] - 2023-10-11

## [2.0.0-19] - 2023-10-02

## [2.0.0-18] - 2023-10-02

## [2.0.0-17] - 2023-09-29

## [2.0.0-16] - 2023-09-08

## [2.0.0-15] - 2023-08-17

### Fixed

- \#276: `frodo script import -A --watch <tenant>` (preceeded by `frodo script export -A --extract <tenant>`) now properly reports errors like scripts not compiling or any REST errors but won't exit the watch thread but keep on watching and pushing local changes to `<tenant>`.

## [2.0.0-14] - 2023-08-16

### Changed

- Update to frodo-lib 2.0.0-21

## [2.0.0-13] - 2023-07-31

## [2.0.0-12] - 2023-07-18

### Fixed

- rockcarver/frodo-lib#272: Added new `--variable-type` parameter to `frodo esv variable create` command.

## [2.0.0-11] - 2023-07-17

## [2.0.0-10] - 2023-07-05

## [2.0.0-9] - 2023-07-05

## [2.0.0-8] - 2023-07-05

## [2.0.0-7] - 2023-06-23

## [2.0.0-6] - 2023-06-22

### Added

- \#251: Support for Identity Cloud admin federation configuration:

  - `frodo admin federation` Manage admin federation configuration.
    - `export`             Export admin federation providers.
    - `import`             Import admin federation providers.
    - `list`               List admin federation providers.

  Examples:

  - List all configured admin federation providers:<br>
    `frodo admin federation list <myTenant>`

    `frodo admin federation list <myTenant> <username> <password>`
  - Export all admin federation providers to a single file:<br>
    `frodo admin federation export -a <myTenant>`

    `frodo admin federation export -a <myTenant> <username> <password>`
  - Import all admin federation providers from a single file:<br>
    `frodo admin federation import -a -f allProviders.admin.federation.json <myTenant>`

    `frodo admin federation import -a -f allProviders.admin.federation.json <myTenant> <username> <password>`<br>

  **_Note_**: Only tenant admins can perform admin federation operations, service accounts do not have the required privileges. Therefore, the connection profile used must contain username and password or they must be provided through command arguments.

### Changed

- Update to frodo-lib 2.0.0-8

## [2.0.0-5] - 2023-06-21

## [2.0.0-4] - 2023-06-16

## [2.0.0-3] - 2023-06-15

## [2.0.0-2] - 2023-06-15

## [2.0.0-1] - 2023-06-15

## [1.0.0] - 2023-06-30

### Added

- MacOS binaries are now signed and notarized and run without security exceptions.
- \#251: Support for Identity Cloud admin federation configuration:

  - `frodo admin federation` Manage admin federation configuration.
    - `export`             Export admin federation providers.
    - `import`             Import admin federation providers.
    - `list`               List admin federation providers.

  Examples:

  - List all configured admin federation providers:<br>
    `frodo admin federation list <myTenant>`

    `frodo admin federation list <myTenant> <username> <password>`
  - Export all admin federation providers to a single file:<br>
    `frodo admin federation export -a <myTenant>`

    `frodo admin federation export -a <myTenant> <username> <password>`
  - Import all admin federation providers from a single file:<br>
    `frodo admin federation import -a -f allProviders.admin.federation.json <myTenant>`

    `frodo admin federation import -a -f allProviders.admin.federation.json <myTenant> <username> <password>`<br>

  **_Note_**: Only tenant admins can perform admin federation operations, service accounts do not have the required privileges. Therefore, the connection profile used must contain username and password or they must be provided through command arguments.

### Changed

- Update to frodo-lib 1.1.0

## [1.0.0-1] - 2023-06-30

## [0.24.6-3] - 2023-06-30

## [0.24.6-2] - 2023-06-22

## [0.24.6-1] - 2023-06-22

### Added

- \#251: Support for Identity Cloud admin federation configuration:

  - `frodo admin federation` Manage admin federation configuration.
    - `export`             Export admin federation providers.
    - `import`             Import admin federation providers.
    - `list`               List admin federation providers.

  Examples:

  - List all configured admin federation providers:<br>
    `frodo admin federation list <myTenant>`

    `frodo admin federation list <myTenant> <username> <password>`
  - Export all admin federation providers to a single file:<br>
    `frodo admin federation export -a <myTenant>`

    `frodo admin federation export -a <myTenant> <username> <password>`
  - Import all admin federation providers from a single file:<br>
    `frodo admin federation import -a -f allProviders.admin.federation.json <myTenant>`

    `frodo admin federation import -a -f allProviders.admin.federation.json <myTenant> <username> <password>`<br>

  **_Note_**: Only tenant admins can perform admin federation operations, service accounts do not have the required privileges. Therefore, the connection profile used must contain username and password or they must be provided through command arguments.

### Changed

- Update to frodo-lib 1.0.1-0

## [0.24.6-0] - 2023-06-21

## [0.24.5] - 2023-05-31

### Added

- Fixed build pipeline for automatically updating homebrew formula

## [0.24.4] - 2023-05-30

### Added

- Build pipeline for automatically updating homebrew formula for frodo-cli

## [0.24.4-2] - 2023-05-30

## [0.24.4-1] - 2023-05-29

## [0.24.4-0] - 2023-05-29

## [0.24.3] - 2023-05-25

### Changed

- Update to frodo-lib 0.19.2

## [0.24.2] - 2023-05-22

### Added

- Support for authorization policies, policy sets, and resource types through new `authz` commands:

  - `frodo authz type`    Manage authorization resource types.
    - `delete`          Delete authorization resource types.
    - `describe`        Describe authorization resource types.
    - `export`          Export authorization resource types.
    - `import`          Import authorization resource types.
    - `list`            List authorization resource types.
  - `frodo authz set`     Manage authorization policy sets.
    - `delete`          Delete authorization policy sets.
    - `describe`        Describe authorization policy sets.
    - `export`          Export authorization policy sets.
    - `import`          Import authorization policy sets.
    - `list`            List authorization policy sets.
  - `frodo authz policy`  Manage authorization policies.
    - `delete`          Delete authorization policies.
    - `describe`        Describe authorization policies.
    - `export`          Export authorization policies.
    - `import`          Import authorization policies.
    - `list`            List authorization policies.

  Examples:

  - Export a whole policy set including policies and resource types:<br>
    `frodo authz set export -i <myPolicySet> <myTenant>`
  - Import a whole policy set including dependencies exported using the previous example:<br>
    `frodo authz set import -f <myPolicySet>.policyset.authz.json <myTenant>`
  - Remove a whole policy set with all its policies:<br>
    `frodo authz set delete -i <myPolicySet> <myTenant>`
  - Export all policies in a policy set including dependencies:<br>
    `frodo authz policy export -a --set-id <myPolicySet> <myTenant>`
  - Import all policies into another policy set in another tenant:<br>
    `frodo authz policy import -a --set-id <myOtherPolicySet> -f <>.policy.authz.json <myOtherTenant>`<br>
    **_Note_**: Policy IDs/names have to be unique within the realm. Therefore you cannot export all policies from one policy set and import them into another policy set in the same realm without deleting the original policy set first.

  Notes:

  - Use the new `--prereqs` option with the `authz set/policy import/export` commands to include structural prerequisites like resource types and policy sets.
  - Use the new `--json` option with all `describe` sub-commands:<br>
    `frodo authz type describe --json -n URL <myTenant>`<br>
    `frodo authz type describe --json -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 <myTenant>`<br>
    `frodo authz set describe --json -i <myPolicySet> <myTenant>`<br>
    `frodo authz policy describe --json -i <myPolicy> <myTenant>`

### Changed

- Update to frodo-lib 0.19.1
- Update dependencies
- Changes based on rockcarver/frodo-lib#234 (code refactoring) and updated frodo-lib:
  - Added support for `-A` and `-a` options to `frodo app import` command
  - Added support for `--no-deps` option to `frodo app export` and `frodo app import` commands

### Fixed

- \#214: Fixed a regression introduced in #186, which 'swallowed' `frodo` command exit codes and resulted in always exiting with 0 even if a `frodo` command returned with a different exit code.

## [0.24.1] - 2023-05-22 [YANKED]

## [0.24.1-0] - 2023-05-22 [YANKED]

## [0.24.0] - 2023-05-21 [YANKED]

## [0.23.1-8] - 2023-05-21

## [0.23.1-7] - 2023-05-18

## [0.23.1-6] - 2023-05-17

## [0.23.1-5] - 2023-05-17

## [0.23.1-4] - 2023-04-20

### Changed

- Update to frodo-lib 0.18.9-4

## [0.23.1-3] - 2023-04-18

### Changed

- Update to frodo-lib 0.18.9-3
- Changes based on rockcarver/frodo-lib#234 (code refactoring) and updated frodo-lib:
  - Added support for `-A` and `-a` options to `frodo app import` command
  - Added support for `--no-deps` option to `frodo app export` and `frodo app import` commands
- \#213: More debug logging for connection profile lookup by a unique substring. Use --debug to see the additional output. This is not yet a solution for #213 but should help identify the root cause.
- \#216: More debug logging for the 2fa process and proper detection of unsupported webauthn factor.

### Fixed

- \#214: Fixed a regression introduced in #186, which 'swallowed' `frodo` command exit codes and resulted in always exiting with 0 even if a `frodo` command returned with a different exit code.

## [0.23.1-2] - 2023-03-28

### Changed

- Update to frodo-lib 0.18.9-1

## [0.23.1-1] - 2023-03-23

### Added

- \#213: More debug logging for connection profile lookup by a unique substring. Use --debug to see the additional output. This is not yet a solution for #213 but should help identify the root cause.
- \#216: More debug logging for the 2fa process and proper detection of unsupported webauthn factor.

### Changed

- Update to frodo-lib 0.18.9-0

## [0.23.1-0] - 2023-02-27

## [0.23.0] - 2023-02-17

### Added

- \#186: Support node 19 when running as npm and when developing. Binaries are still built using node 18 until our package manager supports node 19.

### Changed

- Update to frodo-lib 0.18.8

### Fixed

- \#115: Running frodo as an npm package no longer requires the `-S` option of the `env` shell command, which caused issued on Linux distributions with older version of `coreutils` like `CentOS Linux 7` and other Redhat-based distributions.

## [0.22.3] - 2023-02-16

### Changed

- Update to frodo-lib 0.18.7
- Update dependencies

## [0.22.2] - 2023-02-15

### Fixed

- \#203: Frodo no longer outputs cosmetic error messages when exporting IDM config.

## [0.22.1] - 2023-02-14

### Changed

- Update to frodo-lib 0.18.5

### Fixed

- \#196 and #197: Frodo now properly detects Encore environments as ForgeOps environments and obtains an access token for IDM APIs.

## [0.22.0] - 2023-02-13

### Added

- The `frodo conn save` command now supports the following new options to manage log API keys:
  1. `--log-api-key [key]` Log API key. If specified, must also include `--log-api-secret`. Ignored with `--no-log-api`.
  2. `--log-api-secret [secret]` Log API secret. If specified, must also include `--log-api-key`. Ignored with `--no-log-api`.
  3. `--no-log-api` Do not create and add log API key and secret.

### Changed

- Update to frodo-lib 0.18.4
- The `frodo conn save` command no longer supports providing log API key and secret as arguments but requires the use of the new options `--log-api-key` and `--log-api-secret`.

### Fixed

- \#195: Frodo again creates log API keys on first use of any of the `frodo logs` sub-commands `list`, `tail`, or `fetch` and a connection profile without an API key.

## [0.21.1] - 2023-01-27

### Changed

- Update to frodo-lib 0.18.3
- \#192: Better error handling and reporting in frodo-cli

## [0.21.0] - 2023-01-25

### Added

- \#52: Added new developer options for `script export` and `script import` commands:

  - `frodo script export`:
    - `-x`, `--extract`: Extract the script from the exported file, and save it to a separate file. Ignored with `-n` or `-a`.
  - `frodo script import`:

    - `-w`, `--watch`: Watch for changes to the script files and import the scripts automatically when the file changes. Can only be used with `-A`. (default: false)

      **_Note:_** This new option only applies if the export was generated with the new `--extract` option!

### Changed

- Updated to frodo-lib 0.18.2

### Fixed

- \#190: Frodo now properly imports previously exported saml providers.

## [0.20.2-0] - 2023-01-24

## [0.20.1] - 2023-01-20

### Changed

- Updated to frodo-lib 0.18.1
- Include service account name in `frodo conn list -l` and `frodo conn describe <host>` output.
- Add missing service account name when running `frodo conn save <host>`.
- Add tenant name to beginning of output of all `frodo logs` sub-commands: `fetch`, `list`, `tail`.

### Fixed

- \#176: frodo logs fetch end timestamp ignored

## [0.20.1-1] - 2023-01-16

## [0.20.1-0] - 2023-01-15

### Fixed

- \#176: frodo logs fetch end timestamp ignored

## [0.20.0] - 2023-01-13

### Added

- Full support for Identity Cloud Service Accounts across all commands. Three options to leverage service accounts:

  1. Connection profiles for daily CLI usage:

     For daily admin and development tasks, using the new `frodo conn save` command (see details under next bullet) is the easiest way to get going with service accounts. To migrate an existing connection profile to service accounts and automatically create a service account for your tenant admin, simply issue the following command:

         % frodo conn save service-accounts
         Connected to https://openam-service-accounts.forgeblocks.com/am [alpha] as user volker.scheuber@forgerock.com
         Created and added service account Frodo-SA-1673586189578 with id 99c04bba-7213-463b-9a27-ceafa8a95734 to profile.
         Saved connection profile https://openam-service-accounts.forgeblocks.com/am
         %

     Then validate your connection profile is using the new service account:

         % frodo info service-accounts
         Connected to https://openam-service-accounts.forgeblocks.com/am [alpha] as service account Frodo-SA-1673586189578 [99c04bba-7213-463b-9a27-ceafa8a95734]

         Host URL       │https://openam-service-accounts.forgeblocks.com/am
         AM Version     │7.3.0-2022-10-SNAPSHOT Build 9a1793c301ef579705e59b66ce57587f553e915f (2022-December-13 10:05)
         Subject (Type) │Frodo-SA-1673586189578 [99c04bba-7213-463b-9a27-ceafa8a95734] (Service Account)
         Deployment Type│cloud
         Cookie Name    │e8b2bd07d5440d3
         Immutable      │false
         Locked         │false
         Region         │us-west1
         Tier           │other

         Bearer token:
         eyJ0eXAiOiJKV1QiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2IiwiYWxnIjoiZGlyIn0..JD1iu64iGZZoGNwEr-iF2w.af-0-UDDOdusAETjw9YE3YnjOPr6TrdQrBLcl1lxf5RpNThfRhD08xvu1WtJbUZgvjbWdajECEFJfnEinnrUdpe9l0tHU6gAxDrRmu9hAjt0AB3PFSk9BE5SlwvaGoW5vrF4oH0IYtuv4899hFF8KGNYUtou143xmSrsLH37862YiAeiRKtjaQsVUrdbDPAFnKgGRxJIiXp-UE0ZCQQGSqm-Gj0AqVvo-Piib9THrEbbJCzdc00RPaCU2Ra1DH9PDid7ix-zfuind5IgEXxA8XwBM7kSEkiDLUWZ8EaFhn6YXwIHjXetacgYvvDaUav2Fq5baIitnG_LIrCm32XzcDkVnph4mVklBwfbQbWE6BGXEVLK-QLdDupaQw-bic-yVs2d7PBk2y70gbChHCQOm6-MepkYznP4wKoRR1gkqCdl51QIp-tsFB5K2plrKXiwsfHlHKfFKmsbdQUmH7xJFZQRhAtR_pKm-vHPOrPfBh0VbAdLRSkSeOZUABFH56X3gwXIpG_zuH42bQQkM9AlkB-lZrLf4jN0zFq-2ZN-zDgRR9h6qiiD3p9BDmFfaorUDTfFSrfaKas7OIp5ooW8Kqpv28RRtRtvfex0vT_kRbWl5R08MPWZDKZbx4IMyuun-2pYJ-F2-dvfA4A-jRvWIvC6jTUTu-RZZ0Yw1F2lgwFOVbmpMmG2uGHp5GceWePsZ34FVtJuaTd5D-uq_FoAb3HQ7FGEgUMJN_q82hCCX3URv_ocbFMjYwctdUqV_Ed-__A_9lbHHr8D2Uw_Qo0mwku7qwNBTS0-OcrwDvBOJohzRbpbfim-Sq2UzV9SBzzXNK7sMft1pNfu2-saOwPfy6SE0u42-HDqxE9t4MkklSroPY0oDUxO58ET8LXnewGhC9Tt0XTk6WA2rNLcNirhFqdmtKgfrSMQ_t22_DQEDwXpXqtHGmDoltJe7x_6Ofh0W5l7_A71MoHeFpVa_AHpHybnaF4fvUbD284wOV8i22SqrUKuHoJ3o6_g5JlhvMCvb4OZQ-ltxSf98aPsB9nCSthYg5-GkiR_r5mK1w9gZkBTXfYs0qC8-zYEQb4WNiI9.2JGMj9iW6YD-RE_dGkL7_w
         %

     Once you have verified that your service account works, go ahead and enable MFA for your tenant admin account!

  2. CLI parameters:

     All commands support the following new options to use service accounts:

     - `--sa-id <uuid>` Service account's uuid. If specified, must also include `--sa-jwk-file`.
     - `--sa-jwk-file <file>` File containing the service account's java web key (jwk). Jwk must contain private key! If specified, must also include `--sa-id`.

     This is a great way to leverage the nice UI to create and manage service accounts and then use one of the accounts with Frodo.

  3. Environment variables for CI/CD

     For CI/CD pipelines, environment variables are preferable over command line parameters, because they are not visible in system logs:

     - `FRODO_SA_ID`: Service account's uuid. If set, must also set `FRODO_SA_JWK`.
     - `FRODO_SA_JWK`: Service account's java web key (jwk) as single-line string. Jwk must contain private key! If set, must also set `FRODO_SA_ID`.

- \#143: Support Identity Cloud Service Accounts in `frodo conn save|add` command

  1. The `frodo conn add` command is renamed to `frodo conn save` and `add` is added as an alias for backwards compatibility.
  2. The `frodo conn save` command supports the following new options to manage service accounts:
     1. `--sa-id <uuid>` Service account's uuid. If specified, must also include `--sa-jwk-file`. Ignored with `--no-sa`.
     2. `--sa-jwk-file <file>` File containing the service account's java web key (jwk). Jwk must contain private key! If specified, must also include `--sa-id`. Ignored with `--no-sa`.
     3. `--no-sa` Do not add service account.
  3. The existing `--no-validate` option also applies to service account operations, allowing to add service account configuration to a connection profile without validating it, typical use case is an offline situation.
  4. The `frodo conn save` command automatically creates a new service account and adds it to an existing ID Cloud profile without service account or to a new ID Cloud profile. It does not do that if the `--no-sa` option is supplied.
     1. If `--sa-id` and `--sa-jwk-file` are supplied, `frodo conn save` adds the existing service account specified by those two parameters to the profile instead of creating a new service account.
     2. The `frodo conn save` command checks if the ID Cloud tenant supports service accounts before performing any service account operations.
  5. The `frodo conn save` command validates service account configuration unless the `--no-validate` options is supplied.

- Add support for additional environment variables:

  - `FRODO_SA_ID`: Service account's uuid. If set, must also set `FRODO_SA_JWK`.
  - `FRODO_SA_JWK`: Service account's java web key (jwk) as single-line string. Jwk must contain private key! If set, must also set `FRODO_SA_ID`.
  - `FRODO_AUTHENTICATION_SERVICE=journey`: Specify a login journey for frodo to use.
  - `FRODO_MOCK=1`: Enable mocking. If enabled, frodo-lib replays recorded API responses instead of connecting to a platform instance.
  - `FRODO_POLLY_LOG_LEVEL=info`: Frodo mock engine log level (`trace`, `debug`, `info`, `warn`, `error`, `silent`). This is helpful for troubleshooting the mock capability, only.

  Environment variables added in 0.19.0:

  - `FRODO_HOST`
  - `FRODO_REALM`
  - `FRODO_USERNAME`
  - `FRODO_PASSWORD`
  - `FRODO_SA_ID`
  - `FRODO_SA_JWK`
  - `FRODO_LOG_KEY`
  - `FRODO_LOG_SECRET`
  - `FRODO_DEBUG`

- Enhanced the `frodo info` command to give more details for Identity Cloud tenants.

- Warn if IDM connector servers are offline

- Add mock mode for library to allow unit testing of clients using the library, like frodo-cli. This initial release contains minimal mock data. Enable mock mode using `FRODO_MOCK=1`.

- Updated list of contributors in package.json

- \#166: Add linux arm64 binary builds

### Changed

- Updated to frodo-lib 0.18.0
- More automated testing

### Fixed

- \#164: Frodo now properly exports scripts with special chars in name
- \#161: Frodo now properly adds connection profiles with log credentials

## [0.19.5-2] - 2023-01-13

## [0.19.5-1] - 2023-01-12

## [0.19.5-0] - 2023-01-12

## [0.19.4] - 2023-01-09

## [0.19.3] - 2023-01-07

## [0.19.3-3] - 2023-01-07

## [0.19.3-2] - 2023-01-05

## [0.19.3-1] - 2022-12-31

## [0.19.3-0] - 2022-12-31

## [0.19.2] - 2022-12-30

## [0.19.1] - 2022-12-20

### Fixed

- \#161: Frodo now properly allows adding connection profiles with log credentials

## [0.19.0] - 2022-12-18

### Added

- \#154: Allow all connection parameters to be supplied using environment variables for secure CI/CD:
  - `FRODO_HOST`
  - `FRODO_REALM`
  - `FRODO_USERNAME`
  - `FRODO_PASSWORD`
  - `FRODO_SA_ID`
  - `FRODO_SA_JWK`
  - `FRODO_LOG_KEY`
  - `FRODO_LOG_SECRET`
  - `FRODO_DEBUG` - set to any value to enable debug logging, e.g. `FRODO_DEBUG=1 frodo info tenant-name`
- \#143: Support Identity Cloud Service Accounts in `frodo conn save|add` command
  1. The `frodo conn add` command is renamed to `frodo conn save` and `add` is added as an alias for backwards compatibility.
  2. The `frodo conn save` command supports the following new options to manage service accounts:
     1. `--sa-id <uuid>` Service account's uuid. If specified, must also include `--sa-jwk-file`. Ignored with `--no-sa`.
     2. `--sa-jwk-file <file>` File containing the service account's java web key (jwk). Jwk must contain private key! If specified, must also include `--sa-id`. Ignored with `--no-sa`.
     3. `--no-sa` Do not add service account.
  3. The existing `--no-validate` option also applies to service account operations, allowing to add service account configuration to a connection profile without validating it, typical use case is an offline situation.
  4. The `frodo conn save` command automatically creates a new service account and adds it to an existing ID Cloud profile without service account or to a new ID Cloud profile. It does not do that if the `--no-sa` option is supplied.
     1. If `--sa-id` and `--sa-jwk-file` are supplied, `frodo conn save` adds the existing service account specified by those two parameters to the profile instead of creating a new service account.
     2. The `frodo conn save` command checks if the ID Cloud tenant supports service accounts before performing any service account operations.
  5. The `frodo conn save` command validates service account configuration unless the `--no-validate` options is supplied.
- \#101: Added new `frodo service` set of commands to manage AM realm services (`baseurl`, `DataStoreService`, `oauth-oidc`, `policyconfiguration`, `selfServiceTrees`, `SocialIdentityProviders`, `validation`, etc.) and global services (e.g. `CorsService`, `dashboard`, etc.).
  frodo service
  delete Delete AM services.
  export Export AM services.
  import Import AM services.
  list List AM services.
- Added new `frodo idm import` command.
- \#98: Add support for Agents / Gateways
  frodo agent Manage agents.
  delete Delete agents of any type.
  describe Describe agents of any type.
  export Export agents of any type.
  import Import agents of any type.
  list List agents of any type.
  gateway Manage gateway agents.
  delete Delete gateway agents.
  describe Describe gateway agents.
  export Export gateway agents.
  import Import gateway agents.
  list List gateway agents.
  java Manage java agents.
  delete Delete java agents.
  describe Describe java agents.
  export Export java agents.
  import Import java agents.
  list List java agents.
  web Manage web agents.
  delete Delete web agents.
  describe Describe web agents.
  export Export web agents.
  import Import web agents.
  list List web agents.
- Added `--raw` option to `frodo saml import` and `frodo saml export` commands. The new option uses the classic (pre 7.0.0) SAML REST APIs. This allows Frodo to export and import SAML entity providers from pre 7 platform instances.
- New default options `--verbose`, `--debug`, and `--curlirize` for all commands

### Changed

- Updated to frodo-lib 0.17.0
- \#110: Migrate from .frodorc to Connections.json
- Ongoing refactoring of code base:
  - Refactored Email Template and Theme functionality in lib to remove fs operations
  - \#93: Move cli functions from frodo-lib to frodo-cli
- More automated testing

### Fixed

-

## [0.18.2-18] - 2022-12-17

## [0.18.2-17] - 2022-12-14

## [0.18.2-16] - 2022-12-14

## [0.18.2-15] - 2022-12-12

## [0.18.2-14] - 2022-12-10

## [0.18.2-13] - 2022-12-01

## [0.18.2-12] - 2022-11-29

## [0.18.2-11] - 2022-11-26

## [0.18.2-10] - 2022-11-23

## [0.18.2-9] - 2022-11-22

- \#110: Migrate from .frodorc to Connections.json
- Refactored Email Template and Theme functionality in lib to remove fs operations

## [0.18.2-8] - 2022-11-22

## [0.18.2-7] - 2022-11-21

## [0.18.2-6] - 2022-11-16

## [0.18.2-5] - 2022-11-16

## [0.18.2-4] - 2022-11-10

## [0.18.2-3] - 2022-11-09

## [0.18.2-2] - 2022-11-09

## [0.18.2-1] - 2022-10-24

## Fixed

- \#99: frodo logs does not show help on error.
- \#108: Use default values for begin and end timestamps for logs fetch

## [0.18.2-0] - 2022-10-22

## [0.18.1] - 2022-10-20

### Changed

- Updated frodo-lib to 0.16.1

## [0.18.0] - 2022-10-19

### Added

- \#85: Ability to fetch historical logs from ID Cloud

## [0.17.1] - 2022-10-17

### Changed

- Updated frodo-lib to 0.15.2
- Added options to `frodo journey describe` command:
  - Added `--verbose` option
  - Added `--debug` option

## [0.17.0] - 2022-10-16

### Changed

- Updated frodo-lib to 0.15.1

### Added

- \#82: Check for updates
- \#86: Support markdown output with `frodo journey describe` command
  - Added new `--markdown` option to enable markdown output
  - Added new `--output-file` option to enable writing output to a file

### Fixed

- \#88: `frodo idm export` now properly regognizes `-N`/`--name` option

## [0.16.2-1] - 2022-10-11

### Added

- \#82: Check for updates

## [0.16.2-0] - 2022-10-11

### Added

- \#82: Check for updates

## [0.16.1] - 2022-10-11

### Changed

- Updated frodo-lib to 0.14.1
- Release name is now prefixed with `Frodo CLI` for clarity in notifications.

### Added

- rockcarver/frodo-cli#70: Added ability to create custom logging noise filters
- \#76, #77, #78, #79: `frodo theme import` command now supports `--debug` and `--verbose` flags. Other commands may register the new cli options as well. Most output is expected to come from the library layer but cli commands may also issue `verbose` and `debug` message.

### Fixed

- rockcarver/frodo-lib#116: Frodo now properly imports themes.

## [0.16.0] - 2022-10-11

### Changed

- Updated frodo-lib to 0.14.0

### Added

- rockcarver/frodo-cli#70: Added ability to create custom logging noise filters
- \#76, #77, #78, #79: `frodo theme import` command now supports `--debug` and `--verbose` flags. Other commands may register the new cli options as well. Most output is expected to come from the library layer but cli commands may also issue `verbose` and `debug` message.

### Fixed

- # rockcarver/frodo-lib#116: Frodo now properly imports themes.

### Added

- \#82: Added version update checking
  > > > > > > > Stashed changes

## [0.15.1] - 2022-10-05

### Fixed

- \#73: frodo command can now be run properly again after `npm i -g @rockcarver/frodo-cli` with version 0.15.1 and newer. Npm package `@rockcarver/frodo-cli` versions `0.14.0 - 0.15.1-0` were defective and did not run after a global install.

## [0.15.1-0] - 2022-10-04

### Changed

- Updated frodo-lib to 0.13.1-0

### Added

- \#70: Added ability to create custom logging noise filters

## [0.15.0] - 2022-10-04

### Added

- New `frodo journey` sub-commands:
  - `frodo journey enable -i 'journeyId'` to enable a journey by name/id
  - `frodo journey disable -i 'journeyId'` to disable a journey by name/id

## [0.14.1] - 2022-10-03

### Fixed

- \#66: Removed unnecessary files from npm package

## [0.14.0] - 2022-10-03

### Changed

- Updated frodo-lib to 0.12.7
- Changes to `frodo journey describe` command:
  - Added journey status (enabled/disabled)
  - Added journey/node classification:
    Classifications are shown for the whole journey and for each node type and node, making it easy to determine why a journey is classified a certain way.
    - `standard`: can run on any instance of a ForgeRock platform
    - `cloud`: utilize nodes, which are exclusively available in the ForgeRock Identity Cloud
    - `premium`: utilizes nodes, which come at a premium
    - `custom`: utilizes nodes not included in the ForgeRock platform release
  - Added journey categories/tags
  - Added consideration of version from export file meta data when using `-f [file]` option to describe a juorney export
  - Added `-o`/`--override-version` parameter. Notation: `major.minor.patch` e.g. `7.2.0`. Override detected version with any version. This is helpful in order to check if journeys in one environment would be compatible running in another environment (e.g. in preparation of migrating from on-prem to ForgeRock Identity Cloud.
- \#59: Converted frodo-cli to TypeScript

## [0.13.3] - 2022-09-30

### Added

- rockcarver/frodo-lib#104: Enhanced `frodo journey describe` command to include more details
- \#60: Support the improved frodo journey describe command with frodo-cli

### Changed

- Updated frodo-lib to 0.12.6

## [0.13.2] - 2022-09-29

### Changed

- Updated frodo-lib to 0.12.5

### Fixed

- rockcarver/frodo-lib#98: Frodo now properly runs `frodo idm export -A -D ./idm <host>` command
- rockcarver/frodo-lib#100: Frodo now properly handles nested realms when specified as `/parent/child`
- rockcarver/frodo-lib#101: Frodo now properly sets the identity resource when the realm was specified with a leading slash
- rockcarver/frodo-lib#102: Frodo now properly replaces existing themes on import when the realm was specified with a leading slash

## [0.13.1] - 2022-09-23

### Changed

- Updated frodo-lib to 0.12.4
- Updated binary installation instructions in README.md

### Fixed

- \#49: Frodo now properly reports missing mandatory parameters when running `frodo esv variable describe <host>` and `frodo esv secret describe <host>`

## [0.13.0] - 2022-09-17

### Added

- Frodo now allows two new parameters when adding a connection profile:

  \--authentication-service [service] Name of the authentication service/tree to use.

  \--authentication-header-overrides [headers] Map of headers: {"host":"am.example.com:8081"}.

  These parameters are currently only supported in the `frodo conn add` command and the configuration elements will be automatically applied to commands issued using that connection profile.

      % frodo conn add https://platform.example.com:9443/am username password --authentication-service ldapService --authentication-header-overrides '{"host":"am.example.com:8081"}' -k
      ForgeOps deployment detected.
      Connected to ForgeRock Access Management 7.2.0 Build 64ef7ebc01ed3df1a1264d7b0400351bc101361f (2022-June-27 08:15)
      Saving creds in /Users/vscheuber/.frodo/.frodorc...
      Updating connection profile https://platform.example.com:9443/am
      Advanced setting: Authentication Service: ldapService
      Advanced setting: Authentication Header Overrides:
      { host: 'am.example.com:8081' }
      %

  After the connection profile is created with the additional parameters, the environment can be accessed as usual. In this case it requires the `-k` parameter for every command, as the environment uses a self-signed certificate.

      % frodo journey list platform alpha -k
      ForgeOps deployment detected.
      Connected to ForgeRock Access Management 7.2.0 Build 64ef7ebc01ed3df1a1264d7b0400351bc101361f (2022-June-27 08:15)
      Listing journeys in realm "alpha"...
      Agent
      Example
      Facebook-ProvisionIDMAccount
      Google-AnonymousUser
      Google-DynamicAccountCreation
      HmacOneTimePassword
      PersistentCookie
      PlatformForgottenUsername
      PlatformLogin
      PlatformProgressiveProfile
      PlatformRegistration
      PlatformResetPassword
      PlatformUpdatePassword
      RetryLimit
      %

### Fixed

- rockcarver/frodo-lib#94: Frodo can now connect to improperly configured platform instances

## [0.12.5] - 2022-09-16

### Fixed

- \#92: `frodo email template list <host>` now runs properly

## [0.12.4] - 2022-09-15

### Changed

- Updated frodo-lib to v0.12.2

### Fixed

- \#33: Describing all journeys in a realm (`frodo journey describe <host>`) now runs properly
- \#69: AM version is now included in export meta data. This will help identify if an export is suitable for import into a target environment based on both origin and target versions.
- \#71: Importing applications into Catalyst demo environments now works properly
- \#78: `frodo journey list -l <host>` now runs properly
- \#80: `frodo idp export -A <host>` now runs properly
- \#83: `frodo saml export -A <host>` now runs properly
- \#85: `frodo journey export -A <host>` now runs properly
- \#90: Exporting journeys from bravo realm of a cloud tenant now works properly

## [0.12.4-6] - 2022-09-15

## [0.12.4-5] - 2022-09-13

## [0.12.4-4] - 2022-09-12

## [0.12.4-3] - 2022-09-12

## [0.12.4-2] - 2022-09-09

## [0.12.4-1] - 2022-09-08

## [0.12.4-0] - 2022-09-02

## [0.12.3] - 2022-09-01

### Fixed

- \#24 - `frodo conn list` now showing the expected output
- \#25 - `npm run build` now running properly

## [0.12.2] - 2022-08-27

### Changed

- \#3: `frodo-cli` now uses the new callback based progress indicator and message display framework in `frodo-lib 0.12.0`

### Fixed

- \#16: 2nd-level commands in binary builds are working properly again (they were broken in all 0.11.x and 0.12.x builds)

## [0.12.1] - 2022-08-27 [YANKED]

## [0.12.0] - 2022-08-27 [YANKED]

## [0.11.1-2] - 2022-08-21

### Fixed

- rockcarver/frodo#389: Exporting of empty scripts now works properly

## [0.11.1-1] - 2022-08-21

### Added

- Frodo CLI is now effectively using Frodo Library for all functionality except CLI.
  - This changes has no effect on users using frodo binaries except for the download location of those binaries, which has now shifted to the [frodo-cli](https://github.com/rockcarver/frodo-cli) repo [release section](https://github.com/rockcarver/frodo-cli/releases).
  - This change does affect users who run Frodo in `Developer Mode`. The exact effects and required actions are not yet fully documented and understood.
  - This change does not effect the installation/update/usage process of users running the Frodo CLI NPM package. However, under the surface there is a big change in that the [Frodo CLI (@rockcarver/frodo-cli)](https://www.npmjs.com/package/@rockcarver/frodo-cli) package is now built on the new [Frodo Library (@rockcarver/frodo-lib)](https://www.npmjs.com/package/@rockcarver/frodo-lib).

### Changed

- The output of `frodo -v` has changed to include all three versions: cli, lib, and node:
  ```console
  % frodo -v
  cli: v0.11.1-1
  lib: v0.11.1-6
  node: v18.7.0
  ```

## [0.11.1-0] - 2022-08-19 [YANKED]

## [0.10.4] - 2022-08-13

### Added

- \#376: Frodo is now being published as an npm package: @rockcarver/frodo-cli.
- \#317: Binary archive names now include the release version.
- \#369: Added backwards compatibilty with node 16 and 14. Binaries are still built using the latest node version (18). Smoke tests run against all supported versions (18, 16, 14).

### Fixed

- \#368: Progress bar no longer overrides verbose output on journey import.

## [0.10.3] - 2022-08-13 [YANKED]

## [0.10.2] - 2022-08-13 [YANKED]

## [0.10.1] - 2022-08-13 [YANKED]

## [0.10.0] - 2022-08-13 [YANKED]

## [0.9.3-7] - 2022-08-13 [YANKED]

## [0.9.3-6] - 2022-08-13 [YANKED]

## [0.9.3-5] - 2022-08-13 [YANKED]

## [0.9.3-4] - 2022-08-13 [YANKED]

## [0.9.3-3] - 2022-08-13 [YANKED]

## [0.9.3-2] - 2022-08-13 [YANKED]

## [0.9.3-1] - 2022-08-13 [YANKED]

## [0.9.3-0] - 2022-08-12 [YANKED]

## [0.9.2] - 2022-08-11

### Added

- \#205: Added `--no-deps` option to `journey export`/`import` commands. This allows users to omit all external dependencies from a journey export and/or import. One use case where this comes in handy is when using frodo as a CI/CD tool to extract and deploy individual configuration artifacts and it is desirable to not mingle multiple types of configuration in a single file but keep each type of configuration in its own file for version and change control.
- Added `--verbose` option to `journey export` command.
- \#341: Added initial smoke tests to validate basic functionality.

### Changed

- \#363: Frodo now performs dependency resolution and reports unresolved dependencies on single journey imports.
- \#364: Frodo now uses a spinner and no longer a progress bar to indicate progress on single journey imports.
- Internal restructuring (#158, #159, #164, #165)
- Updated PIPELINE.md with latest pipeline changes

### Fixed

- \#359: Frodo now properly exports themes from forgeops deployments.
- \#362: Frodo now properly imports journeys with email templates.
- \#357: Frodo no longer throws an error and exits occasionally when running the `frodo log tail` command.
- \#355: Frodo now properly imports social IDPs into 7.1 environments when using the `frodo journey import` command.
- \#353: Frodo now properly imports social IDPs when using the `frodo journey import` command.
- \#351: Frodo now properly shows IDM messages using the `frodo logs tail` command.
- \#349: Frodo now properly exports journeys from classic deployments

## [0.9.2-12] - 2022-08-09

### Fixed

- \#359: Frodo now properly exports themes from forgeops deployments.

## [0.9.2-11] - 2022-08-09

### Changed

- \#363: Frodo now performs dependency resolution and reports unresolved dependencies on single journey imports.
- \#364: Frodo now uses a spinner and no longer a progress bar to indicate progress on single journey imports.

### Fixed

- \#362: Frodo now properly imports journeys with email templates.

## [0.9.2-10] - 2022-08-05

### Fixed

- \#357: Frodo no longer throws an error and exits occasionally when running the `frodo log tail` command.

## [0.9.2-9] - 2022-07-30

### Fixed

- \#355: Frodo now properly imports social IDPs into 7.1 environments when using the `frodo journey import` command.

## [0.9.2-8] - 2022-07-28

### Fixed

- \#353: Frodo now properly imports social IDPs when using the `frodo journey import` command.

## [0.9.2-7] - 2022-07-28

### Fixed

- \#351: Frodo now properly shows IDM messages using the `frodo logs tail` command.

## [0.9.2-6] - 2022-07-27

### Fixed

- \#349: Frodo now properly exports journeys from classic deployments

## [0.9.2-5] - 2022-07-23

### Changed

- Internal restructuring (#158, #159, #164, #165)

## [0.9.2-4] - 2022-07-22

### Added

- \#341: Added initial smoke tests to validate basic functionality

### Changed

- Updated PIPELINE.md with latest pipeline changes

## [0.9.2-3] - 2022-07-22 [YANKED]

## [0.9.2-2] - 2022-07-22 [YANKED]

## [0.9.2-1] - 2022-07-22 [YANKED]

## [0.9.2-0] - 2022-07-22 [YANKED]

## [0.9.1] - 2022-07-21

### Added

- \#311: Added explicit support for network proxies (`HTTPS_PROXY=<protocol>://<host>:<port>`)
  Frodo now supports using system enviroment variable `HTTPS_PROXY` (and `HTTP_PROXY`) to connect through a network proxy.

### Changed

- Changes to `frodo realm describe` command:
  - The realm argument now exclusively determines the realm
  - Removed `-n`/`--name` parameter
- Internal restructuring (#167)

### Fixed

- \#329: Fixed help info for `esv apply` command
- \#335: Fixed error when running `idm list` command
- \#338: Frodo now successfully authenticates with or without using a proxy

## [0.9.1-1] - 2022-07-21

### Fixed

- \#338: Frodo now successfully authenticates with or without using a proxy

## [0.9.1-0] - 2022-07-21 [YANKED]

## [0.9.0] - 2022-07-21 [YANKED]

## [0.8.2] - 2022-07-17

### Changed

- Changed `idm` sub-commands to align with other commands:
  - The sub-commands `export`, `exportAll`, and `exportAllRaw` have been collapsed into one: `export`
    - `idm export -A` (`--all-separate`) is now the way to export all idm configuration.
      - Options `-e` and `-E` select old `exportAll` functionality with variable replacement and filtering
      - Omitting options `-e` and `-E`, selects the old `exportAllRaw` functionality without variable replacement and without filtering
  - Renamed sample resource files for `idm export` command:
    - `<frodo home>/resources/sampleEntitiesFile.json`
    - `<frodo home>/resources/sampleEnvFile.env`
  - The `-N`/`--name` option of the count command has been renamed to `-m`/`--managed-object`
- Internal restructuring (#137)

### Fixed

- \#325: Frodo now gracefully reports and skips node types causing errors during pruning
- \#331: Frodo now correctly counts managed objects when using the `idm count` command

## [0.8.2-1] - 2022-07-16

### Fixed

- \#325: Frodo now gracefully reports and skips node types causing errors during pruning

## [0.8.2-0] - 2022-07-16 [YANKED]

## [0.8.1] - 2022-07-15

### Added

- New `-l`/`--long` option to script list command

### Changed

- Changed default behavior of `frodo conn add` to validate connection details by default and renamed parameter from `--validate` to `--no-validate` to allow disabling validation
- Internal restructuring (#169)

### Fixed

- \#324: Frodo now includes themes assigned at journey level in journey exports

## [0.8.1-0] - 2022-07-14 [YANKED]

## [0.8.0] - 2022-07-13

### Added

- \#320: Frodo now identifies itself through the User-Agent header `<name>/<version>` (e.g. `frodo/0.7.1-1`)

### Changed

- Renamed `realm details` to `realm describe` but registered `realm details` as an alias for backwards compatibility
- Changes to application command
  - Renamed command to `app` but registered `application` as an alias for backwards compatibility
  - Renamed option `-i`/`--id` to `-i`/`--app-id`. Short version is not impacted by rename.
- Internal restructuring (#133, #134, #141 #142, #146)

### Fixed

- \#319: frodo admin create-oauth2-client-with-admin-privileges --llt properly handles name collisions

## [0.7.1-1] - 2022-07-11

## [0.7.1-0] - 2022-07-10

## [0.7.0] - 2022-07-10

### Added

- CHANGELOG.md
- `conn describe` command to describe connection profiles
  - `--show-secrets` option to `conn describe` command to show clear-text secrets
- `--validate` option to `conn add` command to validate credentials before adding

### Changed

- Adapted true semantic versioning
- Pipeline changes
  - Automated updating changelog using keep a changelog format in CHANGELOG.md
  - Automated version bump (SemVer format) using PR comments to trigger prerelease, patch, minor, or major bumps
  - Automated release notes extraction from CHANGELOG.md
  - Automated GitHub release creation
  - Renamed frodo.yml to pipeline.yml
- Renamed connections command to `conn` with aliases `connection` and `connections` for backwards compatibility
- Internal restructuring (#160, #135)

### Fixed

- \#280: Fixed missing -k/--insecure param in application sub-commands #280
- \#310: No longer storing connection profiles unless explicitly instructed to

## [0.6.4-4] - 2022-07-10 [YANKED]

## [0.6.4-3] - 2022-07-09 [YANKED]

## [0.6.4-2] - 2022-07-09 [YANKED]

## [0.6.4-1] - 2022-07-09 [YANKED]

## [0.6.4-0] - 2022-07-09 [YANKED]

## [0.6.3] - 2022-07-08 [YANKED]

## 0.6.3-alpha.1 - 0.6.3-alpha.51 [YANKED]

## 0.6.2 [YANKED]

## 0.6.1 alpha 26 - 2022-06-28

### Changed

- Changed archive step of Windows binary build to use 7zip

## 0.6.1 alpha 22 - 0.6.1 alpha 25 [YANKED]

## 0.6.1 alpha 21 - 2022-06-27

### Added

- Added theme delete command
- Theme list e2e tests
- Theme delete e2e tests
- Added esv command
  - esv secret - Manage secrets.
  - esv variable - Manage variables.
  - esv apply - Apply pending changes.
- Updated all dependencies to the latest versions

### Changed

- Moved secret command under new esv command

## 0.6.1 alpha 20 - 2022-06-23

### Added

- Added journey delete command
- journey list e2e tests
- journey delete e2e tests

### Changed

- Allow progressbar output to be captured in redirects

### Fixed

- Journey import fixes
- Journey export bug fix
- Fix theme import issues when using /alpha or /bravo instead of alpha or bravo
- Fix admin create-oauth2-client-with-admin-privileges command

## 0.6.1 alpha 19 - 2022-06-14

### Added

- First stab at e2e testing of journey command
- saml command enhancements

### Fixed

- Detect and remove invalid tree attributes on import
- Fixed issue where overriding deployment type would fail to detect the default realm
- Fix theme import -A

## 0.6.1 alpha 18 - 2022-06-10

### Added

- \--txid parameter with the logs commands to filter log output by transactionId

### Fixed

- Bug in idm exportAllRaw

## 0.6.1 alpha 17 - 2022-06-08

### Added

- New saml command to manage entity providers and circles of trust

### Changed

- Updates to journey export/import commands
  - Support for social identity providers
  - Support for themes
  - Support for SAML entity providers
  - Support for SAML circles of trust
  - Breaking changes in journey sub-commands
    - export
      - \-t/--tree renamed to -i/--journey-id
    - import
      - \-t/--tree renamed to -i/--journey-id
      - \-i/--journey-id is now only used to select the journey to import if there are multiple journeys in the import file
      - \-n (No re-UUID) removed
      - new flag --re-uuid with inversed behavior of removed -n flag. Frodo by default no longer generates new UUIDs for nodes on import
- Scalability enhancements to journey prune command. The changes allow the prune command to scale to many thousands of orphaned node configuration objects in an AM instance
- Updated readme
- Miscellaneous bug fixes

## 0.6.1 alpha 14 - 0.6.1 alpha 16 [YANKED]

## 0.6.1 alpha 13 - 2022-05-20

### Added

- New script command to export and import scripts
- New email_templates command to manage email templates
- New application command to export and import oauth2 clients
- New realm command to manage realms
- New secret command to manage Identity Cloud secrets
- New theme command to manage hosted pages UI themes
- New admin command to perform advanced administrative tasks
- Encrypt the password value in the connection profile
- Added progress bars/spinners for long running operations
- Added version option -v, --version
- Auto provisioning of log API keys
- Added initial unit testing

### Changed

- Improved performance of journey command (multi-threading)
- Consolidated settings under one folder (~/.frodo)
- Proposed new code formatting (prettier) and style (eslint) rules
- Updated readme
- Update to node 18

### Fixed

- Fixed problem with adding connection profiles
- Miscellaneous bug fixes

[unreleased]: https://github.com/rockcarver/frodo-cli/compare/v3.0.5...HEAD
[3.0.5]: https://github.com/rockcarver/frodo-cli/compare/v3.0.4...v3.0.5
[3.0.4]: https://github.com/rockcarver/frodo-cli/compare/v3.0.4-1...v3.0.4
[3.0.4-1]: https://github.com/rockcarver/frodo-cli/compare/v3.0.4-0...v3.0.4-1
[3.0.4-0]: https://github.com/rockcarver/frodo-cli/compare/v3.0.3...v3.0.4-0
[3.0.3]: https://github.com/rockcarver/frodo-cli/compare/v3.0.2...v3.0.3
[3.0.2]: https://github.com/rockcarver/frodo-cli/compare/v3.0.1...v3.0.2
[3.0.1]: https://github.com/rockcarver/frodo-cli/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/rockcarver/frodo-cli/compare/v2.1.0...v3.0.0
[2.1.0]: https://github.com/rockcarver/frodo-cli/compare/v2.0.6-2...v2.1.0
[2.0.6-2]: https://github.com/rockcarver/frodo-cli/compare/v2.0.6-1...v2.0.6-2
[2.0.6-1]: https://github.com/rockcarver/frodo-cli/compare/v2.0.6-0...v2.0.6-1
[2.0.6-0]: https://github.com/rockcarver/frodo-cli/compare/v2.0.5...v2.0.6-0
[2.0.5]: https://github.com/rockcarver/frodo-cli/compare/v2.0.5-0...v2.0.5
[2.0.5-0]: https://github.com/rockcarver/frodo-cli/compare/v2.0.4...v2.0.5-0
[2.0.4]: https://github.com/rockcarver/frodo-cli/compare/v2.0.3...v2.0.4
[2.0.3]: https://github.com/rockcarver/frodo-cli/compare/v2.0.2...v2.0.3
[2.0.2]: https://github.com/rockcarver/frodo-cli/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/rockcarver/frodo-cli/compare/v2.0.1-0...v2.0.1
[2.0.1-0]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0...v2.0.1-0
[2.0.0]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-70...v2.0.0
[2.0.0-70]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-69...v2.0.0-70
[2.0.0-69]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-68...v2.0.0-69
[2.0.0-68]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-67...v2.0.0-68
[2.0.0-67]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-66...v2.0.0-67
[2.0.0-66]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-65...v2.0.0-66
[2.0.0-65]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-64...v2.0.0-65
[2.0.0-64]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-63...v2.0.0-64
[2.0.0-63]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-62...v2.0.0-63
[2.0.0-62]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-61...v2.0.0-62
[2.0.0-61]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-60...v2.0.0-61
[2.0.0-60]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-59...v2.0.0-60
[2.0.0-59]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-58...v2.0.0-59
[2.0.0-58]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-57...v2.0.0-58
[2.0.0-57]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-56...v2.0.0-57
[2.0.0-56]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-55...v2.0.0-56
[2.0.0-55]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-54...v2.0.0-55
[2.0.0-54]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-53...v2.0.0-54
[2.0.0-53]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-52...v2.0.0-53
[2.0.0-52]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-51...v2.0.0-52
[2.0.0-51]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-50...v2.0.0-51
[2.0.0-50]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-49...v2.0.0-50
[2.0.0-49]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-48...v2.0.0-49
[2.0.0-48]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-47...v2.0.0-48
[2.0.0-47]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-46...v2.0.0-47
[2.0.0-46]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-45...v2.0.0-46
[2.0.0-45]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-44...v2.0.0-45
[2.0.0-44]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-43...v2.0.0-44
[2.0.0-43]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-42...v2.0.0-43
[2.0.0-42]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-41...v2.0.0-42
[2.0.0-41]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-40...v2.0.0-41
[2.0.0-40]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-39...v2.0.0-40
[2.0.0-39]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-38...v2.0.0-39
[2.0.0-38]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-37...v2.0.0-38
[2.0.0-37]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-36...v2.0.0-37
[2.0.0-36]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-35...v2.0.0-36
[2.0.0-35]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-34...v2.0.0-35
[2.0.0-34]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-33...v2.0.0-34
[2.0.0-33]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-32...v2.0.0-33
[2.0.0-32]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-31...v2.0.0-32
[2.0.0-31]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-30...v2.0.0-31
[2.0.0-30]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-29...v2.0.0-30
[2.0.0-29]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-28...v2.0.0-29
[2.0.0-28]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-27...v2.0.0-28
[2.0.0-27]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-26...v2.0.0-27
[2.0.0-26]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-25...v2.0.0-26
[2.0.0-25]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-24...v2.0.0-25
[2.0.0-24]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-23...v2.0.0-24
[2.0.0-23]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-22...v2.0.0-23
[2.0.0-22]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-21...v2.0.0-22
[2.0.0-21]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-20...v2.0.0-21
[2.0.0-20]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-19...v2.0.0-20
[2.0.0-19]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-18...v2.0.0-19
[2.0.0-18]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-17...v2.0.0-18
[2.0.0-17]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-16...v2.0.0-17
[2.0.0-16]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-15...v2.0.0-16
[2.0.0-15]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-14...v2.0.0-15
[2.0.0-14]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-13...v2.0.0-14
[2.0.0-13]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-12...v2.0.0-13
[2.0.0-12]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-11...v2.0.0-12
[2.0.0-11]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-10...v2.0.0-11
[2.0.0-10]: https://github.com/rockcarver/frodo-cli/compare/v2.0.0-9...v2.0.0-10
[2.0.0-9]: https://github.com/rockcarver/frodo-cli/compare/v1.0.0...v2.0.0-9
[1.0.0]: https://github.com/rockcarver/frodo-cli/compare/v1.0.0-1...v1.0.0
[1.0.0-1]: https://github.com/rockcarver/frodo-cli/compare/v0.24.6-3...v1.0.0-1
[0.24.6-3]: https://github.com/rockcarver/frodo-cli/compare/v0.24.6-2...v0.24.6-3
[0.24.6-2]: https://github.com/rockcarver/frodo-cli/compare/v0.24.6-1...v0.24.6-2
[0.24.6-1]: https://github.com/rockcarver/frodo-cli/compare/v0.24.6-0...v0.24.6-1
[0.24.6-0]: https://github.com/rockcarver/frodo-cli/compare/v0.24.5...v0.24.6-0
[0.24.5]: https://github.com/rockcarver/frodo-cli/compare/v0.24.4...v0.24.5
[0.24.4]: https://github.com/rockcarver/frodo-cli/compare/v0.24.4-2...v0.24.4
[0.24.4-2]: https://github.com/rockcarver/frodo-cli/compare/v0.24.4-1...v0.24.4-2
[0.24.4-1]: https://github.com/rockcarver/frodo-cli/compare/v0.24.4-0...v0.24.4-1
[0.24.4-0]: https://github.com/rockcarver/frodo-cli/compare/v0.24.3...v0.24.4-0
[0.24.3]: https://github.com/rockcarver/frodo-cli/compare/v0.24.1...v0.24.3
[0.24.1]: https://github.com/rockcarver/frodo-cli/compare/v0.24.1-0...v0.24.1
[0.24.1-0]: https://github.com/rockcarver/frodo-cli/compare/v0.24.1...v0.24.1-0
[0.24.1]: https://github.com/rockcarver/frodo-cli/compare/v0.24.0...v0.24.1
[0.24.0]: https://github.com/rockcarver/frodo-cli/compare/v0.23.1-8...v0.24.0
[0.23.1-8]: https://github.com/rockcarver/frodo-cli/compare/v0.23.1-7...v0.23.1-8
[0.23.1-7]: https://github.com/rockcarver/frodo-cli/compare/v0.23.1-6...v0.23.1-7
[0.23.1-6]: https://github.com/rockcarver/frodo-cli/compare/v0.23.1-5...v0.23.1-6
[0.23.1-5]: https://github.com/rockcarver/frodo-cli/compare/v0.23.1-4...v0.23.1-5
[0.23.1-4]: https://github.com/rockcarver/frodo-cli/compare/v0.23.1-3...v0.23.1-4
[0.23.1-3]: https://github.com/rockcarver/frodo-cli/compare/v0.23.1-2...v0.23.1-3
[0.23.1-2]: https://github.com/rockcarver/frodo-cli/compare/v0.23.1-1...v0.23.1-2
[0.23.1-1]: https://github.com/rockcarver/frodo-cli/compare/v0.23.1-0...v0.23.1-1
[0.23.1-0]: https://github.com/rockcarver/frodo-cli/compare/v0.23.0...v0.23.1-0
[0.23.0]: https://github.com/rockcarver/frodo-cli/compare/v0.22.3...v0.23.0
[0.22.3]: https://github.com/rockcarver/frodo-cli/compare/v0.22.2...v0.22.3
[0.22.2]: https://github.com/rockcarver/frodo-cli/compare/v0.22.1...v0.22.2
[0.22.1]: https://github.com/rockcarver/frodo-cli/compare/v0.22.0...v0.22.1
[0.22.0]: https://github.com/rockcarver/frodo-cli/compare/v0.21.1...v0.22.0
[0.21.1]: https://github.com/rockcarver/frodo-cli/compare/v0.21.0...v0.21.1
[0.21.0]: https://github.com/rockcarver/frodo-cli/compare/v0.20.2-0...v0.21.0
[0.20.2-0]: https://github.com/rockcarver/frodo-cli/compare/v0.20.1...v0.20.2-0
[0.20.1]: https://github.com/rockcarver/frodo-cli/compare/v0.20.1-1...v0.20.1
[0.20.1-1]: https://github.com/rockcarver/frodo-cli/compare/v0.20.1-0...v0.20.1-1
[0.20.1-0]: https://github.com/rockcarver/frodo-cli/compare/v0.20.0...v0.20.1-0
[0.20.0]: https://github.com/rockcarver/frodo-cli/compare/v0.19.5-2...v0.20.0
[0.19.5-2]: https://github.com/rockcarver/frodo-cli/compare/v0.19.5-1...v0.19.5-2
[0.19.5-1]: https://github.com/rockcarver/frodo-cli/compare/v0.19.5-0...v0.19.5-1
[0.19.5-0]: https://github.com/rockcarver/frodo-cli/compare/v0.19.4...v0.19.5-0
[0.19.4]: https://github.com/rockcarver/frodo-cli/compare/v0.19.3...v0.19.4
[0.19.3]: https://github.com/rockcarver/frodo-cli/compare/v0.19.3-3...v0.19.3
[0.19.3-3]: https://github.com/rockcarver/frodo-cli/compare/v0.19.3-2...v0.19.3-3
[0.19.3-2]: https://github.com/rockcarver/frodo-cli/compare/v0.19.3-1...v0.19.3-2
[0.19.3-1]: https://github.com/rockcarver/frodo-cli/compare/v0.19.3-0...v0.19.3-1
[0.19.3-0]: https://github.com/rockcarver/frodo-cli/compare/v0.19.2...v0.19.3-0
[0.19.2]: https://github.com/rockcarver/frodo-cli/compare/v0.19.1...v0.19.2
[0.19.1]: https://github.com/rockcarver/frodo-cli/compare/v0.19.0...v0.19.1
[0.19.0]: https://github.com/rockcarver/frodo-cli/compare/v0.18.2-18...v0.19.0
[0.18.2-18]: https://github.com/rockcarver/frodo-cli/compare/v0.18.2-17...v0.18.2-18
[0.18.2-17]: https://github.com/rockcarver/frodo-cli/compare/v0.18.2-16...v0.18.2-17
[0.18.2-16]: https://github.com/rockcarver/frodo-cli/compare/v0.18.2-15...v0.18.2-16
[0.18.2-15]: https://github.com/rockcarver/frodo-cli/compare/v0.18.2-14...v0.18.2-15
[0.18.2-14]: https://github.com/rockcarver/frodo-cli/compare/v0.18.2-13...v0.18.2-14
[0.18.2-13]: https://github.com/rockcarver/frodo-cli/compare/v0.18.2-12...v0.18.2-13
[0.18.2-12]: https://github.com/rockcarver/frodo-cli/compare/v0.18.2-11...v0.18.2-12
[0.18.2-11]: https://github.com/rockcarver/frodo-cli/compare/v0.18.2-10...v0.18.2-11
[0.18.2-10]: https://github.com/rockcarver/frodo-cli/compare/v0.18.2-9...v0.18.2-10
[0.18.2-9]: https://github.com/rockcarver/frodo-cli/compare/v0.18.2-8...v0.18.2-9
[0.18.2-8]: https://github.com/rockcarver/frodo-cli/compare/v0.18.2-7...v0.18.2-8
[0.18.2-7]: https://github.com/rockcarver/frodo-cli/compare/v0.18.2-6...v0.18.2-7
[0.18.2-6]: https://github.com/rockcarver/frodo-cli/compare/v0.18.2-5...v0.18.2-6
[0.18.2-5]: https://github.com/rockcarver/frodo-cli/compare/v0.18.2-4...v0.18.2-5
[0.18.2-4]: https://github.com/rockcarver/frodo-cli/compare/v0.18.2-3...v0.18.2-4
[0.18.2-3]: https://github.com/rockcarver/frodo-cli/compare/v0.18.2-2...v0.18.2-3
[0.18.2-2]: https://github.com/rockcarver/frodo-cli/compare/v0.18.2-1...v0.18.2-2
[0.18.2-1]: https://github.com/rockcarver/frodo-cli/compare/v0.18.2-0...v0.18.2-1
[0.18.2-0]: https://github.com/rockcarver/frodo-cli/compare/v0.18.1...v0.18.2-0
[0.18.1]: https://github.com/rockcarver/frodo-cli/compare/v0.18.0...v0.18.1
[0.18.0]: https://github.com/rockcarver/frodo-cli/compare/v0.17.1...v0.18.0
[0.17.1]: https://github.com/rockcarver/frodo-cli/compare/v0.17.0...v0.17.1
[0.17.0]: https://github.com/rockcarver/frodo-cli/compare/v0.16.2-1...v0.17.0
[0.16.2-1]: https://github.com/rockcarver/frodo-cli/compare/v0.16.2-0...v0.16.2-1
[0.16.2-0]: https://github.com/rockcarver/frodo-cli/compare/v0.16.1...v0.16.2-0
[0.16.1]: https://github.com/rockcarver/frodo-cli/compare/v0.16.0...v0.16.1
[0.16.0]: https://github.com/rockcarver/frodo-cli/compare/v0.15.1...v0.16.0
[0.15.1]: https://github.com/rockcarver/frodo-cli/compare/v0.15.1-0...v0.15.1
[0.15.1-0]: https://github.com/rockcarver/frodo-cli/compare/v0.15.0...v0.15.1-0
[0.15.0]: https://github.com/rockcarver/frodo-cli/compare/v0.14.1...v0.15.0
[0.14.1]: https://github.com/rockcarver/frodo-cli/compare/v0.14.0...v0.14.1
[0.14.0]: https://github.com/rockcarver/frodo-cli/compare/v0.13.3...v0.14.0
[0.13.3]: https://github.com/rockcarver/frodo-cli/compare/v0.13.2...v0.13.3
[0.13.2]: https://github.com/rockcarver/frodo-cli/compare/v0.13.1...v0.13.2
[0.13.1]: https://github.com/rockcarver/frodo-cli/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/rockcarver/frodo-cli/compare/v0.12.5...v0.13.0
[0.12.5]: https://github.com/rockcarver/frodo-cli/compare/v0.12.4...v0.12.5
[0.12.4]: https://github.com/rockcarver/frodo-cli/compare/v0.12.4-6...v0.12.4
[0.12.4-6]: https://github.com/rockcarver/frodo-cli/compare/v0.12.4-5...v0.12.4-6
[0.12.4-5]: https://github.com/rockcarver/frodo-cli/compare/v0.12.4-4...v0.12.4-5
[0.12.4-4]: https://github.com/rockcarver/frodo-cli/compare/v0.12.4-3...v0.12.4-4
[0.12.4-3]: https://github.com/rockcarver/frodo-cli/compare/v0.12.4-2...v0.12.4-3
[0.12.4-2]: https://github.com/rockcarver/frodo-cli/compare/v0.12.4-1...v0.12.4-2
[0.12.4-1]: https://github.com/rockcarver/frodo-cli/compare/v0.12.4-0...v0.12.4-1
[0.12.4-0]: https://github.com/rockcarver/frodo-cli/compare/v0.12.3...v0.12.4-0
[0.12.3]: https://github.com/rockcarver/frodo-cli/compare/v0.12.3-1...v0.12.3
[0.12.3-1]: https://github.com/rockcarver/frodo-cli/compare/v0.12.3-0...v0.12.3-1
[0.12.3-0]: https://github.com/rockcarver/frodo-cli/compare/v0.12.2...v0.12.3-0
[0.12.2]: https://github.com/rockcarver/frodo-cli/compare/v0.12.2-2...v0.12.2
[0.12.2-2]: https://github.com/rockcarver/frodo-cli/compare/v0.12.2-1...v0.12.2-2
[0.12.2-1]: https://github.com/rockcarver/frodo-cli/compare/v0.12.2-0...v0.12.2-1
[0.12.2-0]: https://github.com/rockcarver/frodo-cli/compare/v0.12.1...v0.12.2-0
[0.12.1]: https://github.com/rockcarver/frodo-cli/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/rockcarver/frodo-cli/compare/v0.11.1-2...v0.12.0
[0.11.1-2]: https://github.com/rockcarver/frodo-cli/compare/v0.11.1-1...v0.11.1-2
[0.11.1-1]: https://github.com/rockcarver/frodo-cli/compare/v0.11.1-0...v0.11.1-1
[0.11.1-0]: https://github.com/rockcarver/frodo-cli/compare/v0.10.4...v0.11.1-0
[0.10.4]: https://github.com/rockcarver/frodo/compare/v0.10.3...v0.10.4
[0.10.3]: https://github.com/rockcarver/frodo/compare/v0.10.3-0...v0.10.3
[0.10.3-0]: https://github.com/rockcarver/frodo/compare/v0.10.2...v0.10.3-0
[0.10.2]: https://github.com/rockcarver/frodo/compare/v0.10.2-0...v0.10.2
[0.10.2-0]: https://github.com/rockcarver/frodo/compare/v0.10.1...v0.10.2-0
[0.10.1]: https://github.com/rockcarver/frodo/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/rockcarver/frodo/compare/v0.9.3-7...v0.10.0
[0.9.3-7]: https://github.com/rockcarver/frodo/compare/v0.9.3-6...v0.9.3-7
[0.9.3-6]: https://github.com/rockcarver/frodo/compare/v0.9.3-5...v0.9.3-6
[0.9.3-5]: https://github.com/rockcarver/frodo/compare/v0.9.3-4...v0.9.3-5
[0.9.3-4]: https://github.com/rockcarver/frodo/compare/v0.9.3-3...v0.9.3-4
[0.9.3-3]: https://github.com/rockcarver/frodo/compare/v0.9.3-2...v0.9.3-3
[0.9.3-2]: https://github.com/rockcarver/frodo/compare/v0.9.3-1...v0.9.3-2
[0.9.3-1]: https://github.com/rockcarver/frodo/compare/v0.9.3-0...v0.9.3-1
[0.9.3-0]: https://github.com/rockcarver/frodo/compare/v0.9.2...v0.9.3-0
[0.9.2]: https://github.com/rockcarver/frodo/compare/v0.9.2-12...v0.9.2
[0.9.2-12]: https://github.com/rockcarver/frodo/compare/v0.9.2-11...v0.9.2-12
[0.9.2-11]: https://github.com/rockcarver/frodo/compare/v0.9.2-10...v0.9.2-11
[0.9.2-10]: https://github.com/rockcarver/frodo/compare/v0.9.2-9...v0.9.2-10
[0.9.2-9]: https://github.com/rockcarver/frodo/compare/v0.9.2-8...v0.9.2-9
[0.9.2-8]: https://github.com/rockcarver/frodo/compare/v0.9.2-7...v0.9.2-8
[0.9.2-7]: https://github.com/rockcarver/frodo/compare/v0.9.2-6...v0.9.2-7
[0.9.2-6]: https://github.com/rockcarver/frodo/compare/v0.9.2-5...v0.9.2-6
[0.9.2-5]: https://github.com/rockcarver/frodo/compare/v0.9.2-4...v0.9.2-5
[0.9.2-4]: https://github.com/rockcarver/frodo/compare/v0.9.2-3...v0.9.2-4
[0.9.2-3]: https://github.com/rockcarver/frodo/compare/v0.9.2-2...v0.9.2-3
[0.9.2-2]: https://github.com/rockcarver/frodo/compare/v0.9.2-1...v0.9.2-2
[0.9.2-1]: https://github.com/rockcarver/frodo/compare/v0.9.2-0...v0.9.2-1
[0.9.2-0]: https://github.com/rockcarver/frodo/compare/v0.9.1...v0.9.2-0
[0.9.1]: https://github.com/rockcarver/frodo/compare/v0.9.1-1...v0.9.1
[0.9.1-1]: https://github.com/rockcarver/frodo/compare/v0.9.1-0...v0.9.1-1
[0.9.1-0]: https://github.com/rockcarver/frodo/compare/v0.9.0...v0.9.1-0
[0.9.0]: https://github.com/rockcarver/frodo/compare/v0.8.2...v0.9.0
[0.8.2]: https://github.com/rockcarver/frodo/compare/v0.8.2-1...v0.8.2
[0.8.2-1]: https://github.com/rockcarver/frodo/compare/v0.8.2-0...v0.8.2-1
[0.8.2-0]: https://github.com/rockcarver/frodo/compare/v0.8.1...v0.8.2-0
[0.8.1]: https://github.com/rockcarver/frodo/compare/v0.8.1-0...v0.8.1
[0.8.1-0]: https://github.com/rockcarver/frodo/compare/v0.8.0...v0.8.1-0
[0.8.0]: https://github.com/rockcarver/frodo/compare/v0.7.1-1...v0.8.0
[0.7.1-1]: https://github.com/rockcarver/frodo/compare/v0.7.1-0...v0.7.1-1
[0.7.1-0]: https://github.com/rockcarver/frodo/compare/v0.7.0...v0.7.1-0
[0.7.0]: https://github.com/rockcarver/frodo/compare/v0.6.4-4...v0.7.0
[0.6.4-4]: https://github.com/rockcarver/frodo/compare/v0.6.4-3...v0.6.4-4
[0.6.4-3]: https://github.com/rockcarver/frodo/compare/v0.6.4-2...v0.6.4-3
[0.6.4-2]: https://github.com/rockcarver/frodo/compare/v0.6.4-1...v0.6.4-2
[0.6.4-1]: https://github.com/rockcarver/frodo/compare/v0.6.4-0...v0.6.4-1
[0.6.4-0]: https://github.com/rockcarver/frodo/compare/v0.6.3...v0.6.4-0
[0.6.3]: https://github.com/rockcarver/frodo/compare/v0.6.3-alpha.51...v0.6.3
[0.6.3-alpha.51]: https://github.com/rockcarver/frodo/compare/6137b8b19f1c22af40af5afbf7a2e6c5a95b61cb...v0.6.3-alpha.51
