import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { frodo } from '@rockcarver/frodo-lib';
import { createWebEngine, EvalOutcome, WebEngine } from './ShellWebEngineOps';

/**
 * The web console's engine is Node's REPL evaluator with no terminal. These
 * tests pin the behaviors the console relies on, and run it against a
 * temporary home directory because the engine records history on disk.
 */

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
    engine = createWebEngine({
      onLog: (text) => logs.push(text),
    });
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
    expect(await value('_.sum([1, 2, 3])')).toBe(6);
    expect(await value('typeof state.getHost')).toBe('function');
    expect(await value('typeof help')).toBe('function');
  });

  it('keeps lodash in _ after a result is produced', async () => {
    await value('1 + 1');
    expect(await value('typeof _.map')).toBe('function');
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
    // The console surroundings are back: frodo, state, _, help.
    expect(await value('typeof frodo')).toBe('object');
    expect(await value('typeof state')).toBe('object');
    expect(await value('typeof _')).toBe('function');
    expect(await value('typeof help')).toBe('function');
    // And the fresh context still evaluates.
    expect(await value('var after = "kept"; after')).toBe('kept');
  });

  it('reset survives the lodash notice and an error before it', async () => {
    const thrown = await engine.evaluate('throw new Error("boom")');
    expect(thrown.status).toBe('error');
    await engine.reset();
    expect(await value('1 + 1')).toBe(2);
    // The REPL's context-creation notice never reaches the log stream.
    expect(logs.join('')).not.toContain('Expression assignment to _');
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
    expect(engine.history()).toEqual([
      'throw new Error("recorded too")',
      '1 + 1',
    ]);
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

  it('stores a multi-line script as one history entry', async () => {
    const script = 'const a = 1;\nconst b = 2;\na + b';
    expect(await value(script)).toBe(3);
    expect(engine.history()).toEqual([script]);
  });

  it('completes frodo API names', () => {
    const [candidates] = engine.complete('frodo.inf');
    expect(candidates.some((c) => c.startsWith('frodo.info'))).toBe(true);
  });
});
