import { describe, expect, it } from '@jest/globals';
import { createFrodoCompleter } from './ShellAutoCompleteOps';

/**
 * Tab completion. The completer resolves dotted paths against the static
 * root bindings (frodo, $, state, ...) and, when one is wired, against the
 * live REPL context so what the user defined completes as well. What is
 * pinned here: static roots win, user names join at top level, REPL
 * machinery never shows up, and a poisoned context cannot break it.
 */

const docsByMethod = new Map();

describe('createFrodoCompleter', () => {
  it('completes static roots and their dotted paths', () => {
    const complete = createFrodoCompleter(
      { frodo: { idm: { managed: {} } }, $: { get: () => 1, post: () => 2 } },
      docsByMethod
    );
    expect(complete('fr')).toEqual([['frodo'], 'fr']);
    expect(complete('frodo.idm.')).toEqual([
      ['frodo.idm.managed'],
      'frodo.idm.',
    ]);
    // A method completes with its documented-parameter scaffold.
    expect(complete('$.g')).toEqual([['$.get()'], '$.g']);
  });

  it('completes user-defined names from the live context', () => {
    const myVar = { deep: { leaf: 1 } };
    const myFn = () => 1;
    const complete = createFrodoCompleter(
      { frodo: {} },
      docsByMethod,
      undefined,
      () => ({
        myVar,
        myFn,
      })
    );
    expect(complete('my')).toEqual([['myFn', 'myVar'], 'my']);
    // Dotted paths walk into user objects.
    expect(complete('myVar.d')).toEqual([['myVar.deep'], 'myVar.d']);
  });

  it('prefers a static root over a same-named context entry', () => {
    const complete = createFrodoCompleter(
      { frodo: { real: 1 } },
      docsByMethod,
      undefined,
      () => ({
        frodo: { fake: 1 },
      })
    );
    expect(complete('frodo.')).toEqual([['frodo.real'], 'frodo.']);
  });

  it('hides REPL machinery from top-level candidates', () => {
    const complete = createFrodoCompleter({}, docsByMethod, undefined, () => ({
      require: () => 1,
      __dirname: '/x',
      module: {},
      setTimeout: () => 1,
    }));
    // require/__dirname/module are machinery; setTimeout is callable, so
    // completing it is useful and it stays. (An empty line completes to
    // nothing by design, like the terminal REPL: a prefix is required.)
    expect(complete('s')).toEqual([['setTimeout'], 's']);
    expect(complete('r')).toEqual([[], 'r']);
    expect(complete('_')).toEqual([[], '_']);
  });

  it('survives a live context accessor that throws', () => {
    const complete = createFrodoCompleter(
      { frodo: {} },
      docsByMethod,
      undefined,
      () => {
        throw new Error('context gone');
      }
    );
    expect(complete('fr')).toEqual([['frodo'], 'fr']);
    expect(complete('my')).toEqual([[], 'my']);
  });

  it('works without a live context at all (old callers)', () => {
    const complete = createFrodoCompleter({ frodo: { am: {} } }, docsByMethod);
    expect(complete('frodo.a')).toEqual([['frodo.am'], 'frodo.a']);
    expect(complete('my')).toEqual([[], 'my']);
  });

  it('completes array hops in bracket notation, the valid JavaScript', () => {
    // Bracket syntax is what a user types for arrays (and the only form
    // that runs: obj.0 is a SyntaxError), so paths through arrays are
    // offered and rendered as c.result[0].name, not c.result.0.name.
    const payload = {
      result: [
        { _id: 'a', name: 'first', nested: { deep: 1 } },
        { _id: 'b', name: 'second' },
      ],
      resultCount: 2,
    };
    const complete = createFrodoCompleter(
      { frodo: {} },
      docsByMethod,
      undefined,
      () => ({ c: payload }) as unknown as Record<string, unknown>
    );
    // An open bracket offers indices with their closing bracket.
    expect(complete('c.result[')[0]).toContain('c.result[0]');
    expect(complete('c.result[')[0]).toContain('c.result[1]');
    // Past the bracket, properties continue in dot notation.
    expect(complete('c.result[0].')[0]).toContain('c.result[0]._id');
    expect(complete('c.result[0].na')[0]).toEqual(['c.result[0].name']);
    // A closed bracket hop is resolved: its children are offered.
    expect(complete('c.result[0]')[0]).toContain('c.result[0]._id');
    expect(complete('c.result[0].nested.')[0]).toContain(
      'c.result[0].nested.deep'
    );
    expect(complete('c.result[1].na')[0]).toEqual(['c.result[1].name']);
    // A dotted path onto an array offers the bracketed hops.
    expect(complete('c.result.')[0]).toContain('c.result[0]');
  });
});
