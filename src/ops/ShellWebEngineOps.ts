import repl from 'node:repl';
import { PassThrough, Writable } from 'node:stream';
import vm from 'node:vm';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { createFrodoCompleter } from './ShellAutoCompleteOps';
import {
  createConsoleBindings,
  installConsoleContext,
} from './ShellContextOps';
import { ShellHistory } from './ShellHistoryOps';

/**
 * The evaluation engine behind the web console: a REPL with no terminal.
 *
 * It shares the terminal console's surroundings (frodo in scope, `$`
 * facade, history, completion) but supplies its own evaluator. Node's
 * REPL evaluator reports a thrown error only through undocumented
 * plumbing that changed between Node 22 (a `domain` option) and 26
 * (the option rejected, errors routed to an internal handler that never
 * calls the evaluator back), so the engine cannot rely on it. A custom
 * evaluator gets every outcome in its own callback on any Node version:
 *
 *  - the code is compiled as a `vm.Script` and run in the REPL's own
 *    context, so declarations persist between inputs as always;
 *  - a thrown error reaches the callback directly;
 *  - an input with top-level `await` is wrapped in an async function.
 *    For a single expression the wrapped value is the value of the
 *    input; for statements, only the effect survives (the completion
 *    value of a block is not observable without Node's own AST
 *    rewriting), which matters little for a console that also prints
 *    what the script logs;
 *  - input the parser rejects as unfinished comes back as `incomplete`
 *    (the REPL's `Recoverable`), recognized by "Unexpected end of
 *    input", the message V8 produces for every unmatched bracket or
 *    dangling operator. An unterminated string or comment is reported
 *    as a syntax error instead of "keep typing"; a console user sees
 *    the error rather than a silently waiting cursor.
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
  /** Persistent history for this host, newest first. */
  history(): string[];
  /**
   * Discard everything the user defined: a fresh context with the console
   * names reinstalled. The connection and history survive; only the JS
   * namespace is wiped.
   */
  reset(): Promise<void>;
  dispose(): void;
};

type ReplEval = (
  code: string,
  context: vm.Context,
  file: string,
  callback: (error: Error | null, result?: unknown) => void
) => void;

type EvalCallback = Parameters<ReplEval>[3];

// eslint-disable-next-line no-control-regex -- ANSI colour codes are the target
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

/** Only inputs containing await are worth the async-wrapper retry. */
const AWAIT_HINT = /\bawait\b/;

const acornParser = acorn.Parser;

/**
 * Evaluate one input in the REPL's context, calling back with exactly one
 * outcome. Written for the callback contract the REPL expects; everything
 * above it is plain logic, so it behaves the same on every Node version.
 */
export function evaluateInput(
  code: string,
  context: vm.Context,
  file: string,
  cb: EvalCallback
): void {
  // An object literal must reach the parser parenthesized, or its braces
  // parse as a block and the value is lost (the REPL does the same).
  const trimmed = code.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      new vm.Script(`(${trimmed})`);
      code = `(${trimmed})\n`;
    } catch {
      // Not a pure literal; compile as written.
    }
  }

  let script: vm.Script;
  try {
    script = new vm.Script(code, { filename: file });
  } catch (error) {
    const e = error as SyntaxError;
    // An input whose syntax needs await (V8 words the failure variously:
    // "await is only valid in async functions" for a bare await, and
    // "Unexpected identifier" when the await sits inside parentheses) is
    // retried inside an async wrapper, which re-reports any error that
    // was genuine all along.
    if (AWAIT_HINT.test(code) && !isRecoverable(e)) {
      evaluateAwaiting(code, context, file, cb);
      return;
    }
    if (isRecoverable(e)) {
      cb(new repl.Recoverable(e));
      return;
    }
    cb(e);
    return;
  }

  let result: unknown;
  try {
    result = script.runInContext(context);
  } catch (error) {
    cb(error as Error);
    return;
  }
  settle(result, cb);
}

/** Run code that contains top-level await: rewrite it, then run it. */
function evaluateAwaiting(
  code: string,
  context: vm.Context,
  file: string,
  cb: EvalCallback
): void {
  const transformed = processTopLevelAwait(code.trim());
  if (transformed === null) {
    // No real top-level await after all (or a top-level return): the
    // original compile error stands, worded by us because the wrapper is
    // gone and V8's message about the unwrapped code was already lost.
    cb(new SyntaxError('await outside of an async function'));
    return;
  }
  let script: vm.Script;
  try {
    script = new vm.Script(transformed, { filename: file });
  } catch (error) {
    const e = error as SyntaxError;
    if (isRecoverable(e)) {
      cb(new repl.Recoverable(e));
      return;
    }
    cb(e);
    return;
  }
  let promise: unknown;
  try {
    promise = script.runInContext(context);
  } catch (error) {
    cb(error as Error);
    return;
  }
  // The rewrite's last expression comes back as `{ value }`; unwrap it.
  settle(promise, (error, value) => {
    const wrapper = value as { value?: unknown } | null | undefined;
    cb(
      error,
      wrapper !== null && typeof wrapper === 'object' && 'value' in wrapper
        ? wrapper.value
        : value
    );
  });
}

