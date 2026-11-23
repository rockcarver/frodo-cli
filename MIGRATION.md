# Frodo CLI Migration Guide

This page summarizes the breaking changes between major versions of
`@rockcarver/frodo-cli` — everything you need to migrate scripts and
automation from one major version to the next without deciphering the full
[changelog](CHANGELOG.md). What a release may change, and what has to be
listed here, is decided by
[record 0048](docs/decisions/0048-a-major-release-may-change-commands-a-minor-or-patch-release-does-not-break-them.md).

---

## Upgrading to 5.x

### From 4.x

**The text of an MCP tool result is scrubbed of known values**: as its last
step, the text of a tool result of `frodo mcp server start` has the values that
the connection holds replaced by `<redacted>`: the access and session values,
the cookie value, the refresh and ID values, the log API secret, the password
and the keys (each when it is at least 16 characters long), the values of the
configuration header overrides whose names say they are secrets (16 or more
characters), the values of all authentication header overrides, whatever the
header is called (8 or more characters), and the values of the request in the
resource-server mode, and the user info of the host URL of the connection
(8 or more characters each). The password in the user info of any URL
(`scheme://user:password@host`) is replaced as well, whatever its length: the
user info goes up to the last at sign before the authority ends (at a slash, `?`,
`#`, a backslash, white space or a quote), so a password may hold `, ; | ) ] } &`,
and an address that follows without a space (`http://u:p@h,mail@y`) is read as
part of the password. A value shorter than 16 characters that the connection did
not provide as a credential is not matched by value.
`Bearer` followed by a JSON web token or by 16 or more characters is written as
`Bearer <redacted>` as well, and so are a JSON web token anywhere, the line of a
sensitive header (`Authorization: ...`, at the start of a line) and the string
value of a key that is named like one. A JSON
text stays JSON: the value of such a key that is an object, a list, a number, a
boolean or `null` is left as it is. In the text of an error (not in the data of a result), the password of a user
info that has no scheme (`user:password@host`) is replaced as well.
A key in single quotes takes a value in single quotes and a key in double quotes
one in double quotes: a pair with mixed quotes (`{'cookie': "a=b"}`) is not
replaced, because reading across two kinds of quotes would break the JSON text
of a result. A value that is shorter than the length it
is looked for at is not looked for in the text (an ordinary word would be
replaced in every result); the line of the header that carries it is replaced
by the name of the header.

**`frodo journey delete` says more when the journey itself cannot be deleted**:
the error text now starts with `Error deleting <realm> realm journey <id>` and
goes on with the network error (URL, status, code, reason and message), where it
used to print `HTTP client error` with the code, the status and the message. The
library hands the command a `FrodoError` instead of the error of the request.

**`frodo journey disable` prints the cause of a failure**: when a journey cannot
be disabled, the command used to print only `Error disabling journey <id>`. It
now goes on to print the error that the library reports (the network error with
URL, status, code, reason and message), the way `frodo journey enable` does. The
exit codes are unchanged.

**`--curlirize` prints the `authId` of a login as `<redacted>`**: the curl command
that is printed for a request that carries an `authId` prints `<redacted>` in
its place. `--curlirize-secrets` prints the value.

**`frodo log tail` retries failed polls**: the tail used to end silently after
one failed poll with exit code 0. It now keeps following, with increasing pauses,
and gives up after 5 failures in a row with exit code 1. The new `--keep-trying`
option keeps following through longer outages until Ctrl-C. Rate limiting (HTTP
429) is waited out with or without it and does not count as a failure. Refused
credentials (HTTP 401/403) always stop the tail with exit code 1.

**`frodo shell --web` opens the browser, and works in the native binary**: the
help and the docs said that the web console opens in a browser, but it only
printed a one-time sign-in link. It now opens the default browser and prints the
link as well. The browser is not handed the link: it is handed the address of a
private file (in a new folder of your temporary directory that only you can
enter) that sends it on to the link, because the arguments of a program are
readable by other processes. The file is removed when the link is used, after two
minutes and when the console stops. `--no-open` (the option of the browser login,
which it shares) or the environment variable `FRODO_BROWSER_LOGIN_NO_OPEN` set
to a true value (until now listed in the help and read by nothing) turns the
opening off, and for the browser login too: only the link is printed. The
terminal says when a browser signs in, and after 20 seconds without a sign-in
reminds you of the printed link. A browser that cannot be opened, or an opener
that ends with an error, never stops the console. In the native binary
(Homebrew, the release zips) every tab of the web console failed with `Internal
error`; the binary now starts its engines itself. An engine that cannot start now
ends the page's request with the reason, and the page asks again after a growing
pause instead of at once.

**`frodo shell`: `_` is no longer lodash**: the console (terminal and web) bound
`_` to the lodash library in 5.0.0-30, the only release that did, and no longer
ships lodash. In the terminal console `_` is now the Node.js REPL's own `_`, the
value of the last result (`1 + 1`, then `_ + 1` is 3). The web console keeps no
last result, so there `_` is `undefined` until a script assigns it, and a value
a script assigned now survives the console's Reset JS (it used to be replaced by
lodash). `frodo.utils.json` has in-house helpers (`get`, `put`, `findInArray`,
`getPaths`, `cloneDeep`, `mergeDeep`) for JSON search and merge; they are not
drop-in replacements for lodash functions, and `get` takes a path array.
Otherwise use the JavaScript built-ins.

**The console's REST calls (`$`) are sent by the library's request instances**:
`$` in `frodo shell` built its own HTTP client and copied the library's
credential handling. It now uses the same request instances as every command,
so the network settings of the session apply to it. What a script can notice: an
error that it prints (`console.log(error)`, `util.inspect(error)`) shows the
`Authorization` and `Cookie` values it was sent with as `<redacted>`, where it
printed them in clear. Printing and copying the error is safe now; reading is
not hidden: `error.cause.config` and `error.cause.request` still hold the request
as it was sent, the credential values included, and a script (or the web
console, when you evaluate `error.cause.config`) can read them by name. The
header overrides of the connection go to the tenant only: they used to go to
every host the console called, and the configuration header overrides were never
sent. A call to another host now carries no credential and no override, also
when a redirect leads there, and a URL is judged by the origin it is sent to
(scheme, host and port: one with a backslash before an `@` is sent to the host
after it, and an `http://` URL for an `https://` environment is another origin
and carries no credential). `HTTP_PROXY`,
`HTTPS_PROXY` and `NO_PROXY` work as for every command (SOCKS and PAC proxies,
proxy credentials and the messages about a failing proxy too), `--retry`
applies, and `--curlirize` prints a curl command for each call with the credential values
replaced by `<redacted>`. A call that the server refuses with 401 is sent once
more with a renewed credential when the login can be renewed (a `POST` too), and
in a browser-login session a refused `GET` (403) is tried once with a wider
credential, as for every command. In a browser-login session `/openidm` calls
send the primary token, as every IDM command does, and no longer ask for a token
exchange for each call. A credential that has expired and cannot be renewed ends
the call with a longer message that starts as before (`Cached bearer token has
expired and cannot be silently refreshed`), and nothing is sent.

**The npm package runs the CLI in one process, and a signal ends it with the
signal's status**: in 4.x `frodo` (`dist/launch.cjs`, the npm `bin` entry and the
Docker image) started a second Node process and copied its exit code, which was 0
after a signal. A command that a signal ends without a handler of its own, such
as `frodo mcp server start --transport stdio` after SIGTERM, SIGINT or SIGHUP, is
now ended by the signal (a shell reports 143, 130, 129, as for the native
binary); `--transport http` still exits 0 after its graceful shutdown. A script
or supervisor has to accept the signal status as a normal stop. Source maps are
off by default (stack traces show `dist/app.cjs` lines; `FRODO_SOURCE_MAPS=1`
turns them on), and `ps` shows one `node .../launch.cjs` process, so
`pkill -f app.cjs` no longer finds a server: use `frodo mcp server stop`.
`require('@rockcarver/frodo-cli')` (unsupported) runs the CLI in the importer.

**Removed command aliases** (backwards-compatibility spellings of the
canonical commands; use the canonical name):

| Removed alias                  | Canonical command      |
| ------------------------------ | ---------------------- |
| `direct-configuration-control` | `frodo dcc`            |
| `logs`                         | `frodo log`            |
| `connection`, `connections`    | `frodo conn`           |
| `policyset`                    | `frodo authz set`      |
| `details`                      | `frodo realm describe` |
| `ig`                           | `frodo agent gateway`  |

**Kept**: `frodo conn save` retains its `add` alias.

**`frodo agent ai` is deprecated, use `frodo aiagent`**: AI agents are a kind of
identity of their own in Advanced Identity Cloud, not another integration agent
like the web, Java and Gateway agents, so they have a root command group:

| Deprecated (works through 5.x) | Use                      |
| ------------------------------ | ------------------------ |
| `frodo agent ai list`          | `frodo aiagent list`     |
| `frodo agent ai describe`      | `frodo aiagent describe` |
| `frodo agent ai export`        | `frodo aiagent export`   |
| `frodo agent ai import`        | `frodo aiagent import`   |
| `frodo agent ai delete`        | `frodo aiagent delete`   |

`frodo agent ai` is frozen: it behaves as it did in 4.x and the 5.0 prereleases,
and differs only by the deprecated mark in its help, the notice, the missing
usage examples and the exit code of `describe` for an agent that is not there
(below). The commands and options of `frodo aiagent` are the same (and so
are the files they write and read, `<id>.ai.agent.json`), with one difference:
`frodo aiagent import` requires `-f, --file` or `-A, --all-separate`, so `-i` or
`-a` alone is rejected before it connects, with the list of what is missing.
`frodo agent ai import` still accepts `-i` or `-a` without `-f`, as before.
Everything else this guide says about `agent ai` holds for `aiagent` too.

`frodo agent ai` keeps working through 5.x and prints a notice that names `frodo
aiagent` on standard error (standard output and the exit code are unchanged).
Its removal is proposed for 6.0.0 (see [a major release may change
commands](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0048-a-major-release-may-change-commands-a-minor-or-patch-release-does-not-break-them.md)).
To migrate, replace `frodo agent ai` with `frodo aiagent` in scripts and
automation, and give `import` its `-f` or `-A`. The generic commands (`frodo
agent list`, `agent export` and the others) still handle AI agents as before.
Defaults saved with `--prompt --save-defaults` are kept per command, so those
saved for `agent ai ...` do not apply to `aiagent ...`; save them again (`frodo
settings defaults --clear 'agent ai list'` removes the old ones).

**Journey import validation**: journey imports, full configuration imports,
config-manager journey pushes, and `frodo promote` now validate journey
references by default. Pass `--no-validate` to restore the previous behavior.

**`frodo promote` asks before it prunes**: after `promote` deletes a journey it
prunes (permanently deletes) every orphaned node of the realm, not only those of
that journey. In 4.x it did so without asking, and the two options that were
meant to control it had no effect: `--propmt-prune` was misspelled and
`--no-prune` was read under the wrong name. In 5.x a terminal is asked first
(the default answer is no), `-y`/`--yes` prunes without asking, and
`--no-prune` skips the prune without a question. Without a terminal and without
`--yes` the prune is refused: it is a failed change in the summary and the
command exits 1 (unless `--allow-failures` was given). A script or a pipeline
that relied on the prune adds `--yes`; one that does not want it adds
`--no-prune`. `--prompt-prune` (and the old spelling `--propmt-prune`) is
accepted and is what happens on a terminal anyway; it cannot be combined with
`--yes`, and `--yes` cannot be combined with `--no-prune`.

