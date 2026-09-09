# Changelog

## Unreleased

## [v4.13.0] - 2026-09-09

### Added
- Introduced the `config-manager push authz-policies` command, enabling users to push authorization policies more efficiently. (#685)
- Added the `config-manager push test` command, providing users with the ability to test configurations before deployment. (#686)

### Changed
- Added the `--credential` option to enhance login flexibility, and deprecated the `--force-login-as-user` flag to streamline credential management. (#688)

### Fixed
- Updated `@rockcarver/frodo-lib` to version 4.8.4, incorporating the latest bug fixes and performance improvements for better CLI stability. (#688)

## [v4.12.0] - 2026-09-08

### Added
- Introduced the `frodo login setup` command, streamlining the login configuration process. This command enhances user experience by simplifying setup steps. (#672046a5)
- Added browser-based interactive login support using loopback and device flow methods, providing users with more flexible authentication options. (#962078fe)
- Enhanced the `frodo conn save` command with a `--default-credential` option, allowing users to specify a default credential for connection profiles. (#2c2d1ece)
- Introduced the `--force-login-as-user` flag to override credential priority on profiles with multiple credentials, offering users more control over login behavior. (#9d97b191)
- Updated the `session describe` command to display the admin role alongside scope, improving visibility into session details. (#3dee1869)

### Changed
- Redesigned the `session describe` and `session list` commands for improved clarity and usability, making it easier for users to manage sessions. (#672046a5)

### Fixed
- Fixed an issue where obsolete snapshots were left behind by an earlier fixture refresh, ensuring cleaner test environments. (commit 188b12f8)
- Updated `@rockcarver/frodo-lib` to version 4.8.3, incorporating bug fixes and improvements from the library that enhance the stability and performance of the CLI. (commit c763b465)
- Improved session host resolution to distinguish between unresolvable hosts and resolved-but-empty ones, enhancing error handling and diagnostics. (#a296115c)
- Synchronized `mcp server start --profile` choices with the registry and refreshed stale `conn-describe` snapshots, ensuring accurate and up-to-date configurations. (#c72a802b)
- Enhanced `session describe` enrichment, added MCP self-service profile support, and improved reauthentication error handling, providing a more robust session management experience. (#cc5f399e)

## [v4.11.0] - 2026-09-05

### Added
- Introduced the `config-manager push raw` command, enabling users to push raw configurations directly to the server. This feature enhances flexibility in managing configuration data. (#681)
- Added the `config-manager pull telemetry` command, allowing users to pull telemetry data for better monitoring and analysis of system performance. (#680)
- Implemented the `config-manager push secrets` command, providing a secure method to push secret configurations to the server. (#678)
- Introduced the `config-manager push services` command, facilitating the deployment of service configurations. (#676)

### Changed
- Updated container image documentation to require explicit selection of a connection profile, ensuring clarity and proper configuration when deploying containers. (#682)

### Fixed
- Corrected container image handling to ensure connection profiles are selected and documented correctly, preventing potential misconfigurations. (#682)

## [v4.10.0] - 2026-09-04

### Added
- Stabilized the `frodo mcp server start` HTTP transport (`--transport http`) so an MCP gateway running in a Docker container on the same host can reach it without changing the gateway's image or network model; every gate is frodo-side configuration:
  - `SIGHUP` (terminal closed) and `SIGQUIT` (Ctrl+\) now join `SIGTERM`/`SIGINT` in the graceful-shutdown wiring, and shutdown force-closes idle keep-alive sockets before releasing the port -- closing the SSH session that launched a long-lived HTTP server no longer orphans the listener holding the port.
  - `EADDRINUSE` prints one actionable message (find the incumbent with `lsof -iTCP:<port> -sTCP:LISTEN`, use `--port <other>` or stop it) and exits with code 1, instead of doubling the error through the global unhandled-rejection printer.
  - `--allowed-hosts <host...>` extends the default `Host` header allow-list (`localhost`, `127.0.0.1`, `[::1]`) with extra client hostnames; `host.docker.internal` is accepted automatically whenever the bind host is non-loopback (the standard bridge-network container alias for the host machine).
  - `--mcp-auth-token <secret>` (with the `FRODO_MCP_AUTH_TOKEN` environment fallback, preferred so the secret stays out of process listings) requires a matching `Authorization: Bearer` header on every MCP request, timing-safely compared; `GET /health` stays unauthenticated for liveness probes. Binding a non-loopback host without a token refuses to start unless `--allow-unauthenticated` is passed explicitly; loopback binds without a token behave exactly as before.
  - Request-metadata headers (`MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`) are now validated era-conditionally: current-protocol clients get the full header/body cross-checks as before, while earlier-era gateways (LiteLLM defaults to protocol revision 2025-11-25; Kong shipped 2025-06-18) are no longer 400'd at frodo's HTTP layer for headers their protocol era never sends -- the incident behind the original containerized-gateway connection failure.
  - Two SDK-parity rejections close silent-downgrade holes in the era gate: a present-but-malformed `_meta` envelope claim (a claim key whose value is not a protocol-version string) is answered `400 -32602` with the SDK's own `envelope-invalid` wording instead of being quietly served as legacy traffic with every modern cross-check skipped, and an empty JSON-RPC batch (`[]`) is answered `400 -32600` instead of an empty `202`. Each received shutdown signal (`SIGTERM`/`SIGINT`/`SIGHUP`/`SIGQUIT`) is now logged, so a remotely triggered shutdown leaves a record of why the server went down.
  - Observability for the long-running server: the listening line now carries the server PID, a liveness heartbeat (`heartbeat: ... still listening ...`, every 15 minutes) tells a healthy listener apart from a hung one in remote logs, an `EADDRINUSE` message names a live MCP incumbent when its `/health` endpoint answers the probe (plain squatters still get the generic message), and an uncaught exception in server mode logs one timestamped crash line (event `crash`), closes the port best-effort, and exits 1 so a supervisor restarts cleanly; unhandled promise rejections stay owned by `frodo`'s global CLI handler (logged, exit code 1, server keeps serving). `frodo`'s `launch.cjs` wrapper now forwards `SIGHUP`/`SIGTERM`/`SIGINT`/`SIGQUIT` to the CLI child (and kills the child if the wrapper exits first), so signals that reach only the wrapper — a closing SSH session, `kill <wrapper-pid>` — actually stop the server and release the port.
  - SDK-parity completion of the 2026-07-28 envelope gate: every request carrying an envelope claim must now also carry the required `io.modelcontextprotocol/clientCapabilities` key (a present object), exactly as the SDK's `validateEnvelopeMeta` requires — a claim-only request (modern or legacy-dated revision named, capabilities missing) is answered `400 -32602` `envelope-invalid` with the SDK's exact wording, missing keys reported before schema violations inside present keys. An `initialize` with a modern claim but no capabilities key still classifies as the legacy handshake (SDK `carriesValidModernEnvelopeClaim` parity), and a JSON-RPC batch containing ANY claimed element is rejected `400 -32600` (`batch-with-modern-element` parity — the SDK rejects on claim presence, whatever its validity or era). Notifications are validated exactly as narrowly as the SDK validates them: a claimed notification needs only a string claim (no capabilities key, whatever revision) and the only notification envelope rejection is a non-string claim value. `POST /mcp` now also accepts a query string (`/mcp?x=y` — RFC 9110, the query is not part of the path; debug arrival lines log the route path only, never the query), and the -32020 presence messages restored origin/main's header capitalization (`MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`).
  - Per-request gate observability at `--mcp-log-level debug` (`http` event): every request's arrival (method, URL, remote address), its fate at each gate (route miss, Host/Origin, 405, 401 -- the Authorization header's PRESENCE is logged, never its contents --, 400, 406, metadata/protocol-version/batch rejections) and one acceptance line before the SDK transport answers. At the default `info` level these lines stay quiet; the point is telling "requests arrive and are rejected at a gate" apart from "requests never arrive".
  - Operational hygiene for long-running deployments: `frodo mcp server stop` stops a running HTTP server via its PID lockfile (`~/.frodo/mcp-http-<port>.pid`, honoring `FRODO_CONFIG_PATH`; written after a successful listen, removed on every shutdown signal and on the crash path) -- SIGTERM first with a 10-second wait, `--force` for SIGKILL, stale lockfiles cleaned as a success, a best-effort PID-reuse guard refusing to signal a process that demonstrably is not frodo, and a clear exit 1 when no lockfile exists for the port. A start over a dead-PID lockfile logs a one-line stale note (`overwriting stale lockfile for port N (recorded pid P is not running)`) before overwriting it. `--port auto` binds an OS-assigned ephemeral port and the listening line/heartbeat/lockfile all report the RESOLVED port (also fixing `--port 0` printing the requested `0`; a literal `--port 0` now falls back to the default 6277 like other invalid values instead of binding ephemeral -- use `--port auto` for that). The dry-run summary reports the literal option value (`"port": "auto"` rather than the internal `0`) since no port is bound on a dry run. `--max-body-size <bytes>` (default 1 MiB; `FRODO_MCP_MAX_BODY_SIZE`) bounds request bodies with a `Content-Length` pre-check plus a mid-stream accumulation cap, answering `413` with a JSON-RPC `-32000` error naming the limit and closing the socket (the mid-stream path's `receivedBytes` reports the bytes actually observed up to the cap, not the limit itself); `--max-concurrent-requests <n>` (default 64; `FRODO_MCP_MAX_CONCURRENT_REQUESTS`) rejects over-cap handler executions with `429` + `Retry-After: 1` (queue-less; the cap counts handler executions, so a slow SSE stream holds its slot until its handler resolves); `FRODO_MCP_HEARTBEAT_INTERVAL_MS` overrides the liveness heartbeat (clamped >= 1000 ms, invalid keeps the 15-minute default). All defaults are generous (1 MiB is ~2.5x the largest observed QA payload; 64 far above observed load) and every knob is opt-in, so existing deployments are unaffected.
  - Container packaging: a multi-stage `Dockerfile` (node:24-slim build running `npm run build:only`, then a slim runtime stage with only the self-contained `dist/` bundle -- zero runtime `node_modules` -- running as the non-root `node` user with `launch.cjs` as ENTRYPOINT so `docker stop` performs the graceful shutdown) and an example `docker/docker-compose.yml` (bridge network `mcpnet`, read-only `Connections.json` + `masterkey.key` mounts, `FRODO_HOST` profile selection, node-one-liner `/health` healthcheck, `restart: unless-stopped`, `--allowed-hosts frodo-mcp` so the co-located gateway's service-DNS-name `Host` header passes the Host gate, and a commented-out co-located-gateway service dialing `http://frodo-mcp:6277/mcp` by service DNS name). The connection profile must be selected explicitly -- the positional tenant argument or `FRODO_HOST`; the image's default CMD carries no tenant, and a server started without one comes up healthy (`/health` answers) but connected to nothing. Documented in `docs/MCP_CLIENT_SETUP.md`.

- Graceful shutdown now includes `SIGHUP` and `SIGQUIT` signals, force-closes idle sockets, and logs shutdown signals (`SIGTERM`/`SIGINT`/`SIGHUP`/`SIGQUIT`) for traceability. (commit 6d6f2916)
  - Improved error handling for `EADDRINUSE`, providing actionable messages and exit codes. (commit 6d6f2916)
  - Extended `--allowed-hosts` to include extra client hostnames, automatically accepting `host.docker.internal` for non-loopback binds. (commit 6d6f2916)
  - Introduced `--mcp-auth-token` for secure requests, with an environment variable fallback. Unauthenticated binds require explicit allowance. (commit 6d6f2916)
  - Enhanced request validation to accommodate different protocol eras, preventing silent downgrades and ensuring SDK parity. (commit 6d6f2916)
  - Improved observability with server PID logging, liveness heartbeats, and detailed request processing logs at `--mcp-log-level debug`. (commit 6d6f2916)
  - Operational hygiene improvements include a `frodo mcp server stop` command, lockfile management, and support for ephemeral ports with `--port auto`. (commit 6d6f2916)
  - Added container packaging with a multi-stage `Dockerfile` and example `docker-compose.yml`, supporting non-root execution and graceful shutdown. (commit 6d6f2916)

### Fixed
- Corrected the dry-run summary to report the literal 'auto' port instead of the internal `0`. (commit c9906c56)
- Log a note when starting over a stale lockfile to indicate overwriting a dead record. (commit 06d344b4)
- Allow the compose gateway's service DNS name in the Host gate to facilitate containerized deployments. (commit 8e62327e)

## [v4.9.1] - 2026-09-01

### Fixed
- Ensure theme settings persist on first run by creating config directory (#675).

## [v4.9.0] - 2026-08-31

### Added
- Added a `frodo settings` command for managing local frodo CLI preferences (distinct from `frodo config`/`config-manager`, which manage remote Ping/AIC configuration), with `theme` as its first category:
- Introduced a `frodo settings` command for managing local frodo CLI preferences, with `theme` as its first category. This includes commands for listing, showing, setting, and detecting themes, as well as an interactive picker for theme selection. Twelve bundled themes are available, each computed for optimal contrast based on terminal background color. Themes are stored as discoverable JSON files, allowing for user customization. The active preferences persist in `~/.frodo/Theme.json` (#901c5ac5).
  - `frodo settings theme show` -- the active theme, a per-intent color swatch table, and a realistic sample of frodo-cli output (an object table, a schema-property table, a status table, and every message type) rendered in it, the practical way to judge whether a theme actually works on a given terminal background.
- Added a `negative` intent for styling bad/inactive/disabled status values, distinct from `error`, and applied it across multiple call sites (#baed6ac3).
  - `frodo settings theme background <name>` / `frodo settings theme contrast <tier>` -- the theme model is two independent preferences, not one flat name: `background` (`dark`/`light`/`blue`/`yellow`) and `contrast` (`high-contrast`/`regular`/`vibrant`, default `vibrant`), combined into a theme name (`<background>` for `high-contrast`, `<background>-<contrast>` otherwise). `set <name>` still works, parsing a recognized combined name into both preferences.
  - `frodo settings theme detect` -- best-effort terminal-background auto-detection (OSC 11), setting only the `background` preference; `contrast` is never touched by detection. Runs automatically once, only the first time no background has ever been chosen; `detect` re-runs it on demand (e.g. after switching terminals), and `frodo settings theme autodetect on|off` disables it entirely.
  - `frodo settings` and `frodo settings theme` (called with no subcommand) launch an interactive picker -- a two-step background-then-contrast flow for `theme`, including an "Auto-detect from my terminal" entry -- built on a custom Escape-aware prompt (the packaged `@inquirer/select` has no Escape keybinding at all) so Escape backs out a level (contrast step back to background step) instead of requiring Ctrl+C; `settings` itself skips its own category menu when there's only one category (still just Theme) rather than showing a single-item menu with nowhere further to back out to.

  Twelve bundled themes ship (3 contrast tiers x 4 backgrounds), each computed against its actual background RGB via frodo-lib's `TerminalContrastFilter` rather than eyeballed -- including `blue` and `yellow`, whose reference colors are real macOS Terminal profiles ("Ocean", "Man Page"). Theme files are discoverable files in `~/.frodo/themes/` (JSON, one file per theme), not a single opaque settings blob -- `dark`/`light`'s `high-contrast` tier is always guaranteed-readable (resolved from code, never from disk); every other tier is genuinely file-driven, written there as an illustrative, forkable reference copy a user can copy under a new name and edit into a real custom theme. The active preferences persist in `~/.frodo/Theme.json`, with `FRODO_COLOR_THEME` still taking precedence for the underlying dark/light mode, same as before.
- Added a `negative` intent (`ColorTheme.ts`) for bad/inactive/disabled status values, distinct from `error` -- a `disabled: true` field in a describe table isn't a failure, so it shouldn't have to borrow that intent's color to get styled. Applied across ~48 call sites in 14 `ops/` files that had been using `muted` (too quiet to read as a real status) for the same values.
- Adopted frodo-lib's new semantic color-intent theme (`error`/`warning`/`command`/`emphasis`), replacing frodo-cli's own previous non-semantic fix (a flat `*Bright`-to-plain remap in `ColorTheme.ts`) for the same underlying problem: `tinyrainbow`'s bright ANSI colors are unreadable on light-background terminals. Added frodo-cli-specific intents on top (`heading`, `positive`, `muted`, `debug`), each color chosen via frodo-lib's new objective `TerminalContrastFilter` (a WCAG contrast-ratio check) rather than by eye, and migrated all ~500 of frodo-cli's own call sites from raw hue names (`c.cyanBright(...)`) to the matching semantic name (`c.command(...)`, `c.heading(...)`, etc.) so no code outside `ColorTheme.ts` references a literal color anymore. Also caught and fixed two latent bugs the stricter typing surfaced: `printMessage(msg, 'success')` and `printMessage(msg, 'warning')` (a typo for `'warn'`) were both silently falling through to plain, uncolored text, since neither matched any of `printMessage`'s actual case values.
  - Added a real `MessageType` union type for `printMessage`'s `type` parameter (previously an unenforced string), plus canonical `infoMessage`/`warnMessage`/`errorMessage`/`successMessage` wrapper functions mirroring the existing `verboseMessage`/`debugMessage` pattern. `printMessage`/`printError` keep their existing names and signatures otherwise -- `printError` remains distinct, since it understands and formats an actual `Error`/`FrodoError` object, unlike `errorMessage`'s arbitrary error-styled string.
- Added new commands to manage IDM tenant-configuration features (Cloud only) (ca2f90a9):
- Adopted frodo-lib's new semantic color-intent theme, replacing previous color mappings. Added frodo-cli-specific intents and migrated call sites to use semantic names, improving readability on light-background terminals (#32ea91b3).
- Added `frodo script type describe` to print the bindings exposed to scripts running in a given AM scripting context (ca2f90a9).
- Restructured `frodo idm schema` to promote `property` to a sibling of `object` and added a new `frodo idm schema relationship` command tree for managing relationship schemas (8776bd5f).
- Added new commands for managing IDM schema objects, properties, and relationships, including create, update, delete, export, import, and list operations. These commands now support flags for detailed configuration, replacing previous JSON payload methods (49393042).

  `install` is confirmation-gated with an explicit irreversibility warning and is a no-op if the feature is already installed.
- Added `frodo script type describe` to print the bindings (available objects/APIs) exposed to scripts running in a given AM scripting context (ca2f90a9).
- Restructured `frodo idm schema`: promoted `property` to a sibling of `object` (`frodo idm schema property ...` instead of `frodo idm schema object property ...`).
- Added a new `frodo idm schema relationship` command tree (any deployment that runs IDM -- Cloud and ForgeOps), backed by IDM's dedicated v2 relationship-schema API:
- Added `--sub-property <path>` for managing nested properties of a `type: object` property, allowing for detailed schema manipulation (49393042).
- Added `-l, --long` to list commands for detailed output, matching the CLI's convention (49393042).
- Enhanced `frodo idm schema object describe` with `-r, --recursive` for expanded nested property details and improved table formatting (49393042).
- Added `frodo script type list` to discover script types, supporting `-l, --long` for detailed output (49393042).

  Includes bidirectional (two-managed-object-type) relationship support -- `create --reverse-property` auto-creates the reverse side in the same write; `update`/`delete --with-reverse` infer the reverse side's identity from the property's own existing definition.
- Added new commands filling gaps left when the `object`/`relationship` trees were first built (`property` already had both):
- Added `--description <text>` to `frodo idm schema object create/update` for setting type descriptions (49393042).
- Shortened and standardized help text across `frodo idm schema` and `frodo feature` command families for consistency and clarity (49393042).
- Revised usage examples for `frodo idm schema` commands, adding more detailed scenarios and flag combinations (49393042).

  `relationship`'s dedicated v2 API has no bulk-list endpoint, so `relationship list` falls back to a whole-type schema read filtered to relationship-typed properties.
- `frodo idm schema object create`/`update` are now flags-only (`-o`/`--title`/`--icon`), matching `relationship`'s design, instead of taking a `-f/--file` JSON payload -- `export`/`import` remain the file-based round-trip path. `create` seeds a minimal type (just the `_id` property, a populated `order` array, and a default icon if `--icon` isn't passed) since custom properties are added afterward via `property create`/`relationship create`, which already keep `order`/`required` in sync.
- `frodo idm schema property create`/`update` now take flags (`--property-type`, `--array`, `--title`, `--description`, `--required`, `--searchable`, `--user-editable`, `--not-viewable`, `--return-by-default`) instead of a `-f/--file` JSON payload, matching `object`/`relationship`'s design; `--property-type` supports every type the Admin UI's picker offers (string/number/boolean/date/time/datetime/duration/object).
- Added new commands as the file-based round-trip path the `property create`/`update` flags above displace:
- Changed `frodo idm schema object export/import` flag from `-i, --individual-object` to `-o, --managed-object` for consistency (49393042).
- Updated `frodo idm schema object create/update` to use `mat-icon` instead of `icon` for setting icons, aligning with the Ping Identity Platform's Admin UI requirements (49393042).

  `import` is also the only way to give a new `object` property its own nested sub-properties in one write, since the flags only build a flat definition.
- Added new commands giving `relationship` the same file-based round-trip commands `object`/`property` already have:
- Refactored schema property and relationship handling to use frodo-lib functions, improving maintainability without changing behavior (49393042).
- Updated usage examples to use short connection-profile aliases for clarity in repeated examples (49393042).
- Added `--sub-property <path>` for managing nested properties of a `type: object` property, a dot-path relative to `-p`/`--property` (e.g. `--sub-property geo` with `-p address` targets `address.geo`):
- Promoted MCP Server documentation to its own top-level section in the README for better visibility (49393042).
- Corrected exit code handling across CLI commands to ensure non-zero exit codes on errors (28ccff3c).
- Fixed `heading` color for dark themes to ensure visibility against terminal backgrounds (4ffe9826).
- Restored color expressiveness lost in the semantic migration, ensuring consistent and readable output (b41817da).
- Resolved issues with terminal-background auto-detection to improve theme matching accuracy (baed6ac3).

  Every path segment but the last must already exist and be `type: object`; `list` alone takes an optional `-p` (with `--sub-property` relative to it) since it has no other property target.
- Added `-l, --long`, matching the rest of the CLI's list-command convention: names only, one per line, by default; `-l` prints the full table instead, using the same columns/abbreviations as the corresponding describe command:
- Fixed `frodo idm schema relationship` to support ForgeOps deployments, correcting previous assumptions about API availability (52ee6c2a).
- Ensured `frodo idm schema relationship create/update/delete` waits for full propagation of writes to avoid race conditions (52ee6c2a).
- Improved `frodo idm schema object describe` output formatting, including cardinality and target details for relationships (49393042).

  `property list -l`/`relationship list -l` reuse `property describe`/`object describe`'s row-building, including cardinality and the extra reverse-lookup reads for `relationship list -l`. `--json` is unaffected by `-l` on all three.
- `frodo idm schema object list -l` now also shows Icon, Properties, and Relationships columns -- all counted from the same single bulk `managed` config-entity read `list` already does, so no extra API calls. Properties and Relationships are each shown as `total/required` (e.g. `4/1`) rather than a separate Required column, since a required entry can be either a property or a relationship; the numerator is right-padded to the widest one in its column so the `/` lines up down the column. That bulk read doesn't include IDM's auto-injected `_meta`/`_notifications` relationship properties (those only appear via the dedicated per-type schema read `object describe`/`relationship list` use), so a type's Properties/Relationships counts here can run up to 2 low relative to those commands -- accepted in exchange for staying on one read instead of one per type.
- Added `-r, --recursive` to `frodo idm schema object describe`. It now prints `Title (name)` (or just `name` with no title), the icon on its own line if configured, a `Properties` table, and (only if the type has any) a separate `Relationships` table -- previously just a property/relationship-property count. Flat by default, `-r` expands nested `type: object` properties inline using dot-path row names (e.g. `address.street`) that are valid `--sub-property` values. Both tables abbreviate their flag columns (`REQ`/`SRH`/`UED`/`VIW`), with a key line printed underneath (a blank line separating it from the table); `Properties` omits the Target column, which only `Relationships` needs, placed right after Title. `--json` is unaffected by `-r` -- always the complete definition. `property describe` leads the same way (`Title (name)`, or just the dot-path if untitled), then -- always, no flag needed -- a `Properties` table of a `type: object` property's own children (full nested tree, dot-path rows), then, for a virtual property, a `Scripts` section with each `onRetrieve`/`onStore` script's source printed verbatim instead of mangled into the generic field table one line per row. The `Title (name)`/`Properties`/`Relationships`/`Scripts` headings are bold (the table column headers keep their existing color-coding, unchanged). `frodo idm schema relationship describe`'s non-recursive output now leads the same way (`Title (name.path)`, bold, `title` no longer duplicated in the field table below it; the reverse side, with `--with-reverse`, is suffixed ` (reverse)`).
- Added new flags to `frodo idm schema property create`/`update` for default values, enumerated properties, and virtual properties:
- Removed `integer` from `frodo idm schema property create/update --property-type` choices, aligning with supported types (49393042).
  - `--enum <csv>`
  - `--enum-titles <csv>`
  - `--on-retrieve-script <file>`
  - `--on-store-script <file>`
  - `--derive-from-relationship <name>`
  - `--derive-fields <csv>`
  - `--flatten`

  A script-derived property computes its value from a local JavaScript file's contents on read/write, while an RDVP (relationship-derived virtual property) computes it by querying through a relationship instead, with no script at all. Both live entirely inside `schema.properties`, the same place `create`/`update` already read and write -- confirmed against two live examples on `alpha_user` (`custom_availableFactors`, script-derived; `memberOfOrgIDs`, a pure RDVP) -- so no new API surface was needed.
- Added `frodo script type list`, so `frodo script type describe -c <context>`'s required context id has a discoverable source -- name only by default, one per line; `-l, --long` adds Languages/Hidden columns. Reuses the same `readScriptTypes()` read `describe` was already adjacent to; a context's own `_id` (e.g. `SCRIPTED_DECISION_NODE`) is exactly the value `-c/--context` expects.
- Added `--description <text>` to `frodo idm schema object create/update`, targeting the type's own `schema.description` (confirmed real via a live type that has one set) -- not in frodo-lib's `ManagedObjectSchema` type any more than `mat-icon` is, same reason.
- `frodo idm schema property create/update` now reject a `--derive-from-relationship` value that doesn't name an existing relationship property on the type, and reject `--enum-titles` when its entry count doesn't match `--enum`'s -- both now enforced in `frodo-lib` (see its own changelog), not just by `--property-type`'s CLI `.choices()`.

### Changed
- Shortened the `frodo idm schema object/property/relationship` and `frodo feature` command families' help text to match the rest of the CLI's one-line style, following a tracker-wide help-text review.
- Expanded the `frodo idm schema object/property/relationship` command families' usage examples, especially the commands with the most flag combinations (`relationship create`/`update`, `property create`/`update`, `object export`/`import`) -- `object export`/`import` previously had none at all. Added `--sub-property`, `-r/--recursive`, `--many`/`--reverse-property-name`-only, and multi-flag combo examples where the flag interactions weren't otherwise obvious from a single example.
- `frodo idm schema object export/import`'s `-i, --individual-object` is now `-o, --managed-object`, matching every other command in the `object`/`property`/`relationship` families, which all already used `-o` for the managed object type. `import`'s stays a boolean flag (the type itself still comes from the imported file's own content, same as before) rather than gaining a `<type>` value with no functional use.
- Revised the `frodo idm schema object/property/relationship` and `frodo feature`/`script type` command families' help text for consistency: flag descriptions are now free of examples (`E.g. "..."`) and use "Managed object type."/"Property name."/"Relationship property name." uniformly, `-y/--yes` now reads "Answer y/yes to all prompts." everywhere instead of a command-specific phrase, and a few other wording tweaks (e.g. "Property description." instead of "Display description.", "Mark the property searchable in the UI." instead of the longer "omitted if not passed" phrasing).
- `frodo idm schema object create/update`'s `--icon` now writes `mat-icon` (a Material Design Icon name, e.g. `directions_boat`) instead of `icon` (a Font Awesome name). Confirmed via PingIDM's docs that `icon` only applies to standalone IDM while `mat-icon` is what the Ping Identity Platform's own Admin UI reads, and this command only ever targets Cloud/ForgeOps (Platform deployments) -- every live example checked this session had both fields set, with only `mat-icon` matching what the modern Admin UI actually displays. `SampleData`'s icon example changed from `fa-ship` to `directions_boat` to match.
- `frodo idm schema property create/update/delete`'s type definitions (`SchemaPropertyFields`), payload building (`buildSchemaPropertyPayload`), current-value parsing (`extractSchemaPropertyFields`), the `--property-type` choice list, and the sub-property dot-path navigation helpers now come from `frodo-lib` (`ManagedObjectSchemaPropertyFields`/`buildManagedObjectSchemaPropertyPayload`/`extractManagedObjectSchemaPropertyFields`/`MANAGED_OBJECT_SCHEMA_CREATABLE_PROPERTY_TYPES`/`navigatePropertyPath` and friends) instead of being defined locally in this CLI, along with the actual read-modify-write for create/update/delete (`frodo.idm.managed.schema.createManagedObjectSchemaFlatProperty`/`updateManagedObjectSchemaFlatProperty`/`removeManagedObjectSchemaFlatProperty`) -- this CLI now only handles flag parsing, the confirmation prompt/diff on `update`/`delete`, and progress indicators. Pure refactor: no behavior change for `create`/`update`/`delete`/`describe`/`list`/`export`/`import`, apart from the two new validations noted above.
- `frodo idm schema object create/update/delete`'s type-schema building (`buildManagedObjectTypeConfig`), the default icon constant, and the actual read-modify-write/existence checks now come from `frodo-lib` (`buildManagedObjectTypeSchema`/`MANAGED_OBJECT_TYPE_DEFAULT_ICON`/`frodo.idm.managed.schema.createManagedObjectType`/`updateManagedObjectType`/`removeManagedObjectType`) instead of being defined locally in this CLI -- this CLI now only handles flag parsing, the confirmation prompt/diff, and progress indicators. Pure refactor: no behavior change.
- `frodo idm schema relationship create/update/delete`'s type definitions (`RelationshipPropertyFields`/`RelationshipReverseCreateFields`), payload building/parsing (`buildRelationshipPropertyPayload`/`extractRelationshipFields`/`toReverseDescriptorFields`/`inferReverseIdentity`), and the actual read-modify-write orchestration -- including the bidirectional reverse-side handling (auto-create on `create`, the required reverse-descriptor re-supply and second write on `update`, and the ordered delete-with-cascade-404-as-success handling on `delete`) -- now come from `frodo-lib` (`ManagedObjectSchemaRelationshipPropertyFields`/`ManagedObjectSchemaRelationshipReverseFields`/`buildManagedObjectSchemaRelationshipPropertyPayload`/`extractManagedObjectSchemaRelationshipPropertyFields`/`toManagedObjectSchemaRelationshipReverseFields`/`inferManagedObjectSchemaRelationshipReverseIdentity`/`frodo.idm.managed.schema.createManagedObjectSchemaRelationshipProperty`/`updateManagedObjectSchemaRelationshipProperty`/`removeManagedObjectSchemaRelationshipProperty`) instead of being defined locally in this CLI -- this CLI now only handles flag parsing, building the confirmation prompt/diff (`describe`/`update`/`delete` still read the property directly for this preview), and progress indicators. `update --with-reverse`'s two writes (forward, then reverse) now run under a single progress indicator instead of two sequential ones, since a partial failure (forward succeeded, reverse didn't) is now reported as one descriptive error rather than a second indicator's own failure message; the underlying behavior (including no automatic rollback) is unchanged. Otherwise a pure refactor: no other behavior change for `create`/`update`/`delete`/`describe`/`export`/`import`/`list`.
- `frodo idm schema object/property/relationship`, `frodo feature`, and `frodo script type`'s usage examples now use `${connId}` (a short connection-profile alias, e.g. `matrix`) for every example after the first on each command, instead of the full `${amBaseUrl}` (e.g. `https://openam-matrix.id.forgerock.io/am`) on all of them -- the first example on each command still uses the full URL, so both forms stay visible, while the (often long, multi-flag) later examples read far more clearly with the short form.
- README: promoted MCP Server from a `### MCP Server` subsection buried under `## Usage` to its own top-level `## MCP Server` section, added it to the Quick Nav table of contents, and gave it a callout in the top summary -- frodo-cli's MCP server is turn-key (reuses an existing connection profile, no separate server to build or host), so it belongs alongside the other top-level sections instead of nested where it was easy to miss.

### Fixed
- `program.help()` calls `process.exit()` internally, reading whatever `process.exitCode` already is at that point (defaulting to 0) -- across 155 command files, every "missing required option"/"unrecognized combination" fallback set `process.exitCode = 1` *after* calling `program.help()`, so that line never took effect and the command silently exited 0 despite the error it had just printed. Same fix everywhere: set `process.exitCode` first.
- `idm-schema-object-export.e2e.test.js`'s three "ForgeOps Tests" passed the cloud connection instead of the forgeops one (defined but never actually used) -- one passed by coincidence, the other two (plus the corresponding `idm-schema-object-import.e2e.test.js` case) have no recorded fixture at all for their exact forgeops scenario and are marked `test.skip` with an explanatory comment rather than left silently misrepresenting cloud data as forgeops.
- `heading`'s dark-theme color (`whiteBright`) was indistinguishable from most dark terminals' own default foreground -- e.g. `frodo info`'s table labels ("Host URL", "AM Version", etc.) looked uncolored next to genuinely colored text. Now `blueBright` (dark) / `magentaBright` (light), chosen because both clear WCAG's bold-text 3:1 threshold and are visually distinct from typical default text, unlike white on a light-foreground terminal.
- `FeatureOps.ts`'s "not installed" had been turned red by an over-broad `muted`-to-`error`(now `negative`) conversion; it's a neutral, expected state, not a negative one, and is back to `muted`. `JourneyOps.ts`'s describe-view flags (Inner Tree Only/Must Run/No Session/Transactional Only) now match the list view's existing cautionary framing (`warning` for the risky "on" state, `positive` for the safe default) instead of a plain true=positive/false=negative read that contradicted it.
- Terminal-background auto-detection (`frodo settings theme detect`) could match a genuinely near-white background to the colored `yellow`/`blue` presets instead of `light`, since those presets weren't competing against plain black/white as candidates, only used as a distance-based fallback. Both are now real candidates in the match.
- `frodo idm schema relationship` no longer rejects ForgeOps deployments. IDM's dedicated v2 relationship-schema API is a standard IDM REST API available since IDM 7.5.0, not Cloud-specific as previously assumed; the command tree is now gated to any deployment that runs IDM (Cloud and ForgeOps), rejecting only classic.
- `frodo idm schema relationship create/update/delete` now wait for the relationship-property config write to fully propagate before returning (via a `frodo-lib` default), matching a captured, working Platform Admin UI request for the same endpoint -- avoids an occasional race where an immediately-following read or dependent write (e.g. auto-creating a bidirectional relationship's reverse side) could see IDM's config not yet fully applied.
- `frodo idm schema object describe`/`property describe`'s Type column no longer shows a raw `number,null` for a nullable property (IDM represents nullable as `type: [x, "null"]`, not a plain string); Type now renders the plain `x`, with nullability moved to its own `NUL` flag column (between Type and REQ, added to the legend) alongside `REQ`/`SRH`/`UED`/`VIW`, and Title now comes before Type.
- `frodo idm schema property describe`/`export` now read via the same raw `managed` config entity `create`/`update` already use, instead of the dedicated per-type schema endpoint, which silently omits a virtual property's `onRetrieve`/`onStore` script -- `describe` was showing an incomplete definition for one, and `export` was silently dropping the script on an export/import round trip.
- `object describe`'s Relationships table's Type column no longer shows the redundant `relationship`/`relationship[]` -- it now shows the relationship's cardinality (`1:1`/`1:n`/`n:1`/`n:n`/`1:-`/`n:-`, `-` meaning no reverse configured), and Target moved between Title and Type. The reverse side's own cardinality isn't in the whole-type schema read `object describe` already had in hand, so getting it right costs one extra dedicated-API read per top-level relationship property (parallelized); a failed read, or a relationship nested under `--sub-property` (unsupported by that API), falls back to what's locally knowable (`1:-`/`n:-`) rather than failing the describe. `property describe -r` shows the same cardinality in Type when describing a relationship property, but -- like its non-recursive view -- never shows a Target column at all, even then: Target is relationship-specific, and `relationship describe` is the dedicated command for that.
- `frodo idm schema property create/update --property-type` no longer offers `integer` as a choice. It was never a real option: the Admin UI's own property-type picker offers only string/number/boolean/date/time/datetime/duration/object (confirmed both by an earlier live screenshot and, now, by live `moSample` data -- a type built through that same picker -- whose own "Number" property is `type: "number"`, never `"integer"`); `integer` could still be written because `create`/`update` write with `validate: false`, which bypasses IDM's server-side schema validation entirely, not because IDM recognizes it as a property type.

## [v4.8.0] - 2026-08-26

### Added
- Introduced the `-c, --clean` flag for `frodo config-manager pull journeys`, allowing users to clean up configurations before the pull. This feature mirrors the logic used in `fr-config-pull journeys` (#671).
- Added new commands to support push and pull operations for IDM authentication configurations (#670):
  - `frodo config-manager push idm-authentication`
  - `frodo config-manager pull idm-authentication`
- Added new commands to manage IDM managed-object schema types and properties directly through the CLI (#672):
  - `frodo idm schema object create`
  - `frodo idm schema object update`
  - `frodo idm schema object delete`
  - `frodo idm schema object export`
  - `frodo idm schema object import`
  - `frodo idm schema object property create`
  - `frodo idm schema object property update`
  - `frodo idm schema object property delete`
  - `frodo idm schema object property describe`
  - `frodo idm schema object property list`
- Added new commands to list and describe Frodo node types, providing users with more detailed insights into node configurations (#672):
  - `frodo node type list`
  - `frodo node type describe`

### Changed
- Updated `@rockcarver/frodo-lib` to version 4.5.0, which includes improvements that may affect the behavior and performance of Frodo CLI (1b2850ff).

### Fixed
- Resolved an issue in `mcp server start` where the per-request realm override was not being honored, ensuring more accurate server start configurations (3818f6ea).
- Simplified the `aiAgentIdentityUid` structure in snapshots to improve clarity and reduce complexity (24a62b92).
- Updated color handling to use a non-bright ANSI palette and centralized the color source for consistent CLI output (4f58ff0b).

## [v4.7.2] - 2026-08-20

### Fixed
- `writeSyncJsonToDirectory` (used by `frodo idm export` and `frodo config export`) no longer throws `Cannot read properties of null (reading 'name')` when a tenant's legacy `sync.json` `mappings` array contains a null/malformed entry; such entries are now skipped instead of aborting the config entity save.
- `writeManagedJsonToDirectory` (used by `frodo idm export` and `frodo config export`) no longer throws `Cannot read properties of null (reading 'name')` when a tenant's `managed.json` `objects` array contains a null/malformed entry; such entries are now skipped instead of aborting the config entity save.

### Changed
- Updated `@rockcarver/frodo-lib` to version 4.4.2, which may include improvements affecting the behavior and performance of Frodo CLI. (b1056129)

## [v4.7.1] - 2026-08-19

### Changed
- Frodo shell autocomplete and `help()` output now indicate which parameters are optional.

- Frodo shell autocomplete and `help()` output now indicate which parameters are optional. The shell autocomplete scaffolds append `?` to parameter names marked as optional, and the `help()` output labels optional parameters with a `(optional)` tag. (#668, 66b9f1e7)
- Updated `@rockcarver/frodo-lib` to version 4.4.1, which may include improvements affecting the behavior and performance of Frodo CLI. (3239da2a)

## [v4.7.0] - 2026-08-19

### Added
- Introduced `config-manager push variables` command, allowing users to push variable configurations. This feature supports ESV placeholders and includes global environment flags for enhanced configuration management. (#667, dff7e7bb)

### Fixed
- Corrected an issue in the `idm-import` command by adding a missing `await`, ensuring proper asynchronous operation and updated snapshots. (5a28650c)

### Changed
- Updated `@rockcarver/frodo-lib` to version 4.4.0, which includes improvements that may affect the behavior and performance of Frodo CLI. (b0e94969)

## [v4.6.0] - 2026-08-18

### Added
- Introduced `config-manager pull iga-workflows` command, allowing users to pull IGA workflow configurations easily. This enhances the flexibility and control over IGA workflows. (#662, #662)
- Added `config-manager push iga-workflows` command, enabling users to push IGA workflow configurations. This facilitates streamlined management of workflow configurations. (#662)

## [v4.5.4] - 2026-08-18

### Added
- Surface build timestamps via `frodo -v` and the MCP server manifest, providing users with build information for better traceability. (#665)
- Report special-kind skill counts in `mcp server info`, offering more detailed server insights. (#665)

### Changed
- Updated to `frodo-lib` v4.3.3, incorporating the latest enhancements and bug fixes. (037822ce)
- Adapted to `frodo-lib`'s `resolveIdentity` replacing `resolvePerpetratorUuid`, ensuring smoother identity resolution processes. (03d21c3b)

### Fixed
- Disabled token cache for `mcp server start`, improving startup reliability and performance. (#665)
- Reformatted build-timestamp display for clarity and consistency. (#665)
- Removed unused realm positional from `mcp server start`, simplifying command usage. (#665)
- Hidden `--no-cache`/`--flush-cache` options from `mcp server start` help, reducing confusion over unsupported options. (#665)

## [v4.5.3] - 2026-08-17

### Added
- Introduced an experimental `claude/channel` capability in `buildMcpServer`, enhancing compatibility and reducing warnings related to Claude Code's channel notifications. (#664)
- Added `process.stderr` as a parallel output path in `McpLogger`, improving logging capabilities. (commit 038455ac)

### Changed
- Updated to `frodo-lib` v4.3.1, incorporating the latest library improvements. (commit 2595fe4e)
- Replaced inline `hydrateManagedObjectTypes` call with the unified `hydrateMcpDiscoveryContext()` from `frodo-lib`, enabling `executeRecommendedByDefault` for the MCP server startup path. (#664)

### Fixed
- Notifications and message startup delivery are now gated on the negotiated protocol era, ensuring compatibility and stability during server operations. (commit de89498a)

## [v4.5.2] - 2026-08-09

### Added
- Introduced dynamic object family resolution for the MCP module, enhancing flexibility in object handling. (#661)
- Added managed discovery and protocol logging features to the MCP module, improving observability and troubleshooting capabilities. (#661)

### Fixed
- Minor improvements and bug fixes in the MCP server operations to enhance stability and performance. (#661)

## [v4.5.1] - 2026-08-08

### Changed
- Updated the `conn delete` command to display the URL of the tenant being deleted. This change reduces ambiguity by providing clear feedback when users input a substring. (#659)

## [v4.5.0] - 2026-08-08

### Added
- Introduced enhancements to the Model Context Protocol (MCP) with new profiles, schemas, and CLI improvements. These enhancements provide users with more robust tools for managing server configurations and policies. (#660)
- Added new server capabilities, info, policies, profiles, and tools to the MCP CLI, offering expanded functionality and improved user experience when interacting with server configurations. (#660)

### Changed
- Improved the `server-start` command within the MCP CLI to enhance startup processes and provide more detailed feedback during server initialization. (#660)

## [v4.4.0] - 2026-08-07

### Added
- Introduced the `config-manager push journeys` command, allowing users to import journey configurations efficiently. This enhancement streamlines the process of managing journey configurations within the Frodo CLI. (#657)

### Changed
- Modified the `config-manager pull journeys` command to extract journeys to the root realm directory instead of the journey directory, improving the organization and accessibility of journey files. (#657)

### Fixed
- Updated tests for `config-manager-pull-authentication` to accommodate the new root realm behavior, ensuring consistent and reliable test results. (#657)

## [v4.3.3] - 2026-08-03

### Changed
- Updated `frodo-lib` to version 4.1.7, which includes refinements to release pipeline checks, improving the stability and accuracy of the release process. (#655)

### Fixed
- Corrected syntax for reading package version in the release pipeline, ensuring accurate versioning during deployment. (#656)

## [v4.3.2] - 2026-08-02

### Changed
- Updated `frodo-lib` to version 4.1.6, enhancing release pipeline inputs. (#652)

## [v4.3.2-0] - 2026-08-02

### Added
- Introduced `frodo config-manager push restart` command to restart Ping AIC tenant and apply pending ESV updates. (#643)
- Added `frodo config-manager pull iga-workflows` command to pull IGA workflow configurations. (#645)
- Implemented `frodo config-manager push connector-mappings` command for importing connector mapping configurations. (#615)
- Added `frodo config-manager push connector-definitions` command for importing connector definition configurations. (#590)
- Introduced `frodo config-manager push authentication` command for importing authentication configurations. (#589)
- Added `frodo config-manager push ui-config` command for importing UI configurations. (#585)
- Implemented `frodo config-manager push service-objects` command for importing service object configurations. (#584)
- Added `frodo config-manager push cookie-domains` command for importing cookie domain configurations. (#583)
- Introduced `frodo config-manager push audit` command for importing audit configurations. (#582)
- Added `frodo config-manager push access-config` command for importing access configurations. (#581)
- Introduced `frodo config-manager push managed-objects` command for importing managed objects configuration. (#579)

### Changed
- Updated `frodo-lib` to version 4.1.6, enhancing release pipeline inputs. (#652)
- Enhanced CLI formatting by adding `formatOptionalStringArray()` helper to handle optional OAuth client URI arrays in `frodo oauth client list --long`. (#650)
- Made extraction the default behavior for exports, updating `-x, --extract` flags to `-x, --no-extract`. (#588)
- Updated `-M, --modified-properties` flag descriptions to remove creation timestamps. (#587)

### Fixed
- Resolved crash in `frodo oauth client list --long` when an OAuth client omits `redirectionUris`, improving CLI robustness. (#650)
- Fixed `frodo shell` REPL to correctly route debug and curlirize output to the REPL output stream. (#611)
- Allowed Forgeops deployments to export/import full AM configuration. (#612)

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.3.1] - 2026-07-30

## [4.3.0] - 2026-07-25

### Added

- Added `frodo config-manager pull iga-workflows` for exporting IGA workflow definitions from cloud IGA tenants.
- Added `frodo config-manager push restart` to restart the environment when pending ESV updates need to be applied.

### Changed

- Updated CLI color handling to use `tinyrainbow`.

### Fixed

- Fixed `frodo journey prune` failing in environments with v2 nodes after the frodo-lib journey prune fix.
- Updated workflow export handling for `frodo config-manager pull iga-workflows` to match the latest frodo-lib workflow export fixes.
- Fixed the linux-arm64 binary release build by updating the Node.js version used for packaging.

## [4.2.1-2] - 2026-07-25

## [4.2.1-1] - 2026-07-25

## [4.2.1-0] - 2026-07-24

## [4.2.0] - 2026-07-22

### Added

- Expanded experimental `frodo config-manager push` coverage with new import commands (PRs #633, #637, #638, #639, #640):
  - `frodo config-manager push cors`
  - `frodo config-manager push csp` (Cloud-only)
  - `frodo config-manager push custom-nodes`
  - `frodo config-manager push remote-servers`
  - `frodo config-manager push secret-mappings` (Cloud-only)
- Added targeted import filters for new config-manager push flows:
  - `frodo config-manager push csp --name <name>` supports importing only `enforced` or `report-only` policy content.
  - `frodo config-manager push custom-nodes --name <name>` imports a single custom node by display name.
  - `frodo config-manager push secret-mappings --name <name>` imports a single secret mapping by ID (requires specifying a non-root realm argument).

### Changed

- Updated custom node pull option naming for consistency across config-manager commands:
  - `frodo config-manager pull custom-nodes` now uses `--name <name>` (replacing `--node-name <node-name>`).

## [4.1.0] - 2026-07-21

### Added

- Support Identity Governance for cloud IGA tenants with first-class workflow lifecycle tooling and safer request type migration controls (PR #631):
  - Added a new `frodo iga workflow` command group with end-to-end workflow operations: `list`, `describe`, `export`, `import`, `publish`, and `delete`.
  - Added `--only-custom` (`-c`) to `frodo config export` and `frodo config import` so request type migration can be scoped to custom request types only.

### Changed

- The latest CLI workflow command set and IGA behavior in this line are based on `@rockcarver/frodo-lib` `4.1.0`.

### Fixed

- Fixed `frodo config import -A` behavior to better handle directory-based imports when global or realm subdirectories are missing, instead of failing early (PR #631).
- Fixed config import UX to emit a clear warning when an import run completes with no entities imported (PR #631).

## [4.0.2-0] - 2026-07-20

## [4.0.1] - 2026-07-17

### Changed

- Updated journey commands to work correctly with frodo-lib 4.0.1 export format changes (PR #629).
- Improved `frodo journey list`, `frodo journey describe`, and journey export flows to more reliably return the requested journey when processing multi-journey export data (PR #629).
- Improved journey dependency handling for exports/imports involving nested trees referenced by Backchannel Initialize nodes via frodo-lib 4.0.1 (PR #595).
- The latest CLI is now based on `@rockcarver/frodo-lib` `4.0.1`.

### Added

- Added script filtering options for bulk script operations (PR #627):
  - `frodo script list --language <language> --context <context> --evaluator-version <version>`
  - `frodo script export -a/-A --language <language> --context <context> --evaluator-version <version>`
  - `frodo script delete -a --language <language> --context <context> --evaluator-version <version>`
- Added support for combining script filters so you can narrow bulk list/export/delete operations to only the scripts you intend to target (PR #627).

### Fixed

- Improved service-account authentication reliability for hosts that include explicit default ports, avoiding JWT audience mismatches during token requests via frodo-lib 4.0.1 (PR #591).
- Improved connection/runtime compatibility for standalone AM environments with incomplete `serverinfo` payloads by using more resilient version parsing via frodo-lib 4.0.1 (PR #594).
- Fixed secret export behavior when active values are requested but `Use in Placeholders` is disabled: CLI flows now skip incompatible active-value reads instead of failing via frodo-lib 4.0.1 (PR #592).

## [4.0.1-1] - 2026-07-16

## [4.0.1-0] - 2026-07-16

## [4.0.0] - 2026-07-14

### Changed

- Updated to Frodo Lib 4.0.0
- Updated binary release to run on Node v24
- Dropped support for Node v20 in the 4.x line.
- Export extraction is now the default for supported export commands; use `--no-extract` to keep content inline.
- Updated `-M, --modified-properties` behavior/docs to align with creation timestamp filtering changes in exports.
- Improved CLI help output structure and added stability indicators to command help.
- Improved `frodo shell` UX with:
  - Contextual `help()`, enhanced `.help`, and persistent per-host `.history` support (including clear/trim operations).
  - Added shell autocomplete enhancements with method parameter and type hints.
- Updated dependencies

### Added

- Added support for Node Designer Nodes through several API and Ops functions to allow for doing exports, imports, deletes, etc. with custom node configurations.
  - Just like with journeys, custom nodes get exported and imported in the same way as they do from AIC/AM, so you can import Frodo exported custom nodes into AIC/AM and vice versa.
  - Additionally, journeys were updated to include custom node dependencies during exports. Even if a journey is exported with Frodo and contains these dependencies in the export JSON, they can still be imported into AIC/AM using the admin UI as it should ignore the custom node dependencies (since AIC/AM doesn't support exporting them yet).
- Added `--retry <strategy>` option to all commands to control automatic retry of failed operations. Valid values for strategy:
  - everything: Retry all failed operations.
  - network: Retry only network-related failed operations.
  - nothing: Do not retry failed operations (this is the default modus operandi).
- Added the ability to authenticate to an AM classic deployment using Amster credentials (i.e. a public/private key pair). The private key can be in a variety of formats such as PKCS, JWK, and OpenSSH, but is ultimately stored in PKCS#8 format. You can also use encrypted private keys by providing the passphrase when creating the connection profile.
- Added secret store command coverage, including secret store mapping and alias sub-commands.
- Added `frodo mcp ...` commands for Model Context Protocol server management.
- Added `frodo dcc ...` (direct configuration session/control) command support, including session lifecycle commands.
- Added command alias support across CLI commands.
- Added connection profile IGA support (`isIGA`) and `FRODO_IGA` environment override support.
- Added app command support to export/import/delete by app ID in addition to name.
- Added managed object naming controls for ForgeOps-style deployments (realm prefix handling options).
- Added experimental `frodo config-manager` (`fr-config-manager`) commands.
- Added support for extracting IDM scripts during exports, with compatible import support for that extracted format.

### Fixed

- Fixed `frodo log fetch --query-filter` handling by aligning CLI behavior with corrected lib query filter encoding (rockcarver/frodo-cli#553).
- Fixed inability to connect to AM instances with expired certificates when using `-k` (rockcarver/frodo-cli#568).
- Fixed ForgeOps full AM export/import command gating to allow compatible commands to run correctly (rockcarver/frodo-cli#612).
- Fixed deprecation warnings when running packaged/binary Frodo CLI builds (rockcarver/frodo-cli#570).
- Fixed authentication/configuration header override application issues by updating to matching frodo-lib fixes.

## [4.0.0-54] - 2026-07-13

## [4.0.0-53] - 2026-07-12

## [4.0.0-52] - 2026-07-12

## [4.0.0-51] - 2026-07-11

## [4.0.0-50] - 2026-05-04

## [4.0.0-49] - 2026-04-26

## [4.0.0-48] - 2026-04-21

## [4.0.0-47] - 2026-04-20

## [4.0.0-46] - 2026-04-20

## [4.0.0-45] - 2026-04-17

## [4.0.0-44] - 2026-04-17

## [4.0.0-43] - 2026-04-08

## [4.0.0-42] - 2026-04-08

## [4.0.0-41] - 2026-04-03

## [4.0.0-40] - 2026-04-03

## [4.0.0-39] - 2026-04-03

## [4.0.0-38] - 2026-04-03

## [4.0.0-37] - 2026-03-30

## [4.0.0-36] - 2026-03-30

## [4.0.0-35] - 2026-03-30

## [4.0.0-34] - 2026-03-27

## [4.0.0-33] - 2026-03-27

## [4.0.0-32] - 2026-03-27

## [4.0.0-31] - 2026-03-27

## [4.0.0-30] - 2026-03-27

## [4.0.0-29] - 2026-03-24

## [4.0.0-28] - 2026-03-24

## [4.0.0-27] - 2026-03-23

## [4.0.0-26] - 2026-03-23

## [4.0.0-25] - 2026-03-23

## [4.0.0-24] - 2026-03-21

## [4.0.0-23] - 2026-03-21

## [4.0.0-22] - 2026-03-20

## [4.0.0-21] - 2026-03-19

## [4.0.0-20] - 2026-03-18

## [4.0.0-19] - 2026-03-17

## [4.0.0-18] - 2026-03-12

## [4.0.0-17] - 2026-03-07

## [4.0.0-16] - 2026-03-05

## [4.0.0-15] - 2026-03-05

## [4.0.0-14] - 2026-03-03

## [4.0.0-13] - 2026-03-02

## [4.0.0-12] - 2026-02-27

## [4.0.0-11] - 2026-02-24

## [4.0.0-10] - 2026-02-23

## [4.0.0-9] - 2026-02-23

## [4.0.0-8] - 2026-02-23

## [4.0.0-7] - 2026-02-22

## [4.0.0-6] - 2026-02-18

## [4.0.0-5] - 2026-02-06

## [4.0.0-4] - 2026-02-04

### Changed

- Updated to Frodo Lib 4.0.0
- Updated binary release to run on Node v24
- Updated dependencies

### Added

- Added `frodo config-manager` (`fr-config-manager`) commands.
- Added support for Node Designer Nodes through several API and Ops functions to allow for doing exports, imports, deletes, etc. with custom node configurations.
  - Just like with journeys, custom nodes get exported and imported in the same way as they do from AIC/AM, so you can import Frodo exported custom nodes into AIC/AM and vice versa.
  - Additionally, journeys were updated to include custom node dependencies during exports. Even if a journey is exported with Frodo and contains these dependencies in the export JSON, they can still be imported into AIC/AM using the admin UI as it should ignore the custom node dependencies (since AIC/AM doesn't support exporting them yet).
- Added `--retry <strategy>` option to all commands.
- Added the ability to authenticate to an AM classic deployment using Amster credentials (i.e. a public/private key pair). The private key can be in a variety of formats such as PKCS, JWK, and OpenSSH, but is ultimately stored in PKCS#8 format. You can also use encrypted private keys by providing the passphrase when creating the connection profile.

### Fixed

- \#XXX:

## [4.0.0-3] - 2026-02-04

### Changed

- Updated to Frodo Lib 4.0.0

### Added

- Added `frodo config-manager` (`fr-config-manager`) commands.
- Added support for Node Designer Nodes through several API and Ops functions to allow for doing exports, imports, deletes, etc. with custom node configurations.<br><br>
  Just like with journeys, custom nodes get exported and imported in the same way as they do from AIC/AM, so you can import Frodo exported custom nodes into AIC/AM and vice versa.<br><br>
  Additionally, journeys were updated to include custom node dependencies during exports. Even if a journey is exported with Frodo and contains these dependencies in the export JSON, they can still be imported into AIC/AM using the admin UI as it should ignore the custom node dependencies (since AIC/AM doesn't support exporting them yet).
- Added `--retry <strategy>` option to all commands.
- Added the ability to authenticate to an AM classic deployment using Amster credentials (i.e. a public/private key pair). The private key can be in a variety of formats such as PKCS, JWK, and OpenSSH, but is ultimately stored in PKCS#8 format. You can also use encrypted private keys by providing the passphrase when creating the connection profile.

### Fixed

- \#XXX:

## [4.0.0-2] - 2026-01-27

## [4.0.0-1] - 2026-01-26

### Changed

- Updated to Frodo Lib 4.0.0

### Added

- Added `frodo config-manager` (`fr-config-manager`) commands.
- Added support for Node Designer Nodes through several API and Ops functions to allow for doing exports, imports, deletes, etc. with custom node configurations.<br><br>
  Just like with journeys, custom nodes get exported and imported in the same way as they do from AIC/AM, so you can import Frodo exported custom nodes into AIC/AM and vice versa.<br><br>
  Additionally, journeys were updated to include custom node dependencies during exports. Even if a journey is exported with Frodo and contains these dependencies in the export JSON, they can still be imported into AIC/AM using the admin UI as it should ignore the custom node dependencies (since AIC/AM doesn't support exporting them yet).
- Added `--retry <strategy>` option to all commands.

### Fixed

- \#XXX:

## [3.1.1-1] - 2026-01-25

## [3.1.1-0] - 2026-01-25

## [3.1.0] - 2026-01-22

## [3.0.10] - 2026-01-20

### Changed

- This release enables the CLI to support Proxy Connect in PingOne Advanced Identity Cloud through the use of custom authentication headers.

### Fixed

- rockcarver/frodo-lib#519: Fixed an error generated by the `frodo admin grant-oauth2-client-admin-privileges` command due to changes in AIC default configuration.
- Updated dependencies with security issues.

## [3.0.9] - 2025-09-16

### Fixed

- Further improve exports using the -a and -A options to no longer stop prematurely if errors are encountered. This version resolves issues with large sets of IDM configurations.

## [3.0.8] - 2025-09-11

### Fixed

- Exports using the -a and -A options no longer stop prematurely if errors are encountered.

## [3.0.7] - 2025-07-24

### Fixed

- log fetch now repects the log API request limit (1 per second)
- log fetch and log tail default to ALL levels by default

## [3.0.6] - 2025-06-18

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
  - `frodo mapping` Manage IDM mappings.
    - `delete` Delete IDM mappings.
    - `export` Export IDM mappings.
    - `import` Import IDM mappings.
    - `list` List IDM mappings.
    - `rename` Renames mappings from the combined/default/legacy naming scheme (sync/\\<name>) to the separate/new naming scheme (mapping/\\<name>). To rename mappings from new back to legacy, use the -l, --legacy flag.

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

  - `frodo authn` Manage authentication setting.
    - `describe` List authentication settings.
    - `export` Export authentication settings.
    - `import` Import authentication settings.

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
    - `export` Export admin federation providers.
    - `import` Import admin federation providers.
    - `list` List admin federation providers.

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
    - `export` Export admin federation providers.
    - `import` Import admin federation providers.
    - `list` List admin federation providers.

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
    - `export` Export admin federation providers.
    - `import` Import admin federation providers.
    - `list` List admin federation providers.

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

  - `frodo authz type` Manage authorization resource types.
    - `delete` Delete authorization resource types.
    - `describe` Describe authorization resource types.
    - `export` Export authorization resource types.
    - `import` Import authorization resource types.
    - `list` List authorization resource types.
  - `frodo authz set` Manage authorization policy sets.
    - `delete` Delete authorization policy sets.
    - `describe` Describe authorization policy sets.
    - `export` Export authorization policy sets.
    - `import` Import authorization policy sets.
    - `list` List authorization policy sets.
  - `frodo authz policy` Manage authorization policies.
    - `delete` Delete authorization policies.
    - `describe` Describe authorization policies.
    - `export` Export authorization policies.
    - `import` Import authorization policies.
    - `list` List authorization policies.

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

[unreleased]: https://github.com/rockcarver/frodo-cli/compare/v4.3.1...HEAD
[4.3.1]: https://github.com/rockcarver/frodo-cli/compare/v4.3.0...v4.3.1
[4.3.0]: https://github.com/rockcarver/frodo-cli/compare/v4.2.1-2...v4.3.0
[4.2.1-2]: https://github.com/rockcarver/frodo-cli/compare/v4.2.1-1...v4.2.1-2
[4.2.1-1]: https://github.com/rockcarver/frodo-cli/compare/v4.2.1-0...v4.2.1-1
[4.2.1-0]: https://github.com/rockcarver/frodo-cli/compare/v4.2.0...v4.2.1-0
[4.2.0]: https://github.com/rockcarver/frodo-cli/compare/v4.1.0...v4.2.0
[4.1.0]: https://github.com/rockcarver/frodo-cli/compare/v4.0.2-0...v4.1.0
[4.0.2-0]: https://github.com/rockcarver/frodo-cli/compare/v4.0.1...v4.0.2-0
[4.0.1]: https://github.com/rockcarver/frodo-cli/compare/v4.0.1-1...v4.0.1
[4.0.1-1]: https://github.com/rockcarver/frodo-cli/compare/v4.0.1-0...v4.0.1-1
[4.0.1-0]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0...v4.0.1-0
[4.0.0]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-54...v4.0.0
[4.0.0-54]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-53...v4.0.0-54
[4.0.0-53]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-52...v4.0.0-53
[4.0.0-52]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-51...v4.0.0-52
[4.0.0-51]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-50...v4.0.0-51
[4.0.0-50]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-49...v4.0.0-50
[4.0.0-49]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-48...v4.0.0-49
[4.0.0-48]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-47...v4.0.0-48
[4.0.0-47]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-46...v4.0.0-47
[4.0.0-46]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-45...v4.0.0-46
[4.0.0-45]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-44...v4.0.0-45
[4.0.0-44]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-43...v4.0.0-44
[4.0.0-43]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-42...v4.0.0-43
[4.0.0-42]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-41...v4.0.0-42
[4.0.0-41]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-40...v4.0.0-41
[4.0.0-40]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-39...v4.0.0-40
[4.0.0-39]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-38...v4.0.0-39
[4.0.0-38]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-37...v4.0.0-38
[4.0.0-37]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-36...v4.0.0-37
[4.0.0-36]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-35...v4.0.0-36
[4.0.0-35]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-34...v4.0.0-35
[4.0.0-34]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-33...v4.0.0-34
[4.0.0-33]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-32...v4.0.0-33
[4.0.0-32]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-31...v4.0.0-32
[4.0.0-31]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-30...v4.0.0-31
[4.0.0-30]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-29...v4.0.0-30
[4.0.0-29]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-28...v4.0.0-29
[4.0.0-28]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-27...v4.0.0-28
[4.0.0-27]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-26...v4.0.0-27
[4.0.0-26]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-25...v4.0.0-26
[4.0.0-25]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-24...v4.0.0-25
[4.0.0-24]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-23...v4.0.0-24
[4.0.0-23]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-22...v4.0.0-23
[4.0.0-22]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-21...v4.0.0-22
[4.0.0-21]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-20...v4.0.0-21
[4.0.0-20]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-19...v4.0.0-20
[4.0.0-19]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-18...v4.0.0-19
[4.0.0-18]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-17...v4.0.0-18
[4.0.0-17]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-16...v4.0.0-17
[4.0.0-16]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-15...v4.0.0-16
[4.0.0-15]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-14...v4.0.0-15
[4.0.0-14]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-13...v4.0.0-14
[4.0.0-13]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-12...v4.0.0-13
[4.0.0-12]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-11...v4.0.0-12
[4.0.0-11]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-10...v4.0.0-11
[4.0.0-10]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-9...v4.0.0-10
[4.0.0-9]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-8...v4.0.0-9
[4.0.0-8]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-7...v4.0.0-8
[4.0.0-7]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-6...v4.0.0-7
[4.0.0-6]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-5...v4.0.0-6
[4.0.0-5]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-4...v4.0.0-5
[4.0.0-4]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-3...v4.0.0-4
[4.0.0-3]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-2...v4.0.0-3
[4.0.0-2]: https://github.com/rockcarver/frodo-cli/compare/v4.0.0-1...v4.0.0-2
[4.0.0-1]: https://github.com/rockcarver/frodo-cli/compare/v3.1.1-1...v4.0.0-1
[3.1.1-1]: https://github.com/rockcarver/frodo-cli/compare/v3.1.1-0...v3.1.1-1
[3.1.1-0]: https://github.com/rockcarver/frodo-cli/compare/v3.1.0...v3.1.1-0
[3.1.0]: https://github.com/rockcarver/frodo-cli/compare/v3.0.10...v3.1.0
[3.0.10]: https://github.com/rockcarver/frodo-cli/compare/v3.0.10-1...v3.0.10
[3.0.10-1]: https://github.com/rockcarver/frodo-cli/compare/v3.0.10-0...v3.0.10-1
[3.0.10-0]: https://github.com/rockcarver/frodo-cli/compare/v3.0.9...v3.0.10-0
[3.0.9]: https://github.com/rockcarver/frodo-cli/compare/v3.0.8...v3.0.9
[3.0.8]: https://github.com/rockcarver/frodo-cli/compare/v3.0.7...v3.0.8
[3.0.7]: https://github.com/rockcarver/frodo-cli/compare/v3.0.6...v3.0.7
[3.0.6]: https://github.com/rockcarver/frodo-cli/compare/v3.0.5...v3.0.6
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
