# Project scope

Read by the issue gate's scope check (Repo Concierge). The check is off for a repository without this file.

## Purpose

Frodo CLI (`@rockcarver/frodo-cli`) is a command line interface to export, import and manage PingOne Advanced Identity Cloud environments, ForgeOps deployments and classic deployments. It is powered by frodo-lib and also ships a turnkey MCP server (`frodo mcp server start`).

## In scope

- Commands that manage one kind of configuration artifact each (agents, applications, authentication settings, journeys and nodes, scripts, themes, OAuth2 clients, IDM configuration, ESVs, IGA and more) through a common set of sub-commands: `delete`, `describe`, `export`, `import` and `list`, plus the occasional extra
- Full-configuration export and import, promotion between environments, and `config-manager` compatibility
- Connection profiles and login (`frodo conn`, `frodo login`), environment information, logs and diagnostics
- The interactive command mode and the shell
- The MCP server: policies, profiles and skills
- Installing and distributing the CLI (npm, Homebrew, the native binaries), its documentation, tests and build and release pipeline

## Out of scope

<!-- Every item here can close an issue automatically as not planned. Keep the list short and specific. -->

- Operating-system or file-system chores such as mounting drives or network shares, or managing the shell environment. The CLI reads and writes local files at the paths you give it; mount the location first.
- Managing other vendors' identity platforms, such as Okta, Auth0, Keycloak or Microsoft Entra ID. Frodo manages the Ping Identity platform.
- Exporting ESV secret values unencrypted. Frodo always encrypts exported ESV secret values and leaves secrets with the environment they belong to.

## Needs a maintainer

- Support for Ping products other than Advanced Identity Cloud, ForgeOps and classic (PingAM, PingIDM) deployments
- Exporting platform passwords or other stored secret values. Frodo generally does not export them; administrators are expected to use configuration placeholders and ESVs.
- Installing, provisioning or upgrading the platform itself, as opposed to managing its configuration
- A graphical or web user interface
- Reading from or writing to remote storage directly (cloud buckets, network shares, Git remotes) instead of local files

## Where to go instead

- Network drives and other remote locations: mount them with your operating system and pass the mounted path.
- Secrets: use ESVs and configuration placeholders so exports do not need the secret values (see "Considerations" in the README).
