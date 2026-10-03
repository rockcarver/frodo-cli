import { Option } from 'commander';
import {
  isPidAlive,
  readMcpHttpLockfile,
  removeMcpHttpLockfile,
  verifyMcpProcessIdentity,
} from '../../../ops/McpServerLockfile.js';
import c from '../../../utils/ColorTheme';
import { printMessage } from '../../../utils/Console';
import { FrodoStubCommand } from '../../FrodoCommand';

type McpStopOptions = {
  /** The port whose lockfile names the server to stop. */
  port: string;
  /** Fall back to SIGKILL when SIGTERM does not finish the job in time. */
  force?: boolean;
};

// How often to re-poll for process death after SIGTERM, and how long to wait
// before declaring the stop timed out (matching the plan: 100ms interval,
// 10s budget, 3s for the SIGKILL fallback).
const POLL_INTERVAL_MS = 100;
const SIGTERM_TIMEOUT_MS = 10_000;
const SIGKILL_TIMEOUT_MS = 3_000;

const DEFAULT_PORT = '6277';

/** Sleeps for `ms`, as the poll loop's await. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits until `pid` is no longer alive (or the deadline passes). Returns
 * true when the process exited within the deadline.
 */
async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) {
      return true;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return !isPidAlive(pid);
}

/**
 * Stops the MCP HTTP server recorded in the PID lockfile for a port.
 *
 * The lockfile (`~/.frodo/mcp-http-<port>.pid`, written by
 * `frodo mcp server start --transport http`) is the source of truth: no
 * lockfile means this command has nothing to act on (the server may never
 * have been started with --transport http, may run under a different user,
 * or its lockfile was cleaned up). Stale lockfiles (the recorded PID is no
 * longer alive) are removed and reported as success — the port is free.
 *
 * A live PID is verified best-effort to actually be a frodo process before
 * any signal is sent (the PID-reuse guard: a lockfile can outlive its
 * writer and name a recycled PID). Where the platform cannot determine the
 * process identity (no /proc, ps unavailable), the guard is skipped — the
 * operator asked for this port to be stopped, and the lockfile was written
 * by frodo itself.
 */
export default function setup() {
  const program = new FrodoStubCommand('stop')
    .description(
      'Stop a running MCP HTTP server via its PID lockfile (written by `frodo mcp server start --transport http`).'
    )
    .withStability('experimental')
    .addOption(
      new Option(
        '--port <port>',
        'The port the MCP HTTP server is listening on; its lockfile (~/.frodo/mcp-http-<port>.pid) names the process to stop.'
      ).default(DEFAULT_PORT)
    )
    .addOption(
      new Option(
        '--force',
        'Send SIGKILL if the server has not exited 10 seconds after SIGTERM.'
      ).default(false)
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Stop the MCP HTTP server listening on the default port 6277:\n` +
        c.command(`  $ frodo mcp server stop\n`) +
        `  Stop the server on a specific port:\n` +
        c.command(`  $ frodo mcp server stop --port 8443\n`) +
        `  Force-stop a server that ignored SIGTERM:\n` +
        c.command(`  $ frodo mcp server stop --port 6277 --force\n`) +
        `  Start the server again after stopping it:\n` +
        c.command(`  $ frodo mcp server start --transport http --port 6277\n`)
    );

  program.action(async (options) => {
    const opts = options as McpStopOptions;
    const port = Number(opts.port ?? DEFAULT_PORT);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      printMessage(`Invalid --port value '${opts.port}'.`, 'error');
      process.exitCode = 1;
      return;
    }

    const lockfile = readMcpHttpLockfile(port);
    if (!lockfile) {
      printMessage(
        `No MCP HTTP server lockfile for port ${port} (is it running? was it started with --transport http?).`,
        'error'
      );
      process.exitCode = 1;
      return;
    }

    const { pid } = lockfile;
    if (!isPidAlive(pid)) {
      // Stale lockfile: the writer is gone (crashed, killed -9, machine
      // rebooted). Removing it is the whole job — the port is already free.
      removeMcpHttpLockfile(port);
      printMessage(
        `Stale lockfile for port ${port}: recorded pid ${pid} is not running. Lockfile removed.`,
        'info'
      );
      return;
    }

    // PID-reuse guard (best-effort): refuse to signal a process that is
    // demonstrably not frodo — a stale lockfile whose PID was recycled.
    const identity = verifyMcpProcessIdentity(pid);
    if (identity.verified && identity.looksLikeFrodo === false) {
      printMessage(
        `Refusing to stop pid ${pid} for port ${port}: the process does not look like a frodo MCP server (${identity.detail}). The lockfile may be stale — remove ${'~/.frodo/mcp-http-' + port + '.pid'} manually if you are sure.`,
        'error'
      );
      process.exitCode = 1;
      return;
    }

    // Graceful first: SIGTERM runs the server's own shutdown wiring (log
    // line, lockfile removal, closeIdleConnections, port release).
    try {
      process.kill(pid, 'SIGTERM');
    } catch (err) {
      printMessage(
        `Failed to signal pid ${pid} for port ${port}: ${err instanceof Error ? err.message : String(err)}`,
        'error'
      );
      process.exitCode = 1;
      return;
    }

    if (await waitForExit(pid, SIGTERM_TIMEOUT_MS)) {
      removeMcpHttpLockfile(port);
      printMessage(
        `Stopped MCP HTTP server (pid ${pid}), port ${port} released.`,
        'info'
      );
      return;
    }

    if (opts.force) {
      printMessage(
        `MCP HTTP server (pid ${pid}) still running after ${SIGTERM_TIMEOUT_MS / 1000}s — sending SIGKILL (--force).`,
        'warn'
      );
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Died between the SIGTERM wait and here: treat as stopped.
      }
      if (await waitForExit(pid, SIGKILL_TIMEOUT_MS)) {
        removeMcpHttpLockfile(port);
        printMessage(
          `Stopped MCP HTTP server (pid ${pid}) with SIGKILL, port ${port} released.`,
          'info'
        );
      } else {
        printMessage(
          `MCP HTTP server (pid ${pid}) did not exit even after SIGKILL — it may be in uninterruptible kernel state (check: ps -p ${pid}).`,
          'error'
        );
        process.exitCode = 1;
      }
      return;
    }

    printMessage(
      `MCP HTTP server (pid ${pid}) is still running after ${SIGTERM_TIMEOUT_MS / 1000}s — use --force to send SIGKILL.`,
      'error'
    );
    process.exitCode = 1;
  });

  return program;
}