/**
 * The rewrite Node's own REPL applies to inputs with top-level await
 * (internal/repl/await, replicated): the input becomes the body of an
 * async function whose declarations are hoisted out to the surrounding
 * scope (`var name;` before the wrapper, `name=` at the declaration), so
 * variables survive into later inputs, and whose last top-level
 * expression statement is returned as `{ value }`, so the console can
 * print it. Returns null when there is no top-level await after all, or
 * when the input has a top-level `return`, which has no meaning here.
 */
function processTopLevelAwait(src: string): string | null {
  const wrapPrefix = '(async () => { ';
  const wrapped = `${wrapPrefix}${src} })()`;
  const wrappedArray = wrapped.split('');
  let root: acorn.Node;
  try {
    root = acornParser.parse(wrapped, { ecmaVersion: 'latest' });
  } catch (error) {
    const e = error as Error & { pos: number };
    if (e.message.startsWith('Unterminated ')) {
      throw new repl.Recoverable(e as SyntaxError);
    }
    // A parse error before the first await belongs to the original input:
    // report the input's own failure rather than the wrapper's.
    const awaitPos = src.indexOf('await');
    const errPos = e.pos - wrapPrefix.length;
    if (awaitPos > errPos) return null;
    return null;
  }
  const statements = (root as unknown as { body: acorn.Node[] }).body;
  // The async arrow's own body: walking it (not the program) is what
  // makes "top level" mean "outside any function or block the user wrote".
  const arrowBody = (
    statements[0] as unknown as {
      expression: { callee: { body: acorn.Node } };
    }
  ).expression.callee.body as unknown as { body: acorn.Node[] };
  const state = {
    body: arrowBody as unknown as acorn.Node,
    ancestors: [] as acorn.Node[],
    hoistedDeclarationStatements: [] as string[],
    containsAwait: false,
    containsReturn: false,
    prepend(node: acorn.Node, str: string): void {
      wrappedArray[node.start] = str + wrappedArray[node.start];
    },
    append(node: acorn.Node, str: string): void {
      wrappedArray[node.end - 1] += str;
    },
    replace(from: number, to: number, str: string): void {
      for (let i = from; i < to; i++) wrappedArray[i] = '';
      wrappedArray[from] = str;
    },
  };

  const isTopLevel = (): boolean =>
    state.ancestors[state.ancestors.length - 2] === state.body;

  type Continue = (node: unknown, st?: unknown, override?: string) => void;
  type Visitor = (node: acorn.Node, st: unknown, c: Continue) => void;
  const noop: Visitor = () => undefined;
  const base = walk.base as unknown as Record<string, Visitor>;
  const visitorsWithoutAncestors: Record<string, Visitor> = {
    ClassDeclaration(node, st, c) {
      const { id } = node as unknown as { id: { name: string } };
      if (isTopLevel()) {
        state.prepend(node, `${id.name}=`);
        state.hoistedDeclarationStatements.push(`let ${id.name}; `);
      }
      base.ClassDeclaration(node, st, c);
    },
    ForOfStatement(node, st, c) {
      if ((node as unknown as { await: boolean }).await === true) {
        state.containsAwait = true;
      }
      base.ForOfStatement(node, st, c);
    },
    FunctionDeclaration(node, st, c) {
      const { id } = node as unknown as { id: { name: string } };
      state.prepend(node, `this.${id.name} = ${id.name}; `);
      state.hoistedDeclarationStatements.push(`var ${id.name}; `);
      base.FunctionDeclaration(node, st, c);
    },
    FunctionExpression: noop,
    ArrowFunctionExpression: noop,
    MethodDefinition: noop,
    AwaitExpression(node, st, c) {
      state.containsAwait = true;
      base.AwaitExpression(node, st, c);
    },
    ReturnStatement(node, st, c) {
      state.containsReturn = true;
      base.ReturnStatement(node, st, c);
    },
    VariableDeclaration(node, st, c) {
      const n = node as unknown as {
        kind: string;
        declarations: { id: unknown }[];
      };
      const parent = state.ancestors[state.ancestors.length - 2] as unknown as
        { type: string } | undefined;
      const inForHead =
        parent?.type === 'ForOfStatement' || parent?.type === 'ForInStatement';
      if (n.kind === 'var' || (!inForHead && isTopLevel())) {
        // A declaration becomes an assignment to the hoisted name
        // (`void (w = ...)`), so the value lands in the console's
        // context and outlives the wrapper. `var` does this even
        // inside a block, matching its hoisting rules.
        state.replace(
          node.start,
          node.start + n.kind.length,
          n.declarations.length === 1 ? 'void' : 'void ('
        );
        n.declarations.forEach((decl, index) => {
          const d = decl as unknown as acorn.Node & { init: acorn.Node | null };
          state.prepend(d, '(');
          state.append(d, d.init ? ')' : '=undefined)');
          if (
            n.declarations.length !== 1 &&
            index === n.declarations.length - 1
          ) {
            state.append(d, ')');
          }
        });

        // Hoist the declared names so they outlive the wrapper.
        const hoist: Array<[string, string[]]> = [
          ['var', []],
          ['let', []],
        ];
        const at = n.kind === 'var' ? 0 : 1;
        const register = (identifier: unknown): void => {
          const id = identifier as {
            type: string;
            name: string;
            properties?: { value?: unknown; argument?: unknown }[];
            elements?: unknown[];
          } | null;
          if (id === null) return;
          switch (id.type) {
            case 'Identifier':
              hoist[at][1].push(id.name);
              break;
            case 'ObjectPattern':
              for (const property of id.properties ?? []) {
                register(property.value ?? property.argument);
              }
              break;
            case 'ArrayPattern':
              for (const element of id.elements ?? []) {
                register(element);
              }
              break;
            default:
              break;
          }
        };
        for (const decl of n.declarations) {
          register(decl.id);
        }
        for (const [kind, names] of hoist) {
          if (names.length > 0) {
            state.hoistedDeclarationStatements.push(
              `${kind} ${names.join(', ')}; `
            );
          }
        }
      }
      base.VariableDeclaration(node, st, c);
    },
  };
  const visitors: Record<string, Visitor> = {};
  for (const nodeType of Object.keys(base)) {
    const custom = visitorsWithoutAncestors[nodeType];
    visitors[nodeType] = (node, st, c) => {
      const isNew = node !== state.ancestors[state.ancestors.length - 1];
      if (isNew) state.ancestors.push(node);
      (custom ?? base[nodeType])(node, st, c);
      if (isNew) state.ancestors.pop();
    };
  }
  walk.recursive(state.body as never, state as never, visitors as never);

  // Not actually awaiting, or returning from the top level: no rewrite.
  if (!state.containsAwait || state.containsReturn) {
    return null;
  }

  // Return the last statement inside the wrapper as { value }: the
  // wrapper's statements, not the program's (the program's only statement
  // is the wrapper itself).
  const inner = arrowBody.body;
  for (let i = inner.length - 1; i >= 0; i--) {
    const node = inner[i] as unknown as {
      type: string;
      expression?: acorn.Node;
    };
    if (node.type === 'EmptyStatement') continue;
    if (node.type === 'ExpressionStatement' && node.expression) {
      const expr = node.expression as unknown as acorn.Node;
      const stmt = node as unknown as acorn.Node;
      state.prepend(expr, '{ value: (');
      state.append(expr, ') }');
      state.prepend(stmt, 'return ');
    }
    break;
  }
  return state.hoistedDeclarationStatements.join('') + wrappedArray.join('');
}

