import type { AsyncCompleter } from 'node:readline';
import repl from 'node:repl';
import { PassThrough, Writable } from 'node:stream';
import vm from 'node:vm';
import { state } from '@rockcarver/frodo-lib';
import { createFrodoCompleter } from './ShellAutoCompleteOps';
import {
  createConsoleBindings,
  installConsoleContext,
} from './ShellContextOps';
import { HistoryEntry, ShellHistory } from './ShellHistoryOps';
import { IdmCatalog, refreshIdmCatalog } from './ShellIdmCatalogOps';

/**
 * The evaluation engine behind the web console: a REPL with no terminal.
 *
 * It shares the terminal console's surroundings (frodo in scope, `$`
 * facade, history, completion) and, like the terminal console, runs Node's
 * own REPL evaluator. That evaluator already does what the console needs:
 * declarations persist between inputs (var, let, const, class, function),
 * top-level `await` works with the value of the last expression, an object
 * literal is read as a value, and unfinished input comes back as
 * `repl.Recoverable`.
 *
 * What the evaluator does not do is call back when a script throws or an
 * await rejects: it hands that error to the REPL option `handleError`. The
 * engine takes from there the errors that end the input itself: a synchronous
 * throw, and a rejection that the input awaits at its top level, both reach
 * the handler as a plain call, and become the outcome of the input that is
 * running. An error raised on the side (a timer of the script, a promise it
 * does not await, an event emitter) reaches the handler as an uncaught
 * exception instead; the engine tells the two apart with a capture callback
 * of its own (see watchUncaughtExceptions). Such an error is printed into the
 * log, where the script's output is, and ends nothing: the input goes on, and
 * the next input waits for it, as it does for any input.
 *
 * This runs whatever code it is given with the connected environment's
 * credentials, exactly as typing it in the terminal would. It must
 * therefore only ever be reachable through the authenticated local
 * server in ShellWebServerOps, never exposed directly.
 */

export type EvalOutcome =
  | { status: 'ok'; value: unknown }
  | { status: 'error'; error: unknown }
  /** The input is a valid start of a statement that is not finished yet. */
  | { status: 'incomplete' };

export type WebEngine = {
  /** Run one input. Inputs are queued: only one runs at a time. */
  evaluate(code: string): Promise<EvalOutcome>;
  /** Completions for the text before the cursor: [candidates, replaced text]. */
  complete(line: string): [string[], string];
  /** Fetch the tenant's managed types, config instances and connectors for resource completion. */
  refreshCatalog(): Promise<void>;
  /** Persistent history for this host, newest first, with metadata. */
  history(): HistoryEntry[];
  /**
   * Discard everything the user defined: a fresh context with the console
   * names reinstalled. The connection and history survive; only the JS
   * namespace is wiped.
   */
  reset(): Promise<void>;
  dispose(): void;
};

/**
 * The slots in which a REPL keeps what `_` and `_error` read. They are fields
 * of the REPL's own line handler and of the `_` accessors it puts on the
 * context, which @types/node does not declare; the engine reads and writes
 * them through this shape (a cast, in createWebEngine). A Node that renames
 * them would leave the console without `_`: the tests that compare the engine
 * with a real REPL (ShellWebEngineLastResult.unit.test.ts) fail then.
 */
type ReplLastSlots = {
  /** The last result; `_` reads it. */
  last: unknown;
  /** True once a script assigned `_`: results stop replacing it. */
  underscoreAssigned: boolean;
  /** The last error; `_error` reads it. */
  lastError: unknown;
  /** True once a script assigned `_error`: errors stop replacing it. */
  underscoreErrAssigned: boolean;
};

// eslint-disable-next-line no-control-regex -- ANSI colour codes are the target
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

/**
 * True while the process hands an uncaught exception to its capture
 * callbacks, which is how an error raised on the side reaches the REPL: a
 * timer that throws, a rejected promise nobody awaits. The REPL's own
 * callback then calls the `handleError` option in the same call stack, so the
 * flag is true there, and false for the errors that the REPL hands to it
 * directly (a synchronous throw, an awaited rejection).
 */
let uncaughtArriving = false;
let watchingUncaught = false;

/**
 * Register the capture callback that sets uncaughtArriving. Callbacks run
 * most recent first and the first to return true ends the handling, so this
 * one has to be registered after the REPL's own (made when the first REPL
 * starts) and has to return false.
 */
function watchUncaughtExceptions(): void {
  if (watchingUncaught) return;
  watchingUncaught = true;
  process.addUncaughtExceptionCaptureCallback(() => {
    uncaughtArriving = true;
    // The handler runs before the stack unwinds; nothing may stay flagged.
    queueMicrotask(() => {
      uncaughtArriving = false;
    });
    return false;
  });
}

