# The frodo JS shell

`frodo shell` is a JavaScript console for working with a PingOne Advanced
Identity Cloud, ForgeOps, or classic deployment: type expressions, get
results immediately, with authentication handled for you. The same console
also runs in a browser with `--web`.

This page documents what the shell offers. For the architecture behind it
(the engine, the web server's security model, the completion scanner), see
[INTERACTIVE-COMMANDS.md](INTERACTIVE-COMMANDS.md) and the decision records
it links to.

## Starting

```console
# with explicit login parameters
$ frodo shell https://cdk.iam.example.com/am / alpha 'password'

# with a connection profile (unique substring of the AM base URL, or alias)
$ frodo shell cdk

# the same console as a local web page
$ frodo shell cdk --web
```

The shell also starts bare (`frodo shell`): everything that does not need a
connection works; a REST call with no environment connected fails with
`Not connected to an environment.` until you start the shell against a
host (or use `--web` and pick a profile in the page).

Exit with `.exit` or Ctrl+D.

## What is in context

| Name       | What it is |
| ---------- | ---------- |
| `frodo`    | The whole frodo API surface (same modules the CLI commands use: `frodo.idm.managed`, `frodo.journey`, ...) |
| `frodoLib` | Alias of `frodo` |
| `openidm`  | The IDM scripting functions (below) |
| `am`       | The AM realm JSON APIs (below) |
| `$`        | REST with authentication attached (below) |
| `state`    | frodo-lib's session state: `state.getHost()`, `state.getRealm()`, ... |
| `help`     | Browsable API docs (below) |

Top-level `await` works, and `let`/`const`/function/class declarations
persist between inputs, so multi-line exploration flows the way a browser
devtools console does.

`_` is not a frodo name. In the terminal console it is the Node.js REPL's own
`_`: the value of the last result (`1 + 1`, then `_ + 1` is 3), until you
assign to it. The web console does not keep a last result, so there `_` is
`undefined` until you assign it. For JSON data, `frodo.utils.json` has
in-house helpers (`get`, `put`, `findInArray`, `getPaths`, `cloneDeep`,
`mergeDeep`; they are not drop-in replacements for lodash functions, and `get`
takes a path array), and the JavaScript built-ins cover the rest.

## REST: the `$` facade

`$` sends HTTP calls with the session's credentials attached:

```js
$.get('/openidm/managed/alpha_user?_queryFilter=userName eq "bjensen"')
$.post('/openidm/config/scheduler', { enabled: false })
$.put(url, data)
$.patch(url, [op, op, ...])
$.delete(url)
$.head(url)
$.ajax(url, { method, data, headers })
$.ajax({ url, method, data, headers })
$.last      // status, headers and body of the last response
```

Relative URLs resolve against the connected environment: paths under
`/openidm` (and bare paths) go to the IDM origin, `/am/...` paths go to AM.
Absolute URLs pass through, with credentials attached only when the target
is the connected host.

Results resolve with the parsed response body; HTTP error statuses reject
with a `ShellRestError` whose `.result` carries the full response
(`.result.status`, `.result.headers`, `.result.data`), or inspect `$.last`.

## The IDM scripting functions: `openidm.*`

The functions an IDM script context provides, callable from the shell:

| Call | Purpose |
| ---- | ------- |
| `openidm.read(resourceName, params?)` | Fetch one object by path (resolves `null` on 404) |
| `openidm.query(resourceName, params?)` | CREST query (`_queryFilter` or `_queryId` required) |
| `openidm.create(resourceName, id, obj)` | Create with a client-chosen id |
| `openidm.update(resourceName, rev, obj)` | Full update (If-Match on `_rev`) |
| `openidm.patch(resourceName, rev, ops)` | Patch operations |
| `openidm.delete(resourceName, rev)` | Delete |
| `openidm.action(resourceName, action, content?)` | Invoke a resource action (`triggerSyncCheck`, ...) |
| `openidm.encrypt / decrypt / hash / matches` | Crypto through the IDM script endpoint (tenant keys stay server-side) |
| `openidm.isEncrypted / isHashed` | Local `$crypto` blob checks |

Resource names use the same paths as `$`: `managed/alpha_user`,
`repo/link`, `config/scheduler`, `internal/user`, ... The shell completes
them (see below).

## The AM realm APIs: `am.*`

The AM identity, device, and session APIs, always addressed under the
session's realm:

| Namespace | Calls |
| --------- | ----- |
| `am.users` | `read`, `query`, `count`, `create`, `update`, `delete` |
| `am.groups` | same, plus `addMember(groupId, userId)`, `removeMember(groupId, userId)` |
| `am.devices` | `list(userId, type)`, `read`, `update`, `delete`, over the registered MFA device types: `binding`, `oath`, `push`, `webauthn`, `profile`, `trusted` |
| `am.sessions` | `info(tokenId?)`, `validate`, `refresh`, `logout` |

Examples:

```js
await am.users.query({ _queryFilter: 'userName sw "a"' })
await am.groups.addMember('admins', 'jdoe')
await am.devices.list('jdoe', 'oath')
await am.sessions.info()
```

URLs compose from the session's realm (the same call works at the root
realm and under subrealms), and each API sends its documented version
headers.