/** Resolve a thenable outcome; pass anything else straight through. */
function settle(result: unknown, cb: EvalCallback): void {
  if (
    result !== null &&
    (typeof result === 'object' || typeof result === 'function') &&
    typeof (result as { then?: unknown }).then === 'function'
  ) {
    Promise.resolve(result).then(
      (value) => cb(null, value),
      (error) => cb(error)
    );
    return;
  }
  cb(null, result);
}

/**
 * Would more input make this parse? V8 says "Unexpected end of input" for
 * every unmatched bracket and dangling operator, which is the case that
 * matters for a console. An unterminated string or comment is reported as
 * "Invalid or unexpected token", indistinguishable from genuinely invalid
 * code without embedding a parser; those surface as an error.
 */
function isRecoverable(error: SyntaxError): boolean {
  return /Unexpected end of input/.test(error.message);
}

export function createWebEngine(options: {
  /** Text the script printed. Plain text: colour codes are removed. */
  onLog: (text: string) => void;
}): WebEngine {
  const bindings = createConsoleBindings();
  const log = (text: string): void => {
    const plain = text.replace(ANSI, '');
    // The REPL prints this whenever it builds a context (it dislikes the
    // pre-bound lodash `_`). At startup the tab's stream is not open yet,
    // so it is invisible; after a reset it would surface as junk above the
    // reset note. It says nothing the console user needs.
    if (plain.trim() === 'Expression assignment to _ now disabled.') return;
    if (plain.length > 0) options.onLog(plain);
  };

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
    eval: evaluateInput as unknown as ReplEval,
  });
  installConsoleContext(server.context, bindings, {
    write: log,
    colors: false,
    captureAll: true,
  });

  // Top-level let/const/class/function names the user has declared, from
  // parsing each evaluated input. They are invisible to the context object
  // (they live in the eval's lexical scope), so completion needs them
  // spelled out; reads go through the context by name.
  const lexicalNames = new Set<string>();

  // Collect the names one input declares: top-level only (the REPL runs
  // each input as its own script, so nested blocks do not persist).
  function harvestLexicalNames(code: string): void {
    try {
      const ast = acorn.parse(code, { ecmaVersion: 'latest' });
      for (const node of (
        ast as unknown as { body: Array<Record<string, unknown>> }
      ).body) {
        if (node.type === 'VariableDeclaration' && node.kind !== 'var') {
          for (const decl of node.declarations as Array<
            Record<string, unknown>
          >) {
            walkFullIdents(decl.id, lexicalNames);
          }
        } else if (
          node.type === 'FunctionDeclaration' ||
          node.type === 'ClassDeclaration'
        ) {
          if (typeof node.id === 'object' && node.id !== null) {
            lexicalNames.add((node.id as { name: string }).name);
          }
        }
      }
    } catch {
      // Unparsable input never ran either; nothing to harvest.
    }
  }

  // A binding pattern's identifiers: plain names now (a destructuring
  // pattern's names also persist in the lexical scope; walk them too).
  function walkFullIdents(node: unknown, into: Set<string>): void {
    const n = node as {
      type?: string;
      name?: string;
      elements?: unknown[];
      properties?: unknown[];
      left?: unknown;
      right?: unknown;
      argument?: unknown;
    };
    if (!n || typeof n !== 'object') return;
    if (n.type === 'Identifier' && n.name) {
      into.add(n.name);
      return;
    }
    if (n.type === 'ObjectPattern') {
      for (const p of n.properties ?? [])
        walkFullIdents((p as { value?: unknown }).value, into);
      return;
    }
    if (n.type === 'ArrayPattern') {
      for (const e of n.elements ?? []) walkFullIdents(e, into);
      return;
    }
    if (n.type === 'AssignmentPattern') {
      walkFullIdents(n.left, into);
      return;
    }
    if (n.type === 'RestElement') {
      walkFullIdents(n.argument, into);
      return;
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

  const completer = createFrodoCompleter(
    bindings.rootBindings,
    bindings.docsByMethod,
    undefined,
    // The live view of the namespace. The context object alone misses
    // let/const (they live in the eval's lexical scope), so this is a
    // proxy: own keys are the context's plus the harvested lexical names,
    // and reads resolve lexical names by evaluating them in the context.
    // Cleared by reset (a fresh context holds none of the old names).
    // Passed as an accessor: the completer reads it per completion.
    () => liveView()
  );
  // Shared across connections: one console, many environments, one
  // history (ShellHistory.shared() folds in the old per-host files).
  const history = ShellHistory.shared();

  // Inputs run one after another; a later one waits for an earlier await.
  let queue: Promise<unknown> = Promise.resolve();

  function runOnce(code: string): Promise<EvalOutcome> {
    return new Promise<EvalOutcome>((resolve) => {
      server.eval.call(
        server,
        `${code}\n`,
        server.context,
        'console',
        (error, value) => {
          if (error instanceof repl.Recoverable) {
            resolve({ status: 'incomplete' });
          } else if (error) {
            resolve({ status: 'error', error });
          } else {
            resolve({ status: 'ok', value });
          }
        }
      );
    });
  }

  return {
    evaluate(code) {
      const next = queue.then(() => runOnce(code));
      queue = next.catch(() => undefined);
      return next.then((outcome) => {
        // Unfinished input is not an entry yet; the user is still typing it.
        if (outcome.status !== 'incomplete') {
          history.addLine(code);
          // A successful input's top-level let/const/class/function names
          // now exist in the lexical scope: remember them for completion.
          if (outcome.status === 'ok') harvestLexicalNames(code);
        }
        return outcome;
      });
    },
    complete: (line) => completer(line),
    history: () => history.getLines(),
    // Queued like an eval, so it cannot interleave with one: the context
    // never vanishes under a script that is running. resetContext() swaps
    // in an empty context; the console names (frodo, $, help, ...) live in
    // installConsoleContext, so they go back on by hand.
    reset() {
      const next = queue.then(() => {
        if (typeof server.resetContext === 'function') {
          server.resetContext();
          installConsoleContext(server.context, bindings, {
            write: log,
            colors: false,
            captureAll: true,
          });
          // The fresh lexical scope holds none of the harvested names.
          lexicalNames.clear();
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
