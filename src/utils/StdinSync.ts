import { readSync } from 'node:fs';

/**
 * The only place in the CLI that reads fd 0 synchronously (an ESLint rule
 * keeps it that way, see `eslint.config.mjs`).
 *
 * Why every synchronous read of standard input needs the same care: the
 * first access to the `process.stdin` getter anywhere in the process -- even
 * just `process.stdin.isTTY`, as `canPrompt()` and the terminal background
 * detection do -- makes libuv switch fd 0 to non-blocking mode. A plain
 * `readSync(0)` then throws EAGAIN whenever no data has arrived yet: at a
 * prompt because the user has not typed, on a pipe because the producer is
 * slower than the CLI (frodo-cli#887 and its sibling,
 * `config-manager push raw --stdin`). So EAGAIN is not an error here, it is
 * "no input yet": wait a moment and ask again. Any other error is real and
 * propagates.
 *
 * This is safe next to a resumed `process.stdin` too: the loops below never
 * yield to the event loop, so libuv cannot read the data away from us.
 */

/** How long to wait before asking fd 0 again after EAGAIN. */
const RETRY_DELAY_MS = 20;

/** How much of a pipe is read per call when reading it to its end. */
const PIPE_CHUNK_BYTES = 64 * 1024;

/** Blocks the thread for `ms` without spinning the CPU. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * One read from fd 0 that waits for input: fills `buffer` with whatever
 * arrives first (a typed line at a prompt, the next piece of a pipe) and
 * returns the number of bytes read; 0 means end of input.
 *
 * Besides returning 0, end of input can surface as an error with code `EOF`
 * (what Node raises for a closed pipe on Windows, and what `readline-sync`
 * handled the same way): it is mapped to 0 here too. That mapping is not
 * exercised on a real Windows console by the tests.
 *
 * @param {Buffer} buffer where the bytes are put; its length is the most that is read
 * @returns {number} the number of bytes read, 0 at end of input
 */
export function readStdinChunkSync(buffer: Buffer): number {
  for (;;) {
    try {
      return readSync(0, buffer, 0, buffer.length, null);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EAGAIN') {
        sleepSync(RETRY_DELAY_MS);
        continue;
      }
      if (code === 'EOF') return 0;
      throw error;
    }
  }
}

/**
 * Everything on standard input up to its end, as UTF-8 text. Waits for a
 * slow producer (EAGAIN between chunks is normal on a pipe), and decodes
 * once at the end so a multi-byte character split across two chunks stays
 * intact.
 *
 * @returns {string} all of stdin
 */
export function readStdinToEndSync(): string {
  const chunks: Buffer[] = [];
  for (;;) {
    const buffer = Buffer.alloc(PIPE_CHUNK_BYTES);
    const bytesRead = readStdinChunkSync(buffer);
    if (bytesRead === 0) break;
    chunks.push(buffer.subarray(0, bytesRead));
  }
  return Buffer.concat(chunks).toString('utf8');
}
