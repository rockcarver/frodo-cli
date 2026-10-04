import { readSync } from 'node:fs';

/**
 * Prompt the user and return the line they typed. Synchronous, because the
 * one caller (the MFA OTP callback handler in `ops/AuthenticateOps.ts`) is
 * invoked from frodo-lib's *synchronous* `CallbackHandler` contract, which
 * cannot await a promise.
 *
 * Replaces `readline-sync` (unmaintained since 2016). Reading stdin directly
 * is what readline-sync itself did; `readSync` on fd 0 blocks until a full
 * line is available.
 *
 * @param {string} question text printed before reading input
 * @returns {string} the user's answer with the trailing newline removed
 */
export function question(question: string): string {
  process.stdout.write(question);
  const buffer = Buffer.alloc(1024);
  const bytesRead = readSync(0, buffer, 0, buffer.length, null);
  return buffer
    .subarray(0, bytesRead)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}
