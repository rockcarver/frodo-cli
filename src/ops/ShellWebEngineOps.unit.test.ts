import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
import { ShellHistory } from './ShellHistoryOps';
import { createWebEngine, EvalOutcome, WebEngine } from './ShellWebEngineOps';

/**
 * The web console's engine is Node's REPL evaluator with no terminal. These
 * tests pin the behaviors the console relies on, and run it against a
 * temporary home directory because the engine records history on disk.
 */

/** Wait a little, for a timer a script started to fire. */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How long an input may take to have an outcome in these tests. An engine
 * whose error handler is not wired never answers an input that throws; the
 * test must fail at once, with a reason, not wait for the test runner.
 */
const NO_OUTCOME_MS = 2000;

/** The engine, with every wait that depends on an outcome limited. */
function failFast(inner: WebEngine): WebEngine {
  const within = <T>(promise: Promise<T>, what: string): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    return Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `no outcome for ${what} within ${NO_OUTCOME_MS} ms (is the error handler of the engine wired?)`
              )
            ),
          NO_OUTCOME_MS
        );
      }),
    ]).finally(() => clearTimeout(timer));
  };
  return {
    ...inner,
    evaluate: (code) => within(inner.evaluate(code), `the input ${code}`),
    reset: () => within(inner.reset(), 'the reset'),
  };
}

