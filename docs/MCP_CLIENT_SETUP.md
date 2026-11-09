# Setting up Frodo MCP in an MCP Client

This guide covers how to configure an MCP client to connect to Frodo's MCP server (`frodo mcp server start`). For what the server does once connected -- skill discovery, policy presets, profiles, logging -- see the [MCP Server](../.github/README.md#mcp-server) section of the main README. This guide is only about the client-side wiring: where each client's config file lives and what to put in it.

MCP client configuration file formats are still evolving and differ from client to client. The examples below were verified against each client's own documentation at the time of writing; if a client has since changed its config schema, trust that client's own current docs over this file, and please open an issue or PR to update this guide.

## Prerequisites

- Frodo installed and on `PATH` (`npm i -g @rockcarver/frodo-cli`), or invoked via `npx @rockcarver/frodo-cli`.
- A saved [connection profile](../.github/README.md#connection-profiles) for the tenant you want the MCP server to target (`frodo conn add ...`), so `frodo mcp server start <profile>` doesn't need credentials on the command line or in a client config file.

Frodo's MCP server supports two transports (`frodo mcp server start --help` for the full flag list):

- **stdio** (default): the client launches `frodo mcp server start ...` as a subprocess and talks to it over stdin/stdout. This is what every example below uses -- it's the simplest, most widely supported option and needs no separate process management.
- **http** (`--transport http --bind-host <host> --port <port>`, default `127.0.0.1:6277`): you start the server yourself as a long-running process, and point a client that supports HTTP/SSE-based MCP servers at its URL instead of a launch command. Support for this varies more by client than stdio does, so prefer stdio unless you have a specific reason to run the server long-lived and shared across multiple client sessions. See [Running the HTTP transport](#running-the-http-transport) below for bind/auth/host options.

## VS Code Copilot (Agent Mode)

VS Code reads MCP server definitions from a `.vscode/mcp.json` file in the workspace root (or from VS Code's user-level MCP settings for a config you want available across projects). Its schema uses a top-level `servers` key -- not `mcpServers`, which is what Claude Desktop and some other clients use -- and requires an explicit `"type": "stdio"` on each entry.

`.vscode/mcp.json`:

```json
{
  "servers": {
    "frodo": {
      "type": "stdio",
      "command": "frodo",
      "args": ["mcp", "server", "start", "my-tenant"]
    }
  }
}
```

Replace `my-tenant` with the name of a saved connection profile. Restart VS Code (or reload the window) after adding or changing this file. Once the workspace opens, Copilot starts the server and its tools become available in Agent Mode.

## Claude Code

Claude Code is configured via the `claude mcp add` command rather than by hand-editing a config file directly (though it does write one under the hood). For a stdio server, options come before the server name, and `--` separates the server name from the command Claude Code should run:

```console
claude mcp add --transport stdio frodo -- frodo mcp server start my-tenant
```

Use `--scope project` instead of the default user scope if you want this registered only for the current project rather than for all of Claude Code. Verify with `claude mcp list`.

## Claude Desktop

Claude Desktop reads `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Its schema uses `mcpServers` as the top-level key, and typically infers stdio transport from the presence of `command`/`args` rather than requiring an explicit `type` field (unlike VS Code):

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

Restart Claude Desktop after editing this file for the change to take effect.

## Other MCP clients

Any MCP client that supports launching a local stdio server should work the same way: point it at the `frodo` executable with args `["mcp", "server", "start", "<profile>"]` (or the fully-qualified path/`npx @rockcarver/frodo-cli` invocation, if `frodo` isn't globally on `PATH` in that client's execution environment). Consult the client's own documentation for its specific config file location and key names.

## Running the HTTP transport

`frodo mcp server start --transport http` serves the MCP endpoint at `POST /mcp` and a liveness probe at `GET /health` (`{"status":"ok"}`, no auth -- liveness probes must not need secrets). The default bind is `127.0.0.1:6277`, which only exposes the port to the local machine; everything below exists to safely widen that.

### Bearer-token auth (`--mcp-auth-token` / `FRODO_MCP_AUTH_TOKEN`)

Pass `--mcp-auth-token <secret>` and every `POST /mcp` request must carry a matching `Authorization: Bearer <secret>` header; requests without (or with a wrong) token get `401` and a `WWW-Authenticate: Bearer` challenge. The comparison is timing-safe. `GET /health` stays unauthenticated. The token value is never printed in logs or the startup summary, which only reports `HTTP auth: on`:

```console
frodo mcp server start --transport http --bind-host 0.0.0.0 --port 6277 --mcp-auth-token <secret> my-tenant
```

`my-tenant` selects the saved [connection profile](../.github/README.md#connection-profiles) to connect with: a unique substring of, or the alias for, one profile's host URL. It can also come from the `FRODO_HOST` environment variable (same resolution rules; the command-line argument wins if both are set). Without a tenant the server still starts and `/health` answers -- but it is connected to nothing, and every tool call fails; always give it a profile (or explicit `--host`/credentials). The tenant credentials come from that profile, so its stored password must be decryptable on this machine (the `masterkey.key` from the machine that saved the profile).

The token can instead come from the `FRODO_MCP_AUTH_TOKEN` environment variable -- preferred for anything long-lived, since the environment keeps the secret out of process listings (`ps`). The CLI flag wins when both are set; the flag exists for parity and quick testing.

Refusing an exposed bind without a token: binding a non-loopback host (`0.0.0.0`, a LAN address, a hostname -- anything that is not `127.x.y.z`, `[::1]`, or `localhost`) without a token **refuses to start**, because anything that can reach the port could drive tenant operations with the startup credentials. Pass `--mcp-auth-token <secret>` (or set the env var), or `--allow-unauthenticated` to accept that risk explicitly. A loopback bind without a token behaves exactly as it always has -- local-only, no auth gate.

### Host allow-list (`--allowed-hosts`)

The server validates the `Host` header against an allow-list to stay safe against DNS rebinding. The default set is `localhost`, `127.0.0.1`, and `[::1]`; `--allowed-hosts <host...>` *extends* it (it does not replace it), and `host.docker.internal` is added automatically whenever the bind host is non-loopback -- the standard Docker Desktop/Linux `host-gateway` alias a bridge-network container uses to reach a server on the host itself:

```console
frodo mcp server start --transport http --allowed-hosts mcp.example.internal
```

### Containerized gateway on the same machine

The setup this section exists for: an AI gateway (or other MCP client) running in a Docker container on the same host as frodo. A bridge-network container cannot reach the host's `127.0.0.1` -- inside the container that is the container's own loopback, so the connection is refused. Point the container at the host instead (via `host.docker.internal`, or `extra_hosts: host-gateway:host-gateway` on Linux where the alias does not exist by default), and run frodo bound to a non-loopback interface with a token:

```console
frodo mcp server start --transport http --bind-host 0.0.0.0 --port 6277 --mcp-auth-token <secret> my-tenant
```

```yaml
# docker-compose fragment for the gateway container
services:
  gateway:
    extra_hosts:
      - "host.docker.internal:host-gateway"   # Linux: create the alias; Docker Desktop has it natively
    environment:
      FRODO_MCP_URL: http://host.docker.internal:6277/mcp
      FRODO_MCP_AUTH_TOKEN: <secret>          # same secret as frodo's --mcp-auth-token
```

The gateway then connects to `http://host.docker.internal:6277/mcp` with `Authorization: Bearer <secret>` on every request. No change to the gateway's image or network model is needed: opening the three gates (non-loopback bind, the `host.docker.internal` Host alias -- automatic --, and the token) is all frodo-side configuration. Note what the automatic alias does and does not cover: it accepts the `Host: host.docker.internal:6277` header that a container dialing the HOST machine sends. It does not accept the hostname of another CONTAINER on a shared network -- see the next section.

### Running frodo's MCP server itself in Docker (`Dockerfile`, `docker/docker-compose.yml`)

The repository ships a `Dockerfile` (multi-stage: `node:24-slim` build stage running `npm run build:only`, then a slim runtime stage containing only the self-contained `dist/` bundle -- the bundle compiles every dependency in, so the runtime image needs no `node_modules`) and an example compose stack in `docker/docker-compose.yml`. Build and run:

```console
FRODO_MCP_AUTH_TOKEN=<secret> docker compose -f docker/docker-compose.yml up -d --build
```

The compose service mounts your saved `~/.frodo/Connections.json` -- **and the `masterkey.key` that decrypts its stored passwords** -- read-only, sets `FRODO_HOST` to select which profile to connect with (a saved profile's host URL, a unique substring, or its alias; without it the container starts healthy but connected to nothing), binds the server on `0.0.0.0:6277` inside a user-defined bridge network (`mcpnet`), and healthchecks `GET /health` with a node one-liner (the slim base image has no wget/curl). A gateway co-located on the same network dials frodo by service DNS name -- `http://frodo-mcp:6277/mcp` -- with no host-gateway alias and no published port needed; the commented-out `gateway` block in the compose file shows the shape. The image runs as the non-root `node` user, `ENTRYPOINT` is `dist/launch.cjs` (the signal-forwarding wrapper, so `docker stop` performs the graceful shutdown), and the connection-profile volume is the only state. The image's default CMD carries no tenant -- override it with the profile name as the final positional argument, or set `FRODO_HOST`, or the server starts unconnected.

> **Co-location requires the service name in the Host allow-list.** When the gateway dials `http://frodo-mcp:6277/mcp`, the `Host` header it sends is `frodo-mcp:6277` -- and that name is NOT in the default allow-list, and NOT covered by the automatic `host.docker.internal` alias (that alias only covers containers dialing the host machine). Without it the server answers `403 Invalid Host` before the token is ever checked. This is why the compose file's command line carries `--allowed-hosts frodo-mcp`: the service's DNS name must be allowed explicitly. If you rename the service (or run frodo under a different container name), allow that name instead.

### Operational hygiene: stop, lockfile, port auto, body/concurrency limits

Both `start` and `stop` resolve the lockfile directory at invocation time from `FRODO_CONFIG_PATH` (default `~/.frodo`), so the two must run with the SAME value of that variable: a server started with `FRODO_CONFIG_PATH=/var/frodo` writes its lockfile there, and a `stop` that runs without the variable looks in `~/.frodo`, finds nothing, and reports "no lockfile for port". Run them in the same shell/profile, or set the variable in both.

- **`frodo mcp server stop`** stops a running HTTP server cleanly: SIGTERM first (the server's own graceful shutdown runs -- log line, lockfile removal, port release), then, after 10 seconds, `--force` sends SIGKILL. It finds the process through the PID lockfile (`~/.frodo/mcp-http-<port>.pid`, honoring `FRODO_CONFIG_PATH`), refuses to signal a process that demonstrably is not frodo (PID-reuse guard, best-effort: `/proc/<pid>/cmdline` on Linux, `ps` elsewhere), removes stale lockfiles (recorded PID no longer alive) as a success, and exits 1 with a message when there is no lockfile for the port.
- **PID lockfile**: after a successful `listen()`, the transport writes `~/.frodo/mcp-http-<port>.pid` (`{pid, port, bindHost, startedAt}`); it is removed on every shutdown signal and on the crash path. A start that finds an existing lockfile naming a live PID reports that PID in its `EADDRINUSE` message (`frodo mcp server stop --port <port>`), and a dead PID is logged as stale (`overwriting stale lockfile for port N (recorded pid P is not running)`) and overwritten. Additive: servers started before this change work exactly as before, just without the lockfile.
- **`--port auto`** binds an OS-assigned ephemeral port; the listening line, heartbeat, startup summary log, and lockfile all report the RESOLVED port (this also fixes the long-standing wrong-print where `--port 0` echoed `0`). A dry run still shows the literal option value (`"port": "auto"` in the JSON summary -- no port is bound or printed, since nothing starts). Note the `--port 0` change of meaning: before this, a literal `0` bound an ephemeral port; it now means the DEFAULT port (6277) like any other invalid value -- use `--port auto` when you want the OS to pick.
- **`--max-body-size <bytes>`** (default 1048576 = 1 MiB; env `FRODO_MCP_MAX_BODY_SIZE`) bounds the accepted request body -- enforced as a `Content-Length` pre-check (reject before reading a byte) and as an accumulation cap for chunked/unannounced bodies. Over-limit requests are answered `413` with a JSON-RPC error (`-32000`) naming the limit and the option that raises it, and the socket is closed so the unread remainder is dropped. This is frodo transport policy, not MCP protocol behavior; the default is ~2.5x the largest payload observed in QA gateway crawls.
- **`--max-concurrent-requests <n>`** (default 64; env `FRODO_MCP_MAX_CONCURRENT_REQUESTS`) caps concurrent MCP handler executions; over-cap requests get an immediate `429` with `Retry-After: 1` (queue-less reject -- the client's/gateway's retry policy is the queue). The cap counts handler executions, not held sockets: a slow SSE stream mid-write still occupies a slot until its handler resolves.
- **`FRODO_MCP_HEARTBEAT_INTERVAL_MS`** overrides the 15-minute liveness heartbeat (clamped to a minimum of 1000 ms; invalid values keep the default). No CLI flag by design -- the use case is making the interval verifiable from a container/service definition.

### Observability (PID, heartbeat, crash lines)

The HTTP server is long-lived and usually watched remotely, so its log carries the basics a remote operator needs:

- The startup line names the server PID: `MCP HTTP server (pid 12345) listening on http://...` -- pair it with `lsof -iTCP:<port> -sTCP:LISTEN` when sorting out who holds a port.
- A liveness heartbeat is logged every 15 minutes (`heartbeat: MCP HTTP server still listening on ...`) so a silent process can be told apart from a hung one.
- Signals are logged as they arrive (`shutdown: received SIGHUP, shutting down MCP HTTP server`), so a remotely triggered shutdown leaves a record of why the server went down.
- **The server ends the sessions it created when it stops** (SIGTERM, SIGINT, SIGHUP, SIGQUIT on either transport, and stdin reaching end-of-file on stdio), including a `--dry-run` and a start that finds its port taken. Which sessions it may end is the library's rule (core 0021), not a setting of the server. With the token cache on (the default), the login went into the cache and another server of the same host and identity may be using it, so nothing is logged out and the session expires by itself. With `--no-cache` the server logs out the session of its own login, and the session of each realm-overridden request when that request is over. A logout never fails or holds up the shutdown: the port and the lockfile are released first, a refused logout is one `warning: shutdown: Could not end the server session: ...` line (the exit code stays 0), and the server stops waiting after 3 seconds (`Ending the sessions took more than 3000 ms; ...`). If AM accepts the logout request and never answers it, the process itself ends when the request times out (30 seconds). A server that crashes (uncaught exception) or is killed with SIGKILL ends nothing.
- If the port is already taken, the `EADDRINUSE` message probes the incumbent's `/health` endpoint: when something answers, the message says an MCP server is already serving on that port; otherwise it falls back to the generic "another process is likely listening" wording with the `lsof` discovery hint. Either way the process exits with code 1.
- Process-level crashes in server mode log one timestamped line each (event `crash`): an uncaught exception logs the error and first stack frame, releases the port best-effort, and exits with code 1 (a supervisor should restart it). Unhandled promise rejections are owned by `frodo`'s own global handler (shared by every CLI command): they are logged -- the "please report this unhandled error" block -- and set the shell's eventual exit code to 1, while the server keeps serving. There is no additional server-specific rejection handler.
- Every request's path through the gates is visible at `--mcp-log-level debug` (`http` event: arrival with method/route-path/remote address -- the path only, never the query string, so secret material in a query parameter cannot be echoed into the log --, the deciding gate and value on each rejection -- including which gate rejected an unauthorized POST, without ever logging the Authorization header's contents -- and one acceptance line before the SDK transport answers). At the default `info` level the per-request lines stay quiet.

Test/debug-only hook: setting `FRODO_MCP_CRASH_TEST=1` in the environment makes the HTTP server throw an uncaught exception shortly after it starts listening, so the crash path above (crash line, port release, exit code 1) can be exercised in a real spawned process. Never set it in production.

Note for `frodo`'s own launcher: signals delivered to only the `frodo` wrapper process (`launch.cjs`) -- a closing SSH session sending SIGHUP to the session leader, or `kill <wrapper-pid>` -- are forwarded to the actual CLI child, and a wrapper that exits for any other reason takes the child down with it. Without that forwarding, a long-running HTTP server could outlive its parent and keep holding the port with nobody watching it.

### Protocol-era handling (request metadata and batches)

Older gateway stacks (LiteLLM defaults to protocol revision 2025-11-25; Kong shipped 2025-06-18) speak an earlier MCP protocol era without the 2026 request-metadata headers. Frodo detects the era per request and applies the matching rules, so those clients work without configuration. A request is only rejected at this layer for a genuinely unsupported protocol version, or for one of these SDK-parity validation cells (each answered exactly as the MCP SDK's own HTTP entry answers it):

- an invalid `_meta` envelope (400 -32602): a request claiming the 2026-07-28 per-request envelope must carry BOTH required envelope keys -- the protocol-version claim (a string) AND `io.modelcontextprotocol/clientCapabilities` (a present object). Missing keys are reported first (`io.modelcontextprotocol/clientCapabilities: missing` when only the claim key is present, whatever the claim's value), then schema violations inside present keys (a non-string claim value, a non-object capabilities value). The one carve-out, matching the SDK: an `initialize` whose claim lacks the capabilities key is still treated as the legacy handshake and answered normally. Notifications are validated NARROWER, exactly as the SDK validates them: a notification whose claim is a string is served with no capabilities-key requirement (whatever revision it names); the only notification envelope rejection is a claim whose value is not a string (`400 -32602`, the claim key's type error).
- an empty JSON-RPC batch (`[]`) or a batch containing any element with an envelope claim (400 -32600, `batch-with-modern-element`) -- the 2026 per-request envelope has no batch semantics, and the SDK rejects on claim presence whatever the claim's validity or era.
- a modern `MCP-Protocol-Version` header on a request without a complete envelope (400 -32602, listing every missing envelope key), or a header/body disagreement (400 -32020) -- on requests and on claimed notifications alike.