**Mutually exclusive options are now rejected**: 4.x accepted many option
combinations in which one option was silently ignored (the help said "Ignored
with ..."). In 5.x the command refuses to run and exits with code 1, before it
connects to anything:

```text
error: option '-i, --agent-id <agent-id>' cannot be used with option '-a, --all'
```

A script that passed both options must drop the one that was being ignored.
`frodo <command> -h` shows "Cannot be used with ..." on every affected option.
The rejected combinations follow these patterns:

| Combination                                                                                            | Commands                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An id or name option (`-i`, `-n`, `-u`, `--script-id`, ...) together with `-a` or `-A`                 | Export, import and delete commands that offer them (admin federation, agent, app, authz, config, email template, esv, iga workflow, idm, idp, journey, mapping, node, oauth client, realm, role, saml, script, secretstore, server, service, theme) |
| Two ways to select the same object (`-i` with `-n`, `-i` with `-u`)                                    | app, authz type, node, realm, role, script, server, theme                                                                                                                                                                                           |
| `-a` together with `-A`                                                                                | Every export and import command that offers both                                                                                                                                                                                                    |
| `-f, --file` together with `-A`                                                                        | Every export and import command that offers both                                                                                                                                                                                                    |
| `--no-deps` with `-a` or `-A`; `-d, --default` with `-i` or `-n`                                       | `script export`                                                                                                                                                                                                                                     |
| The deprecated `-s, --script` with `-i`, `-n`, `-a` or `-A`                                            | `script export`                                                                                                                                                                                                                                     |
| `--no-deps` with `-A`                                                                                  | `script import`                                                                                                                                                                                                                                     |
| `-t, --secretstore-type` with `-a` or `-A`                                                             | `secretstore delete`, `export`, `import`                                                                                                                                                                                                            |
| `-g, --global` with `-a` or `-A`                                                                       | `config import`                                                                                                                                                                                                                                     |
| `--raw` with `-a`                                                                                      | `email template import`                                                                                                                                                                                                                             |
| `-x, --no-extract` with `-a`                                                                           | `iga workflow export`                                                                                                                                                                                                                               |
| `-c, --connector-id` or `-t, --managed-object-type` with `-i, --mapping-id`                            | `mapping delete`, `mapping export`                                                                                                                                                                                                                  |
| `--set-id` with `-i, --policy-id`                                                                      | `authz policy delete`, `authz policy export` (`authz policy import` allows both)                                                                                                                                                                    |
| `-e, --entities-file` with `-i, --entity-id`                                                           | `idm export`, `idm import`                                                                                                                                                                                                                          |
| `-o, --managed-object` with `-a` or `-A`                                                               | `idm schema object export`                                                                                                                                                                                                                          |
| `-f, --file` with `--value`                                                                            | `esv secret create`, `esv secret version create`                                                                                                                                                                                                    |
| `-p, --prefix` with `-n, --script-name`                                                                | `config-manager pull scripts`                                                                                                                                                                                                                       |
| `--alias` with `--all`                                                                                 | `secretstore mapping alias delete`                                                                                                                                                                                                                  |
| `--no-sa` with `--sa-id` or `--sa-jwk-file`; `--no-log-api` with `--log-api-key` or `--log-api-secret` | `conn save`                                                                                                                                                                                                                                         |

**New command and a removed option**: `frodo esv secret version prune` deletes
the old versions of one secret (`-i`) or of all secrets (`-a`) and keeps the
active version. `-a` first shows which versions it will delete and asks for
confirmation; pass `-y` to skip the question (required without a terminal) or
`--dry-run` to only show the plan. `frodo esv secret version delete` lost its
`-a, --all` option:
it never did anything on its own (the command always needed `-i` and `-v`, and
with `-i` the option was ignored), so `frodo esv secret version delete -a -i
<secret-id> -v <version>` is now rejected as an unknown option. Drop `-a`; to
remove old versions, use `prune`.

**Secret options without a value are asked for**: in 4.x, `frodo conn save
--log-api-secret`, `frodo admin get-access-token -s` and `frodo admin
create-oauth2-client-with-admin-privileges --client-secret` accepted the flag
without a value and used `true` as the secret, so the command failed or kept a
useless secret. In 5.x a bare flag asks for the value with the input hidden,
or reads it from stdin when input is piped (`echo "$SECRET" | frodo ...
--client-secret`), and the command refuses to run and exits with code 1 when
it can do neither. `frodo admin get-access-token -i` likewise needs a value:
`-i` without one is rejected with `option '-i, --client-id <id>' argument
missing`, instead of sending `true` as the client id.

**Options that need a value now say so**: in 4.x an option declared with an
optional value (`--scope [scope]`) was accepted without one and then used
`true` as its value (`--scope` failed on `true.split(' ')`, the others passed
`true` on as a description, an alias or a host header). In 5.x the option
requires its value, and
the command refuses to run and exits with code 1 before it connects to
anything:

```text
error: option '--scope <scope>' argument missing
```

This affects `-e, --entities-file` (`idm export` and `idm import`),
`--description`, `--encoding`, `--value` and `--variable-type` (`esv secret
create`, `esv variable create`, `esv variable set`), `--client-id`, `--jwk-file`,
`--sub`, `--iss`, `--scope` and `--llt-scope`, `--llt-esv`, `--llt-ttl` (the
`frodo admin` OAuth 2.0 commands), `--log-api-key`, `--authentication-service`,
`--authentication-header-overrides`, `--configuration-header-overrides` and
`--alias` (`conn save`, `login`), and the same options plus `--username` on
`conn set`, which is new in 5.x. `-f, --file` without a file name still writes
the export to the default file name.

**RFC7523 commands require the input they cannot work without**: 4.x let
`frodo admin generate-rfc7523-authz-grant-artefacts` run without `--iss` and
saved a trusted issuer with no issuer value, which no assertion can match, so
every later `frodo admin execute-rfc7523-authz-grant-flow` failed. In 5.x
`--iss` is required (the command exits with code 1 before it connects, or asks
for the value in interactive mode). `execute-rfc7523-authz-grant-flow` requires
`--client-id` the same way (4.x made up a random client id that could not
exist) and, when it can find no issuer, key or subject, stops before it sends
anything and names the option to give. Without `--sub` it uses the trusted
issuer's allowed subject only when there is exactly one (4.x took the first of
several); with several, or with an issuer that allows any user, you name the
user with `--sub` or, on a terminal, pick one from a list. A `--jwk-file` that cannot be read stops
either command with exit code 1 (`generate-rfc7523-authz-grant-artefacts` used
to make a new key instead). These are fixes for defects, behaviour that no
valid input could mean (see
[record 0048](docs/decisions/0048-a-major-release-may-change-commands-a-minor-or-patch-release-does-not-break-them.md)).

**Commands that cannot tell what to act on say so before they connect**: a
command line that does not say what to delete, export or create is rejected
before the command connects to anything, with the error of every command that
has an option rule, and exits with code 1. From 5.0.0-26 this holds for these
four:

| Command line                                                                                                  | Rejected with                                                                                                                                                | Use instead                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `service delete` without `-i, --id` or `-a, --all` (`-y` or `-g` alone)                                       | `error: one of '-i, --id <id> \| -a, --all' is required to choose what to delete`                                                                            | Name the service with `-i`, or delete all of them with `-a` (and `-y` without a terminal). The 5.0.0 prereleases up to 5.0.0-25 logged in first, and `service delete -y` deleted every service.                |
| `authz policy export --set-id <set>` without `-a`, `-A` or `-i`                                               | `error: one of '-a, --all \| -A, --all-separate \| -i, --policy-id <policy-id>' is required to choose what to export`                                        | `--set-id` only narrows `-a` or `-A` to one policy set, as it does for `authz policy delete`: add `-a` or `-A`, or name one policy with `-i`. It logged in and printed the usage.                              |
| `secretstore mapping create` without all of `-i, --secretstore-id`, `-s, --secret-id` and `-a, --aliases`     | `error: all of '-i, --secretstore-id <secretstore-id> + -s, --secret-id <secret-id> + -a, --aliases <aliases>' are required to choose the mapping to create` | Give the three options; `-t` and `-g` stay optional. It printed `Unrecognized combination of options or no options...` and the usage, or, with none of its five options, a `one of` error that named all five. |
| `secretstore mapping alias create` without all of `-i, --secretstore-id`, `-s, --secret-id` and `-a, --alias` | `error: all of '-i, --secretstore-id <secretstore-id> + -s, --secret-id <secret-id> + -a, --alias <alias>' are required to choose the alias to create`       | Give the three options; `-t` and `-g` stay optional. The old messages were the same as for `mapping create`.                                                                                                   |

**On a terminal, the last options get a picker (interactive mode only)**: from
5.0.0-26, `conn service-account describe` and `remove` no longer ask for
`--name` as free text; they list the additional service accounts saved on the
connection profile, without a login. `service delete` first asks what to delete
(`-i` or `-a`), as the other delete commands do. `esv secret delete` and
`service delete` used to go on to the question "Delete all ...?" when the tenant
had nothing to pick; they now print `There is no secret to choose from.` or
`There is no service to choose from.` and exit with code 1, and nothing is
deleted (to delete everything, pass `-a`). A command whose options are all
required (`secretstore mapping create`, `secretstore mapping alias create`,
`esv secret version activate`, `deactivate` and `delete`) asks for every option
that is missing, not for one of them. A command line that is complete, and a
run without a terminal, are not affected.

**Deleting everything of a kind now asks first**: a delete that can remove
more than the one object it names (`-a`/`--all`) used to run without a
question. In 5.x, on a terminal it shows what it is about to delete and where
and asks, with the answer defaulting to no. Without a terminal (a script, a CI
job, `--no-prompt`, `FRODO_NO_PROMPT`) it refuses before it connects to anything
and exits with code 1, unless you pass `-y`/`--yes`:

```text
Refusing to delete all journeys without confirmation: there is no interactive terminal to ask. Pass -y/--yes to delete without asking.
```

Add `-y` to every script and CI job that deletes in bulk. Deleting a single
named object never asks. This affects `frodo agent delete -a` and
`agent ai|gateway|java|web delete -a`, `app delete -a`,
`authz policy|set|type delete -a`, `email template delete -a`,
`esv secret|variable delete -a`, `iga workflow delete -a`, `journey delete -a`,
`log key delete -a`, `mapping delete -a`, `node delete -a`, `saml delete -a`,
`script delete -a`, `secretstore delete --all`, `secretstore mapping delete
--all`, `secretstore mapping alias delete --all`, `service delete -a` and
`theme delete -a`. It is a safety guard added in a major release: see
[a command that can delete more than the one object it names asks first](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md).

**New command: `frodo config-manager delete tenant-config`** deletes all ESV
secrets and all ESV variables of a Cloud tenant, and nothing else: no journeys,
scripts, realms, applications or other configuration. The values of a deleted
secret cannot be recovered. On a terminal it shows both lists, says so, and
asks, with the answer defaulting to no. Without a terminal it refuses before it
connects and exits with code 1, unless you pass `-y`/`--yes`; `-d`/`--dry-run`
only shows what would be deleted. It takes no selector (to delete one secret or
one variable, use `config-manager delete secrets -i` or `delete variables -i`).
It deletes the secrets, then the variables, tries every one of them, prints a
summary of what failed and exits with code 1 if any failed; `--allow-failures`
keeps the exit code at 0 when deletes failed, but a list that cannot be read
still exits with code 1. With `-y`, a list that cannot be read stops only its
own half: the other half is still deleted (on a terminal the plan reads both
lists first, and nothing is deleted if either cannot be read). See
[a command that can delete more than the one object it names asks first](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md)
and
[a command that runs many operations runs them all, then fails if any failed](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0040-a-command-that-runs-many-operations-runs-them-all-then-fails-if-any-failed.md).

**`config-manager push secrets --prune` asks before it deletes, and `-p` is
gone**: `--prune` deletes the old versions of every secret it pushes, and in 4.x
it did so without asking. In 5.x, on a terminal, it reads the tenant, shows the
versions it would delete and asks (the answer defaults to no) when more than one
version would go, and also when a secret could not be checked; a prune that
would delete a single version does not ask. Without a terminal (a script, a CI
job, `--no-prompt`, `FRODO_NO_PROMPT`) it refuses before it connects to anything
and exits with code 1, unless you pass `-y`/`--yes`; it refuses even when the
prune would delete nothing, so that a script does not start to fail on the day
it has something to delete. Add `--yes` to every script and CI job that pushes
secrets with `--prune`:

```text
frodo config-manager push secrets --prune --yes <host>
```

The new option `--dry-run` (only with `--prune`) shows which versions would be
deleted and neither deletes nor imports anything; it wins over `--yes`. The
short form `-p` of `--prune` is removed, because a destructive option has a long
form only: write `--prune`. A secret that is new in the tenant has no old
versions, and the versions that are deleted are the same as before (the
versions that are still enabled besides the active one). See
[a command that can delete more than the one object it names asks first](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md).

**Short forms of the `config-manager` options follow one rule, and some are
gone**: inside `frodo config-manager` a short letter has one meaning, and an
option that is destructive, or that shared its letter with an option that means
something else, has a long form only. The rule and the whole list of letters are
in
[options of the configuration commands](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md).
The old spellings in the tables below are removed at once, with no alias,
because the group is experimental: a script that still passes one fails before
it connects to anything, with `error: unknown option '-p'` and the usage, and
exit code 1. The long forms keep working. These options moved to the capital
letter (the commands are `frodo config-manager` commands):

| Removed                          | Now                              | Commands                                                                    |
| -------------------------------- | -------------------------------- | --------------------------------------------------------------------------- |
| `-i, --ignore-encrypted-secrets` | `-I, --ignore-encrypted-secrets` | `promote run-dryrun-promotion`, `promote run-promotion`                     |
| `-l, --local-lock-only`          | `-L, --local-lock-only`          | `promote check-locked-status`                                               |
| `-p, --promoter`                 | `-P, --promoter`                 | `promote rollback`, `promote run-dryrun-promotion`, `promote run-promotion` |

These options have a long form only now:

| Removed                      | Command                           | Write                    |
| ---------------------------- | --------------------------------- | ------------------------ |
| `-p, --provisional`          | `promote check-promotion-reports` | `--provisional`          |
| `-r, --provisional-rollback` | `promote check-promotion-reports` | `--provisional-rollback` |
| `-d, --description`          | `promote rollback`                | `--description`          |
| `-d, --description`          | `promote run-dryrun-promotion`    | `--description`          |
| `-d, --description`          | `promote run-promotion`           | `--description`          |
| `-f, --file`                 | `pull authz-policies`             | `--config-file`          |
| `-f, --file`                 | `pull csp`                        | `--config-file`          |
| `-i, --include-immutable`    | `pull iga-workflows`              | `--include-immutable`    |
| `-c, --clean`                | `pull journeys`                   | `--clean`                |
| `-u, --custom-relationships` | `pull managed-objects`            | `--custom-relationships` |
| `-f, --file`                 | `pull oauth2-agents`              | `--config-file`          |
| `-f, --config-file`          | `pull raw`                        | `--config-file`          |
| `-f, --file`                 | `pull saml`                       | `--config-file`          |
| `-f, --file`                 | `pull service-objects`            | `--config-file`          |
| `-u, --dump`                 | `pull variables`                  | `--dump`                 |
| `-f, --filename-filter`      | `push custom-nodes`               | `--filename-filter`      |
| `-f, --filename-filter`      | `push endpoints`                  | `--filename-filter`      |
| `-d, --draft`                | `push iga-workflows`              | `--draft`                |
| `-p, --path`                 | `push raw`                        | `--path`                 |
| `-i, --stdin`                | `push raw`                        | `--stdin`                |
| `-c, --check`                | `push restart`                    | `--check`                |
| `-f, --filename-filter`      | `push schedules`                  | `--filename-filter`      |
| `-f, --filenameFilter`       | `push scripts`                    | `--filenameFilter`       |

`-d, --dry-run` is new on `delete oauth-cimd-profiles`, `delete oauth-issuers`,
`delete oauth-software-publishers`, `delete schedules`, `delete secret-mappings`
and `push secrets`, where only `--dry-run` existed, so `-d` is the dry run on
every `config-manager` command that has one. A cluster of short letters that
holds a removed letter has to be split: `-p provisional-report -uid 'a report'`
becomes `-P provisional-report -uI --description 'a report'`, and `-cD dir`
becomes `--clean -D dir`.