## Exploring the API: `help()`

```js
help()                          // overview of everything
help(frodo.journey)             // a module's methods
help(frodo.journey.exportJourneys)  // full signature + parameter docs
help('exportJourneys')          // search across all modules
help(openidm.read)              // the shell's own functions, documented too
```

## Exploring results: Ctrl+O

`Ctrl+O` opens the last result as a collapsible tree under the prompt:
arrows move, right/Enter expands, left collapses, Esc closes and keeps the
view in scrollback, `q` or Ctrl+O closes and erases it. Two alternatives
for the same thing: the `.explore` dot-command (for terminals that swallow
the key) and `await explore(value)` for any value.

## History: Ctrl+R

`Ctrl+R` opens a fuzzy search over past commands; Ctrl+R cycles matches,
Enter runs the selection, Esc cancels. A space in the query separates
words that may match in any order (`export config` finds `frodo config
export -A`), and of two exact matches the shorter command comes first.
Letters are matched as typed: accents are not folded, so `cafe` does not
find `café`. Entries remember when they ran and
against which environment, shown as a dim annotation (`2h ago ·
https://tenant...`). The `.history` dot-command prints the full history
with those columns; `.history clear` deletes it; `.history trim <n>` keeps
only the last `n` commands. History is shared between the terminal and web
consoles (10,000 entries) and deduplicated.

## Tab completion

Completion is driven by the same documentation `help()` uses, and by a
catalog enriched from the connected tenant at sign-in:

- **Method names**: `frodo.journey.ex` completes to
  `frodo.journey.exportJourneys`; in the terminal to `name(` (the full
  signature shows in the hint line above the prompt), in the web console
  to the full call with the cursor inside the parens.
- **Resource paths**: inside the first quoted string of
  `openidm.read/query/create/update/patch/delete` and `$` URL strings.
  The suggestions come from the tenant's live shape, so on an Identity
  Cloud tenant `openidm.read('alpha_` finds `managed/alpha_user`, and on a
  self-managed deployment `openidm.read('man` finds `managed/user`.
  Also suggested: the fixed resource families (`repo/link`,
  `repo/managed/<type>`, ...), relationship hops after an id
  (`managed/user/<id>/roles`), `openidm.action`'s action names filtered by
  the resource, CREST query parameters after `?` (and as params-object
  keys: `openidm.query('managed/alpha_user', {` offers `_queryFilter`,
  `_pageSize`, ...), and `am.devices.list`'s device types.
- **Anything you defined**: your own variables, functions and dotted paths
  complete as well, including array hops in bracket notation
  (`c.result[0].name`).

The hint line above the prompt shows what the cursor's position expects
(the method signature, or the current argument's name, type and
description), and lists what each suggested resource is for.

## The web console: `--web`

`frodo shell <host> --web` serves the same console as a local web page and
opens it in the default browser. A one-time sign-in link is always printed to
the terminal too; whoever holds it controls the shell, so it works once and is
consumed on use. The server binds to the loopback address only, and shuts
itself down after 30 idle minutes.

How the browser gets the link: the program that opens a browser is given the
address of a private launcher file, never the link, because the arguments of a
program are readable by every other process of the machine while it runs (and a
browser it starts may keep them). The launcher file is a page that sends the
browser on to the link. It sits in a new folder of your temporary directory that
only you can enter (mode 0700), is readable by you alone (mode 0600), and is
removed as soon as the link is used, after two minutes, and when the console
stops; a file that a killed run left behind is removed at the next start. A
process of your own user, or root, can read the file for that time, as it can
read the credentials of the console anyway. The terminal says "A browser signed
in to the web console." when the link is used, and, if nothing signs in within
20 seconds, reminds you once to use the link that was printed. If the page does
not open (a browser that is packaged so that it cannot read your temporary
directory, an editor that handles `.html` files, a remote session) use the
printed link.

`--no-open` (the option of the browser login), or the environment variable
`FRODO_BROWSER_LOGIN_NO_OPEN` set to a true value, leaves the browser alone: no
file is made, the link is printed and opening it is up to you. A browser that
cannot be opened (no desktop, an SSH session, no browser installed, an opener
that ends with an error) never stops the console: it says so and the printed
link works the same.

If a tab's engine cannot start, the page shows the reason in place of the
connection line and the terminal prints it once; the page asks again after a
pause that grows, and a reload tries at once. The reason is the first error line
the engine process wrote before it ended.

No username or password is needed for `--web`: each browser tab runs its
own engine process that signs in from a connection profile picked in the
page (or the one named on the command line). In the native binary the engine
is the binary itself, started again with a private environment variable that
makes it the engine and not the command line; with npm and in the Docker image
it is node and a separate worker file. The page offers the same
prompt, completion, Ctrl+R search, history and object exploration as the
terminal, plus a connection picker for switching environments, and a
density toggle (compact by default).

## Shell dot-commands

| Command | Purpose |
| ------- | ------- |
| `.help` | The console overview (context, keys, dot-commands) |
| `.explore` | Open the last result as a tree (same as Ctrl+O) |
| `.history [clear\|trim <n>]` | Print, clear, or trim command history |
| `.exit` | Leave the shell |
