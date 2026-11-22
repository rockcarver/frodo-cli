/**
 * PID lockfile for `frodo mcp server start --transport http` and
 * `frodo mcp server stop`.
 *
 * The file lives at `<config dir>/mcp-http-<port>.pid` (the same config dir
 * ThemeConfig/Config use, honoring FRODO_CONFIG_PATH) and carries a small
 * JSON record `{ pid, port, bindHost, startedAt }`. Written after a
 * successful `listen()`; removed on graceful shutdown (all four signals),
 * on the best-effort crash path, and by `stop` once a process's death is
 * confirmed or the lockfile proves stale.
 *
 * Split out of McpServerOps.ts (whose import graph cannot load under jest's
 * ESM runtime) so the liveness/staleness rules have direct unit coverage.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The lockfile record persisted for a running HTTP transport. */
export type McpHttpLockfileRecord = {
  pid: number;
  port: number;
  bindHost: string;
  startedAt: string;
};

/**
 * The frodo config directory: the same location Config.ts's getConfigPath
 * resolves — FRODO_CONFIG_PATH when set, else `~/.frodo`. Reimplemented here
 * (two lines) instead of imported because Config.ts's import graph pulls in
 * all of frodo-lib, which cannot load under jest's ESM runtime; the lockfile
 * module must stay dependency-free for direct unit coverage.
 */
function getConfigPath(): string {
  return process.env.FRODO_CONFIG_PATH || `${os.homedir()}/.frodo`;
}

/**
 * The lockfile path for a port: `<config dir>/mcp-http-<port>.pid`. Exported
 * so tests can point FRODO_CONFIG_PATH at a temp dir and compute the same
 * path without re-implementing the naming rule.
 */
export function getMcpHttpLockfilePath(port: number): string {
  return path.join(getConfigPath(), `mcp-http-${port}.pid`);
}

/**
 * Reads and validates a lockfile record. Returns null for a missing,
 * unreadable, or malformed file — every caller treats that as "no usable
 * lockfile" rather than an error, because a corrupt lockfile must never
 * block a start (or a stop).
 */
export function readMcpHttpLockfile(
  port: number
): McpHttpLockfileRecord | null {
  try {
    const raw = fs.readFileSync(getMcpHttpLockfilePath(port), 'utf8');
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.pid === 'number' &&
      Number.isInteger(parsed.pid) &&
      parsed.pid > 0
    ) {
      return {
        pid: parsed.pid,
        port: typeof parsed.port === 'number' ? parsed.port : port,
        bindHost: typeof parsed.bindHost === 'string' ? parsed.bindHost : '',
        startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Writes the lockfile record for a port. Best-effort: a failure (read-only
 * config dir, disk full) logs and returns false rather than failing the
 * start — the lockfile is an operational aid, not a correctness mechanism.
 */
export function writeMcpHttpLockfile(record: McpHttpLockfileRecord): boolean {
  try {
    fs.mkdirSync(getConfigPath(), { recursive: true });
    fs.writeFileSync(
      getMcpHttpLockfilePath(record.port),
      JSON.stringify(record, null, 2)
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes the lockfile for a port, if present. Best-effort by design —
 * "remove" failing must not turn a successful shutdown into an error.
 */
export function removeMcpHttpLockfile(port: number): void {
  try {
    fs.rmSync(getMcpHttpLockfilePath(port), { force: true });
  } catch {
    // Nothing useful to do; a leftover file is cleaned up by the next
    // start's stale-detection (its PID liveness check fails).
  }
}

/**
 * Whether `pid` is a live process. `process.kill(pid, 0)` sends no signal —
 * it is purely the liveness probe — and throws EPERM for a live process we
 * lack permission to signal, which still means "alive" for staleness
 * purposes.
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export type McpProcessVerification = {
  /** Whether frodo-relation could be determined at all. */
  verified: boolean;
  /** Whether a determination was made and it said "not frodo". */
  looksLikeFrodo: boolean | undefined;
  /** What was inspected (for the refusal message). */
  detail: string;
};

/**
 * Best-effort check that a live PID looks like a frodo process — the
 * PID-reuse guard for `frodo mcp server stop`: a lockfile can outlive its
 * writer and name a recycled PID that now belongs to something unrelated,
 * and that process must NOT be signalled.
 *
 * - Linux: reads `/proc/<pid>/cmdline` (NUL-separated argv) and looks for
 *   a frodo entry name (`frodo`, `app.cjs`, `launch.cjs`, `app.js`,
 *   `loader.cjs`; see `argvLooksLikeFrodo`).
 * - macOS/BSD: falls back to `ps -p <pid> -o command=`.
 * - Where neither is available or readable, verification is skipped
   (`verified: false`) and the caller decides policy (stop proceeds — the
   operator explicitly asked; the PID-reuse guard stays best-effort, as
   documented).
 */
export function verifyMcpProcessIdentity(pid: number): McpProcessVerification {
  // /proc (Linux) is the precise check: the kernel's argv, no output parsing.
  try {
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    const argv = cmdline.split('\0').filter((part) => part.length > 0);
    return {
      verified: true,
      looksLikeFrodo: argvLooksLikeFrodo(argv),
      detail: `/proc/${pid}/cmdline: ${argv.join(' ')}`,
    };
  } catch {
    // Fall through to ps.
  }
  try {
    const output = execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
    }).trim();
    if (!output) {
      // The process died between the liveness check and here — that is not
      // "not frodo", it is "no longer anything".
      return {
        verified: false,
        looksLikeFrodo: undefined,
        detail: `ps -p ${pid} returned nothing (process likely exited)`,
      };
    }
    return {
      verified: true,
      looksLikeFrodo: argvLooksLikeFrodo(output.split(/\s+/)),
      detail: `ps -p ${pid}: ${output}`,
    };
  } catch {
    return {
      verified: false,
      looksLikeFrodo: undefined,
      detail: 'process identity could not be determined on this platform',
    };
  }
}

/**
 * Whether an argv/command line names one of frodo's own entry points: a part
 * whose last path component is exactly `frodo`, `app.cjs`, `launch.cjs`,
 * `app.js` or `loader.cjs`. Matches the dev (`node .../app.cjs mcp server
 * start`), launcher (`node .../launch.cjs ...`) and packaged (`frodo mcp
 * server start`) invocations. The subcommand words are not matched, so
 * another program that is given `mcp server start` as arguments is not
 * frodo, and neither is a name that merely contains one of the names (for
 * example `not-app.cjs`).
 */
function argvLooksLikeFrodo(argv: string[]): boolean {
  return argv.some((part) => {
    const base = part.split('/').pop() ?? part;
    return (
      base === 'frodo' ||
      base === 'app.cjs' ||
      base === 'launch.cjs' ||
      base === 'app.js' ||
      // Defensive, and redundant in practice. Releases before the one that
      // removed the ESM loader started the app process as `node ...
      // --experimental-loader file:///.../loader.cjs .../app.cjs ...`; that
      // command line also names `app.cjs` (and the wrapper names
      // `launch.cjs`), so it is recognised without this line. The name stays
      // for one release after the loader was removed, so that a command line
      // that names only the old loader still counts.
      base === 'loader.cjs'
    );
  });
}