describe('ShellWebEngineOps', () => {
  let home: string;
  let engine: WebEngine;
  let logs: string[];

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-engine-'));
    // Jest hands tests a copy of process.env, so HOME cannot be redirected;
    // replace os.homedir instead, and refuse to run if that did not take.
    jest.spyOn(os, 'homedir').mockReturnValue(home);
    if (frodo.utils.getFrodoHome() !== path.join(home, '.frodo')) {
      throw new Error(
        `Engine tests are not isolated: frodo home is ${frodo.utils.getFrodoHome()}`
      );
    }
    logs = [];
    engine = failFast(
      createWebEngine({
        onLog: (text) => logs.push(text),
      })
    );
  });

  afterEach(() => {
    engine.dispose();
    jest.restoreAllMocks();
    fs.rmSync(home, { recursive: true, force: true });
  });

  const value = async (code: string): Promise<unknown> => {
    const outcome = await engine.evaluate(code);
    if (outcome.status !== 'ok') {
      const detail =
        outcome.status === 'error'
          ? `: ${(outcome.error as Error).message}`
          : '';
      throw new Error(
        `expected ok, got ${JSON.stringify(outcome.status)}${detail}`
      );
    }
    return outcome.value;
  };

  it('evaluates expressions', async () => {
    expect(await value('1 + 1')).toBe(2);
  });

  it('supports top-level await', async () => {
    expect(await value('(await Promise.resolve(41)) + 1')).toBe(42);
    expect(
      await value('await new Promise((r) => setTimeout(() => r("late"), 20))')
    ).toBe('late');
  });

  it('keeps the value of the last expression after statements with await', async () => {
    expect(await value('const o = { a: await 1 }; o')).toEqual({ a: 1 });
    expect(await value('const x2 = await 2; x2 + 1')).toBe(3);
  });

  it('returns a promise that a script does not await as a promise', async () => {
    // Like the terminal console: a promise is a value, `await` is how a
    // script gets its result.
    const outcome = await engine.evaluate('Promise.resolve(3)');
    expect(outcome.status).toBe('ok');
    expect(
      util.types.isPromise(
        (outcome as Extract<EvalOutcome, { status: 'ok' }>).value
      )
    ).toBe(true);
    expect(await value('await Promise.resolve(3)')).toBe(3);
  });

  it('runs inputs from concurrent callers strictly in order', async () => {
    await value('var order = []');
    const first = engine.evaluate(
      'order.push("first"); await new Promise((r) => setTimeout(() => r(), 30)); order.push("first-done")'
    );
    const second = engine.evaluate(
      'order.push("second"); await new Promise((r) => setTimeout(() => r(), 5)); order.push("second-done")'
    );
    await Promise.all([first, second]);
    expect(await value('order.join(",")')).toBe(
      'first,first-done,second,second-done'
    );
  });

  it('keeps accepting inputs after a failing one', async () => {
    const failing = engine.evaluate('throw new Error("boom")');
    const after = engine.evaluate('1 + 1');
    const outcomes = await Promise.all([failing, after]);
    expect(outcomes[0].status).toBe('error');
    expect(outcomes[1]).toEqual({ status: 'ok', value: 2 });
  });

  it('keeps variables declared with top-level await between inputs', async () => {
    // A declaration itself completes to undefined, like the terminal REPL.
    expect(
      await value('var awaitedVar = await Promise.resolve(5)')
    ).toBeUndefined();
    expect(await value('awaitedVar + 1')).toBe(6);
    expect(
      await value('let awaitedLet = await Promise.resolve(9)')
    ).toBeUndefined();
    expect(await value('awaitedLet * 2')).toBe(18);
  });

  it('keeps a function declared alongside await in the input', async () => {
    expect(
      await value(
        'async function awaitedFn(x) { return await Promise.resolve(x) }'
      )
    ).toBeUndefined();
    expect(await value('awaitedFn(4)')).toBe(4);
  });

  it('keeps variables between inputs', async () => {
    await value('var x = 20');
    await value('let y = 22');
    expect(await value('x + y')).toBe(42);
  });

  it('gives scripts the console names', async () => {
    expect(await value('typeof frodo.info.getInfo')).toBe('function');
    expect(await value('typeof $.get')).toBe('function');
    expect(await value('typeof state.getHost')).toBe('function');
    expect(await value('typeof help')).toBe('function');
  });

  it('leaves _ to the REPL: it is not bound, and a result does not set it', async () => {
    // The engine calls the REPL's evaluator, not the REPL's line handler,
    // and only the line handler stores a result in the last-result slot, so
    // `_` stays undefined until a script assigns it.
    expect(await value('typeof _')).toBe('undefined');
    await value('1 + 1');
    expect(await value('_')).toBeUndefined();
    expect(await value('typeof _')).toBe('undefined');
  });

  it('keeps a value a script assigns to _', async () => {
    expect(await value('_ = 5')).toBe(5);
    expect(await value('_ + 1')).toBe(6);
    // The REPL says "Expression assignment to _ now disabled." when a script
    // assigns it. That sentence is about the terminal's last-result feature,
    // which this engine does not have (it is misleading here), so it stays
    // out of the log stream.
    expect(logs.join('')).not.toContain('Expression assignment to _');
  });

  it('keeps other output that contains an underscore in the log stream', async () => {
    await value('console.log("a_b and _c")');
    expect(logs.join('')).toContain('a_b and _c');
  });

  it('reports unfinished input instead of an error', async () => {
    expect(await engine.evaluate('function f() {')).toEqual({
      status: 'incomplete',
    });
    expect(await engine.evaluate('[1, 2,')).toEqual({ status: 'incomplete' });
    expect(await engine.evaluate('`open template')).toEqual({
      status: 'incomplete',
    });
  });

  it('reports an unfinished template literal and comment as unfinished input', async () => {
    expect(await engine.evaluate('const t = `first line\nsecond')).toEqual({
      status: 'incomplete',
    });
    expect(await engine.evaluate('/* an open comment')).toEqual({
      status: 'incomplete',
    });
    // The finished form of the same input runs.
    expect(await value('const t = `first line\nsecond`; t.length')).toBe(17);
  });

  it('reports a real syntax error as an error', async () => {
    const outcome = await engine.evaluate('var = ;');
    expect(outcome.status).toBe('error');
  });

  it('reports a thrown error with its message', async () => {
    const outcome = await engine.evaluate('throw new Error("boom")');
    expect(outcome.status).toBe('error');
    const error = (outcome as Extract<EvalOutcome, { status: 'error' }>).error;
    expect((error as Error).message).toBe('boom');
    // The REPL also prints the error text itself; that copy must not reach the
    // log stream, or the browser would show every error twice.
    expect(logs.join('')).not.toContain('boom');
  });

  it('reports a rejected promise as an error', async () => {
    const outcome = await engine.evaluate(
      'await Promise.reject(new Error("no"))'
    );
    expect(outcome.status).toBe('error');
  });

  it('prints no copy of a rejected await in the log', async () => {
    // The REPL prints an error it handles itself; the browser shows the
    // error from the outcome, so a printed copy would show it twice.
    const outcome = await engine.evaluate(
      'await Promise.reject(new Error("rejected-copy"))'
    );
    expect(outcome.status).toBe('error');
    expect(
      (outcome as Extract<EvalOutcome, { status: 'error' }>).error
    ).toEqual(expect.objectContaining({ message: 'rejected-copy' }));
    expect(logs.join('')).not.toContain('rejected-copy');
  });

  it('reports the error of an await that follows statements', async () => {
    const outcome = await engine.evaluate(
      'const before = 1; await Promise.reject(new TypeError("after-before"))'
    );
    expect(outcome.status).toBe('error');
    const error = (outcome as Extract<EvalOutcome, { status: 'error' }>)
      .error as Error;
    expect(error.name).toBe('TypeError');
    expect(error.message).toBe('after-before');
  });

  it('prints an error from a timer, after its input has finished, into the log', async () => {
    // Nothing is running when the timer fires: the error belongs to no
    // input, so the REPL prints it, and it fails no later input.
    expect(
      await value('setTimeout(() => { throw new Error("late-boom") }, 10); 1')
    ).toBe(1);
    await sleep(60);
    expect(logs.join('')).toContain('late-boom');
    expect(await value('1 + 1')).toBe(2);
  });

  it("does not fail the running input with the error of an earlier input's timer", async () => {
    await value('setTimeout(() => { throw new Error("stray-boom") }, 20); 1');
    // This input is still awaiting when the stray timer fires.
    const outcome = await engine.evaluate(
      'await new Promise((r) => setTimeout(() => r("finished"), 80))'
    );
    expect(outcome).toEqual({ status: 'ok', value: 'finished' });
    expect(logs.join('')).toContain('stray-boom');
  });

  it('ends an input with its own value when its own timer raises an error, and the next input waits for it', async () => {
    // The error of a timer that the input started is not the input's outcome:
    // the input goes on, and no later input starts on top of it.
    const first = engine.evaluate(
      'var finalA = "running"; setTimeout(() => { throw new Error("own-timer") }, 20); await new Promise((r) => setTimeout(r, 150)); finalA = "A finished"; "A value"'
    );
    const second = engine.evaluate('finalA');
    expect(await first).toEqual({ status: 'ok', value: 'A value' });
    expect(await second).toEqual({ status: 'ok', value: 'A finished' });
    // The error is printed into the log, where a script's output is.
    expect(logs.join('')).toContain('own-timer');
  });

  it('takes the rejection an input awaits as its outcome, not an error that arrived before it', async () => {
    const outcome = await engine.evaluate(
      'setTimeout(() => { throw new Error("side-error") }, 10); await new Promise((r) => setTimeout(r, 60)); await Promise.reject(new Error("awaited-error"))'
    );
    expect(outcome.status).toBe('error');
    expect(
      ((outcome as Extract<EvalOutcome, { status: 'error' }>).error as Error)
        .message
    ).toBe('awaited-error');
    expect(logs.join('')).toContain('side-error');
    expect(logs.join('')).not.toContain('awaited-error');
  });

  it('fails only the input whose history entry cannot be written, and runs the next input', async () => {
    jest.spyOn(ShellHistory.prototype, 'addLine').mockImplementationOnce(() => {
      throw new Error('history write failed');
    });
    await expect(engine.evaluate('1 + 1')).rejects.toThrow(
      'history write failed'
    );
    expect(await value('2 + 2')).toBe(4);
  });

  it('keeps working after an error', async () => {
    await engine.evaluate('throw new Error("x")');
    expect(await value('"still alive"')).toBe('still alive');
  });

  it('captures what a script prints', async () => {
    await value('console.log("hello from the script")');
    expect(logs.join('')).toContain('hello from the script');
  });

  it('reset wipes user definitions and reinstalls the console names', async () => {
    await value('var mine = 42; function myFn() { return 1; }');
    await engine.reset();
    expect(await value('typeof mine')).toBe('undefined');
    expect(await value('typeof myFn')).toBe('undefined');
    // The console surroundings are back: frodo, state, $, help.
    expect(await value('typeof frodo')).toBe('object');
    expect(await value('typeof state')).toBe('object');
    expect(await value('typeof $')).toBe('object');
    expect(await value('typeof help')).toBe('function');
    // `_` is not one of them: a fresh context leaves it to the REPL.
    expect(await value('typeof _')).toBe('undefined');
    // And the fresh context still evaluates.
    expect(await value('var after = "kept"; after')).toBe('kept');
  });

  it('reset keeps a value a script assigned to _', async () => {
    expect(await value('_ = 5')).toBe(5);
    await engine.reset();
    // The console names are installed again and none of them is `_`, so
    // nothing overwrites what the script assigned (the REPL keeps it).
    expect(await value('_')).toBe(5);
  });

  it('reset survives an error before it', async () => {
    const thrown = await engine.evaluate('throw new Error("boom")');
    expect(thrown.status).toBe('error');
    await engine.reset();
    expect(await value('1 + 1')).toBe(2);
  });

  it('reset runs in order with evals (no mid-script wipe)', async () => {
    const evalP = engine.evaluate(
      'var step = 0; await new Promise((r) => setTimeout(() => r(), 30)); step = 1; step'
    );
    await engine.reset();
    const outcome = await evalP;
    // The eval ran to completion before the context swap: no error from a
    // context vanishing under it. (Its `var step` died with the old
    // context, which is exactly what a reset promises.)
    expect(outcome.status).toBe('ok');
  });

  it('captures help() output without colour codes', async () => {
    await value('help()');
    const text = logs.join('');
    expect(text).toContain('Help System');
    // eslint-disable-next-line no-control-regex
    expect(text).not.toMatch(/\x1b\[/);
  });

  it('runs inputs one at a time, in order', async () => {
    await value('var order = []');
    const first = engine.evaluate(
      'await new Promise((r) => setTimeout(r, 40)); order.push("first")'
    );
    const second = engine.evaluate('order.push("second")');
    await Promise.all([first, second]);
    expect(await value('order.join(",")')).toBe('first,second');
  });

  it('records finished inputs in history, newest first, but not unfinished ones', async () => {
    await value('1 + 1');
    await engine.evaluate('function f() {');
    await engine.evaluate('throw new Error("recorded too")');
    // Entries carry metadata (ts set, host unset in tests: nothing
    // connected); the texts must match exactly.
    expect(engine.history().map((e) => e.text)).toEqual([
      'throw new Error("recorded too")',
      '1 + 1',
    ]);
    expect(engine.history().every((e) => typeof e.ts === 'number')).toBe(true);
    expect(engine.history().every((e) => e.host === undefined)).toBe(true);
  });

  it('completes let/const names and their paths (not just var)', async () => {
    await value('const c = { result: [{ _id: "x" }], resultCount: 1 }');
    expect(engine.complete('c.')[0]).toContain('c.result');
    // Array hops render in bracket notation: the valid JavaScript.
    expect(engine.complete('c.result.')[0]).toContain('c.result[0]');
    expect(engine.complete('c.result[0].')[0]).toContain('c.result[0]._id');
    await value('let l = { y: { z: 1 } }');
    expect(engine.complete('l.y.')[0]).toContain('l.y.z');
    await value('var v = { w: 1 }');
    expect(engine.complete('v.')[0]).toContain('v.w');
    await value('function myFn() { return 1 }');
    expect(engine.complete('myFn')[0]).toContain('myFn');
    await value('const [d1, d2] = [1, 2]');
    expect(engine.complete('d1.')[0]).toEqual([]); // number: no paths
    expect(engine.complete('d2')[0]).toContain('d2');
  });

  it('forgets lexical names on reset', async () => {
    await value('const gone = { x: 1 }');
    expect(engine.complete('gone')[0]).toContain('gone');
    await engine.reset();
    expect(engine.complete('gone')[0]).toEqual([]);
    expect(engine.complete('gone.')[0]).toEqual([]);
  });

  it('completes names a declaration destructures or an await declares', async () => {
    await value('const { p1, q1: [r1] } = { p1: { a: 1 }, q1: [{ b: 2 }] }');
    expect(engine.complete('p1')[0]).toContain('p1');
    expect(engine.complete('p1.')[0]).toContain('p1.a');
    expect(engine.complete('r1')[0]).toContain('r1');
    expect(engine.complete('r1.')[0]).toContain('r1.b');
    await value('const awaited = await Promise.resolve({ k: 1 })');
    expect(engine.complete('awaite')[0]).toContain('awaited');
    expect(engine.complete('awaited.')[0]).toContain('awaited.k');
    await value('class Klass { static s = 1 }');
    expect(engine.complete('Klas')[0]).toContain('Klass');
    await value('let m1 = 1, m2 = { z: 1 }');
    expect(engine.complete('m')[0]).toEqual(
      expect.arrayContaining(['m1', 'm2'])
    );
    expect(engine.complete('m2.')[0]).toContain('m2.z');
  });

  it('completes a name that a failed input declared before it threw', async () => {
    const outcome = await engine.evaluate(
      'const half = { x: 1 }; throw new Error("after")'
    );
    expect(outcome.status).toBe('error');
    expect(engine.complete('hal')[0]).toContain('half');
    expect(engine.complete('half.')[0]).toContain('half.x');
  });

  it("does not offer the names the console starts with as the user's", async () => {
    // The REPL lists its own names (the built-in modules, the globals) with
    // the user's let/const/class names; only the user's belong to completion.
    expect(engine.complete('zli')[0]).toEqual([]);
    await value('const mine = 1');
    expect(engine.complete('zli')[0]).toEqual([]);
    expect(engine.complete('min')[0]).toContain('mine');
  });

  it("completes names declared after a reset, and still not the console's own", async () => {
    await value('const before = 1');
    await engine.reset();
    expect(engine.complete('befor')[0]).toEqual([]);
    await value('const after = { y: 1 }');
    expect(engine.complete('after.')[0]).toContain('after.y');
    expect(engine.complete('zli')[0]).toEqual([]);
  });

  it('stores a multi-line script as one history entry', async () => {
    const script = 'const a = 1;\nconst b = 2;\na + b';
    expect(await value(script)).toBe(3);
    expect(engine.history().map((e) => e.text)).toEqual([script]);
  });

  it('completes frodo API names', () => {
    const [candidates] = engine.complete('frodo.inf');
    expect(candidates.some((c) => c.startsWith('frodo.info'))).toBe(true);
  });
});
