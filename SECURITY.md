# Security policy

## Reporting a vulnerability

Please report a suspected vulnerability privately, with GitHub's private vulnerability reporting: open the **Security** tab of the repository and choose **Report a vulnerability** ([direct link](https://github.com/rockcarver/frodo-cli/security/advisories/new)).

Do not open a public issue or pull request for a suspected vulnerability.

Include, as far as you can:

- the affected version (`frodo --version`) and how you installed it,
- the steps to reproduce it, ideally a small working proof of concept,
- the impact, and
- who controls the input that triggers it (see the threat model below).

## Scope and threat model

`frodo` and its MCP server run with the privileges of the person who starts them. That person, their command line, environment, connection profiles and the files they point the tool at are trusted. A report has to show an attacker who controls an input without already controlling those.

The MCP HTTP server binds to loopback by default and needs a token when it is bound to any other address. [Decision record 0021](docs/decisions/0021-the-mcp-http-server-is-loopback-only-until-it-is-given-a-token.md) states that model. Most network traffic goes through [frodo-lib](https://github.com/rockcarver/frodo-lib/security/policy), which has its own policy.

## Out of scope

- Reports that need control of the operator's own machine, command line, environment, connection profiles or files. The person who runs Frodo is trusted.
- Automated scanner output without a working proof of concept.
- Vulnerabilities in third-party dependencies that Dependabot already tracks. Please report those upstream.

## What to expect

Frodo is maintained by a small team of volunteers. We answer on a best-effort basis, handle confirmed vulnerabilities through a private advisory, and disclose them after a fix is released. We credit the reporter if they want to be named.

## Unsolicited fix pull requests

We read a pull request that claims to fix a security problem before we run any automated checks on it, and we may close it without merging. Please report the problem privately instead. How we handle reports is recorded in [core 0017](docs/decisions/core/0017-security-reports-and-fixes-are-handled-privately-by-a-maintainer.md).

## Supported versions

Fixes are made on `main` and released in the next release.
