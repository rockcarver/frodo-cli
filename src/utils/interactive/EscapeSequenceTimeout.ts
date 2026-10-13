/**
 * Readline's escapeCodeTimeout decides how long a lone ESC byte is held
 * as a potential escape-SEQUENCE prefix before it is delivered as an
 * 'escape' keypress. Node's default (500ms) makes the double-ESC
 * "exit all" gesture impossible: within that horizon the second ESC
 * byte merely RESTARTS the pending sequence instead of delivering a
 * second keypress, so a fast double-press yields ONE keypress ~500ms
 * later -- long after any in-prompt grace window closed (verified live
 * and in isolated probes; setting the interface's property after
 * creation does NOT take effect -- only the constructor option does).
 *
 * 50ms is an order of magnitude below a human double-tap (~80-150ms)
 * while comfortably above real escape sequences (arrow/function keys
 * arrive as contiguous multi-byte bursts, well under 50ms apart), so
 * sequence parsing stays correct.
 *
 * @inquirer/core constructs its readline interfaces WITHOUT the option,
 * and the interface isn't reachable before the first keypress, so the
 * value cannot be passed through the prompt wrappers. This shim replaces
 * node:readline's createInterface once, injecting the default into every
 * interface the CLI creates (all of them are prompt/readline consumers;
 * nothing else in frodo depends on a 500ms escape horizon).
 *
 * The patch mutates the CJS exports object of the builtin: builtin CJS
 * exports are mutable ordinary objects, and node's ESM named exports for
 * builtins delegate to that same object, so @inquirer's
 * require('node:readline') sees the replacement.
 */
import { createRequire } from 'node:module';
import type { Interface as ReadLine, ReadLineOptions } from 'node:readline';

export const ESCAPE_CODE_TIMEOUT_MS = 50;

let patched = false;

export function applyEscapeSequenceTimeout(): void {
  if (patched) return;
  patched = true;
  // require() (not a static import): the patch must go through the CJS
  // exports OBJECT of the builtin -- a static ESM import's named
  // bindings are immutable and cannot be re-pointed. createRequire
  // works in both module systems; its base differs (CJS has __filename,
  // the ESM Jest suites only have import.meta.url -- which the bundler
  // polyfills for the CJS output).
  const requireRef = (() => {
    try {
      return createRequire(__filename);
    } catch {
      return createRequire(import.meta.url);
    }
  })();
  const rl = requireRef('node:readline') as {
    createInterface: (options?: ReadLineOptions) => ReadLine;
  };
  const original = rl.createInterface;
  rl.createInterface = function patchedCreateInterface(
    options?: ReadLineOptions
  ): ReadLine {
    return original({
      escapeCodeTimeout: ESCAPE_CODE_TIMEOUT_MS,
      ...options,
    });
  };
}