export function createWebEngine(options: {
  /** Text the script printed. Plain text: colour codes are removed. */
  onLog: (text: string) => void;
}): WebEngine {
  const bindings = createConsoleBindings();
  const log = (text: string): void => {
    const plain = text.replace(ANSI, '');
    // The REPL prints this once when a script assigns `_`. It is the REPL's
    // own sentence, not something the script printed, and the log stream
    // holds what a script prints: it stays out of it, as it did before `_`
    // held results. The same notice for `_error` is not filtered.
    if (plain.trim() === 'Expression assignment to _ now disabled.') return;
    if (plain.length > 0) options.onLog(plain);
  };

  // How the input that is running gets its outcome, while it runs (inputs run
  // one after another, see the queue below): the error handler of the REPL
  // has no other way to say which input an error ends.
  let settleRunning: ((outcome: EvalOutcome) => void) | undefined;

  const server = repl.start({
    input: new PassThrough(),
    output: new Writable({
      write(chunk, _encoding, done) {
        log(chunk.toString());
        done();
      },
    }),
    terminal: false,
    useColors: false,
    prompt: '',
    useGlobal: false,
    // A thrown error or a rejected await does not reach the evaluator's
    // callback: the REPL hands it to this function, synchronously, and takes
    // 'print', 'ignore' or 'unhandled' as the answer.
    handleError(error) {
      const settle = settleRunning;
      if (settle && !uncaughtArriving) {
        // The error that ends the input that is running: it is that input's
        // outcome. The browser shows it from there, so the REPL's own
        // printed copy would show it twice.
        settle({ status: 'error', error });
        return 'ignore';
      }
      // An error raised on the side, or with no input running (a timer of an
      // earlier input): the REPL prints it into the log, where the script's
      // other output is. It is no input's outcome.
      return 'print';
    },
  });
  watchUncaughtExceptions();
  const slots = server as unknown as ReplLastSlots;
  installConsoleContext(server.context, bindings, {
    write: log,
    colors: false,
    captureAll: true,
  });

  // The names the REPL lists for an empty line, which is how completion
  // learns the user's let/const/class declarations: they live in the
  // context's global lexical scope, which the context object does not show,
  // and the REPL asks the inspector for that scope. The same list holds
  // everything else the REPL knows too (the context's properties, the
  // built-in modules, the globals).
  function replNames(): Promise<string[]> {
    return new Promise((resolve) => {
      try {
        (server.completer as AsyncCompleter)('', (error, result) => {
          resolve(error || !result ? [] : result[0]);
        });
      } catch {
        resolve([]);
      }
    });
  }

  // What that list holds with nothing declared by the user, taken once the
  // console names are installed: what it holds beyond this is the user's.
  let baseline = new Set<string>();
  async function takeBaseline(): Promise<void> {
    baseline = new Set(await replNames());
  }

  // Top-level let/const/class names the user has declared, in the order the
  // REPL lists them. Reads go through the context by name (liveView).
  const lexicalNames = new Set<string>();
  async function harvestLexicalNames(): Promise<void> {
    lexicalNames.clear();
    for (const name of await replNames()) {
      if (!baseline.has(name)) lexicalNames.add(name);
    }
  }

  // The namespace as completion sees it: everything the context object
  // holds, plus the lexical names resolving through the context. Own-key
  // enumeration is what the completer's top-level candidates read.
  function liveView(): Record<string, unknown> {
    return new Proxy({} as Record<string, unknown>, {
      ownKeys() {
        return Array.from(
          new Set([...Object.keys(server.context), ...lexicalNames])
        );
      },
      getOwnPropertyDescriptor(_t, key) {
        // Object.keys on a proxy keeps only keys whose descriptor says
        // enumerable. All harvested names claim so; reads resolve lazily.
        if (key in server.context || lexicalNames.has(String(key))) {
          return {
            configurable: true,
            enumerable: true,
            writable: false,
            value: undefined,
          };
        }
        return undefined;
      },
      get(_t, key) {
        if (typeof key !== 'string') return undefined;
        try {
          return vm.runInContext(`(${key})`, server.context);
        } catch {
          return undefined;
        }
      },
    });
  }

  // The tenant-shaped completion data (managed types, config instances,
  // connectors), refreshed by connectToHost in the worker once the tab
  // signs in. Empty until then: static families still suggest.
  let idmCatalog: IdmCatalog | undefined;
  const completer = createFrodoCompleter(
    bindings.rootBindings,
    bindings.docsByMethod,
    undefined,
    // The live view of the namespace. The context object alone misses
    // let/const (they live in the context's lexical scope), so this is a
    // proxy: own keys are the context's plus the harvested lexical names,
    // and reads resolve lexical names by evaluating them in the context.
    // Cleared by reset (a fresh context holds none of the old names).
    // Passed as an accessor: the completer reads it per completion.
    () => liveView(),
    // Web mode keeps the full param scaffold (the page places the cursor
    // inside the parens); the accessor is for the catalog, not this flag.
    false,
    () => idmCatalog
  );
  // Shared across connections: one console, many environments, one
  // history (ShellHistory.shared() folds in the old per-host files).
  const history = ShellHistory.shared();

  // Inputs run one after another; a later one waits for an earlier await.
  // The first waits for the baseline, so that nothing is declared before it.
  let queue: Promise<unknown> = takeBaseline();

  // What the REPL's line handler does after an input, which the engine does
  // not use (it calls the evaluator directly, to get each input's value):
  // a result goes into `_`, and the error that ended an input into `_error`,
  // each unless a script assigned that name. An input with nothing to show
  // (a statement, a declaration, undefined) is no result: the terminal
  // console starts its REPL with ignoreUndefined for this. Unfinished input
  // is neither. An error the REPL prints itself (raised on the side) is
  // kept in `_error` by the REPL.
  function rememberOutcome(outcome: EvalOutcome): void {
    if (outcome.status === 'ok') {
      if (outcome.value !== undefined && !slots.underscoreAssigned) {
        slots.last = outcome.value;
      }
    } else if (outcome.status === 'error' && !slots.underscoreErrAssigned) {
      slots.lastError = outcome.error;
    }
  }

  function runOnce(code: string): Promise<EvalOutcome> {
    return new Promise<EvalOutcome>((resolve) => {
      // The first outcome counts; the evaluator and the error handler do not
      // both report one input, but a later call must change nothing.
      const settle = (outcome: EvalOutcome): void => {
        if (settleRunning !== settle) return;
        settleRunning = undefined;
        rememberOutcome(outcome);
        resolve(outcome);
      };
      settleRunning = settle;
      server.eval.call(
        server,
        `${code}\n`,
        server.context,
        'console',
        (error, value) => {
          if (error instanceof repl.Recoverable) {
            settle({ status: 'incomplete' });
          } else if (error) {
            settle({ status: 'error', error });
          } else {
            settle({ status: 'ok', value });
          }
        }
      );
    });
  }

  return {
    evaluate(code) {
      const next = queue.then(async () => {
        const outcome = await runOnce(code);
        // Unfinished input is not an entry yet; the user is still typing it.
        if (outcome.status !== 'incomplete') {
          history.addLine(code, {
            ts: Date.now(),
            // The host the input ran against, from this engine's own state
            // (an engine is one environment; the parent's state never
            // connects). An entry typed before any connect carries none.
            host: state.getHost() || undefined,
          });
          // A finished input may have declared let/const/class names, also
          // one that then failed: remember them for completion.
          await harvestLexicalNames();
        }
        return outcome;
      });
      queue = next.catch(() => undefined);
      return next;
    },
    complete: (line) => completer(line),
    // Called by the worker after a successful connect: the tenant's live
    // types, config instances and connectors for resource completion.
    async refreshCatalog() {
      idmCatalog = await refreshIdmCatalog(idmCatalog);
    },
    history: () => history.getEntries(),
    // Queued like an eval, so it cannot interleave with one: the context
    // never vanishes under a script that is running. resetContext() swaps
    // in an empty context; the console names (frodo, $, help, ...) live in
    // installConsoleContext, so they go back on by hand.
    reset() {
      const next = queue.then(async () => {
        // resetContext() exists on every runtime REPLServer but is missing
        // from @types/node's REPLServer interface; the cast keeps the method
        // call (its `this` must stay the server) while the guard keeps a
        // future Node without it working.
        const serverWithReset = server as unknown as {
          resetContext?: () => void;
        };
        if (typeof serverWithReset.resetContext === 'function') {
          serverWithReset.resetContext();
          installConsoleContext(server.context, bindings, {
            write: log,
            colors: false,
            captureAll: true,
          });
          // The fresh lexical scope holds none of the harvested names, and
          // the list the REPL gives is taken again for the new context.
          lexicalNames.clear();
          await takeBaseline();
        }
      });
      queue = next.catch(() => undefined);
      return next;
    },
    dispose() {
      server.close();
    },
  };
}
