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
to make a new key instead). These are fixes for defects in the sense of
[a fix for a defect is not a departure from the 4.x rule](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0034-a-fix-for-a-defect-is-not-a-departure-from-the-4x-rule.md).

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
`theme delete -a`. It is a safety guard, a deliberate exception to the rule that
a command line that ran under 4.x keeps running: see
[a command that can delete more than the one object it names asks first](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md).

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
config file that is not in the config folder given with `-C` (`saml.json`,
`authz-policies.json`, `oauth2-agents.json` or `service-objects.json`) is not:
there is nothing for that step to export, so it is skipped with a warning and
the exit code is not affected. The step names in the summary are the names of
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
-a`, `service delete -a`, `journey delete -a`, `agent export -A`, `agent ai
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
`admin federation import`, and `config-manager pull` and `push` of
`authentication`, `authz-policies`, `journeys`, `oauth2-agents` and
`org-privileges`. For the deletes this means a
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
privilege assignments failed; it tries both. `push journeys` rejects the batch
of a realm when the library finds an invalid journey or a missing dependency:
that realm fails, and the other realms are imported. `pull journeys -n` exits 1
and says so when no realm has the journey (it exited 0 and exported nothing).
`push oauth2-agents` skips the root realm on Identity Cloud, as the other kinds
do (frodo-cli#1097). Listing the realms, reading the config file given with
`-f`, and a missing `realms` folder fail the command whatever `--allow-failures`
says. See
[a command that runs many operations runs them all, then fails if any failed](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0040-a-command-that-runs-many-operations-runs-them-all-then-fails-if-any-failed.md).

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