**The config file of a `pull` command is `--config-file`, with no short form**:
`pull authz-policies`, `pull csp`, `pull oauth2-agents`, `pull raw`, `pull saml`
and `pull service-objects` took their config file as `-f, --file` (`pull raw`:
`-f, --config-file`). It is `--config-file` now, as it already was on `pull
oauth-cimd-profiles`, `pull oauth-issuers` and `pull oauth-software-publishers`,
and `-f` means nothing in `frodo config-manager` any more (`-f, --file` stays on
the commands outside the group that read or write a data file). A script that
still passes `-f` or `--file` to one of the six fails before it connects to
anything, with `error: unknown option '-f'` and exit code 1. The option is
mandatory on `pull service-objects` and `pull raw`, which cannot guess what to
pull, and optional on the other four. The rule is in
[options of the configuration commands](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md).

**`pull saml`, `pull authz-policies` and `pull oauth2-agents` need no config
file any more**: without `--config-file` they pull everything, as a file that
lists everything would. `pull saml` pulls every SAML provider and every circle
of trust, `pull authz-policies` every policy set with its policies and the
resource types they use, and `pull oauth2-agents` every agent and every OAuth2
client (the three agent types that have a command of their own,
`oauth-cimd-profiles`, `oauth-issuers` and `oauth-software-publishers`, are left
to their own commands). Until now a command line without the file failed. The
realm argument narrows a pull without a file to one realm (these three commands
declare that they use their realm, so the realm picker of the interactive mode
can offer it); without a realm every realm of the tenant is pulled, and the root
realm of an Identity Cloud tenant is left out by `pull saml` and `pull
oauth2-agents`, which have nothing there, and visited by `pull authz-policies`.
With a file the realms of the file are pulled and the realm argument is not
used, as before: to keep a pull of today's selection, give the file. An object
whose id is not one name that a file can have (an id that holds `/` or `\`, is
empty, or is `.` or `..`) is skipped with a warning that names it and its realm,
and a realm whose lists cannot be read is one failed operation: the others are
still pulled, and the command exits with 1 unless `--allow-failures` is given,
as [a command that runs many operations runs them all, then fails if any
failed](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0040-a-command-that-runs-many-operations-runs-them-all-then-fails-if-any-failed.md)
asks. An empty value (`--config-file ""`) is refused before the command connects
to anything, with exit code 1: it never means "no file". A pull of
`oauth2-agents` without a file reads every OAuth2 client of the realm, the ones
that the platform manages included; a later `push oauth2-agents` would send them
back, so give a file, or select one with `-i`, to pull fewer. `pull all` pulls
these three in full when the config folder does not have `authz-policies.json`,
`oauth2-agents.json` or `saml.json` (see below), so its output grows.

Three commands outside the group give up a letter as well, so that `-d` and `-C`
mean one thing in the group; their long forms are unchanged:

| Removed            | Command               | Write          |
| ------------------ | --------------------- | -------------- |
| `-C, --clean`      | `config import`       | `--clean`      |
| `-d, --draft-only` | `iga workflow delete` | `--draft-only` |
| `-C, --clean`      | `service import`      | `--clean`      |

**`pull journeys` and `push journeys` include what a journey needs, and
`--no-deps` leaves it out**: the scripts that the journeys use, and the inner
journeys of a journey that is named, were pulled and pushed only with
`--pull-dependencies` and `--push-dependencies`. They are pulled and pushed by
default now, and the two options are gone, with no alias, as
[options of the configuration commands](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md)
decided. `--no-deps` is the option that the other commands with dependencies
have, and it gives you what you got without an option:

| Before                              | Now                       |
| ----------------------------------- | ------------------------- |
| `pull journeys`                     | `pull journeys --no-deps` |
| `pull journeys --pull-dependencies` | `pull journeys`           |
| `push journeys`                     | `push journeys --no-deps` |
| `push journeys --push-dependencies` | `push journeys`           |

A script that passes `--pull-dependencies`, `--push-dependencies` or `-d`, the
short form that both had before, fails before it connects to anything, with
`error: unknown option` and exit code 1: drop the option. A script that passes
none of them now gets the dependencies: add `--no-deps` to keep what it did.

A pull writes the scripts that the journeys use, into `scripts-config` and
`scripts-content` (a script that is in the config folder already is not pulled
again), and, with `-i`, the inner journeys of the journey that is named. An
inner journey is written once, however many journeys and nodes use it. A node
whose script is `[Empty]`, or that does not use its script, has nothing to pull
or to push. A push reads the same files from the config folder, and **a journey
whose script file, content file or inner journey file is missing is not pushed,
and neither is a journey that needs it**: the other journeys are pushed, one
summary names the journeys that failed (a journey that failed because of a file
that another one lacks is named too) and the command exits with code 1, or 0
with `--allow-failures`, as [a command that runs many operations runs them all,
then fails if any failed](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0040-a-command-that-runs-many-operations-runs-them-all-then-fails-if-any-failed.md)
asks. The message names the journey and the file, with the path below the config
folder:

```text
Journey 'Login' requires the script 'S', but its file is missing: realms/alpha/scripts/scripts-config/S.json
Pull the dependency too, or push with --no-deps.
```

This changes a push that had no option: it did not read the scripts, and it
reads them now, so a folder that has the journeys without the scripts that they
use fails (pull the scripts, or push with `--no-deps`). With
`--push-dependencies` a script file that was missing was reported and left out,
and the journey was pushed anyway; now the journey is not pushed. And `push
journeys -i <journey>` fails when the files of an inner journey are not in the
folder, also when the tenant has that journey. A push without `-i` reads the
inner journeys of every journey, with or without `--no-deps`, as before, and
fails the same way for one that is not in the folder. `pull all` and `pull
all-static` are unchanged: the scripts have a step of their own, and the
journeys step pulls the journeys only.

The files of a script that a pull of journeys writes are named as the rest of
the config folder names what the tenant names. In the name and the context of a
script a character that a file name cannot hold (`/`, `\`, `:`, `?`, `"`, `<`,
`>`, `|` or a control character) is written percent-encoded, `/` as `%2F` and `:`
as `%3A`, and a name of dots only gives an empty file name. The id of a script
stays as it is, a `:` included, unless it holds `/`, `\`, `C:` or a control
character or is `.` or `..`, and is then written in the same way. A push reads
the files back. Before, a `/` in the name of a script made folders, and `..`
wrote a file outside the config folder. `pull journeys --clean` clears the node
files below the folder of `-D`; it cleared them below the current directory.

The folder and the file of a journey that a pull writes, and the folder of its
realm, are named as the rest of the config folder names what the tenant names: a
name that the tenant gives is one name, so it cannot lead out of the config
folder. A journey id that holds `/`, `\`, `C:` or a control character is written
percent-encoded and a push finds it again: `a/b` is the folder `a%2Fb` with the
file `a%2Fb.json` (it was written as the folders `a/b`), and `ABC:x` is `ABC%3Ax`
(the library removed the `C:` and wrote `ABx`). An id that
is empty, `.` or `..` is not pulled: the summary names the journey as failed and
the command exits with code 1, or 0 with `--allow-failures`. A realm is `/`, a
name or a path of names. A realm with a part that is `.` or `..`, or that holds a
backslash, `C:`, a control character, `%`, `?` or `#`, and an empty realm, are
not pulled either, and are named in the same way. Before, a realm that holds `%`,
`?` or `#` was written as it was, and `.`, `..` and an empty realm wrote the
journeys above or beside the `realms` folder. An id or a realm that goes up
(`../x`, `..\x`, `..C:/x`) wrote the files of the journey outside the config
folder, and `pull journeys --clean` could remove a folder `nodes` outside it.
`migrate applications` no longer looks for the files of an OAuth2 client or a
SAML provider in a realm that is not a name: the tree has none.

What a pull wrote before stays where it is: a folder `a/b` or `ABx` of an older
pull is not moved or removed, so delete it and pull again. Two ids that are
written as one folder (`a/b` and the id `a%2Fb`, or two long ids with a `/` that
are cut to the same 250 bytes) are not told apart yet: the later journey of a
pull overwrites the earlier one without a message. A link to another folder
inside the config folder is not looked at either: a journey folder or a realm
folder that is a link still leads out of the config folder.

**A `--no-` option that is picked in the interactive editor does what it says**:
the editor wrote `true` for every option that it picked. For an option that is
negated (`--no-deps`, `--no-validate`, `-N, --no-metadata`, `--no-cache`,
`--no-open`, `--no-decode`, `--no-coords`, `--no-wait`, `--no-prune` and the
others that have no positive twin) `true` is the value that the option has while
the flag is not written, so a picked option showed in the command preview and
was then ignored: `push journeys --prompt` with `--no-deps` picked pushed the
scripts, and the picked `--no-validate` of `push journeys` still validated. The
editor writes the value that the typed flag gives, `false`, and the run is the
command that the preview shows. A default that an older version saved with
`--save-defaults` for such an option holds `true`: when the command runs it still
does nothing, but the preview now shows it as if the flag was picked. Clear it
with `frodo settings defaults --clear '<command path>'` (that clears every saved
default of the command) and save the flag again; `--no-deps` on `pull journeys`
and `push journeys` is new, so only the older `--no-` options can have one. The
editor no longer adds `(default: true)` to the description of these options.

**Selectors of the `config-manager` commands are `-i, --<type>-id` and `-n,
--<type>-name`, and `-n` and `--name` keep working**: inside `frodo
config-manager` an object is selected by its identifier with `-i, --<type>-id`
(a value that cannot be chosen freely or changed later: a journey name is one)
and, for a type whose objects have a name that can change, by that name with
`-n, --<type>-name`. A command that has both declares them mutually exclusive,
so `-i a -n b` fails before it connects to anything. The rule is in
[options of the configuration commands](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md).
This is the third of three steps: the tables below are the `pull`, the `push`
and the `delete` commands.

Nothing is removed. On a command that took `-n, --name <name>` for an
identifier, `-i, --<type>-id` is the option now, and `-n` and `--name` are
spellings of the same option (the help ends its description with `(alias: -n,
--name)`). On a command whose objects have a name that can change, `-n` is `-n,
--<type>-name` and `--name` is its alias. These aliases are permanent: a script
that passes `-n`, `--name` or a cluster of short letters that ends in `-n` keeps
working and gets the same result. A selector that is given twice on a command
that has the identifier only (`-i a -n b`) uses the last one, as any repeated
option does. A default that was saved with `--prompt --save-defaults` for the
option `name` of one of these commands is not read any more; save it again for
the new option.

| Command                          | Select by                                  | Still works      |
| -------------------------------- | ------------------------------------------ | ---------------- |
| `pull applications`              | `-i, --app-id`, `-n, --app-name`           | `--name`         |
| `pull oauth-cimd-profiles`       | `-i, --profile-id`                         | `-n`, `--name`   |
| `pull connector-definitions`     | `-i, --connector-id`                       | `-n`, `--name`   |
| `pull connector-mappings`        | `-i, --connector-mapping-id`               | new              |
| `pull custom-nodes`              | `-i, --node-id`, `-n, --node-name`         | `--name`         |
| `pull email-templates`           | `-i, --template-id`                        | `-n`, `--name`   |
| `pull endpoints`                 | `-i, --endpoint-id`                        | `-n`, `--name`   |
| `pull internal-roles`            | `-i, --role-id`, `-n, --role-name`         | `--name`         |
| `pull journeys`                  | `-i, --journey-id`                         | `-n`, `--name`   |
| `pull locales`                   | `-i, --locale-id`                          | `-n`, `--name`   |
| `pull managed-objects`           | `-i, --managed-object-id`                  | `-n`, `--name`   |
| `pull org-privileges`            | `-i, --org-privileges-id`                  | `-n`, `--name`   |
| `pull remote-proxies`            | `-i, --proxy-id`                           | `-n`, `--name`   |
| `pull schedules`                 | `-i, --schedule-id`                        | `-n`, `--name`   |
| `pull scripts`                   | `-i, --script-id`, `-n, --script-name`     | `-n` (as before) |
| `pull secrets`                   | `-i, --secret-id`                          | new              |
| `pull secret-mappings`           | `-i, --secret-mapping-id`                  | `-n`, `--name`   |
| `pull services`                  | `-i, --service-id`                         | `-n`, `--name`   |
| `pull themes`                    | `-i, --theme-id`, `-n, --theme-name`       | new              |
| `pull telemetry`                 | `-i, --exporter-id`                        | `-n`, `--name`   |
| `pull oauth-issuers`             | `-i, --issuer-id`                          | `-n`, `--name`   |
| `pull oauth-software-publishers` | `-i, --software-publisher-id`              | `-n`, `--name`   |
| `pull variables`                 | `-i, --variable-id`                        | new              |
| `pull iga-workflows`             | `-i, --workflow-id`, `-n, --workflow-name` | `--name`         |
| `pull saml`                      | `-i, --entity-id`                          | new              |
| `pull authz-policies`            | `-i, --policy-id`                          | new              |
| `pull oauth2-agents`             | `-i, --agent-id`                           | new              |

`pull themes` takes `-n, --theme-name` for the first time, and
`pull connector-mappings`, `pull secrets` and `pull variables` take `-i` for the
first time: they pulled everything before and still do without it. `-i` on
`pull applications`, `pull custom-nodes`, `pull iga-workflows`,
`pull internal-roles`, `pull scripts` and `pull themes` selects by the id of the
object, which these commands could not do before (their `-n` selects by name as
before). `pull scripts -i` cannot be combined with `-n` or with `-p`, the
prefix, as `-n` could not be combined with `-p` before. `pull csp` and
`pull terms-and-conditions` take no selector: their file is the whole entity,
and a file that held a part of it would replace the whole entity when it is
pushed.

