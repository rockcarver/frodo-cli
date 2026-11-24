import os from 'node:os';
import path from 'node:path';
import repl from 'node:repl';
import { PassThrough, Writable } from 'node:stream';
import util from 'node:util';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { frodo } from '@rockcarver/frodo-lib';
import { makeHome, removeHome } from '../../test/utils/WebShell.js';
import { createWebEngine, WebEngine } from './ShellWebEngineOps';

/**
 * `_` and `_error` in the web console against Node's own REPL.
 *
 * Every sequence of inputs runs twice: on the engine of the web console, and
 * on a REPL started the way the terminal console starts its own (default
 * evaluator, ignoreUndefined, the REPL's own line handler). After each input
 * both say what they showed: a value, nothing, an error, or unfinished input.
 * Inputs that read `_` and `_error` are part of the sequences, so a
 * difference in what the two keep shows up as a difference in what they
 * show. The sequences are the oracle's questions; what the answers are is
 * decided by the REPL, not by this file.
 */

/** One input of a sequence, or an event in the console. */
type Step = string | { incomplete: string } | { reset: true };

/** What an input showed: the same words for both sides. */
type Shown =
  | { shown: 'value'; value: string }
  | { shown: 'nothing' }
  | { shown: 'error' }
  | { shown: 'incomplete' }
  | { shown: 'reset' };

/**
 * The text of a value, equal for equal values. An error is its name and
 * message: its stack names the files of whoever ran it.
 */
const inspect = (value: unknown): string =>
  util.types.isNativeError(value)
    ? `${value.name}: ${value.message}`
    : util.inspect(value, { depth: 2 });

/** How long the reference REPL may take to come back to its prompt. */
const PROMPT_WAIT_MS = 5000;
const PROMPT = '⁣reference> ';
const MORE_PROMPT = '| ';

/**
 * A REPL as the terminal console starts it, with its input fed by the test:
 * Node's own line handler runs every input, so what it keeps in `_` and
 * `_error` is Node's.
 */
