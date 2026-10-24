import { readStdinChunkSync } from './StdinSync';

/**
 * Prompt the user and return the line they typed. Synchronous, because the
 * one caller (the MFA OTP callback handler in `ops/AuthenticateOps.ts`) is
 * invoked from frodo-lib's *synchronous* `CallbackHandler` contract, which
 * cannot await a promise.
 *
 * Replaces `readline-sync` (unmaintained since 2016). Unlike a bare
 * `readSync(0)`, `readline-sync` never relied on fd 0 being blocking (on
 * POSIX it read a freshly opened `/dev/tty`); `readStdinChunkSync` (see
 * `StdinSync.ts`, which owns every synchronous read of stdin) gets the same
 * robustness by treating EAGAIN as "wait for input".
 *
 * @param {string} question text printed before reading input
 * @returns {string} the user's answer with the trailing newline removed
 */
export function question(question: string): string {
  process.stdout.write(question);
  const buffer = Buffer.alloc(1024);
  const bytesRead = readStdinChunkSync(buffer);
  return buffer
    .subarray(0, bytesRead)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}
