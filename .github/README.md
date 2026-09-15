<!-- README.md for GitHub; the one for NPM is ../README.md. -->

# Frodo CLI (@rockcarver/frodo-cli) - Export, import, and manage PingOne Advanced Identity Cloud configuration

A command line interface to manage PingOne Advanced Identity Cloud environments, ForgeOps deployments, and classic deployments. Frodo-cli is powered by [frodo-lib](https://github.com/rockcarver/frodo-lib), a hybrid (ESM and CJS) library to manage PingOne Advanced Identity Cloud environments, ForgeOps deployments, and classic deployments.

Frodo-cli also ships a turn-key **[MCP server](#mcp-server)**: point any MCP-compatible client (Claude Code, Claude Desktop, VS Code Copilot, and others) at `frodo mcp server start`, using a connection profile you've already saved, and it can discover and operate on your tenant through the same capabilities the CLI itself uses — no separate server to build or host.

## Quick Nav

- [Quick start](#quick-start)
- [New in 4.x](#new-in-4x)
- [About](#about)
- [Considerations](#considerations)
- [Installing](#installing)
- [Usage](#usage)
- [MCP Server](#mcp-server)
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

## New In 4.x

### Based on Frodo Library 4.x

[Frodo Library 4.x](https://github.com/rockcarver/frodo-lib?tab=readme-ov-file#frodo-library-4x---rockcarverfrodo-lib) continually improves with more stabilty, more modules, token caching, automatic token refresh, better error handling, and more.

### New commands

#### `frodo config-manager`

A set of commands and export/import format optimized for CI/CD pipelines and compatible with `fr-config-manager`.

#### `frodo direct-configuration-control`

A set of commands to manage AIC envs supporting `Direct Configuration Control`.

#### `frodo node`

A set of commands supporting `Custom Nodes` in PingAM and PingOne Advanced Identity Cloud.

### Node.js Versions

- Added support for Node.js 24 and 25/26.
- Dropped support for Node.js 18 and 20.

## About

### Commands

| Command                                          |  Since  | Description                                                            |
| ------------------------------------------------ | :-----: | ---------------------------------------------------------------------- |
| frodo admin                                      |  1.0.0  | Platform admin tasks.                                                  |
| &emsp;add-autoid-static-user-mapping             |  1.0.0  | Add AutoId static user mapping to enable dashboards.                   |
| &emsp;create-oauth2-client-with-admin-privileges |  1.0.0  | Create an oauth2 client with admin privileges.                         |
| &emsp;execute-rfc7523-authz-grant-flow           |  2.0.0  | Execute RFC7523 authorization grant flow.                              |
| &emsp;federation                                 |  1.0.0  | Manages admin federation configuration.                                |
| &emsp;generate-rfc7523-authz-grant-artefacts     |  2.0.0  | Generate RFC7523 authorization grant artefacts.                        |
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
| frodo authn                                      |  2.0.0  | Manage authentication settings.                                        |
| &emsp;describe                                   |  2.0.0  | Describe authentication settings.                                      |
| &emsp;export                                     |  2.0.0  | Export authentication settings.                                        |
| &emsp;import                                     |  2.0.0  | Import authentication settings.                                        |
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
| frodo app / application                          |  2.0.0  | Manage applications. Old `app` command was renamed to `oauth`.         |
| &emsp;delete                                     |  2.0.0  | Delete applications.                                                   |
| &emsp;export                                     |  2.0.0  | Export applications.                                                   |
| &emsp;import                                     |  2.0.0  | Import applications.                                                   |
| &emsp;list                                       |  2.0.0  | List applications.                                                     |
| frodo config                                     |  2.0.0  | Manage full cloud configuration.                                       |
| &emsp;export                                     |  2.0.0  | Export full cloud configuration.                                       |
| &emsp;import                                     |  2.0.0  | Import full cloud configuration.                                       |
|                                                  |         |                                                                        |
| frodo config-manager                             | `4.0.0` | Manage cloud configuration using fr-config-manager.                    |
| &emsp;pull                                       | `4.0.0` | Export cloud configuration using fr-config-manager.                    |
| &emsp;&emsp;access-config                        | `4.0.0` | Export access-config objects.                                          |
| &emsp;&emsp;all                                  | `4.0.0` | Export all config.                                                     |
| &emsp;&emsp;all-static                           | `4.0.0` | Export all static config.                                              |
| &emsp;&emsp;audit                                | `4.0.0` | Export audit objects.                                                  |
| &emsp;&emsp;authentication                       | `4.0.0` | Export authentication objects.                                         |
| &emsp;&emsp;authz-policies                       | `4.0.0` | Export authorization policies from realm.                              |
| &emsp;&emsp;connector-definitions                | `4.0.0` | Export aconnector definitions.                                         |
| &emsp;&emsp;connector-mappings                   | `4.0.0` | Export connector mappings.                                             |
| &emsp;&emsp;cookie-domains                       | `4.0.0` | Export cookie-domains objects.                                         |
| &emsp;&emsp;cors                                 | `4.0.0` | Export CORS configuration.                                             |
| &emsp;&emsp;csp                                  | `4.0.0` | Export content security policy.                                        |
| &emsp;&emsp;custom-nodes                         | `4.0.0` | Export custom nodes.                                                   |
| &emsp;&emsp;email-provider                       | `4.0.0` | Export email provider configuration.                                   |
| &emsp;&emsp;email-templates                      | `4.0.0` | Export email-templates objects.                                        |
| &emsp;&emsp;endpoints                            | `4.0.0` | Export custom endpoints objects.                                       |
| &emsp;&emsp;internal-roles                       | `4.0.0` | Export internal roles.                                                 |
| &emsp;&emsp;journeys                             | `4.0.0` | Export journeys.                                                       |
| &emsp;&emsp;kba                                  | `4.0.0` | Export kba-config objects.                                             |
| &emsp;&emsp;locales                              | `4.0.0` | Export custom locales objects.                                         |
| &emsp;&emsp;managed-objects                      | `4.0.0` | Export managed-objects.                                                |
| &emsp;&emsp;oauth2-agents                        | `4.0.0` | Export OAuth2 Agents                                                   |
| &emsp;&emsp;org-privileges                       | `4.0.0` | Export organization privileges config.                                 |
| &emsp;&emsp;password-policy                      | `4.0.0` | Export password-policy objects.                                        |
| &emsp;&emsp;raw                                  | `4.0.0` | Export raw configurations from the tenant.                             |
| &emsp;&emsp;remote-servers                       | `4.0.0` | Export remote-servers objects.                                         |
| &emsp;&emsp;saml                                 | `4.0.0` | Export saml.                                                           |
| &emsp;&emsp;schedules                            | `4.0.0` | Export schedules.                                                      |
| &emsp;&emsp;scripts                              | `4.0.0` | Export authorization scripts.                                          |
| &emsp;&emsp;secret-mappings                      | `4.0.0` | Export secret mappings.                                                |
| &emsp;&emsp;secrets                              | `4.0.0` | Export secrets.                                                        |
| &emsp;&emsp;service-objects                      | `4.0.0` | Export service objects.                                                |
| &emsp;&emsp;services                             | `4.0.0` | Export authentication services.                                        |
| &emsp;&emsp;terms-and-conditions                 | `4.0.0` | Export terms and conditions.                                           |
| &emsp;&emsp;test                                 | `4.0.0` | Test connection and authentication.                                    |
| &emsp;&emsp;themes                               | `4.0.0` | Export themes.                                                         |
| &emsp;&emsp;ui-config                            | `4.0.0` | Export ui-configuration objects.                                       |
| &emsp;&emsp;variables                            | `4.0.0` | Export variables objects.                                              |
| &emsp;push                                       | `4.0.0` | Import configuration optimized for CI/CD pipelines (format compatible with fr-config-manager). |
| &emsp;&emsp;access-config                        | `4.0.0` | Import access configuration.                                           |
| &emsp;&emsp;audit                                | `4.0.0` | Import audit configuration.                                            |
| &emsp;&emsp;authentication                       | `4.0.0` | Import authentication objects.                                         |
| &emsp;&emsp;connector-definitions                | `4.0.0` | Import connector definitions.                                          |
| &emsp;&emsp;cookie-domains                       | `4.0.0` | Import cookie domains.                                                 |
| &emsp;&emsp;email-provider                       | `4.0.0` | Import email provider configuration.                                   |
| &emsp;&emsp;email-templates                      | `4.0.0` | Import email template objects.                                         |
| &emsp;&emsp;endpoints                            | `4.0.0` | Import custom endpoints objects.                                       |
| &emsp;&emsp;internal-roles                       | `4.0.0` | Import internal roles.                                                 |
| &emsp;&emsp;kba                                  | `4.0.0` | Import kba configuration.                                              |
| &emsp;&emsp;locales                              | `4.0.0` | Import custom locales objects.                                         |
| &emsp;&emsp;managed-objects                      | `4.0.0` | Import managed objects.                                                |
| &emsp;&emsp;org-privileges                       | `4.0.0` | Import organization privileges config.                                 |
| &emsp;&emsp;password-policy                      | `4.0.0` | Import password-policy objects.                                        |
| &emsp;&emsp;schedules                            | `4.0.0` | Import schedules.                                                      |
| &emsp;&emsp;service-objects                      | `4.0.0` | Import service objects.                                                |
| &emsp;&emsp;terms-and-conditions                 | `4.0.0` | Import terms and conditions.                                           |
| &emsp;&emsp;themes                               | `4.0.0` | Import themes.                                                         |
| &emsp;&emsp;ui-config                            | `4.0.0` | Import UI configuration.                                               |
|                                                  |         |                                                                        |
| frodo conn / connection                          |  1.0.0  | Manage connection profiles.                                            |
| &emsp;delete                                     |  1.0.0  | Delete connection profiles.                                            |
| &emsp;describe                                   |  1.0.0  | Describe connection profile.                                           |
| &emsp;list                                       |  1.0.0  | List connection profiles.                                              |
| &emsp;save / add                                 |  1.0.0  | Save connection profiles.                                              |
|                                                  |         |                                                                        |
| frodo dcc / direct-configuration-control         | `4.0.0` | Direct Configuration Control (DCC) commands.                           |
| &emsp;session                                    | `4.0.0` | Manage direct configuration sessions.                                  |
| &emsp;&emsp;abort                                | `4.0.0` | Abort a direct configuration session.                                  |
| &emsp;&emsp;apply.                               | `4.0.0` | Apply configuration and end a direct configuration session.            |
| &emsp;&emsp;init                                 | `4.0.0` | Initialize a direct configuration session.                             |
| &emsp;&emsp;state.                               | `4.0.0` | Retrieve the state of the direct configuration session.                |
|                                                  |         |                                                                        |
| frodo email                                      |  1.0.0  | Manage email templates and configuration.                              |
| &emsp;template                                   |  1.0.0  | Manage email templates.                                                |
| &emsp;&emsp;delete                               |  3.1.0  | Delete email templates.                                                |
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
| &emsp;&emsp;export                               |  2.0.0  | Export secrets.                                                        |
| &emsp;&emsp;import                               |  2.0.0  | Import secrets.                                                        |
| &emsp;&emsp;list                                 |  1.0.0  | List secrets.                                                          |
| &emsp;&emsp;set                                  |  1.0.0  | Set secret description.                                                |
| &emsp;&emsp;version                              |  1.0.0  | Manage secret versions.                                                |
| &emsp;variable                                   |  1.0.0  | Manage variables.                                                      |
| &emsp;&emsp;create                               |  1.0.0  | Create variables.                                                      |
| &emsp;&emsp;delete                               |  1.0.0  | Delete variables.                                                      |
| &emsp;&emsp;describe                             |  1.0.0  | Describe variables.                                                    |
| &emsp;&emsp;export                               |  2.0.0  | Export variables.                                                      |
| &emsp;&emsp;import                               |  2.0.0  | Import variables.                                                      |
| &emsp;&emsp;list                                 |  1.0.0  | List variables.                                                        |
| &emsp;&emsp;set                                  |  1.0.0  | Set variable description.                                              |
|                                                  |         |                                                                        |
| frodo feature                                    | `4.9.0` | Manage features (e.g. groups, aiagent, am/2fa/profiles).              |
| &emsp;describe                                   | `4.9.0` | Describe feature.                                                     |
| &emsp;install                                    | `4.9.0` | Install a feature. IRREVERSIBLE.                                      |
| &emsp;list                                       | `4.9.0` | List features.                                                        |
| &emsp;validate                                   | `4.9.0` | Validate whether a feature is installable.                            |
|                                                  |         |                                                                        |
| frodo idm                                        |  1.0.0  | Manage IDM configuration.                                              |
| &emsp;count                                      |  1.0.0  | Count managed objects.                                                 |
| &emsp;export                                     |  1.0.0  | Export IDM configuration objects.                                      |
| &emsp;import                                     |  1.0.0  | Import IDM configuration objects.                                      |
| &emsp;list                                       |  1.0.0  | List IDM configuration objects.                                        |
| &emsp;schema                                     | `4.9.0` | Manage IDM schema.                                                     |
| &emsp;&emsp;object                               | `4.9.0` | Manage IDM managed object schema definitions.                         |
| &emsp;&emsp;&emsp;create                         | `4.9.0` | Create IDM managed object schema definition.                          |
| &emsp;&emsp;&emsp;delete                         | `4.9.0` | Delete IDM managed object schema definition.                          |
| &emsp;&emsp;&emsp;describe                       | `4.9.0` | Describe IDM managed object schema definition.                        |
| &emsp;&emsp;&emsp;export                         | `4.9.0` | Export IDM managed object schema definition.                          |
| &emsp;&emsp;&emsp;import                         | `4.9.0` | Import IDM managed object schema definition.                          |
| &emsp;&emsp;&emsp;list                           | `4.9.0` | List IDM managed object schema definitions.                           |
| &emsp;&emsp;&emsp;update                         | `4.9.0` | Update IDM managed object schema definition.                          |
| &emsp;&emsp;property                             | `4.9.0` | Manage IDM managed object property schema definitions.                |
| &emsp;&emsp;&emsp;create                         | `4.9.0` | Create IDM managed object property schema definition.                 |
| &emsp;&emsp;&emsp;delete                         | `4.9.0` | Delete IDM managed object property schema definition.                 |
| &emsp;&emsp;&emsp;describe                       | `4.9.0` | Describe IDM managed object property schema definition.               |
| &emsp;&emsp;&emsp;export                         | `4.9.0` | Export IDM managed object property schema definition.                 |
| &emsp;&emsp;&emsp;import                         | `4.9.0` | Import IDM managed object property schema definition.                 |
| &emsp;&emsp;&emsp;list                           | `4.9.0` | List IDM managed object property schema definitions.                  |
| &emsp;&emsp;&emsp;update                         | `4.9.0` | Update IDM managed object property schema definition.                 |
| &emsp;&emsp;relationship                         | `4.9.0` | Manage IDM relationship schema definitions.                           |
| &emsp;&emsp;&emsp;create                         | `4.9.0` | Create IDM managed object relationship schema definition.             |
| &emsp;&emsp;&emsp;delete                         | `4.9.0` | Delete IDM managed object relationship schema definition.             |
| &emsp;&emsp;&emsp;describe                       | `4.9.0` | Describe IDM managed object relationship schema definition.           |
| &emsp;&emsp;&emsp;export                         | `4.9.0` | Export IDM managed object relationship schema definition.             |
| &emsp;&emsp;&emsp;import                         | `4.9.0` | Import IDM managed object relationship schema definition.             |
| &emsp;&emsp;&emsp;list                           | `4.9.0` | List IDM managed object relationship schema definitions.              |
| &emsp;&emsp;&emsp;update                         | `4.9.0` | Update IDM managed object relationship schema definition.             |
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
| frodo mapping                                    |  2.0.0  | Manage IDM mappings.                                                   |
| &emsp;delete                                     |  2.0.0  | Delete IDM mappings.                                                   |
| &emsp;export                                     |  2.0.0  | Export IDM mappings.                                                   |
| &emsp;import                                     |  2.0.0  | Import IDM mappings.                                                   |
| &emsp;list                                       |  2.0.0  | List IDM mappings.                                                     |
| &emsp;rename                                     |  2.0.0  | Renames mappings from legacy to new naming scheme.                     |
|                                                  |         |                                                                        |
| frodo mcp                                        | `4.0.0` | Manage Model Context Protocol (MCP) integrations.                      |
| &emsp;server                                     | `4.0.0` | Manage Frodo MCP server lifecycle and metadata.                        |
| &emsp;&emsp;start                                | `4.0.0` | Start an MCP server session from frodo-lib capabilities.               |
| &emsp;&emsp;tools                                | `4.0.0` | List MCP tools exposed under the current policy/profile.               |
|                                                  |         |                                                                        |
| frodo node                                       | `4.0.0` | Manage custom nodes.                                                   |
| &emsp;delete                                     | `4.0.0` | Delete custom nodes.                                                   |
| &emsp;describe                                   | `4.0.0` | Delete custom nodes.                                                   |
| &emsp;export                                     | `4.0.0` | Export custom nodes.                                                   |
| &emsp;import                                     | `4.0.0` | Import custom nodes.                                                   |
| &emsp;list                                       | `4.0.0` | List custom nodes.                                                     |
|                                                  |         |                                                                        |
| frodo oauth                                      |  2.0.0  | Renamed from `app`! Manage OAuth2 clients and providers.               |
| &emsp;client                                     |  2.0.0  | Manage OAuth2 clients.                                                 |
| &emsp;&emsp;export                               |  2.0.0  | Export OAuth2 clients.                                                 |
| &emsp;&emsp;import                               |  2.0.0  | Import OAuth2 clients.                                                 |
| &emsp;&emsp;list                                 |  2.0.0  | List OAuth2 clients.                                                   |
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
| &emsp;type                                       | `4.9.0` | Manage scripting contexts (script types).                             |
| &emsp;&emsp;describe                             | `4.9.0` | Describe the bindings (available objects/APIs) exposed to scripts running in a given scripting context. |
|                                                  |         |                                                                        |
| frodo service                                    |  1.0.0  | Manage AM services.                                                    |
| &emsp;delete                                     |  1.0.0  | Delete AM services.                                                    |
| &emsp;export                                     |  1.0.0  | Export AM services.                                                    |
| &emsp;import                                     |  1.0.0  | Import AM services.                                                    |
| &emsp;list                                       |  1.0.0  | List AM services.                                                      |
|                                                  |         |                                                                        |
| frodo shell                                      |  2.0.0  | Launch the frodo interactive shell.                                    |
|                                                  |         |                                                                        |
| frodo theme                                      |  1.0.0  | Manage themes.                                                         |
| &emsp;delete                                     |  1.0.0  | Delete themes.                                                         |
| &emsp;export                                     |  1.0.0  | Export themes.                                                         |
| &emsp;import                                     |  1.0.0  | Import themes.                                                         |
| &emsp;list                                       |  1.0.0  | List themes.                                                           |
|                                                  |         |                                                                        |
| frodo help                                       |  1.0.0  | display help for command                                               |

### Node.js Versions

| Node.js |          1.x       |          2.x       |          3.x.      |.      ***4.x***    |          5.x       |
| :-----: | :----------------: | :----------------: | :----------------: | :----------------: | :----------------: |
|   14    | :white_check_mark: | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: |
|   16    | :white_check_mark: | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: |
|   18    | :white_check_mark: | :white_check_mark: | :white_check_mark: | :heavy_minus_sign: | :heavy_minus_sign: |
|   20    | :heavy_minus_sign: | :white_check_mark: | :white_check_mark: | :heavy_minus_sign: | :heavy_minus_sign: |
|   22    | :heavy_minus_sign: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :heavy_minus_sign: |
|   24    | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: | :white_check_mark: | :white_check_mark: |
|   26    | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: | :white_check_mark: | :white_check_mark: |
|   28    | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: | :white_check_mark: |

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

### Settings

`frodo settings` manages local frodo CLI preferences -- separate from connection profiles above, and from `frodo config`/`config-manager`, which manage remote Ping/AIC configuration. `theme` is the first settings category, letting you pick a color theme suited to your terminal. A theme is two independent preferences: a **background** (`dark`, `light`, `blue`, `yellow`, or auto-detected from your terminal) and a **contrast** level (`high-contrast`, `regular`, or `vibrant` -- the default, the most colorful option each background supports):

```console
$ frodo settings theme list
$ frodo settings theme background light
$ frodo settings theme contrast high-contrast
$ frodo settings theme detect
```

Run `frodo settings` or `frodo settings theme` with no further arguments for an interactive picker (Escape backs out a level instead of requiring Ctrl+C). `frodo settings theme show` renders a realistic sample of frodo-cli output in the active theme -- the quickest way to check whether it actually works on your terminal. Themes are plain JSON files under `~/.frodo/themes/` -- copy one there under a new name to define your own.

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

## MCP Server

Frodo-cli includes a turn-key [MCP](https://modelcontextprotocol.io/) server: point any MCP-compatible client at it and it can discover and operate on your tenant using the same capabilities the CLI itself uses, no separate server to build or host. It reuses a [connection profile](#connection-profiles) you've already saved, so if you can already run `frodo info my-tenant`, you're ready to start the MCP server too.

```console
frodo mcp server start my-tenant
```

For instructions on configuring a specific MCP client (VS Code Copilot, Claude Code, Claude Desktop, and others) to connect to this server, see the [MCP client setup guide](../docs/MCP_CLIENT_SETUP.md).

### One tool surface, many skills

Whatever the configuration, a connected client always sees the same five tools: `frodo_discover` (one-time bootstrap: target, deployment type, object families), `frodo_find_skills` (rank the skills that fit a task, auto-executing a unique read-only recommendation by default), `frodo_describe_skill` (one skill's full contract), `frodo_dispatch_read_only` (run a read-only skill), and `frodo_dispatch` (run a mutating skill). What `--policy` and `--profile` control is the skill layer underneath: which of frodo's capabilities those tools are allowed to discover and dispatch. A policy narrows what the client can *do*; a profile narrows what it gets to do *it to*. Use `frodo mcp server info --policy <preset> --profile <profile>` to see the resulting counts for an exact combination, `frodo mcp server skills` to browse the active skills, and `frodo mcp server policies` / `frodo mcp server profiles` to list the registries.

### Policies (`--policy`)

A policy is the safety posture applied to every skill before it can be exposed: it filters by operation type (create, read, update, delete, search, list, count, export, import) and by risk class (low, medium, high, critical -- the blast radius of the operation). Every preset except `admin` also denies critical-risk skills outright, because some read-shaped operations (e.g. service-account reads) return material that should not reach a client even in an otherwise read-only session.

| Policy | Default | Can do | Cannot do | Tools (canonical + discovery) | Active skills / inventory |
|--------|---------|--------|-----------|-------------------------------|---------------------------|
| `read-only` | | count, read, search, list | create, update, delete, import, export; critical-risk skills; special skills | 5 (4 + 1) | 189 / 679 |
| `agentic` | yes | create, count, read, update, search, list; special skills | delete, import, export; critical-risk skills | 5 (4 + 1) | 332 / 679 |
| `standard` | | everything `agentic` allows, plus export | delete, import; critical-risk skills | 5 (4 + 1) | 418 / 679 |
| `admin` | | every operation and risk class, including special skills | nothing | 5 (4 + 1) | 679 / 679 |

Counts measured with the default `all` profile and no tenant connection (`frodo mcp server info --policy <preset> --profile all`); they scale down with a narrower profile, so check `info` for your exact combination. "Inventory" is the profile's unfiltered skill pool; "active skills" is what survives the policy and backs the tools (frodo reports the same number as "backing skills"). The five-tool surface is fixed at every policy -- `frodo_dispatch` stays registered even under `read-only`; it just has no mutating skills to reach.

The default is `agentic`: the `standard` posture (which permits data *export* for operator-led maintenance) with `export` additionally denied, so an autonomous assistant can make progress with create/update flows but can neither destroy anything, nor bulk-import, nor bulk-extract tenant data. `read-only` is for audits, inventory, and least-privilege sessions; `standard` for operator-led maintenance that needs extraction but keeps destructive paths guarded; `admin` removes all built-in restrictions and should only run in trusted sessions with change control. `agentic`, `standard`, and `admin` also include frodo's "special" skills (operations outside the CRUD vocabulary, e.g. recon cancellation and signing-key generation); `read-only` excludes them.

### Profiles (`--profile`)

A profile scopes the surface by *subject area* instead of by danger: it selects the skills that concern one administrative responsibility and hides the rest. Where a policy protects the tenant from the client, a profile protects the client's context -- a journey engineer's assistant does not need IDM reconciliation skills in its search space. Profiles compose freely with policies (`--policy read-only --profile authentication` is exactly what it sounds like).

| Profile | Default | Scopes the surface to | Typical use | Active skills / inventory (agentic policy) |
|---------|---------|------------------------|-------------|--------------------------------------------|
| `all` | yes | every non-disabled domain -- the full derived universe | broad agent sessions; exploratory work | 332 / 679 |
| `authentication` | | journeys, nodes, OAuth/OIDC, login, sessions (`authn`, `oauth2oidc`, `login`, `session`) | end-to-end authentication administration | 42 / 86 |
| `journey-dev` | | journey engineering only: journeys, nodes, journey settings (`authn.journey`, `authn.node`, `authn.settings`) | building and tuning login journeys | 26 / 42 |
| `authorization` | | access control, policy sets, resource types, roles, user-adjacent operations (`authz`, `role`, `user`) | access-control administration | 25 / 63 |
| `federation` | | SAML, WS-Federation, admin federation (`saml2`, `cloud.adminFed`, `cloud.wsfed`) | trust and federation configuration | 36 / 236 |
| `iga` | | certifications, events, glossary, request forms/types, workflows (`cloud.iga`) | identity-governance operations | 31 / 212 |
| `apps` | | application lifecycle, SSO/provisioning apps, AI-agent app workflows (`app`, `cloud.env.enableAIAgentFeature`, `cloud.feature`) | app onboarding and access-app workflows | 10 / 229 |
| `managed-objects` | | IDM object model and lifecycle: managed objects, mappings, recon, connectors, organization, config, system, script (`idm.*`) | identity data modeling and synchronization | 60 / 118 |

Counts use the default `agentic` policy and no tenant connection (`frodo mcp server info --profile <profile>`); the pool behind each profile (the inventory number) is larger than what a policy activates. Internal frodo domains (`state`, `cache`, `factory`, `utils`) are never exposed by any profile -- `--include-domains` and `--exclude-domains` override the profile's top-level domain selection, and `--include-utils` affects the inventory pool only; no profile or policy exposes utils skills.

### Deployment modes

The server runs in one of two modes, selected with `--transport` (default `stdio`).

#### Developer client (stdio) -- the recommended default

In the default mode the MCP client itself launches `frodo mcp server start` as a subprocess and talks to it over stdin/stdout, once per client session. Nothing listens on the network at all: the server exists only while the client session exists, runs with the user's own saved [connection profile](#connection-profiles), and is gone when the client closes. This is the right mode for a single developer working from their own machine, and it is why it is the default -- there is no port to protect, no process to supervise, and nothing for anyone else to reach.

```json
{
  "mcpServers": {
    "frodo": {
      "command": "frodo",
      "args": ["mcp", "server", "start", "my-tenant"]
    }
  }
}
```

The exact config file and schema differ per client (VS Code uses a `servers` key and an explicit `"type": "stdio"`; Claude Code uses `claude mcp add`) -- the [MCP client setup guide](../docs/MCP_CLIENT_SETUP.md) has copy-paste snippets for each. Extra scoping is just more arguments, e.g. `["mcp", "server", "start", "--policy", "read-only", "--profile", "journey-dev", "my-tenant"]`.

#### Shared server (HTTP transport)

For a server that outlives one client session -- a gateway that several clients or agents share, or a container that cannot spawn processes on your host -- start it yourself as a long-running process over the HTTP transport:

```console
frodo mcp server start --transport http --bind-host 0.0.0.0 --port 6277 --mcp-auth-token <secret> my-tenant
```

The flags that matter:

- `<profile>` (positional, after the flags) -- which saved [connection profile](#connection-profiles) to connect with: a unique substring of, or the alias for, one profile's host URL (also settable via `FRODO_HOST`). Without it the server starts and `/health` answers, but it is connected to nothing and every tool call fails. The profile's stored password must be decryptable on this machine (the `masterkey.key` from the machine that saved the profile).
- `--transport http` -- serve `POST /mcp` (MCP) and `GET /health` (liveness) instead of stdio.
- `--bind-host` -- interface to bind. Default `127.0.0.1` (local machine only); `0.0.0.0` or a LAN address exposes the port and is what triggers the token requirement below.
- `--port` -- default `6277`; `--port auto` lets the OS pick an ephemeral port and reports the resolved value.
- `--mcp-auth-token <secret>` -- bearer token required on every `/mcp` request. Prefer the `FRODO_MCP_AUTH_TOKEN` environment variable for anything long-lived (keeps the secret out of `ps`); the flag wins if both are set. Required when binding a non-loopback host.
- `--allowed-hosts <host...>` -- extra `Host` header values to accept, extending the localhost default (see the security model below). Variadic: it swallows everything after it, so put positional arguments before it or separate them with `--`.

The canonical shared-server story is an AI gateway in a Docker container on the same machine: the container dials the host via `host.docker.internal` (accepted automatically on a non-loopback bind), frodo binds non-loopback with a token, and the gateway authenticates with the same secret. The repo also ships a `Dockerfile` and compose stack for running frodo's MCP server itself in Docker -- the compose example mounts `Connections.json` **and its `masterkey.key`** read-only and selects the profile via `FRODO_HOST` (the image's default CMD carries no tenant; a container started without one comes up healthy but connected to nothing). The [client setup guide's HTTP transport section](../docs/MCP_CLIENT_SETUP.md#running-the-http-transport) walks through all of it, including the compose fragments, `frodo mcp server stop`, the PID lockfile, and the operational knobs (`--max-body-size`, `--max-concurrent-requests`, heartbeat) -- the README gives the pattern, that guide gives the detail.

#### OAuth 2.1 resource server (per-caller identity)

`--mcp-auth-token` gives every caller the *same* identity -- whoever holds the shared secret runs every MCP request as the one account the server authenticated with at startup. `--oauth-resource-server` is the alternative for a shared HTTP server where callers should be distinguishable: each `POST /mcp` request presents its own bearer token, verified per request, and executes with that caller's own identity instead of one shared startup credential. It requires `--transport http` and is mutually exclusive with `--mcp-auth-token`/`--allow-unauthenticated`.

```console
frodo mcp server start --transport http --bind-host 0.0.0.0 --port 6277 --oauth-resource-server my-tenant --type cloud
```

By default (**AM as IdP**) a caller's token is verified directly against the target tenant's own `/oauth2/tokeninfo` endpoint and used as-is as the AM credential -- the caller authenticated to AM/AIC itself, and frodo just confirms the token is live before using it. Pass `--external-idp-issuer <url> --external-idp-audience <audience> --claims-config <file>` (all three together) to instead validate tokens from a third-party OIDC provider (Entra ID, Okta, etc.): the caller never touches AM directly, and a claim on the verified token (named by `claimsConfig.claimName`) is looked up in the claims-config file's `mappings` to pick which of the target's [additional service accounts](#connection-profiles) actually talks to AM on that caller's behalf. A claim matching nothing in the table is refused -- there is no default/fallback credential, and the mapping can only ever point at a named additional service account, never an admin account or the profile's own primary credential.

Both modes serve RFC 9728/8414 OAuth discovery documents (`/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`) so a compliant MCP client can find its authorization server on its own from a `401` alone, no manual client configuration needed on a happy path where the authorization server already supports what the client needs.

That happy path assumes the authorization server supports Dynamic Client Registration (DCR) -- most don't. AM's own real DCR endpoint exists but requires an initial access token frodo/clients don't have; Entra ID has no DCR support at all. `--registered-client-id <client-id>` closes that gap: it turns this server into a lightweight, entirely stateless OAuth proxy for a single, pre-provisioned, public (no-secret, PKCE-only) client already registered directly with AM/AIC or the external IDP.

```console
frodo mcp server start --transport http --oauth-resource-server \
  --external-idp-issuer https://login.microsoftonline.com/<tenant>/v2.0 \
  --external-idp-audience <client-id> --claims-config claims.json \
  --registered-client-id <client-id> --public-url https://mcp.example.com \
  --oauth-scope openid api://<client-id>/.default my-tenant
```

With it set, this server becomes the advertised OAuth `issuer` and serves three proxy endpoints: `/oauth2/register` always hands back the same configured client_id (nothing is actually registered), `/oauth2/authorize` is a stateless redirect to the real upstream authorize endpoint with every parameter -- including the connecting client's own redirect URI -- passed straight through unmodified, and `/oauth2/token` is a byte-faithful relay to the real upstream token endpoint. The real authorize/token decisions are still made entirely by AM/the external IDP against that app registration's own policy; this server only ever relays bytes and never stores anything. A native/loopback MCP client's own (typically ephemeral-port) redirect URI working without being individually pre-registered relies on [RFC 8252 §7.3](https://datatracker.ietf.org/doc/html/rfc8252#section-7.3), which requires authorization servers to accept any port on a loopback-IP redirect URI -- confirmed against both AM and Entra ID. A connecting client's actual requested redirect URI is always logged (at the default `info` level) the first time it registers, for confirming or debugging what the app registration needs to allow.

Getting this far only gets a client to the authorize redirect -- some authorization servers still reject the resulting request if it has no `scope` parameter at all, which an MCP client with no scope of its own configured will produce unless told otherwise (confirmed live against a real Entra ID tenant: `AADSTS900144: The request body must contain the following parameter: 'scope'`). `--oauth-scope <scope...>` fixes this: it names the scope(s) a client should request, advertised via both the protected-resource metadata's `scopes_supported` and the `401` challenge's `WWW-Authenticate: ... scope="..."` -- the two sources, in priority order, a spec-compliant client consults to fill in `scope` when it has none configured itself. Set it to whatever the target OAuth2 client/app registration actually needs -- for AM this is typically just `openid`; for Entra, an access token audienced to your own app also needs that app's own exposed scope, e.g. `api://<client-id>/.default`.

`--public-url` overrides the externally-reachable base URL this server advertises (in both the plain resource-server case and the `--registered-client-id` proxy case above) when it can't be inferred from the incoming request -- normally a request's own `Host` header (once checked against the same allow-list as `--allowed-hosts`) already gives the right answer even behind a wildcard bind, but a reverse proxy or TLS-terminating gateway in front of this process needs it stated explicitly.

### HTTP transport security model

The HTTP transport is built on an explicit layered model; nothing is exposed without deliberate configuration:

- **Loopback-only by default.** The server binds `127.0.0.1:6277`, reachable only from the machine it runs on.
- **DNS-rebinding-safe Host and Origin validation.** Every request's `Host` and `Origin` headers are validated against the localhost set (`localhost`, `127.0.0.1`, `[::1]`); a foreign Host header -- the shape a DNS-rebinding attack produces -- is answered `403` before the MCP endpoint is touched. `--allowed-hosts` *extends* the set, and `host.docker.internal` is added automatically to the Host allow-list (the Origin check stays localhost-only) whenever the bind host is non-loopback, so a bridge-network container can reach the host without weakening the default.
- **Leaving loopback requires a token.** Binding a non-loopback host without `--mcp-auth-token` (or `FRODO_MCP_AUTH_TOKEN`) **refuses to start**; `--allow-unauthenticated` is the explicitly named escape hatch for accepting that risk.
- **Bearer auth on `/mcp` only.** When a token is configured, every `POST /mcp` must carry a matching `Authorization: Bearer` header -- compared timing-safely over SHA-256 digests -- and failures get `401` with a `WWW-Authenticate: Bearer` challenge. `GET /health` stays open for liveness probes (it can only ever answer `{"status":"ok"}`). The token value is never logged or echoed; startup summaries report only `HTTP auth: on`.
- **Bounded request handling.** Request bodies are capped at 1 MiB (`--max-body-size`, env `FRODO_MCP_MAX_BODY_SIZE`) -- enforced as a `Content-Length` pre-check and a mid-stream accumulation cap; over-limit requests are answered `413` with a JSON-RPC error and the socket is closed. Concurrent handler executions are capped at 64 (`--max-concurrent-requests`, env `FRODO_MCP_MAX_CONCURRENT_REQUESTS`) -- over-cap requests get `429` with `Retry-After: 1` rather than queueing.
- **Stateless operation.** The transport keeps no sessions -- there is no session state to hijack, and every request is evaluated on its own merits: Host/Origin gates, then the bearer check when configured.
- **The port is privileged.** The server authenticates to the tenant once at startup (with the [connection profile](#connection-profiles) credentials -- typically an admin account or service account), and every MCP request it accepts executes with those credentials. Treat a listening MCP HTTP port accordingly: keep it on loopback unless something specific needs otherwise, require a token for any non-loopback bind, and keep it off untrusted networks. The design makes the safe path the default path -- loopback needs no setup, and the port cannot leave loopback without an explicit token (or an explicit `--allow-unauthenticated`).

Request metadata headers are validated era-conditionally: current-protocol clients get the full header cross-checks, while earlier-era gateways (e.g. LiteLLM's default 2025-11-25 revision) are not 400'd for headers their protocol era never sends.

The server authenticates before accepting MCP requests and uses Frodo's detected or explicitly overridden deployment type when ranking skills. Cloud and ForgeOps deployments prefer `frodo.idm.managed` for user management, while classic deployments prefer `frodo.user`. When the deployment is known, incompatible skills are hidden from `frodo_find_skills` by default; pass `includeIncompatible: true` for diagnostics. Direct incompatible dispatch remains rejected before invocation.

For Cloud and ForgeOps, startup performs a bounded, best-effort hydration of tenant managed-object type names. Semantic queries such as `count users`, `users/groups`, or a native type such as `alpha_user` can then find managed-object skills; matching concrete types are returned in a bounded `matchedObjectTypes` list. Hydration failures fall back to static skill metadata. `frodo_discover` reports the sanitized active host and MCP profile so clients do not need to inspect local MCP configuration.

For agent discovery, start with a concise `query`, the intended `operationTypes`, and a small `limit` such as 5. The logical `user.User` coordinates are deployment-aware: they select `idm.ManagedObject` identity skills on Cloud/ForgeOps and AM `user.User` skills on classic. Other `domain` and `objectType` selectors remain exact capability coordinates rather than tenant object names. A zero-result response caused by exact filters includes guidance to retry without those selectors rather than treating the capability as unavailable. Active target and deployment metadata appear first in `frodo_discover`, ahead of its larger capability catalog.

Routine startup information is sent to compatible MCP clients as protocol-level `info` messages rather than process stderr. MCP server logging is controlled exclusively by `--mcp-log-level off|error|warn|info|debug` and defaults to `info`; the existing `--verbose` and `--debug` options retain their legacy Frodo behavior but do not change MCP protocol logging. Frodo emits the selected levels even when a client does not call `logging/setLevel`, although clients may still hide received records in their own output. At the default MCP `info` level, `frodo_find_skills` logs its supplied free-text query or structured selectors, candidate count, and up to five ranked candidates with their routing status in a compact single-line record. Credentials, object-valued authentication records, dispatch arguments, and result payloads are not logged. MCP logging does not create a log file. Live stdio sessions reserve stdout for JSON-RPC and do not write routine MCP diagnostics to stderr. Use `--dry-run --json` for a structured startup summary without starting a transport.

## Feature requests

Please use the repository's [issues](https://github.com/rockcarver/frodo-cli/issues) to request new features/enhancements or report bugs/issues.

## Contributing

If you would like to contribute to frodo, please refer to the [contributing instructions](../docs/CONTRIBUTE.md).

## Maintaining

If you are a maintainer of this repository, please refer to the [pipeline and release process instructions](../docs/PIPELINE.md).