function startReference() {
  const input = new PassThrough();
  let output = '';
  const values: unknown[] = [];
  let errors = 0;
  const server = repl.start({
    input,
    output: new Writable({
      write(chunk, _encoding, done) {
        output += chunk.toString();
        done();
      },
    }),
    terminal: false,
    useColors: false,
    prompt: PROMPT,
    ignoreUndefined: true,
    useGlobal: false,
    // An observer only: 'print' is what the REPL does without a handler.
    handleError() {
      errors++;
      return 'print';
    },
    writer(value: unknown) {
      values.push(value);
      return '';
    },
  });

  async function atPrompt(): Promise<'prompt' | 'more'> {
    const deadline = Date.now() + PROMPT_WAIT_MS;
    while (Date.now() < deadline) {
      if (output.endsWith(PROMPT)) return 'prompt';
      if (output.endsWith(MORE_PROMPT)) return 'more';
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    throw new Error(`the reference REPL did not come back: ${output}`);
  }

  async function send(line: string): Promise<'prompt' | 'more'> {
    output = '';
    input.write(`${line}\n`);
    return atPrompt();
  }

  return {
    async run(step: Step): Promise<Shown> {
      values.length = 0;
      errors = 0;
      if (typeof step !== 'string') {
        if ('reset' in step) {
          await send('.clear');
          return { shown: 'reset' };
        }
        // Unfinished input: the line handler waits for more, `.break` ends it.
        const state = await send(step.incomplete);
        if (state !== 'more') {
          throw new Error(`${step.incomplete} was not unfinished input`);
        }
        await send('.break');
        return { shown: 'incomplete' };
      }
      await send(step);
      if (errors > 0) return { shown: 'error' };
      if (values.length > 0) {
        return { shown: 'value', value: inspect(values[0]) };
      }
      return { shown: 'nothing' };
    },
    close: () => server.close(),
  };
}

async function runOnEngine(engine: WebEngine, step: Step): Promise<Shown> {
  if (typeof step !== 'string') {
    if ('reset' in step) {
      await engine.reset();
      return { shown: 'reset' };
    }
    const outcome = await engine.evaluate(step.incomplete);
    if (outcome.status !== 'incomplete') {
      throw new Error(`${step.incomplete} was not unfinished input`);
    }
    return { shown: 'incomplete' };
  }
  const outcome = await engine.evaluate(step);
  if (outcome.status === 'error') return { shown: 'error' };
  if (outcome.status === 'incomplete') return { shown: 'incomplete' };
  if (outcome.value === undefined) return { shown: 'nothing' };
  return { shown: 'value', value: inspect(outcome.value) };
}

const reset: Step = { reset: true };

/** The sequences: each starts with a fresh console on both sides. */
const SEQUENCES: Step[][] = [
  // values of every type, read back through `_`
  ['1 + 1', '_', '_ + 1', '_'],
  ['"text"', '_', '_.length', '_'],
  ['({ a: 1 })', '_', '_.a'],
  ['{ a: 1 }', '_'],
  ['[1, 2, 3]', '_.length', '_'],
  ['10n', '_', '_ + 1n'],
  ['Symbol("s")', '_', 'typeof _'],
  ['null', '_', 'typeof _'],
  ['NaN', '_'],
  ['false', '_'],
  ['0', '_', '""', '_'],
  ['new Date(0)', '_.getTime()', '_'],
  ['new Map([[1, 2]])', '_.size'],
  ['(() => 1)', '_()', '_'],
  ['/re/g', '_.source'],
  ['"a"', '"b"', '"c"', '_'],
  ['typeof _', '_'],
  ['1', '_ + _', '_ * _', '_'],
  ['var arr = []; arr.push(1)', '_', 'arr.push(2)', '_'],
  ['var theObject = {}; theObject', '_ === theObject', 'typeof _'],
  // inputs that have no result to show
  ['5', 'undefined', '_'],
  ['5', 'var a = 1', '_'],
  ['5', 'let b = 2', 'const c = 3', '_'],
  ['5', 'function f() {}', 'class K {}', '_'],
  ['5', 'void 0', '_'],
  ['5', 'if (true) {}', '_'],
  ['5', '', '_'],
  ['5', '   ', '_'],
  ['5', 'console.log("printed")', '_'],
  ['console.log("printed"); 5', '_'],
  // errors, and what `_error` keeps
  ['5', 'throw new Error("e")', '_', '_error.message'],
  ['5', 'throw 3', '_', '_error'],
  ['5', 'null.x', '_', '_error.constructor.name'],
  ['5', 'nope', '_', '_error.name'],
  ['5', 'var = ;', '_', '_error.name'],
  ['5', 'JSON.parse("{")', '_', '_error.name'],
  ['5', 'function r() { return r() } r()', '_', '_error.name'],
  ['5', 'await Promise.reject(new Error("r"))', '_', '_error.message'],
  ['5', 'await Promise.reject(null)', '_', '_error'],
  ['5', 'throw undefined', '_', 'typeof _error'],
  ['throw new Error("a")', '_error.message', 'throw new Error("b")', '_error'],
  ['typeof _error', 'throw new Error("a")', '1 + 1', '_error.message'],
  // unfinished input
  ['5', { incomplete: 'function g() {' }, '_'],
  ['5', { incomplete: '[1, 2,' }, '_'],
  ['5', { incomplete: '`open template' }, '_'],
  ['5', { incomplete: '/* open' }, '_'],
  ['throw new Error("kept")', { incomplete: 'if (true) {' }, '_error.message'],
  // await
  ['await Promise.resolve(5)', '_', '_ + 1'],
  ['const x = await 2', '_', 'x', '_'],
  ['7', 'const y = await 2; y + 1', '_'],
  ['await 1; await 2', '_'],
  ['for await (const i of [1, 2]) { i }', '_'],
  ['await new Promise((r) => setTimeout(() => r("late"), 20))', '_'],
  // a promise is a value
  ['Promise.resolve(3)', '_', 'await _', '_'],
  ['(async () => 5)()', 'await _'],
  ['new Promise(() => {})', '_'],
  // assigning to `_` and `_error`
  ['_ = 7', '_', '1 + 1', '_'],
  ['1 + 1', '_ = 7', '3', '_', '_ = 8', '_'],
  ['_ = undefined', '1 + 1', '_'],
  ['1 + 1', 'var _ = 5', '_', '9', '_'],
  ['_error = 1', 'throw new Error("x")', '_error'],
  ['_ = 5', 'throw new Error("e")', '_', '_error.message'],
  ['5', '_error = 1', '6', '_', '_error'],
  // reset against `.clear`
  ['5', reset, '_', '6', '_'],
  ['_ = 5', reset, '1 + 1', '_'],
  ['throw new Error("e")', reset, '_error.message', '1 + 1'],
  ['_error = 1', reset, 'throw new Error("z")', '_error.message'],
  ['1 + 1', reset, 'var z = 3', '_'],
];

describe('ShellWebEngineLastResult', () => {
  let home: string;
  let engine: WebEngine;
  let reference: ReturnType<typeof startReference>;

  beforeEach(() => {
    home = makeHome('frodo-engine-last-');
    // Jest hands tests a copy of process.env, so HOME cannot be redirected;
    // replace os.homedir instead, and refuse to run if that did not take.
    jest.spyOn(os, 'homedir').mockReturnValue(home);
    if (frodo.utils.getFrodoHome() !== path.join(home, '.frodo')) {
      throw new Error(
        `Engine tests are not isolated: frodo home is ${frodo.utils.getFrodoHome()}`
      );
    }
    engine = createWebEngine({ onLog: () => undefined });
    reference = startReference();
  });

  afterEach(() => {
    reference.close();
    engine.dispose();
    jest.restoreAllMocks();
    removeHome(home);
  });

  it('has at least forty sequences', () => {
    expect(SEQUENCES.length).toBeGreaterThanOrEqual(40);
  });

  it('asks a reference that does keep results: the first sequence shows them', async () => {
    // Guards the oracle itself: two sides that both showed nothing would
    // agree on everything.
    const shown: Shown[] = [];
    for (const step of SEQUENCES[0]) shown.push(await reference.run(step));
    expect(shown).toEqual([
      { shown: 'value', value: '2' },
      { shown: 'value', value: '2' },
      { shown: 'value', value: '3' },
      { shown: 'value', value: '3' },
    ]);
  });

  it.each(SEQUENCES.map((steps, index) => [index + 1, steps] as const))(
    'sequence %i shows what the REPL shows: %j',
    async (_number, steps) => {
      const fromEngine: Shown[] = [];
      const fromReference: Shown[] = [];
      for (const step of steps) {
        fromEngine.push(await runOnEngine(engine, step));
        fromReference.push(await reference.run(step));
      }
      expect(fromEngine).toEqual(fromReference);
    }
  );
});
