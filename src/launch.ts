#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const launchArgs = [
  // '--inspect-brk=2000',
  '--no-warnings',
  '--enable-source-maps',
  fileURLToPath(new URL('./app.cjs', import.meta.url)),
];
const frodoArgs = process.argv.slice(2);

const frodo = spawn(process.execPath, [...launchArgs, ...frodoArgs], {
  stdio: 'inherit',
  shell: false,
});

// Forward the lifecycle signals a CLI wrapper receives to the child. Without
// this, signals that reach only the wrapper (a closing SSH session delivers
// SIGHUP to the login shell's jobs, `kill <wrapper-pid>` targets the wrapper)
// never reach the long-running child: `frodo mcp server start` would keep
// listening with nobody watching it, holding the port. The child's own
// handlers do the graceful shutdown (port release, shutdown log line);
// forwarding just delivers the signal.
const FORWARDED_SIGNALS = ['SIGHUP', 'SIGTERM', 'SIGINT', 'SIGQUIT'] as const;
for (const signal of FORWARDED_SIGNALS) {
  process.on(signal, () => {
    frodo.kill(signal);
  });
}

let childExited = false;
frodo.on('exit', (code) => {
  childExited = true;
  process.exitCode = code;
});

// If the wrapper exits for any other reason while the child is still running
// (an uncaught exception in the wrapper itself, stdin closing in a harness),
// kill the child so it cannot outlive its parent — a detached, orphaned
// long-running server holding a port is exactly the incident this guards
// against. The child's own signal handlers perform the graceful shutdown.
process.on('exit', () => {
  if (!childExited) {
    frodo.kill('SIGTERM');
  }
});