`pull saml`, `pull authz-policies` and `pull oauth2-agents` take `-i` for the
first time (`--entity-id`, `--policy-id` and `--agent-id`), and two more
selectors that name a group: `pull saml --cot-id` pulls one circle of trust, and
`pull authz-policies --set-id` pulls one policy set with its policies and the
resource types they use. `pull authz-policies -i` writes the policy, the
resource type it uses and the definition of its policy set, with the same files
as a pull of the set, so the folder can be pushed back. Each selector needs a
single realm (the realm argument), and the two of one command cannot be combined
with each other or with `--config-file`; they work on the lists of the realm: an
id that the realm does not hold fails the command whatever `--allow-failures`
says, and so does an object that exists but whose id is not one name that a file
can have (an id that holds `/` or `\`, is empty, or is `.` or `..`; for `pull
authz-policies -i` the name of the policy set of the policy, for `pull
oauth2-agents -i` the type or the id): the message names the id and the realm,
and nothing is written, where a pull of everything skips such an object with a
warning. `pull oauth2-agents -i` also fails and names the objects when an agent
and an OAuth2 client have the same id. `--cot-id` and `--set-id` have no `-n`
and no other spelling.

| Command                          | Select by                                  | Still works    |
| -------------------------------- | ------------------------------------------ | -------------- |
| `push applications`              | `-i, --app-id`, `-n, --app-name`           | `--name`       |
| `push connector-definitions`     | `-i, --connector-id`                       | `-n`, `--name` |
| `push connector-mappings`        | `-i, --connector-mapping-id`               | `-n`, `--name` |
| `push custom-nodes`              | `-i, --node-id`, `-n, --node-name`         | `--name`       |
| `push email-templates`           | `-i, --template-id`                        | `-n`, `--name` |
| `push endpoints`                 | `-i, --endpoint-id`                        | `-n`, `--name` |
| `push iga-workflows`             | `-i, --workflow-id`, `-n, --workflow-name` | `--name`       |
| `push internal-roles`            | `-i, --role-id`, `-n, --role-name`         | `--name`       |
| `push journeys`                  | `-i, --journey-id`                         | `-n`, `--name` |
| `push locales`                   | `-i, --locale-id`                          | `-n`, `--name` |
| `push managed-objects`           | `-i, --managed-object-id`                  | `-n`, `--name` |
| `push oauth-cimd-profiles`       | `-i, --profile-id`                         | `-n`, `--name` |
| `push oauth-issuers`             | `-i, --issuer-id`                          | `-n`, `--name` |
| `push oauth-software-publishers` | `-i, --software-publisher-id`              | `-n`, `--name` |
| `push org-privileges`            | `-i, --org-privileges-id`                  | `-n`, `--name` |
| `push remote-proxies`            | `-i, --proxy-id`                           | `-n`, `--name` |
| `push saml`                      | `-i, --entity-id`                          | `-n`, `--name` |
| `push schedules`                 | `-i, --schedule-id`                        | `-n`, `--name` |
| `push scripts`                   | `-i, --script-id`, `-n, --script-name`     | `--name`       |
| `push secret-mappings`           | `-i, --secret-mapping-id`                  | `-n`, `--name` |
| `push secrets`                   | `-i, --secret-id`                          | `-n`, `--name` |
| `push services`                  | `-i, --service-id`                         | `-n`, `--name` |
| `push telemetry`                 | `-i, --exporter-id`                        | `-n`, `--name` |
| `push themes`                    | `-i, --theme-id`, `-n, --theme-name`       | new            |
| `push variables`                 | `-i, --variable-id`                        | `-n`, `--name` |

`push themes` takes `-i, --theme-id` and `-n, --theme-name` for the first time:
it pushed every theme of the realm before and still does without them, and with
one of them the library merges that theme into the themes of the realm and
leaves the others alone, except that a theme that is the default one becomes the
only default theme of the realm. `-i` on `push applications`, `push custom-nodes`,
`push iga-workflows`, `push internal-roles`, `push scripts` and `push themes`
selects by the id of the object, which these commands could not do before (their
`-n` selects by name as before): the id is the `_id` in the file of the object
(the `id` of a workflow file), and a file with another id is not pushed. The
files of `pull applications` hold no id, so `push applications -i` takes the id
that the application has on the tenant, reads the applications of the realm
once, and pushes the folder of the application that has that id. A push matches
an application by its name, so when two applications of a realm share a name,
`push applications` refuses that name (`-i`, `-n` and a push of every folder
alike) and writes nothing for it instead of updating the first of them. `push
applications`, `push scripts` and `push themes` need a single realm for a
selector, as `-n` did; `push custom-nodes`, `push iga-workflows` and
`push internal-roles` take no realm. Each of the six fails when the object is
not there. `push csp` keeps its own `-n, --name`, the name of one
of its two policies (`enforced` or `report-only`), and takes no `-i`: each
policy is replaced whole, and the other one is not touched; an empty value of
that `-n` is refused too, because it would write both policies.
`push terms-and-conditions` takes no selector: the versions are one
configuration entity and a push that wrote only one version would replace the
entity and drop the others.

| Command                            | Select by                              | Still works    |
| ---------------------------------- | -------------------------------------- | -------------- |
| `delete applications`              | `-i, --app-id`, `-n, --app-name`       | `--name`       |
| `delete custom-nodes`              | `-i, --node-id`, `-n, --node-name`     | `--name`       |
| `delete endpoints`                 | `-i, --endpoint-id`                    | `-n`, `--name` |
| `delete scripts`                   | `-i, --script-id`, `-n, --script-name` | `--name`       |
| `delete themes`                    | `-i, --theme-id`, `-n, --theme-name`   | `--name`       |
| `delete email-templates`           | `-i, --template-id`                    | `-n`, `--name` |
| `delete secrets`                   | `-i, --secret-id`                      | `-n`, `--name` |
| `delete terms-and-conditions`      | `-i, --version-id`                     | `-n`, `--name` |
| `delete variables`                 | `-i, --variable-id`                    | `-n`, `--name` |
| `delete locales`                   | `-i, --locale-id`                      | `-n`, `--name` |
| `delete oauth-cimd-profiles`       | `-i, --profile-id`                     | `-n`, `--name` |
| `delete oauth-issuers`             | `-i, --issuer-id`                      | `-n`, `--name` |
| `delete oauth-software-publishers` | `-i, --software-publisher-id`          | `-n`, `--name` |
| `delete schedules`                 | `-i, --schedule-id`                    | `-n`, `--name` |
| `delete secret-mappings`           | `-i, --secret-mapping-id`              | `-n`, `--name` |
| `delete telemetry`                 | `-i, --exporter-id`                    | `-n`, `--name` |

`delete applications`, `delete custom-nodes`, `delete scripts` and
`delete themes` take `-i` for the first time: it selects by the id of the object
(the `_id`; for an application the id it has on the tenant), which these
commands could not do before, and their `-n` selects by name as before. A
default script is never deleted, by id or by name. `-i` cannot be combined with
`-n`, and on `delete scripts` not with `-p`, the prefix (`-n` with `-p` is
accepted as before, and the prefix is ignored). `delete applications -i` and
`delete scripts -i` need a single realm, as their `-n` does. `delete themes -i`
fails with exit code 1 when the realm that was given, or every realm when none
was given, lacks the id, also with `--allow-failures`, because the id names one
theme; `delete themes -n` keeps its behaviour: a warning for each realm that
lacks the name when no realm was given, and `--allow-failures` as before.
`delete terms-and-conditions -i, --version-id` is the version to delete, as
`-n` named it: a single version can be deleted, and `pull` and `push` of the
type take no selector.

A delete that names one object, with `-i`, `-n` or `--name`, never asks and
never needs `-y`, as `-n` never did. The delete guard
([a command that can delete more than the one object it names asks first](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md))
applies to a delete without a selector only, and that did not change: it asks on
a terminal and refuses without one unless `-y` is given.

An empty value of a selector (`-i ""`, `-n ""`, `--name ""`, or a variable that
expands to nothing) is refused with exit code 1 before the command connects to
anything, and never means all objects: commander says which option was given an
empty value. This changes the commands that had `-n` and took `-n ""` as no
selector and pulled everything; leave the option out to pull everything.

The same holds for the `push` commands: `-n ""` pushed everything before, and an
empty `-i`, `-n` or `--name` is refused now; leave the option out to push
everything. The prefix of `pull scripts` is refused when it is empty too
(`pull scripts -p ""`): it would match every script.

And for the `delete` commands: `-n ""` and `--name ""` selected all objects on
`delete applications`, `delete custom-nodes`, `delete email-templates`,
`delete endpoints`, `delete scripts` and `delete themes`, which then asked, or
deleted all of them with `-y`; the other `delete` commands refused an empty name
in their own words, or took it for a name that no object has. An empty `-i`,
`-n` or `--name` is refused now on every `delete` command, with exit code 1,
before the command connects and before it asks, so a script that passes an empty
variable deletes nothing; leave the option out to delete all objects, after the
question or with `-y`. The prefix of `delete scripts` is refused when it is empty
(`delete scripts -p ""`): it matches every script, and `-y` would have deleted
all of them. A name that is only blanks is still refused by the command in its
own words.

A selector is an id or a name, never a path
([a selector is an id or a name, never a path](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0059-a-selector-is-an-id-or-a-name-never-a-path.md)).
The selector (`-i`, `-n`, `--name`) of the nine `push` commands that turn it into
a file or a folder (`connector-definitions`, `connector-mappings`,
`managed-objects`, `org-privileges`, `remote-proxies`, `journeys`,
`oauth-issuers`, `oauth-cimd-profiles` and `oauth-software-publishers`) never
finds anything outside the folder of its type: a value that is written as a path,
such as `-i ../x`, is a name that no file has, and fails with exit code 1, also
with `--allow-failures`, saying that no such file was found. `..` and `.` on
`connector-mappings`, `managed-objects` and `journeys` are said not to name an
object.

For `connector-definitions`, `connector-mappings`, `managed-objects`,
`org-privileges`, `remote-proxies` and `journeys`, `-i` finds the file by its
plain name as before when the name is one name (no `/` or `\`, not `.` or `..`,
no control character).
A name with a `/` is looked up as the agent types look it up: `-i a/b` is the
file `a%2Fb.json`, and no longer the file `b.json` in a folder `a`.

For `oauth-issuers`, `oauth-cimd-profiles` and `oauth-software-publishers`, `-i`
finds the file by the id with a character that a file name cannot hold written as
`%XX` (`/` is `%2F`), so `-i a/b` is `a%2Fb.json`. A file that was named by hand
with such a character left as it is (`a*b.json` for the id `a*b`) is no longer
found: rename it `ab.json`. A file that was named by hand for a name that Windows
reserves (`con.json` for the id `con`) is no longer found either: the id `con` is
the file `.json`. An id of more than 250 bytes is found by its name cut at 250
bytes.

A realm that is not `/`, a name or a path of names such as `/parent/child` (for
example `..`, `../alpha`, `a\b`, or a name with `?`, `#` or `%`) is refused with
exit code 1 before the command connects, also when it comes from `FRODO_REALM`,
on every `config-manager` command that runs in a realm. A realm that is typed
`/alpha` or `/parent/child` names the folder `realms/alpha` or
`realms/parent/child` in the messages that print a path; they printed
`realms//alpha`.

`delete secret-mappings -i` reads the list of the mappings first and deletes the
mapping that has exactly that id. An id that is not a mapping, or that differs in
case, exits with code 1 whatever `--allow-failures` says, and `--dry-run` reads
the list the same way.

A file reference must stay inside the config folder
([a file reference must stay inside the config folder](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0061-a-file-reference-must-stay-inside-the-config-folder.md)).
A `push` command that follows a reference in a file of the config tree (the
`file` of a script, a theme field, an email template, a mapping, a managed
object, a schedule, an endpoint, a workflow step or the script of a journey
node, and the version and language of terms and conditions) joins it to the
folder of the object and refuses a reference that:

- leaves that folder, such as `../shared.js` or `..\x.js`, also when the file it
  names is still in the tree;
- is an absolute path (`/shared.js`), which was joined to the folder before;
- starts with a drive letter (`C:\x.js`, `a:b.js`), which was joined to the
  folder before;
- holds `C:` anywhere (`..C:/x.js`, `ABC:x.js`), because the library removes
  every `C:` from a path;
- is empty, or holds a control character.

Any other colon is an ordinary character: `sub/a:b.js` and
`Login:SSO.onCreate.js` are read as they were. A reference that starts like a
drive letter (one letter, then a colon) is refused, so a name such as `a:b` still
does not round-trip as a reference inside a file: `a:b.onCreate.js` is refused,
`Login:SSO.onCreate.js` is read. A hand-made terms and conditions file whose
version is a number instead of text is refused too, because a version is the
name of a folder and the tenant writes it as text.

A refused reference is not pushed: the command says
`The file reference '<reference>' must stay inside the config folder.`
and exits with code 1 like a file that cannot be read. The other objects of the
run are still pushed, and `--allow-failures` acts as for an unreadable file. A
backslash separates on every platform, so `sub\x.js` is `sub/x.js` on macOS and
Linux too. What pull writes (`scripts-content/<context>/<name>.js`,
`<field>/<locale>.html`) is unchanged.

The same holds for the names that a file of the tree gives as the name of
another object (the id of the script of a journey node or of a script that an
application uses, the id of a circle of trust, the id of a mapping that an
application owns) and for an id or a name given with `-i` or `-n`: a name that
holds `C:` or a backslash is not one name, and is looked up as the file name of
an id (`ABC:x` is the file `ABC%3Ax.json`, as `a/b` is `a%2Fb.json`). A realm
that holds `C:` is refused like any realm that is not a name or a path of names,
and a `pull` of everything skips a circle of trust, a policy set or an agent
whose id holds `C:` with the warning that a name which is not one name already
has. Any other colon (`Login:SSO`) is an ordinary character of a name, as
before. On Windows a colon in a file name is not an ordinary character (the file
system reads it as the start of an alternate data stream; this comes from its
documentation and was not tested here), so a pulled name with a plain colon does
not round-trip there, as before this change. A link of the file system inside
the folder is not followed or checked: it is read as before.

In the root realm of a Cloud tenant, which has no scripts, no applications and
no themes, a selector on `pull scripts`, `pull applications` or `pull themes`
prints one warning that there is nothing to pull for it (the exit code is still
0). `pull scripts -n` and `pull applications -n` were silent before.

**`authn export` and `authn import` exit 1 after a failure**: in 4.x both
commands printed the error and exited with code 0 when the export or the import
failed, because they checked the result before the operation had finished. In
5.x they wait for the operation and exit with code 1, so a script or a pipeline
that runs them sees the failure. Each runs a single operation, so
`--allow-failures` does not apply.

**`describe` commands of agents exit 1 when the agent is not there**: in 4.x
`frodo agent describe -i`, `agent gateway describe -i`, `agent java describe -i`,
`agent web describe -i` and `agent ai describe -i` printed the error and exited
with code 0 when the agent did not exist or could not be read, and wrote an
empty line to standard output. In 5.x they print the error on standard error and
exit with code 1, so a script that checks for an agent by describing it can tell
a missing agent from a found one. `frodo aiagent describe -i` is the same
command as `agent ai describe`. The typed commands (`agent gateway|java|web
describe`, `aiagent describe`) also refuse to run without `-i`, with a message
that says so and exit code 1, instead of asking the tenant for an agent called
`undefined`. `frodo agent describe` without `-i` still describes all the agents.
A script that relied on exit code 0 for a missing agent has to treat exit code 1
as "not found", or add `|| true`.

**`realm describe` exits 1 when there is nothing to describe, and `log key
describe` describes**: in 4.x `frodo realm describe` printed `Realm <name> not
found!` and exited with code 0 for a realm that did not exist, and printed the
same for a realm list it could not read. In 5.x it exits with code 1 for a realm
that is not there, and for a read that failed it prints that error instead of
"not found" and exits with code 1. `frodo log key describe` was registered in
4.x but did nothing: it logged in, printed nothing and exited with code 0 for
any key. In 5.x `log key describe -i <key-id>` prints the key (its id, its name
and when it was created; the secret of a key is shown only when the key is
created) and `log key describe` without `-i` prints every key, both with
`--json` as an option. Both exit with code 1 for a key that is not there or a
read that failed. A script that relied on exit code 0 for a missing realm has to
treat exit code 1 as "not found", or add `|| true`. `frodo conn describe` for a
host without a saved profile already ended with exit code 1 and is unchanged.

**`conn save` with `--sa-id` and `--sa-jwk-file` exits 1 and saves nothing when
the key cannot be used**: in 4.x `frodo conn save <host> --sa-id <id>
--sa-jwk-file <file>` printed an error when the key file could not be read or the
tenant refused the key, and then saved the profile anyway, with the service
account id (and the key, when it could be read) and exit code 0. In 5.x the
command ends with exit code 1 and does not save the profile, so a script cannot
mistake a profile without a working service account for a saved one. The same
holds with `--no-validate` when the key file cannot be read. A script that
relied on exit code 0 has to fix the key file, or save the profile without
`--sa-id` and `--sa-jwk-file` and add the service account afterwards.

**`feature install -i aiagent` refuses when the definitions of the feature are
in the tenant but differ from the original**: `frodo feature install` asked only
the registry whether the feature was installed. The registry reads "not
installed" also when the definitions of the feature are in the tenant but are
not the original (a trailing newline, a changed title), and installing then adds
them a second time
([frodo-cli#1332](https://github.com/rockcarver/frodo-cli/issues/1332)). For
`aiagent` the command now asks the diagnosis first and, when it finds such
definitions, refuses (with `-y` too): it prints what differs, names `frodo
feature validate -i aiagent` and `frodo feature validate -i aiagent --repair`,
sends nothing to the install endpoint and exits with code 1. A script that
installed `aiagent` on such a tenant repairs it first. A tenant without the
definitions, and every other feature, are installed as before.

**`feature validate -i aiagent` exits 1 when the AI agents feature does not work,
and prints a diagnosis**: in 4.x and in earlier 5.x versions `frodo feature
validate` printed `Valid` or `Invalid` and exited with code 0 whenever the check
ran. For the feature `aiagent` it now prints a diagnosis of the tenant first (the
registry, the definitions, the OAuth 2.0 provider of each realm, the AM gate, the
secret store mappings and the AI agents) and the validation after it, and exits
with code 1 when the diagnosis finds a functional problem, so that a pipeline can
use it as a health check. The sentence that says that failures of the form
"already present" mean that the configuration is in the tenant is printed on
stdout, after the failures, instead of on stderr. Cosmetic findings are warnings and exit with code 0. Other features
print what they printed before and exit with code 0, and `--json` prints the
diagnosis as JSON. A script that ran `validate -i aiagent` only to ask whether
the feature can be installed adds `|| true`, or reads the exit code as "the
feature is not healthy". The new option `--repair` fixes what the diagnosis
found repairable, after a backup (`--backup-dir`, required) and one
confirmation (`-y, --yes` skips it). A repair leaves every definition it had to
align aligned with the original, so that the registry reads the feature
installed; a customization (a changed title of a definition, an added mapping
property) is replaced, listed in the plan and kept in the backup, and
`--restore-customizations` puts it back after the repair (white space is never
put back); see
[a repair leaves the feature installed and puts customizations back only on request](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0052-a-repair-leaves-the-feature-installed-and-puts-customizations-back-only-on-request.md).

**`aiagent import -f` imports only the first agent of the file**: in 4.x
`frodo agent ai import -f <file>` (and `frodo aiagent import -f <file>` in 5.x
before this change) printed that it imported the first AI agent of the file but
imported every agent in it. It now imports only the first one, as its message
says. A script that relied on the old behaviour to load a whole file uses `-a`
(`import -a -f <file>`), which imports every agent of the file and is unchanged.

**`app import -f` and `role import -f` import only the first item of the file**:
`frodo app import -f <file>` and `frodo role import -f <file>` print that they
import the first application or the first internal role of the file, but the
library methods behind them imported every item in it. They now import only the
first one, as their messages say. A script that relied on the old behaviour to
load a whole file uses `-a` (`import -a -f <file>`), which imports every item of
the file and is unchanged.

**`config export` names a script type that cannot be read**: for each script
type, `frodo config export` (`-a` and `-A`) reads its engine configuration and
its context. When one of the two could not be read, the command printed a line
(`Unable to get engine configuration for script type '<id>': ...`), exported the
script type without that part and exited with code 0. The script type is now a
failed item: it is named in the summary of the failed items, it is not part of
the export, the other script types are exported, and the command exits with code
1. A script that accepts an incomplete export adds `--allow-failures`: the
failures are still printed and summarised, but do not set the exit code.

**Commands that run several operations now run them all and exit 1 if any
failed**: `frodo config-manager pull all` and `pull all-static` carried on after
a step failed, printed that step's error and exited with code 0, with no
summary. In 5.x they still run every step, then print one summary of the steps
that failed and exit with code 1:

```text
2 of 24 steps failed:
  - org-privileges
  - password-policy
```

A script or CI job that must keep going after a failed step adds
`--allow-failures`: the failures are still printed, as a warning, and the exit
code stays 0. A config file that exists but cannot be read is a failed step. A
config file that is not in the config folder given with `-C` is not:
`service-objects.json` is the one file that a step cannot do without, so its
step is skipped with a warning and the exit code is not affected, while the steps
of `authz-policies.json`, `oauth2-agents.json` and `saml.json` pull everything
when their file is not there (a file that is there still selects what is pulled).
A config folder that does not exist or is not a folder, usually a mistyped path,
is said once, and the warning names `service-objects` as skipped and the three
others as pulled in full. The step names in the summary are the names of
the `config-manager pull` commands, so you can run one of them to see its error
again. Other commands that run several operations follow in later releases; each
one that changes is added here, and the option is shown in its `-h`. So far
these have the option and the new exit code: `config-manager pull all`,
`config-manager pull all-static`, `esv secret delete -a`, `esv variable delete
-a`, `email template delete -a`, `authz policy delete -a`, `authz type delete
-a`, `authz set delete -a`, `script delete -a`, `config-manager delete
custom-nodes`, `email-templates`, `endpoints`, `scripts` and `themes`, `app
delete -a`, `idm remote-proxy delete -a`, `log key delete`, `oauth client delete
-a`, `node delete -a`, `secretstore delete -a`, `secretstore mapping delete -a`,
`iga workflow delete -a`, `agent delete -a`, `agent ai delete -a`, `agent
gateway delete -a`, `agent java delete -a`, `agent web delete -a`, `saml delete
-a`, `service delete -a`, `journey delete -a`, `mapping delete -a`, `agent export -A`, `agent ai
export -A`, `agent gateway export -A`, `agent java export -A`, `agent web export
-A`, `config export`, `idm export`, `idm schema object export -A`, `idm
remote-proxy export -A`, `mapping export -A`, `journey export`, `script export`,
`theme export`, `node export`, `email template export`, `service export`, `realm
export -A`, `role export -A`, `saml export -A`, `saml cot export -A`, `idp
export -A`, `app export -A`, `oauth client export -A` and the bulk exports (`-a`
and `-A`) of `authz policy`, `authz set`, `authz type`, `esv secret`, `esv
variable`, `secretstore`, `server`, `iga workflow` and `admin federation`, and
the imports `agent import`, `agent ai import`, `agent gateway import`, `agent
java import`, `agent web import`, `config import`, `idm import`, `idm schema
object import -D`, `idm remote-proxy import`, `mapping import`, `journey
import`, `node import`, `script import`, `theme import`, `email template
import`, `service import`, `realm import`, `role import`, `saml import`, `saml
cot import`, `idp import`, `app import`, `oauth client import`, `authz policy
import`, `authz set import`, `authz type import`, `esv secret import`, `esv
variable import`, `secretstore import`, `server import`, `iga workflow import`,
`admin federation import`, `admin generate-rfc7523-authz-grant-artefacts`,
`admin grant-oauth2-client-admin-privileges`, `admin
revoke-oauth2-client-admin-privileges`, `admin
create-oauth2-client-with-admin-privileges`, `admin repair-org-model`, and
`config-manager pull` and `push` of `authentication`, `authz-policies`,
`journeys`, `oauth2-agents`, `org-privileges`, `password-policy`, `raw`, `saml`,
`scripts`, `secret-mappings`, `secrets`, `service-objects`, `themes`,
`custom-nodes`, `endpoints`, `iga-workflows`, `locales`, `schedules`,
`services`, `telemetry`, `connector-definitions`, `email-templates`,
`internal-roles`, `remote-proxies` and `variables`, and `config-manager pull
managed-objects`, `pull connector-mappings` and `push csp`, and `idm
remote-proxy setup` and `teardown`, `mapping rename -a`, `promote`, `esv secret
version prune`, `journey describe`, `journey prune` and `journey validate`. For
the deletes this means a
failed delete used to be printed and the command still exited 0 (`esv secret
delete -a`, `log key delete`), or the run ended at the first failure (`esv
variable delete -a`, `script delete -a` with a filter), and now every item is
tried and the exit code is 1 if any failed. The `config-manager` deletes used to
end with a count line of their own (`Deleted 2 scripts, 1 failed.`, `Deleted 2
email templates, 1 failed.`, `Themes could not be deleted in 1 of 3 realms.`);
the summary names the failed items instead (the realms, for themes).
`config-manager delete endpoints` on a tenant without custom endpoints used to
exit 1 and now exits 0, because nothing to delete is not a failure;
`config-manager delete scripts` now says `No scripts found to delete.` when
nothing matches. `node delete -a`, `secretstore delete -a`, `secretstore mapping
delete -a` and `iga workflow delete -a` already exited 1 but ended with "Deleted
..." after failures; they now say that some could not be deleted and name them.
The agent deletes already exited 1 after a failed delete, with one combined
error; they now delete every agent they can, print one summary that names the
agents that failed, and say `No agents found to delete.` and exit 0 when there
are none. Listing the agents fails the command whatever `--allow-failures` says;
since frodo-lib 5.0.0-26 `agent delete -a`, like `agent list` and `agent
export`, also fails when an agent type cannot be listed for any reason other
than HTTP 501 (not implemented), where it used to skip that type without a word.
`mapping delete -a` (with or without `-c` and `-t`) stopped at the first mapping
that could not be deleted and exited 1; it now deletes every mapping it can,
prints one summary that names the mappings that failed, and still exits 1. It
says `No mappings found to delete.` and exits 0 when there are none. Reading the
mappings fails the command whatever `--allow-failures` says.
The bulk exports of these commands now export every item they can, print one
summary that names the items that could not be exported or written, and exit 1
(or 0 with `--allow-failures`). `esv secret export -A`, `esv variable export
-A`, `server export -A` and `admin federation export -A` used to stop at the
first item that failed and left the later ones unexported; `authz policy export
-A`, `authz set export -A` and `authz type export -A` already exported the other
items but ended with one combined error; `secretstore export` and `iga workflow
export` already printed the error of each failed item and exited 1 but ended
without a summary. `esv variable export -a` now says why it failed, where it used
to exit 1 without a reason. A secret store or a workflow whose file cannot be
written is named in the summary too. Exporting everything to one file (`-a`) of
`authz policy`, `authz set`, `authz type`, `esv secret`, `esv variable`,
`server` and `admin federation` reads everything in one library call: if it
fails, no file is written and the command fails whatever `--allow-failures`
says.
`oauth client delete -a` did not delete anything; it now deletes all OAuth2
clients, after asking for confirmation (add `--yes` in a script, cli record
0037). `journey delete -a` printed "Deleted N journeys" with N counting the
journeys it could not delete, and `journey delete -i` exited 0 after one failed;
a journey that could not be deleted (or, with `--deep`, whose nodes could not be
deleted) is now named in the summary and the exit code is 1. The agent exports
to separate files (`agent export -A`, `agent ai|gateway|java|web export -A`)
stopped at the first agent that could not be exported, and before frodo-lib
5.0.0-26 a file that could not be saved was only printed and the command exited
0; they now export every agent they can, print one summary that names the agents
that failed (including a file that could not be saved), and exit 1. Reading the
agents fails the command whatever `--allow-failures` says. `-a` and `-i` export
one thing and are unchanged: a failure is printed and the exit code is 1.
`config export` and `idm export` already exported every object the library could
read, printed the error of each one it could not and exited 1, with `-a` as well as `-A`; they
now also print one summary that names those objects (and, with `-a`, the file if
it could not be written). `config export -A` used to stop at the first kind of
configuration whose files could not be written, and `idm schema object export
-A`, `idm remote-proxy export -A` and `mapping export -A` used to stop at the
first object whose file could not be written, leaving the later ones, and the
file that lists them, unwritten and printing a single error; they now write every
object they can, name the ones that failed in the summary and exit 1.
`journey export -A`
printed "Error saving <journey> to <file>" for a journey whose file could not
be written and exited 0; the journey is now named in the summary and the exit
code is 1. The journeys and scripts that the library cannot export (`journey
export -a` and `-A`, `script export -a` and `-A`) were printed one by one and
now appear in the summary too. `theme export -A`, `node export -A`, `email
template export -A` and `service export -A` stopped at the first theme, custom
node, email template or service whose file could not be written and exited 1;
they now export every one they can and name the ones that failed. `script
export -A` already tried every script and ended with one combined error; it now
prints the summary. `script export -x`, `theme export -x` and `node export -x`
printed the error of extracting the code or HTML into separate files and went on
to write an export that refers to files that are not there, and exited 0; the
script, theme or custom node is now a failure (exit code 1 for a single export,
named in the summary for `-A`). Reading what there is to export fails the
command whatever `--allow-failures` says. The `-a` forms of `theme export`,
`node export`, `email template export` and `service export` read everything and
write one file as one operation, so they fail as a whole.
The exports to
separate files (`-A`) of realms, roles, SAML providers, circles of trust,
identity providers, applications and OAuth2 clients now export every item they
can and print one summary that names the ones that could not be exported or
saved. `realm export -A` and `role export -A` printed the error of a file that
could not be saved and went on to exit 0; they now exit 1. `saml export -A`,
`saml cot export -A`, `idp export -A`, `app export -A` and `oauth client export
-A` already exported the other items and exited 1 with one combined error,
which is now the summary. Reading the items fails the command whatever
`--allow-failures` says. `-a` writes everything to one file and is one
operation: when the library cannot export an item it reports it in one error
and no file is written, so the command exits 1 and `--allow-failures` does not
change that.
The agent imports (`agent import`, `agent ai|gateway|java|web import`) with `-A`
printed the error of every agent file that failed to import and exited 0,
because the loop over the files never saw the failure; with `-a` they already
exited 1 with one combined error. They now import every agent they can, print
one summary that names the agents that could not be imported (and the files that
are not valid JSON), and exit 1. A file named with `-f`, or a working directory,
that cannot be read fails the command whatever `--allow-failures` says. `agent
gateway|java|web import -A` took every `*.agent.json` file whatever the type of
the agents in it and printed an error for each agent of another type; they now
import the agents of their own type and skip the others. A failed login exited 0
in the agent imports (frodo-cli#1094); it exits 1 now.
`config import`, `idm import`, `idm schema object import -D` (it imports the
same directory as `idm import -A`) and `mapping import` already tried every
part, entity or mapping, printed each error and exited 1, but named nothing at
the end; they now print one summary that names what could not be imported, and
`idm import` ends its progress line with the failure instead of "Imported config
entities". `idm import -A`, `mapping import -A` and `idm remote-proxy import -A`
stopped at the first file that could not be parsed; that file is now named in
the summary and the other files are still imported. `idm remote-proxy import`
keeps the check of every proxy before the first one is sent: if the library
refuses any proxy, nothing is imported, the refused proxies are named, the
others are listed as not attempted, and `--allow-failures` does not apply; once
the check is passed, a proxy that cannot be sent is named in the summary and the
others are imported. `idm remote-proxy import -A` in a directory without remote
proxy files now says so as a warning and exits 0, where it exited 1. A file or
directory that the command line names must exist and parse: otherwise the
command fails whatever `--allow-failures` says. After a failed login `config
import`, `idm import`, `idm schema object import` and `mapping import` now end
with the login error and exit code 1; they used to print "Unrecognized
combination of options" or the help of the command after it.
The imports `journey import`, `node import`, `script import`,
`theme import`, `email template import` and `service import` now import every object or file
they can, name the ones that failed in one summary and exit 1 (with `-A`, and
with `-a` or `-f` when one file holds several objects). `theme import -A` and
`service import -A` printed the error of a file that could not be imported and
exited 0, `script import -A` and `node import -A` did so for a file they could
not parse, and `email template import -A` neither counted a file that failed
validation nor went on after a file it could not parse; all of these are failed
files now. `journey import -A` imported nothing when one file could not be
parsed. A file that the command line names and that cannot be read fails the
command whatever `--allow-failures` says, and so does a batch that the library
rejects as a whole: `journey import` validates all journeys first and rejects
the batch if one is invalid or a dependency is missing. `theme import -a`
imports the themes of a file in one library call and is one operation. `node
import -i`, `service import -i` and `service import -f` exited 0 when the file
did not hold what was asked for; they exit 1. `journey import -A` in a directory
without journey files says so and exits 0; it exited 1. A failed login shows the
error of the login and exits 1, instead of printing "Unrecognized combination of
options or no options" and the help.
The imports of realms, roles, SAML providers, circles of trust, identity
providers, applications and OAuth2 clients (`realm import`, `role import`, `saml
import`, `saml cot import`, `idp import`, `app import` and `oauth client
import`) with `-a` or `-A` now try every item and every file, print one summary
that names the items and files that could not be imported, and exit 1 unless
`--allow-failures` was given. A file named with `-f` that cannot be read or
parsed still fails the command whatever the flag says, and so does a failed
login. `realm import -A` printed the error of each realm it could not import and
exited 0, and a failed login in `realm import` exited 0; both now exit 1. `saml
cot import -A` printed the error of each file it could not import and exited 0;
it now exits 1. `saml import`, `idp import`, `app import` and `oauth client
import` already tried every item and exited 1 with one combined error, which is
now the summary. `role import -A` in a directory without role files printed an
error and exited 1; there is nothing to import then, so it now warns and
succeeds. After a failed login these commands used to print "Unrecognized
combination of options or no options..." and the usage; they now print the login
error only. The library does not say which circle of trust failed, so a file of
circles of trust that fails is named as one failure.
The bulk imports (`-a` and `-A`) of `authz policy`, `authz set`, `authz type`,
`esv secret`, `esv variable`, `secretstore`, `server`, `iga workflow` and `admin
federation` already tried every item and printed the error of each one they
could not import, but said nothing about how many failed or which (the policies,
policy sets, resource types, secrets, variables, servers and providers ended
with one combined error per file); they now also print one summary that names
the failed items. With `-A` a file that cannot be parsed is a failed item and
the next file is imported anyway; `server import -A` used to read all files
first and import nothing when one could not be parsed. `iga workflow import -A`
ignored a file that could not be imported at all and could exit 0; it exits 1
now. `secretstore import -i` printed "Successfully imported" after the error of
a failed secret store; it now says the import failed. `secretstore import -f`
without `-i`, `-a` or `-A` imported every secret store of the file instead of
the first one; it imports the first one. `esv secret import`, `esv variable
import`, `secretstore import`, `server import` and `admin federation import`
printed "Unrecognized combination of options or no options..." and the help
after a failed login; they now report the failed login and exit 1. A file that
cannot be read or parsed with `-a`, and a directory that cannot be listed with
`-A`, fail the command whatever `--allow-failures` says.
`config-manager pull` and `push` of `authentication`, `authz-policies`,
`journeys`, `oauth2-agents` and `org-privileges` stopped at the first realm,
policy set, agent or journey that failed, and left the later ones undone. They
now do every one they can, name the ones that failed in one summary (a realm for
`authentication`, a policy set, an agent, a journey, and for `org-privileges`
the privilege assignments or the configuration of a realm) and exit 1, or 0 with
`--allow-failures`. `push org-privileges` ignored the privilege assignments
(an import that failed still exited 0) and failed at the first realm of the
tenant that had no file; a realm without a file has nothing to import now, a
folder without `privilegeAssignments.json` warns, and a missing `org-privileges`
folder, or a file named with `-n` that is not there, is said plainly and exits 1.
`pull org-privileges` with a realm exported nothing for the realm when the
privilege assignments failed; it tries both. `push journeys` fails a journey
alone when the library finds it invalid, or finds that it needs a journey that
is neither on the tenant nor in the files that are pushed, and so does every
journey that needs the one that failed: the other journeys are imported, and the
summary names the ones that failed. The library rejects the batch of a realm
only when it cannot list the journeys that are installed: that realm fails, and
the other realms are imported. `pull journeys -n` exits 1
and says so when no realm has the journey (it exited 0 and exported nothing).
`push oauth2-agents` skips the root realm on Identity Cloud, as the other kinds
do (frodo-cli#1097). Listing the realms, reading the config file given with
`-f`, and a missing `realms` folder fail the command whatever `--allow-failures`
says.
`config-manager pull` and `push` for `password-policy`, `raw`, `saml`, `scripts`
and `secret-mappings` stopped at the first realm, script, secret mapping, SAML
provider, circle of trust or raw config that failed and exited 1 with one error.
They now do every one they can, print one summary that names the ones that
failed, and exit 1 unless `--allow-failures` was given. `push saml` handed all
providers of a realm to the library in one call, which could not say which one
failed; it now imports them one by one, in the same order. A script without a
name, a script whose content file is missing and a file that is not JSON (or,
for `push password-policy`, is not a password policy) used to stop the whole
command; each is one failed item now. What the command line names must exist,
and when it does not the command says so in plain words and fails whatever
`--allow-failures` says: the file of `pull raw --config-file` (the option is
mandatory now; without one the command failed with `The "path" argument must be
of type string`; `pull saml` needs no file any more, see above), the `raw`
folder of `push raw` and the `realms` folder of `push password-policy`, `push
scripts` and `push saml` (the file-system error is gone), a realm given as an
argument whose password policy, script config, SAML config or secret-mappings
folder is missing, a name that is
in no file or not in the tenant (`push scripts -n` printed a warning and exited
0; `push saml -n`, `pull secret-mappings -n` and `push secret-mappings -n`
printed nothing and exited 0), a script that `pull scripts -n` finds but that is
not a JavaScript script, and a `push raw -p` that matches no file (it imported
nothing and exited 0; the path is that of the config in the tenant, for example
`/openidm/config/cluster`, not a file-system path). A realm folder that holds no
password policy or script config is only skipped, with a warning that names the
file or folder (`push password-policy` used to fail), and a realm of the tenant
that has no secret-mappings folder has nothing to push. A realm in the file of
`pull saml` without `samlProviders` or without `circlesOfTrust` is no longer an
error. `push raw --stdin` is one configuration and fails whatever
`--allow-failures` says. `config-manager pull all` runs these pull commands as
steps: a failed item is named in the summary of its command, and the step in the
summary of the steps.
`config-manager pull` and `push` of `secrets`, `service-objects`, `themes`,
`custom-nodes` and `endpoints` now treat every secret, service object, custom
node and endpoint as its own operation (every realm, for themes), and print one
summary that names the ones that failed. They used to stop at the first one
that failed and print its error; `push secrets` printed the error of a secret
file it could not import and exited 0. They now exit 1 after a failure, or 0
with `--allow-failures`. In `config-manager pull all` a step of these kinds that
fails prints its own summary before the summary of the steps. What the command
line names must be there, whatever `--allow-failures` says: the file of `pull
service-objects -f`, a secret, custom node or endpoint named with `-n`, and the
folder a push reads (`esvs/secrets`, `service-objects`, `realms`,
`custom-nodes/nodes`, `endpoints`). The command now says what is missing in
plain words and exits 1; `push service-objects`, `push themes`, `push
custom-nodes` and `push endpoints` printed a raw file-system error.
`pull endpoints -n` and `push endpoints -n` with a name that does not exist
exported or imported nothing and exited 0; they exit 1. `push themes` for all
realms skips a realm without a `themes` folder with a warning, where it failed
with a raw file-system error, and `push secrets` with nothing to push in
`esvs/secrets` warns and exits 0, where it exited 1.
`config-manager pull` and `push` of `iga-workflows`, `locales`, `schedules`,
`services` and `telemetry` now try every workflow, locale, schedule, service
or exporter they can, name the ones that failed in one summary and exit 1
unless `--allow-failures` was given. They used to stop at the first item that
failed and leave the later ones unexported or unimported; `push locales` and
`push schedules` asked the library to import all entities in one call, which
gives up at the first entity it cannot save, and `push telemetry` did the same
with its exporters, so it now imports them one at a time. The library reads and
imports the services of a realm in one call: `pull services` and `push
services` name the services in its error, with the realm (`alpha/Foo`), and
carry on with the other realms, but a service that cannot be read keeps the
other services of its realm from being exported. A file of a push that cannot
be read or parsed is a failed item and no longer ends the command. Following
decision record 0041, naming an item that is not there (`-n`) fails with a
plain message where `pull locales`, `pull schedules`, `pull services`, `pull
telemetry`, `push locales`, `push schedules` and `push services` used to
succeed without doing anything; a folder to push from that is missing (`push
iga-workflows`, `push locales`, `push schedules`, `push telemetry`) is named in
the message instead of a file-system error; and exporting or importing nothing,
when no item was named, succeeds with a message (`push iga-workflows` and `push
telemetry` used to exit 1). Inside `pull all`, the `locales`, `schedules` and
`services` steps print their own summary of the items before the step appears
in the summary of the steps.
The config-manager `pull` and `push` commands for connector definitions, email
templates, internal roles, remote proxies and variables, `pull managed-objects`,
`pull connector-mappings` and `push csp` now try every item, name the ones that
failed in one summary and exit 1 unless `--allow-failures` was given. They
stopped at the first item that failed, so the items after it were not written or
imported, and a `push` that could not read one file imported nothing. A failure
to read the tenant, a file named with `-n` that cannot be read, a named item
that does not exist and a missing source folder fail the command whatever the
flag says. Some exit codes changed (decision record 0041): `pull managed-objects
-n <name>` for an object the tenant does not have, and `push internal-roles -n
<name>` and `push email-templates -n <name>` for an item that no file holds,
succeeded without a word and now say so and exit 1; `push
connector-definitions`, `push internal-roles` and `push email-templates` from an
empty folder succeeded without a word and now say that they found no files and
exit 1, as `push variables` and `push remote-proxies` always did. A missing
source folder is now said plainly (`No internal roles folder found: <path> does
not exist.`) instead of with a file system error. A pull of a kind that the
tenant has none of succeeds and says so (`No email templates found to export.`).
In `config-manager pull all` an item that cannot be written fails its step, as
before, and the step is named in the summary of steps.
The five `admin` commands that change an oauth2 client or the org model used to
stop at the first failed step, or ignore the failure and exit 0; they now run
every step they can, print one summary that names the steps that failed, and
exit 1 unless `--allow-failures` was given. `admin
grant-oauth2-client-admin-privileges` makes the static user mapping only when
the client was updated, and a client that cannot be updated fails the command
whatever the flag says; `admin revoke-oauth2-client-admin-privileges` removes
the static user mapping even when the client could not be updated (and named the
client "undefined" in its first message with `-i`). `admin
create-oauth2-client-with-admin-privileges` prints the client id and secret as
soon as the client exists, also when a later step failed; it printed nothing
then, and a generated secret was lost. With `--llt` a static user mapping that
cannot be made also fails the command whatever the flag says, because the token
would have no admin rights. A secret for the token that cannot be created is now
an error (it printed an empty secret name), `--no-llt-esv` prints the token (it
printed "undefined"), and the access token lifetime of the client is reset also
when the token could not be issued. `admin
repair-org-model` checked the organization model only when the user model needed
no repair, and exited 0 after a model it could not repair; it checks both and
exits 1. `admin generate-rfc7523-authz-grant-artefacts` saves the JWK and the
JWKS independently of each other and no longer names a JWKS file that was not
written.
`idm remote-proxy setup` is one chain of steps (the client and its static user
mapping on the receiving tenant, the ESV secret and variable and the remote
proxy on this one, the apply of the ESV changes, the test through the proxy),
and each step needs the ones before it. A failed step now ends the run with a
summary that names it and lists the steps that were not attempted, and exits 1
whatever `--allow-failures` says; only the last step, the test through the
proxy, can be allowed to fail. `idm remote-proxy teardown` removes the static
user mapping, the OAuth2 client and the remote proxy in that order and stops at
the first one that fails, so that the access is cut before the proxy that points
at it is gone; the ESV variable and the ESV secret do not depend on each other,
so both are tried, and `--allow-failures` applies to those two. `mapping rename
-a` ended at the first mapping it could not rename and left the ones after it in
the old naming scheme; it now renames every mapping it can and names the others
in one summary. A mapping that is in the new naming scheme already is found from
the list of the mappings, not from a failed read, so a read that fails is a
failed mapping instead of "already renamed". `promote` wrote the outcome of
every file it imported or deleted to the log only and exited 0 when some could
not be; it now counts every file as one operation, prints one summary that names
the files that failed (and the orphaned nodes that could not be pruned), and
exits 1 unless `--allow-failures` was given. Without `-M` and `-e` it printed
nothing, and after a failed login only the error of the login, and exited 0
either way; it now says what is missing and exits 1, and exits 1 after a failed
login. `esv secret version prune` and `journey describe` already tried every
version and every journey and exited 1; they now also print one summary that
names the failed versions and journeys. `esv secret version prune -a` checks
every secret first: one that cannot be checked is listed as not checked and does
not stop the others. The versions of the secrets that could be checked are still
pruned (after the question, or with `-y`), and one summary at the end names the
secrets that could not be checked together with any version that could not be
deleted. The command then exits 1, or 0 with `--allow-failures`; `--dry-run`
shows the same plan and ends the same way. `journey describe` now exits 1
after a failed login, as the other commands do. `journey prune` printed the
error of each orphaned node it could not delete and exited 0; it now exits 1 and
names the nodes. `journey validate` counts every journey as one operation: a
journey with an error (or with a warning, with `--strict`) is a failed journey
and is named in one summary, and a journey that cannot be validated (it is not
in the file, or it cannot be exported) no longer hides the findings of the
others. See
[a command that runs many operations runs them all, then fails if any failed](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0040-a-command-that-runs-many-operations-runs-them-all-then-fails-if-any-failed.md).

**`config-manager` can keep an application and everything it owns in one
folder (experimental)**: `config-manager pull applications` writes one folder per
application, `realms/<realm>/applications/<name>/`, with the application
(`application.json`) and the objects it owns (the OAuth2 client, the SAML
providers, the connector and its mappings); `push applications` and `delete
applications` read and remove the same set. A tree records the layout it uses in
`frodo-config-manager.json` at its root. In a tree whose marker says
`"applications": "folders"`, `pull oauth2-agents`, `pull saml`, `pull
connector-definitions` and `pull connector-mappings` no longer write an object
that an application owns: they say which application owns it and skip it, and so
do they for an entry of `oauth2-agents.json` or `saml.json` that names one (those
files are inputs of yours and are never edited). A tree without the marker keeps
every object at the path of its own kind, exactly as before, and nothing switches
it silently: `pull applications` refuses there and names the migration command,
and the `applications` step of `pull all` is skipped with a warning. A new tree
(none of `realm-config/agents`, `realm-config/saml`, `sync/connectors` and
`sync/mappings` exists yet) gets the layout that `frodo settings
config-manager-layout` shows, `folders` unless you chose `--kind-paths`; the
setting is read for a new tree only.
To move an existing tree, run `frodo config-manager migrate applications`, and
look first with `-d` (`--dry-run`), which lists the folders it would write, the
files it would remove and the entries of your config files that name owned
objects, and changes nothing. The command reads the tenant, because only the
tenant knows which objects belong to an application. It writes each application
as `pull applications` does, removes the files of the OAuth2 clients, SAML
providers, connectors and mappings that applications own from the paths of their
own kinds (never a script or a circle of trust, and never a file that holds
anything else), and writes `frodo-config-manager.json` last, only if every
operation succeeded and no realm was given. An application that cannot be written
keeps its files where they are, the command exits 1 (unless `--allow-failures`)
and can be run again; the tree keeps the old layout until it succeeds. It does
not ask a question: the tree is a working copy, so review the result with `git
diff`. Run on a tree that is marked already, it does nothing. A script or a
pipeline that reads an OAuth2 client, a SAML provider, a connector or a mapping
of an application from its old path has to read it from the application folder
after the migration; one that never migrates is not affected. See
[config-manager keeps everything an application owns in one folder](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0042-config-manager-keeps-everything-an-application-owns-in-one-folder.md).

**`config-manager pull oauth2-agents` and `push oauth2-agents` leave CIMD
profiles, trusted JWT issuers and software publishers to their own kinds
(experimental)**:
`config-manager pull oauth-cimd-profiles`, `push oauth-cimd-profiles` and `delete
oauth-cimd-profiles` work with the CIMD profiles of a tenant (the agent type
`CIMDProfile`: the allow-list of client ID URL patterns for OAuth 2.0 clients
that identify themselves with a Client ID Metadata Document),
`pull oauth-issuers`, `push oauth-issuers` and `delete oauth-issuers` work with
the OAuth2 trusted JWT issuers (the agent type `TrustedJwtIssuer`), and
`pull oauth-software-publishers`, `push oauth-software-publishers` and `delete
oauth-software-publishers` work with the OAuth2 software publishers (the agent
type `SoftwarePublisher`: the publishers whose signed software statements an
OAuth 2.0 provider accepts when a client registers itself). `pull all` includes
all three. They write the files where `oauth2-agents` wrote them
(`realms/<realm>/realm-config/agents/CIMDProfile/<name>.json`,
`realms/<realm>/realm-config/agents/TrustedJwtIssuer/<name>.json` and
`realms/<realm>/realm-config/agents/SoftwarePublisher/<name>.json`), so an
existing tree is still valid; the files are written in the plain shape that the
next entry describes. To give each object one writer, `pull oauth2-agents` and `push oauth2-agents` no longer
handle these three types: an entry of type `CIMDProfile`, `TrustedJwtIssuer` or
`SoftwarePublisher` in `oauth2-agents.json`, and the folder `CIMDProfile`,
`TrustedJwtIssuer` or `SoftwarePublisher` of a tree, are skipped with one
warning per realm and type
that names the new command. Your config files are inputs and are never edited,
nothing in the skipped folder is read or changed, and the exit code does not
change: a pipeline that pushed profiles, issuers or publishers with `push
oauth2-agents` keeps exiting 0 and no longer pushes them, so it adds `push
oauth-cimd-profiles`, `push oauth-issuers` or `push oauth-software-publishers`.
The `overrides` of such an entry are not applied by `pull oauth2-agents` any
more; move them to the overrides file of `pull oauth-cimd-profiles`, `pull
oauth-issuers` or `pull oauth-software-publishers` (`--config-file`, for example
`oauth-issuers.json`), where the entries of a realm are a list without the type
level: `"alpha": [ { "id": "zion-issuer", "overrides": { ... } } ]`. The
overrides are merged into the file as it is written, so a value is given as it
is in the file: `"cimdClientIdUrlPatterns": ["https://${HOST}/*"]`. In a tree
that uses one folder per application, a realm that has only entries of these
three types in `oauth2-agents.json` no longer makes the command read the
applications of the realm. See
[config-manager keeps everything an application owns in one folder](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0042-config-manager-keeps-everything-an-application-owns-in-one-folder.md)
for the rule that an object has one writer in a tree.

**Agent files are written without the `{ inherited, value }` wrapper
(experimental)**: `config-manager pull oauth2-agents` (every agent type it
handles, OAuth2 clients included), `pull oauth-cimd-profiles`,
`pull oauth-issuers`, `pull oauth-software-publishers` and the OAuth2 client file
of `pull applications` (`oauth2-client.json` in the application folder) write
each file with the plain value of every property that is set on the object, and
nothing for a property that is unset, inherited from an agent group or a default,
or `null`. Before, they wrote what AM answers a read of one object with: every
property as `{ "inherited": false, "value": ... }`, and `{ "inherited": false }`
for one that is not set. The files get about 60 percent shorter (the committed
examples go from 4331 to 1748 lines), and a version-control diff shows what is
set on the object and no longer what a group or a default changes. The first
`pull` over a tree that was written before this change shows that difference
once, in every agent file. A `push` is not changed and accepts both shapes, so an
older tree still pushes as it is. An overrides file written for the wrapped
files (a value given as `{ "value": ... }` or as `{ "inherited": false, "value":
... }`) still works: an override in that form is read as its value. A group
whose members are all left out stays in the file as an empty object. The CIMD
profile pull makes one request for a realm and none per profile, because the
list answer, with its `null` for what is not set, gives the same file. See
[a config-manager object has one writer and agent files are written in the plain shape](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0054-a-config-manager-object-has-one-writer-and-agent-files-are-written-in-the-plain-shape.md).

**A pull no longer writes a key set that holds a private or secret key
(experimental)**: `config-manager pull oauth2-agents` (remote consent agents and
OAuth2 clients, whose key set is the `jwkSet` of the agent and the one in its
signing and encryption settings), `pull oauth-issuers` and `pull
oauth-software-publishers` replace a `jwkSet` that holds a private or a symmetric
key (a member `d`, `p`, `q`, `dp`, `dq`, `qi`, `oth` or `k`) with the placeholder
`${<ID>_JWKSET}`, the id of the object in upper case, and say so in one warning
that never prints the key. Before, the key was written to the file with a warning.
A key set with public keys only is written as before. A `push` of such a file
fills the placeholder from the variable (`-E`, `--env-file` or the environment of
the process), which holds the key set as JSON text; without the variable that file
fails and names it, and nothing is sent for it. A script that relied on the key in
the file now sets the variable instead. See
[a pull never writes private or secret key material into an agent file](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0055-a-pull-never-writes-private-or-secret-key-material-into-an-agent-file.md).

**The OAuth2 client of an application no longer holds a private key set
(experimental)**: `config-manager pull applications` (and `migrate applications`,
which pulls the application again) replace the `jwkSet` in the signing and
encryption settings of the OAuth2 client in `oauth2-client.json`, when it holds a
private or a symmetric key, with the placeholder `${APP_<NAME>_JWKSET}`: the
name of the application in upper case, every run of other characters as one
underscore, the way `APP_<NAME>_CLIENT_SECRET` is named. One warning says so and
never prints the key. A key set with public keys only is written as before. A
`push applications` fills the placeholder from the variable (`-E`, `--env-file`
or the environment of the process), which holds the key set as JSON text; an
application whose variable is not set is not imported, and the push names the
variable. Before, the key was written to the file. See
[a pull never writes private or secret key material into an agent file](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0055-a-pull-never-writes-private-or-secret-key-material-into-an-agent-file.md).

**Header overrides are stored encrypted**: a connection profile kept the values
of `--authentication-header-overrides` and `--configuration-header-overrides`
in `Connections.json` in the clear. Now both maps are encrypted with the master
key, like the password. A profile saved with plain maps by an earlier version is
read as it is and is not rewritten by reading it; the next save of that profile
(any `conn save` or `conn set` for it) encrypts them. In the other direction, an
earlier version reads only the profile fields it knows, so it does not see the
encrypted maps: it sends no override headers, and a gateway that needs them
refuses the request. For such a run set `FRODO_AUTHENTICATION_HEADER_OVERRIDES`
and `FRODO_CONFIGURATION_HEADER_OVERRIDES`, or use the newer version.

**Trusted JWT issuers and CIMD profiles are not agents of the generic agent
commands any more**: `frodo agent list`, `agent describe`, `agent export` and
`agent delete` leave out the agent types `TrustedJwtIssuer` and `CIMDProfile`,
as they always left out `OAuth2Client`; each of these types is handled only by
its own commands. Until now the generic commands listed, exported and deleted
them together with the other agents. Now `agent list` does not show them, `agent
describe -i <id>`, `agent export -i` and `agent delete -i` answer that the agent
is not found (the last two exit with code 1), `agent export -a` and `-A` do not
write them, and `agent delete -a` does not delete them. That last change matters
most for trusted JWT issuers: a JWT signed by an issuer is accepted as a grant,
so "delete all agents" no longer removes them. Use `frodo
oauth issuer list|describe|export|import|delete` for trusted JWT issuers and
`frodo oauth cimd list|describe|export|import|delete` for CIMD profiles. A
script that relied on `agent export -A` or `agent delete -a` to include them
adds `frodo oauth issuer export -A` (files `<id>.oauth2.issuer.json`) or `frodo
oauth issuer delete -a --yes`, and `frodo oauth cimd export -A` (files
`<id>.oauth2.cimd.json`) or `frodo oauth cimd delete -a --yes`. Files that an
earlier `agent export` wrote with such objects in them (`<id>.agent.json`) still
import with `frodo agent import`. `frodo oauth issuer import -f` reads them
too; `frodo oauth cimd import` does not: it says so and names `frodo agent
import`.

**`frodo config export` writes each trusted JWT issuer once, and CIMD profiles
under a key of their own**: a full export used to write every trusted JWT issuer
twice, under `agent` and under `trustedJwtIssuer` (with `-A`:
`realm/root-<realm>/agent/<id>.agent.json` and
`realm/root-<realm>/trustedJwtIssuer/<id>.trustedJwtIssuer.json`), and on a
deployment that offers the agent type every CIMD profile under `agent`. Now an
issuer is only in `trustedJwtIssuer`, and a CIMD profile is in its own section
`cimdProfile` (with `-A`: `realm/root-<realm>/cimdProfile/<id>.cimdProfile.json`).
The `cimdProfile` key is left out for a realm that has no profile or whose
deployment does not offer the type, so the export of such a realm is unchanged.
A script, or a tree under version control, that reads issuers or profiles from
`agent` reads them from `trustedJwtIssuer` and `cimdProfile` instead; the
`agent/<id>.agent.json` files of issuers that an old tree still holds can be
deleted. `config import` reads both layouts and writes each issuer and each
profile once. A profile that the target deployment cannot hold is skipped with
a message (`Skipped 1 CIMD profile: the alpha realm of this deployment does not
offer CIMD profiles.`) and does not fail the import.

**`frodo promote` does not carry trusted JWT issuers or CIMD profiles**: a full
export keeps them in `trustedJwtIssuer/` and `cimdProfile/`, which `frodo
promote` does not read, so a change to either is not applied. A tree exported
before 5.0.0-38 also holds issuers under `agent/`; where a comparison counts such
a file as deleted, `promote` deletes it as an agent, which ends with an "agent
not found" error and exit code 1 (export the tree again). Use `frodo oauth
issuer` and `frodo oauth cimd`, or the config-manager commands, for these
objects.

**`frodo idm import` refuses a file without the `idm` wrapper, and `idm export`
and `idm import` take `--raw`**: since 3.0 `idm export` writes every
configuration object inside an `idm` wrapper (`{ "idm": { "sync": { ... } } }`)
and `idm import` reads that format. A file that holds the object as IDM serves
it (what 2.x exported as `sync.json`, or a file of the `conf` directory of IDM)
made `idm import -i <id>`, `-f`, `-a -f` and `-A` fail with "Cannot convert
undefined or null to object", and `idm import -i sync` and `-i managed` read it
as a configuration object without mappings or without managed objects and wrote
that to the tenant, with exit code 0 (frodo-cli#476). They now name the file,
say that it has no `idm` wrapper and that `--raw` imports it, write nothing and
exit 1; with `-A` the other files are still imported and the command exits 1.
`idm import -i sync` or `-i managed` with a wrapped file that holds no such
object fails the same way instead of importing an empty one. New: `idm export
-i <id> --raw` writes the object as IDM serves it, without the wrapper, without
metadata and with the scripts inline, to `<id>.json` (`provisioner.openicf/xyz`
becomes `provisioner.openicf-xyz.json`, as in the `conf` directory of IDM), and
`idm import --raw` imports such a file: `-i <id>` names the object (with no `-f`
the file is `<id>.json`), or `-f` alone names it by the `_id` in the file. A file
whose `_id` is another object than the one `-i` names, and a file that has the
wrapper, are refused. `--raw` works for one object at a time and cannot be used
with `-a`, `-A` or `-e`.

**Four options that did nothing are removed**: each of them was declared and
never read, so a command line that passed one was accepted and did what it would
have done without it
([frodo-cli#1217](https://github.com/rockcarver/frodo-cli/issues/1217)). A
command line that passes one is now rejected as an unknown option, with exit
code 1, before the command connects. Drop the option from the script:

| Removed option                                  | Why dropping it changes nothing                                                                                                                                                                      |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-l, --long` of `frodo esv secret version list` | The table already shows every field the server returns for a version (version, status, loaded, created).                                                                                             |
| `--no-deep` of `frodo esv variable delete`      | The command has no deep delete: it deleted the same with or without the option.                                                                                                                      |
| `--no-deep` of `frodo oauth client delete`      | The command has no deep delete: it deleted the same with or without the option.                                                                                                                      |
| `--target <host url>` of `frodo promote`        | The option was copied from the export commands, where it encrypts secret values for another environment. `promote` never read it, so a script that passed it got no encryption for that environment. |

**`frodo promote` is deprecated and will be removed in 5.0.0** (cli#1263): the
command never ran a promotion of Advanced Identity Cloud. It compares two local
directories of a frodo export (a master export and a current export) and runs
the ordinary import and delete for the files that differ; the platform's
promotion (lock, dry run, promote, status, reports, rollback, unlock) is
`frodo config-manager promote`, which exists since 5.0.0-19. In the 5.x
prereleases `frodo promote` keeps working as it did and prints a deprecation
notice; it gets no new options and no new kinds. To replace it:

| What you used it for                                | Use instead                                                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Run the promotion of the platform                   | `frodo config-manager promote run-promotion <connection>` (and `run-dryrun-promotion`, `rollback`, `check-promotion-status`, ...) |
| Bring a tenant to a tree of files                   | `frodo config import -A -D <master> <connection>` (add `--static` for what a promotion carries), or the `frodo config-manager push` commands |
| Delete what was removed from a tree                 | `frodo config-manager delete <type> -i <id>`                                                                                     |

There is no replacement yet for the automatic delete of the files that
disappeared from the tree, and for the report of the differences (see
[the restructuring of the config-manager commands](https://github.com/rockcarver/frodo-cli/issues/1264)).

**`frodo mcp server`: a list or search result says whether it is complete** (the
group is experimental): the result of a list or search now has `truncated`,
`returned` and `total` in front of `data`, and `nextPageOffset` or
`nextPageToken` and `warning` when `truncated` is `true`. `data` is unchanged, so
a client that ignores the new fields keeps working; a client that reads them can
tell a cut list from a complete one. A capability that cannot tell whether it
stopped at a limit of its own (a log search that removes duplicate events
afterwards) gives `returned` and a `warning` but no `truncated` and no `total`;
that is not a complete result, so read the `warning`. These fields come from
frodo-lib: they appear with the library release that includes
[frodo-lib#1117](https://github.com/rockcarver/frodo-lib/pull/1117), so a CLI
release must pin that library first. A result larger than the inline limit of the
server (256 KiB of indented JSON, 2 MiB for the catalog detail of
`frodo_discover`) was already replaced by `data: { "_truncated": true, ... }`; the
CLI now also says `truncated: true` and `returned: 0` at the top level, keeps the
`total` when it is known, and leaves out any pointer to a next page, in front of
`data` and in `metadata.pagination`, because that page was never delivered.

**`config-manager pull test`, `push test` and `delete test` are removed**: the
three commands were `frodo conn test` mounted under each group, the same code
with the same options. They tested a connection and the login and neither read
nor wrote any configuration, and `frodo conn test` does the same for every
command group
([the configuration command group](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0056-the-configuration-command-group.md):
no `test` commands, `frodo conn test` tests a connection for every group). A
command line that still runs one of them is rejected with `error: unknown
command 'test'` and exit code 1, before any connection is made. Replace the
command in the script; the only visible difference is that `frodo conn test`
does not print the experimental notice of the config-manager group:

| Removed command                    | Use instead       |
| ---------------------------------- | ----------------- |
| `frodo config-manager pull test`   | `frodo conn test` |
| `frodo config-manager push test`   | `frodo conn test` |
| `frodo config-manager delete test` | `frodo conn test` |

**`config-manager push direct-control-init`, `-apply`, `-abort` and `-state` are
removed**: direct control had two implementations, these four commands and
`frodo dcc session`, which has the same four calls and now the one option that
only the old commands had, `-w, --wait`
([the configuration command group](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0056-the-configuration-command-group.md):
`frodo dcc session` is the one implementation of direct control). The group
`config-manager` is experimental, so the old spellings have no alias and print no
notice: a command line that still runs one of them is rejected with `error:
unknown command 'direct-control-init'` (or `-apply`, `-abort`, `-state`) and
exit code 1, before any connection is made. Replace the command in the script:

| Removed command                                  | Use instead               |
| ------------------------------------------------ | ------------------------- |
| `frodo config-manager push direct-control-init`  | `frodo dcc session init`  |
| `frodo config-manager push direct-control-apply` | `frodo dcc session apply` |
| `frodo config-manager push direct-control-abort` | `frodo dcc session abort` |
| `frodo config-manager push direct-control-state` | `frodo dcc session state` |

`frodo config-manager push direct-control-apply -w` becomes `frodo dcc session
apply --wait` (or `-w`): it asks the tenant to apply, then reads the state every
10 seconds until the session is applied, prints `Status: <status>` to stderr for
each read, and still has no timeout. What differs from the old commands:

- **The result is a sentence on stderr, not the state on stdout.** The old
  commands printed the state object on stdout. Use `--json` for the same object
  on stdout; a script that parsed the old stdout needs it. With `--wait --json`
  stdout holds one document, the final state (the old command printed the answer
  of the apply call first, then the `Status:` lines).
- **Without `--json` the exit code is 1 when the answer contradicts the
  action**: `init` when no session is active afterwards, `apply` and `abort`
  when the session is still active. The old commands exited 0 whenever the call
  worked. With `--json` the exit codes of `init`, `apply` and `abort` are those
  of `frodo dcc session` before: 0 whatever the answer says (making them follow
  the answer is left for a later change). Waiting is the one exception:
  `apply --wait`, with or without `--json`, exits 1 at once, without waiting,
  when the apply call reports the session as still active, and exits 1 when the
  session reaches the state `ERROR`.
- **The notice on stderr is the one of a preview command.** `frodo dcc
  session` prints `Preview feature in use`, not the experimental notice of the
  config-manager group.

### Node.js version matrix changes in 5.x

- 5.x is tested on Node.js 26 only, and building frodo from source (the npm
  package) requires Node.js 26 (`engines.node >= 26`). The release binaries
  embed the Node.js 26 runtime and have no Node.js requirement at all.

---

## Upgrading to 4.x

### From 3.x

- Dropped support for Node.js 18 and 20; Node.js 22, 24, and 26 are tested.

**Export extraction is the default, and `-x` now means the opposite.** In 3.x
the export commands extracted scripts and server properties into separate
files only when asked (`-x, --extract`). In 4.x they extract by default, and
`-x, --no-extract` turns extraction off. A 3.x command line that passes `-x`
still runs, but it now keeps that content inline. The long form `--extract`
no longer exists and is rejected. This affects `config export`,
`script export` and `server export`.

| 3.x command line                | Same result in 4.x and later    |
| ------------------------------- | ------------------------------- |
| `frodo config export -A -x ...` | `frodo config export -A ...`    |
| `frodo config export -A ...`    | `frodo config export -A -x ...` |

**Removed options**:

| Removed option                                            | Replacement                                                                                                                                                          |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-s, --separate-mappings` (`config export`, `idm export`) | None needed: sync mappings are always written to separate files.                                                                                                     |
| `-o, --separate-objects` (`config export`, `idm export`)  | None needed: managed objects are written to separate files whenever extraction is on, which is the default; `-x, --no-extract` keeps them in one `managed.idm.json`. |

Both options are gone from every 4.x release and from 5.x, and a command line
that passes one is rejected as an unknown option. The 5.0.0 prereleases
5.0.0-15 to 5.0.0-25 declared them on `config export` again by mistake: the
command accepted them and did nothing with them. To get separate files from
`config export`, use `-A` (with `-D <directory>`).

---

## Maintaining This Guide

When a release removes or deprecates a command, alias, or option:

1. Add the removal to the **target major's** section (e.g. "Upgrading to
   5.x / From 4.x") as a table row: removed spelling, canonical replacement.
2. Keep the README's breaking-changes summary in
   [.github/README.md](.github/README.md) as a short list that links here
   for the full detail.
3. Verify against the built binary before publishing: every alias listed
   as removed should actually be rejected (`frodo <alias> -h` falls through
   to root help).
4. When a release renames a command, keep the old name as a transition alias
   (`withAlias('old-name', 'transition')`, see
   [record 0049](docs/decisions/0049-an-alias-is-named-in-the-description-and-the-old-name-of-a-renamed-command-stays-as-a-transition-alias.md))
   and list the rename as a table row: old name, new name, and that the old
   name is still accepted. The help shows `(formerly: old-name)` and typing
   the old name prints a notice on stderr. When a later major release removes
   the alias, move the row to the removed aliases and verify it as in step 3.
