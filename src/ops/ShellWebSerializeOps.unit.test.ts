import vm from 'node:vm';
import { describe, expect, it } from '@jest/globals';
import { buildRoot } from './ShellExploreOps';
import {
  createRemoteRegistry,
  describeNode,
  PREVIEW_LIMIT,
  toJson,
} from './ShellWebSerializeOps';

/**
 * The web console sends the browser one node at a time. These tests pin the
 * shapes it receives and the guarantees behind them: containers stay
 * collapsed until asked for, cycles and huge values are safe, and values
 * made in the REPL's separate vm realm are described correctly.
 */

describe('ShellWebSerializeOps describeNode', () => {
  const describeValue = (value: unknown) => describeNode(buildRoot(value), 1);

  it('describes primitives with a kind and a printable preview', () => {
    expect(describeValue('hi')).toMatchObject({
      kind: 'string',
      preview: '"hi"',
      expandable: false,
    });
    expect(describeValue(42)).toMatchObject({ kind: 'number', preview: '42' });
    expect(describeValue(true)).toMatchObject({
      kind: 'boolean',
      preview: 'true',
    });
    expect(describeValue(null)).toMatchObject({ kind: 'null' });
    expect(describeValue(undefined)).toMatchObject({ kind: 'undefined' });
    expect(describeValue(10n)).toMatchObject({
      kind: 'bigint',
      preview: '10n',
    });
  });

  it('moves a long string into text and marks the preview as cut', () => {
    const long = 'x'.repeat(PREVIEW_LIMIT + 50);
    const node = describeValue(long);
    expect(node.preview.endsWith('…')).toBe(true);
    expect(node.text).toBe(long);
  });

  it('summarizes containers collapsed and reports their size', () => {
    const node = describeValue({ users: [{ a: 1 }], meta: { b: 2 } });
    expect(node).toMatchObject({
      kind: 'object',
      expandable: true,
      count: 2,
      preview: '{users: Array(1), meta: {…}}',
    });
    expect(describeValue([1, 2, 3])).toMatchObject({
      kind: 'array',
      count: 3,
      preview: '(3) [1, 2, 3]',
    });
  });

  it('does not offer empty containers for opening', () => {
    expect(describeValue({})).toMatchObject({
      preview: '{}',
      expandable: false,
    });
    expect(describeValue([])).toMatchObject({
      preview: '[]',
      expandable: false,
    });
  });

  it('describes errors with their stack as text', () => {
    const node = describeValue(new Error('boom'));
    expect(node.kind).toBe('error');
    expect(node.preview).toBe('Error: boom');
    expect(node.text).toContain('boom');
  });
});

describe('ShellWebSerializeOps with values from another realm', () => {
  const make = (code: string): unknown => vm.runInNewContext(code);
  const describeValue = (value: unknown) => describeNode(buildRoot(value), 1);

  it('recognizes Map, Set, Date, RegExp, Error and Promise', () => {
    expect(describeValue(make('new Map([[1, 2]])')).kind).toBe('map');
    expect(describeValue(make('new Set([1])')).kind).toBe('set');
    expect(describeValue(make('new Date(0)'))).toMatchObject({
      kind: 'date',
      preview: '1970-01-01T00:00:00.000Z',
    });
    expect(describeValue(make('/a+/g'))).toMatchObject({
      kind: 'regexp',
      preview: '/a+/g',
    });
    expect(describeValue(make('new Error("x")'))).toMatchObject({
      kind: 'error',
      preview: 'Error: x',
    });
    expect(describeValue(make('Promise.resolve(1)')).kind).toBe('promise');
  });
});

describe('ShellWebSerializeOps registry', () => {
  it('sends children only when asked, one page at a time', () => {
    const registry = createRemoteRegistry();
    const root = registry.describeResult({
      list: Array.from({ length: 450 }, (_, i) => i),
    });
    const top = registry.children(root.id);
    expect(top?.total).toBe(1);
    const list = top?.items[0];
    expect(list).toMatchObject({ key: 'list', kind: 'array', count: 450 });

    const first = registry.children(list!.id, 0, 200);
    expect(first?.items).toHaveLength(200);
    expect(first?.total).toBe(450);
    const last = registry.children(list!.id, 400, 200);
    expect(last?.items.map((i) => i.key)).toEqual(
      Array.from({ length: 50 }, (_, i) => String(400 + i))
    );
  });

  it('marks a self-reference circular instead of expanding it forever', () => {
    const registry = createRemoteRegistry();
    const loop: Record<string, unknown> = { name: 'loop' };
    loop['self'] = loop;
    const root = registry.describeResult(loop);
    const self = registry
      .children(root.id)
      ?.items.find((item) => item.key === 'self');
    expect(self).toMatchObject({ circular: true, expandable: false });
  });

  it('shows changes made since the last time a container was opened', () => {
    const registry = createRemoteRegistry();
    const target: Record<string, unknown> = { a: 1 };
    const root = registry.describeResult({ target });
    const targetNode = registry.children(root.id)!.items[0];
    expect(registry.children(targetNode.id)?.total).toBe(1);
    target['b'] = 2;
    expect(registry.children(targetNode.id)?.total).toBe(2);
  });

  it('answers undefined for a leaf, an unknown id and a forgotten result', () => {
    const registry = createRemoteRegistry(2);
    const leaf = registry.describeResult('text');
    expect(registry.children(leaf.id)).toBeUndefined();
    expect(registry.children(999_999)).toBeUndefined();

    const old = registry.describeResult({ keep: { me: 1 } });
    registry.describeResult({ second: 1 });
    registry.describeResult({ third: 1 });
    // The oldest two results are beyond the limit of 2 and are forgotten.
    expect(registry.children(old.id)).toBeUndefined();
    expect(registry.children(leaf.id)).toBeUndefined();
  });

  it('releases every node of a forgotten result', () => {
    const registry = createRemoteRegistry(1);
    const first = registry.describeResult({ a: { b: 1 } });
    registry.children(first.id);
    const before = registry.size();
    expect(before).toBeGreaterThan(1);
    registry.describeResult(1);
    expect(registry.size()).toBe(1);
  });
});

describe('ShellWebSerializeOps toJson', () => {
  it('handles cycles, BigInt, Map and Set that plain JSON.stringify rejects', () => {
    const value: Record<string, unknown> = {
      n: 1n,
      m: new Map([['k', 1]]),
      s: new Set([1, 2]),
      f() {
        return 1;
      },
    };
    value['self'] = value;
    const { text, truncated } = toJson(value);
    expect(truncated).toBe(false);
    const parsed = JSON.parse(text);
    expect(parsed).toEqual({
      n: '1n',
      m: { k: 1 },
      s: [1, 2],
      self: '[Circular]',
    });
  });

  it('does not call the same object circular when it only appears twice', () => {
    const shared = { x: 1 };
    const { text } = toJson({ a: shared, b: shared });
    expect(JSON.parse(text)).toEqual({ a: { x: 1 }, b: { x: 1 } });
  });
});
