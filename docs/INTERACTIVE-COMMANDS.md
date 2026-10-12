# Interactive commands — architecture

Frodo's commands share one interactive layer: when a command is missing
input, the CLI fills the gaps conversationally instead of failing with
usage errors — and every interactive surface doubles as an authoring
tool for the command that will actually run. This document describes the
layer as it exists on main; each section names the module that owns the
behavior, so this page stays the durable map even as individual
mechanisms evolve.

## The prompt gate

Nothing prompts unless EVERY condition holds (`PromptGateState.ts` — the
pure gate, importable from unit tests; `PromptGate.ts` wraps
`@inquirer/core` for the text prompts):

- `FRODO_NO_PROMPT` unset, and `--no-prompt` not passed;
- `FRODO_TEST !== '1'` (the e2e harness spawns with stdio `inherit`, so
  test runs DO have a TTY — an isTTY-only gate would hang them);
- both stdin and stdout are TTYs;
- `setNeverPrompt()` has not been called for the process (belt and
  braces for protocol-channel surfaces like
  `frodo mcp server start --transport stdio`).

Outside the gate, behavior is byte-identical to the pre-interactive CLI:
same errors, same exit codes. e2e snapshots depend on this.

## The resolution pass

`ResolveInteractiveInputs.ts` runs from `FrodoCommand`'s `preAction`
hook, before the action body, and fills missing input in order:

1. **Persisted per-command defaults** (`DefaultsStore.ts`,
   `~/.frodo/Defaults.json`) — values saved from a previous
   `--prompt --save-defaults` run are applied to options that carry no
   value from flag or env this invocation, written with commander
   source `'cli'`: a saved default is user-authored configuration.
   Precedence: explicit flag > env var > persisted default > built-in.
2. **Connection arguments** — missing `host` (dropdown of saved
   profiles, single profile auto-assumed, free-text entry when none),
   then `username`/`password` — only when no saved profile can supply
   credentials for the resolved host (frodo-lib would answer anyway;
   prompting then is pure friction). The username/password prompts run
   as a single connection page (`ConnectionPagePrompt.ts`) showing
   resolved values with provenance (`from profile X`, `from
FRODO_USERNAME`).
3. **Deferred mandatory options** — `FrodoCommand` overrides commander's
   `missingMandatoryOptionValue()` to DEFER violations into a registry
   instead of throwing at parse time; the pass then prompts for each
   (dropdown for `choices()` options, free text otherwise). All
   `makeOptionMandatory()` call sites become prompt-capable with zero
   syntax change.
4. **Option-requiredness groups** — `requireOneOf()`/`requireAllOf()`
   replace the old `Unrecognized combination` dead-ends: an unsatisfied
   group prompts (pick the member, then its value), non-interactive
   runs fail with commander-shaped errors before auth.
5. **The invocation editor** (`EditableOptions.ts` builds the candidate
   list) — on `--prompt` (or the persisted guided mode,
   `frodo settings guided`), a multi-select over the command's optional
   options, with per-option value steps. `--save-defaults` persists
   what this editor commits.

Injection writes BOTH `command.processedArgs` (what `action()` slices
from) and `command.args` (what `handleDefaultArgsAndOpts` iterates) —
commander's `_processArguments` never writes back, so a single-surface
write would be invisible to one of the two consumers.

## Post-auth pickers

Two pickers fire after `getTokens()` succeeds (their loaders need
tokens), from the getTokens wrapper (`AuthenticateOps.ts`):

