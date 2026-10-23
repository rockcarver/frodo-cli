import { readSync } from 'node:fs';

/** How long to wait before asking fd 0 again after EAGAIN. */
const RETRY_DELAY_MS = 20;

/** Blocks the thread for `ms` without spinning the CPU. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * One read from fd 0 that waits for input.
 *
 * The first access to the `process.stdin` getter anywhere in the process --
 * even just `process.stdin.isTTY`, as `canPrompt()` and the terminal
 * background detection do -- makes libuv switch fd 0 to non-blocking mode.
 * A plain `readSync(0)` then throws EAGAIN whenever the user has not typed
 * yet, which at a prompt is always. So EAGAIN is not an error here, it is
 * "no input yet": wait a moment and ask again. Any other error is real and
 * propagates.
 *
 * This is safe next to a resumed `process.stdin` too: the loop never yields
 * to the event loop, so libuv cannot read the line away from us.
 */
function readStdinSync(buffer: Buffer): number {
  for (;;) {
    try {
      return readSync(0, buffer, 0, buffer.length, null);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EAGAIN') throw error;
      sleepSync(RETRY_DELAY_MS);
    }
  }
}

/**
 * Prompt the user and return the line they typed. Synchronous, because the
 * one caller (the MFA OTP callback handler in `ops/AuthenticateOps.ts`) is
 * invoked from frodo-lib's *synchronous* `CallbackHandler` contract, which
 * cannot await a promise.
 *
 * Replaces `readline-sync` (unmaintained since 2016). Unlike a bare
 * `readSync(0)`, `readline-sync` never relied on fd 0 being blocking (on
 * POSIX it read a freshly opened `/dev/tty`); `readStdinSync` gets the same
 * robustness by treating EAGAIN as "wait for input".
 *
 * @param {string} question text printed before reading input
 * @returns {string} the user's answer with the trailing newline removed
 */
export function question(question: string): string {
  process.stdout.write(question);
  const buffer = Buffer.alloc(1024);
  const bytesRead = readStdinSync(buffer);
  return buffer
    .subarray(0, bytesRead)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}
