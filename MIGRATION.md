# Frodo CLI Migration Guide

This page summarizes the breaking changes between major versions of
`@rockcarver/frodo-cli` — everything you need to migrate scripts and
automation from one major version to the next without deciphering the full
[changelog](CHANGELOG.md).

---

## Upgrading to 5.x

### From 4.x

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

**Journey import validation**: journey imports, full configuration imports,
config-manager journey pushes, and `frodo promote` now validate journey
references by default. Pass `--no-validate` to restore the previous behavior.

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
| `--no-deps` with `-A`                                                                                  | `script import`                                                                                                                                                                                                                                     |
| `-t, --secretstore-type` with `-a` or `-A`                                                             | `secretstore delete`, `export`, `import`                                                                                                                                                                                                            |
| `-g, --global` with `-a` or `-A`                                                                       | `config import`                                                                                                                                                                                                                                     |
| `-s, --separate-mappings` or `-o, --separate-objects` with `-a`                                        | `config export`                                                                                                                                                                                                                                     |
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

**Removed option**:

| Removed option                                            | Replacement                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| `-s, --separate-mappings` (`config export`, `idm export`) | None needed: sync mappings are always written to separate files. |

---

## Maintaining This Guide

When a release removes or deprecates a command, alias, or option:

1. Add the removal to the **target major's** section (e.g. "Upgrading to
   5.x / From 4.x") as a table row: removed spelling, canonical replacement.
2. Keep the README's breaking-changes summary in
   [.github/README.md](.github/README.md) as a short list that links here
   for the full detail.
3. Verify against the built binary before publishing: every listed alias
   should actually be rejected (`frodo <alias> -h` falls through to root
   help).