- **Entity pickers** (`EntityPickers.ts`) — a command whose
  target-entity option (`-i/--secret-id`, `-i/--tree-id`, ...) was left
  unspecified offers a dropdown populated from the live system. Specs
  are registered at setup via `deferEntityPicks(command, [...])`; the
  resolver skips the free-text value step for pickable options. The
  loader is per-deployment-type by construction (whatever read
  function the command family's ops layer provides).
- **The realm picker** (`RealmPickers.ts`) — when the command declares
  a `[realm]` argument, the user did not name a realm, and the target
  system has more than one realm. Provenance (user-specified vs
  sentinel default) is captured BEFORE auth, because frodo-lib maps the
  sentinel to the deployment realm during auth, making the two
  indistinguishable afterwards.

Both inherit type-to-search. Escape declines; single-candidate lists
auto-select.

## Panel per surface (the frame layout)

Every prompt frame is built from the same boxes (`NavigationMenu.ts`
renders them all through one shared `renderFramedBox`):

```
┌ Navigate ────────────────────────────────────────────┐
│ ↑↓ move · type to filter · space select · esc back   │
└──────────────────────────────────────────────────────┘
┌ ? Optional options for 'list' (space to select) ─────┐
│ ○ -E, --env <key=value>                              │
│ ◉ -k, --insecure                                     │
│ ○ --retry <strategy>                                 │
│                                                      │
│ Retry failed operations. Valid values for strategy:  │
│ everything / network / nothing                       │
└──────────────────────────────────────────────────────┘
frodo journey list alpha
```

1. **The Navigate box** — PERMANENT at the top, in the same slot for
   every prompt and every surface. It never disappears; when a
   different surface becomes active (the inline value editor over one
   of the list's members), the box SWAPS its key hints to that
   surface's keys, so the layout never jumps and the keys never lie.
2. **The question panel** — question line (with prefix and filter
   echo) as the title, list rows + the highlighted entry's description
   inside. EVERY list surface gets one: single-select pickers,
   multi-selects, the connection page's rows — the panel is what makes
   them all read as the same kind of object.
3. **Transient editors** (the value box) — their own framed box
   directly UNDER the panel they edit, so the input sits next to the
   list it belongs to and the description stays beside its list.

Only keys that apply to the current prompt appear (silence = that key
does nothing here), and each renders in its role's theme color:
movement muted (furniture), `→`/`←` command (segment navigation worth
spotting), `enter` positive (committing), `esc` negative (backing out).
The box wraps its items within the terminal width. The multi-select's
`space` and the editor's `←` are additional items; the `→` hint count
renders inside the menu.

## The inline value editor

In the invocation editor, `<space>` on a valued option opens the
framed VALUE BOX under the panel:

- An option with commander `.choices()` gets a PICKER (the Navigate
  box's hints swap to `enter pick · esc rejects`) — an enum value is
  picked, never typed. The cursor starts on the option's current value
  when it has one.
- Everything else gets free text (`enter commits · esc rejects`), the
  draft pre-filled with the current value.

Either way the option joins the selection only when a real value is
committed; `<esc>` rejects the mark. Opening or closing the editor
scrubs the readline buffer (replaying its own ctrl+u binding) — the
filter query that positioned the cursor must not leak into the value
as a prefix. All of it stays in ONE prompt: the earlier design that
nested a second @inquirer prompt inside the keypress handler had two
readlines fighting over stdin and froze the frame.

## The command preview

`CommandPreview.ts` (zero-import: pure commander serialization) renders
the command being authored as a footer in every prompt. The footer is
LIVE — a function-form `preview` config is re-invoked on every render
with the highlighted choice, and the pickers shadow the highlighted
value into a throwaway copy of the command's positional/option for that
render only. Red + cursive while mandatory input is missing, green when
ready. On conclusion the resolved command prints once, in green,
directly above the action's results — the copy-paste moment.

Serialization rules (`serializeCommand`): exactly the tokens a user
would retype. Positionals first (`password` masked), then options the
USER provided this invocation (commander defaults and unset options
never serialize; user-typed negatable flags serialize as the flag
alone; repeated list options serialize as repeated flags). Realm
sentinels never display — the deployment type's realm prints instead
when known.

## Erase-on-conclude

Every prompt erases its entire frame when it concludes — enter, escape,
→, SIGINT, or EOF (`clearPromptOnDone` context option; @inquirer/core's
`screen.done({ clearContent })` in the prompt promise's `.finally()`).
The only trace of an interactive session is the eventual-command print
and the action's own output. Abandoned flows (cancelled pickers,
unsatisfied groups, failed auth) print nothing.

## Key language (every interactive surface)

- `↑`/`↓` — move within a list; the cursor CLAMPS at the first/last row
  (a list with a beginning and an end, not an endless loop);
  type-to-filter narrows it.
- `<enter>` — conclude/advance.
- `<space>` — multi-value select only (the invocation editor). Marking
  an option that needs a value side-steps straight into its inline
  value box (a picker for `.choices()` options, free text otherwise);
  the option joins the selection only when a real value is collected
  (escaping the box rejects the mark).
- `→` — enter the next editor segment, where the prompt advertises one
  with a counted hint ("→ 4 options to configure"); only armed when a
  hint exists, and only when the filter query is empty (with text
  typed, ←/→ stay readline cursor movement).
- `←`/`Esc` — back ONE level (see the tree-climb below). Two-stage with
  an active filter: first Esc clears the query, second backs out.
- `Esc` `Esc` (double-press, 400ms window) — exit all the way. Two
  consecutive Escapes within 400ms resolve the current prompt with the
  exit-all sentinel, which unwinds to the very top of the session from
  any nesting depth — no matter how many pickers or editors are stacked.
  Any other key between the two presses resets the pair (the mouse
  double-click analogy: the presses must be consecutive). A single Esc
  at the ROOT picker still prints help and exits, as always.

The invocation editor orders its candidates the way `-h`/`-hh` orders
help: the command's OWN options first, then connection options, then
everything else (authentication, runtime, output) — alphabetical by
option word within each bucket (`sortEditableOptions`; the bucket
derives from the option's help-group heading, so help and the editor
can never disagree about where an option belongs). The cursor carries
a GLYPH (`›`), not just color — color alone is invisible when it sits
on an already-marked row. After a value editor closes, the cursor
returns to the option that was just edited or rejected, and re-opening
the editor (via `→` from a picker) shows previously committed
selections pre-marked.

Command-tree navigation also respects the key language: `Esc` inside a
nested sub-command picker backs out ONE level — the parent's picker
re-opens with the child still filterable — instead of ending the
session. Only the ROOT picker's Esc exits (help-exit), and the
double-ESC exit-all works from any depth (`Esc` `Esc` inside the
config-manager picker, for example, lands straight back at the shell).

## Stubs: containers, action stubs, and the Run row

Every command is one of two classes (`FrodoCommand` = live,
`FrodoStubCommand` = container), and the framework makes the
difference visible in help and behavior:

- **Pure container** (`journey`, `esv`, `log`, ...) — bare invocation
  opens the sub-command picker; its help carries the framework's
  standard line ("Run without a sub-command to enter interactive
  mode.") and lists `--no-prompt` only (legacy help-exit restored).
- **Action stub** (`conn`, `settings`) — a full command of its own
  whose bare invocation runs its own interactive mode (declared in its
  DESCRIPTION, not a marker line; one-line `.summary()` keeps the
  parent's list short). Its sub-command picker carries a **Run row
  first** ("Run 'conn' — <description>"), so the tree stays browsable:
  bare mode → ESC → picker (Run row re-offers the action) → ESC →
  parent. Both `--prompt` (sub-command picker instead of the action —
  browse mode on demand) and `--no-prompt` (the action is
  gate-respecting: declines without prompting, exactly like ESC) list
  in its help.
- **Live command** — everything as before: the resolution pass, the
  `--prompt` options editor, `--no-prompt` legacy failure.

An action stub's bare interactive mode is one level of the navigable
tree, not a session endpoint: declining it (ESC, gate-blocked, esc×2)
throws the framework's STEP_BACK sentinel (`STEP_BACK_FROM_ACTION` for
command files) and the sub-command picker re-opens.

## Zero-import modules and the frodo-lib Jest constraint

Jest cannot import the resolution pass (its frodo-lib import graph
breaks under the test mocks — see `app.commandWiring.test.ts`'s header).
Everything the tests must reach therefore lives in zero-import modules
under `src/utils/interactive/`: `PromptGateState`,
`ActiveActionCommandState`, `AuthoringPrintState`, `PositionalArgs`,
`EditableOptions`, `CommandPreview`, `EntityPickers` (registry only),
`DefaultsStore`. Each is pure fs/commander/none; the resolver and
command wiring lazy-import whatever carries a frodo-lib graph.

## Layering: where interactive code lives

The framework is AMBIENT: a developer adds a command the way they
always have and it picks interactivity up automatically (resolver,
connection page, entity/realm pickers, invocation editor). Regular
command files and ops modules therefore carry no prompting code of
their own — `conn.ts` is one import line, `ConnectionProfileOps` has
none.

- `src/utils/interactive/` — THE interactive folder: the framework
  (prompt components, gate state, resolver-adjacent machinery) AND
  every reusable picker built on its prompts, including the pickers of
  natively-interactive commands (ConnectionProfilePickers behind
  `frodo conn`, JourneyDebugPrompt behind `frodo debug journey`,
  RealmPickers, EntityPickers). Single-use today does not mean
  single-use tomorrow — the theme picker already gained a second
  consumer — so command implementations that prompt centralize HERE,
  next to the machinery they compose. These modules may import frodo-lib
  directly (RealmPickers' `state`, ConnectionProfilePickers'
  `frodo.conn`) but NEVER import from `src/ops/` — the command/resolver
  layer calls INTO them.
- `src/cli/` — command files reach the interactive layer with a plain
  import (conn.ts → ConnectionProfilePickers, debug-journey.ts →
  JourneyDebugPrompt) or not at all. Even a natively-interactive
  command's file contains no prompt code — just the import.
- `src/ops/` — operations, including natively-interactive ones whose
  flow embeds ONE interaction as part of the operation itself
  (LoginSetupOps's "Apply these changes?" transaction gate). A gate is
  proceed/abort only: never value collection, never resolver
  prompting, never a standalone picker. The ONE exception to
  "ops modules must not prompt" — documented at the import site.
  Otherwise: `AuthenticateOps`'s zero-import state imports
  (`ActiveActionCommandState`, `PromptGateState`) are pure state, no
  prompting; its prompt-bearing machinery is reached via
  lazy `await import()` so the frodo-lib graph stays clean for the
  Jest mocks.
- Shared vocabulary (e.g. `CredentialOverrideType`) lives in
  `src/utils/interactive/` so neither layer imports a type across the
  ops boundary; ops re-exports (`AuthenticateOps`) keep established
  import paths stable.
