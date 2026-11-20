import vm from 'node:vm';
import { describe, expect, it } from '@jest/globals';
import {
  buildRoot,
  collapsedPreview,
  collapseNode,
  createObjectViewer,
  expandNode,
  flattenVisible,
  isCollapsibleResult,
  isExplorableValue,
  MAX_BODY_ROWS,
  previewOf,
} from './ShellExploreOps';

/**
 * Unit tests for the console's object explorer tree logic (ShellExploreOps).
 * The interactive rendering is exercised by the PTY layer.
 */

describe('ShellExploreOps isExplorableValue', () => {
  it('accepts plain objects and arrays', () => {
    expect(isExplorableValue({})).toBe(true);
    expect(isExplorableValue([1, 2])).toBe(true);
  });

  it('rejects primitives, null, promises, and typed arrays', () => {
    expect(isExplorableValue('text')).toBe(false);
    expect(isExplorableValue(42)).toBe(false);
    expect(isExplorableValue(null)).toBe(false);
    expect(isExplorableValue(Promise.resolve())).toBe(false);
    expect(isExplorableValue(new Uint8Array(4))).toBe(false);
  });
});

describe('ShellExploreOps tree', () => {
  it('expands an object into child nodes with keys and depths', () => {
    const root = buildRoot({ alpha: { nested: 1 }, beta: 'leaf' });
    expandNode(root);
    expect(root.expanded).toBe(true);
    expect(root.children?.map((c) => c.key)).toEqual(['alpha', 'beta']);
    expect(root.children?.[0].depth).toBe(1);
    expect(root.children?.[1].expandable).toBe(false);
  });

  it('flattenVisible shows only nodes whose ancestors are expanded', () => {
    const root = buildRoot({ a: { b: { c: 1 } }, d: 2 });
    expandNode(root);
    // Only root + its direct children while a is collapsed.
    let visible = flattenVisible(root);
    expect(visible.map((n) => n.key)).toEqual(['', 'a', 'd']);
    expandNode(visible[1]);
    visible = flattenVisible(root);
    expect(visible.map((n) => n.key)).toEqual(['', 'a', 'b', 'd']);
    expandNode(visible[2]);
    visible = flattenVisible(root);
    expect(visible.map((n) => n.key)).toEqual(['', 'a', 'b', 'c', 'd']);
    collapseNode(visible[1]);
    visible = flattenVisible(root);
    expect(visible.map((n) => n.key)).toEqual(['', 'a', 'd']);
  });

  it('marks a self-referencing object circular instead of recursing', () => {
    const value: Record<string, unknown> = { name: 'loop' };
    value['self'] = value;
    const root = buildRoot(value);
    expandNode(root);
    const selfNode = root.children?.find((c) => c.key === 'self');
    expect(selfNode?.circular).toBe(true);
    expect(selfNode?.expandable).toBe(false);
  });

  it('reports expanded containers as counts and collapsed ones as previews', () => {
    const root = buildRoot({ list: [1, 2, 3], obj: { x: 1 } });
    expandNode(root);
    const listNode = root.children?.[0];
    const objNode = root.children?.[1];
    expect(previewOf(listNode as never)).toBe('(3) [1, 2, 3]');
    expandNode(listNode as never);
    expect(previewOf(listNode as never)).toBe('Array(3)');
    expandNode(objNode as never);
    expect(previewOf(objNode as never)).toBe('Object(1 keys)');
  });

  it('previews a collapsed object with its first keys and nested containers summarized', () => {
    const root = buildRoot({
      result: [{ _id: '1' }],
      user: {
        _id: '1',
        userName: 'bjensen',
        profile: { city: 'Bristol' },
        roles: ['a', 'b'],
        extra: true,
      },
    });
    expandNode(root);
    expect(previewOf(root.children?.[0] as never)).toBe('(1) [{…}]');
    expect(previewOf(root.children?.[1] as never)).toBe(
      "{_id: '1', userName: 'bjensen', profile: {…}, roles: Array(2), …}"
    );
  });

  it('reflects later mutations on re-expand', () => {
    const target: Record<string, unknown> = { a: 1 };
    const root = buildRoot({ target });
    expandNode(root);
    const targetNode = root.children?.[0];
    expandNode(targetNode as never);
    expect(targetNode?.children?.length).toBe(1);
    target['b'] = 2;
    collapseNode(targetNode as never);
    expandNode(targetNode as never);
    expect(targetNode?.children?.length).toBe(2);
  });
});

/**
 * The viewer redraws in place by moving the cursor up over its own region,
 * so the cursor arithmetic is the invariant that matters: a miscount leaves
 * stray rows or overwrites the prompt. These tests drive the viewer through
 * a fake IO and check that arithmetic directly.
 */
describe('ShellExploreOps inline viewer geometry', () => {
  function makeViewer(height = 40) {
    const writes: string[] = [];
    let handler: ((chunk: Buffer) => void) | null = null;
    let restored = 0;
    const viewer = createObjectViewer({
      subscribe: (h) => {
        handler = h;
      },
      write: (text) => writes.push(text),
      width: () => 100,
      height: () => height,
      restorePrompt: () => {
        restored++;
      },
    });
    const key = (sequence: string) => handler?.(Buffer.from(sequence));
    const up = (text: string) => {
      const match = /^(?:\x1b\[(\d+)A)?/.exec(text);
      return match?.[1] ? Number(match[1]) : 0;
    };
    const frameLines = (text: string) =>
      text.slice(text.indexOf('\x1b[J') + 3).split('\n').length;
    return { viewer, writes, key, up, frameLines, restored: () => restored };
  }

  const manyKeys = Object.fromEntries(
    Array.from({ length: 100 }, (_, i) => [`key${i}`, i])
  );

  it('opens below the prompt, redraws in place, and closes back onto the prompt row', async () => {
    const t = makeViewer();
    const done = t.viewer.explore({ a: 1, b: { c: 2 } }, { atPrompt: true });
    // Opening: hide cursor and step onto the line below the prompt.
    expect(t.writes[0]).toBe('\x1b[?25l\n');
    // First frame has nothing to undo.
    expect(t.up(t.writes[1])).toBe(0);
    const firstFrame = t.frameLines(t.writes[1]);

    t.key('\x1b[B'); // down
    // A redraw first climbs back over the previous frame (n - 1 lines).
    expect(t.up(t.writes[2])).toBe(firstFrame - 1);

    t.key('q');
    const closing = t.writes[t.writes.length - 1];
    // Close climbs the frame AND the prompt row, clears, shows the cursor.
    expect(t.up(closing)).toBe(t.frameLines(t.writes[2]) - 1 + 1);
    expect(closing).toContain('\x1b[J');
    expect(closing).toContain('\x1b[?25h');
    expect(t.restored()).toBe(1);
    await done;
  });

  it('closes a script-opened viewer without touching a prompt row', async () => {
    const t = makeViewer();
    const done = t.viewer.explore({ a: 1 });
    expect(t.writes[0]).toBe('\x1b[?25l');
    t.key('q');
    const closing = t.writes[t.writes.length - 1];
    expect(t.up(closing)).toBe(t.frameLines(t.writes[1]) - 1);
    expect(t.restored()).toBe(0);
    await done;
  });

  it('caps the region at the body-row limit however large the value is', async () => {
    const t = makeViewer(60);
    const done = t.viewer.explore(manyKeys);
    // header + MAX_BODY_ROWS rows + the "rows a-b of n" footer
    expect(t.frameLines(t.writes[1])).toBe(MAX_BODY_ROWS + 2);
    t.key('G'); // jump to the last row: the window scrolls, size is unchanged
    expect(t.frameLines(t.writes[t.writes.length - 1])).toBe(MAX_BODY_ROWS + 2);
    t.key('q');
    await done;
  });

  it('shrinks the region on a short terminal so it always fits on screen', async () => {
    const t = makeViewer(12);
    const done = t.viewer.explore(manyKeys);
    // height 12 leaves room for 7 body rows (height - 5), plus header + footer
    expect(t.frameLines(t.writes[1])).toBe(7 + 2);
    t.key('q');
    await done;
  });

  it('Esc keeps the view as plain text where the prompt row and region were', async () => {
    const t = makeViewer();
    const done = t.viewer.explore(
      { alpha: { nested: 1 }, beta: 'leaf' },
      { atPrompt: true }
    );
    t.key('\x1b'); // lone Esc: the viewer waits a beat, then keeps and closes
    await done;
    const closing = t.writes[t.writes.length - 1];
    const frame = t.frameLines(t.writes[1]);
    // Climbs the region and the prompt row, clears, then writes the kept text.
    expect(t.up(closing)).toBe(frame - 1 + 1);
    const kept = closing.slice(closing.indexOf('\x1b[J') + 3);
    expect(kept).toContain('alpha');
    expect(kept).toContain('beta');
    // Static text: no key-hint header, no selection highlight.
    expect(kept).not.toContain('frodo explore');
    expect(kept).not.toContain('\x1b[7m');
    // The kept text ends on a fresh line so the prompt is redrawn below it.
    expect(kept.replace('\x1b[?25h', '').endsWith('\n')).toBe(true);
    expect(t.restored()).toBe(1);
  });

  it('q erases without leaving anything behind', async () => {
    const t = makeViewer();
    const done = t.viewer.explore({ alpha: 1, beta: 2 }, { atPrompt: true });
    t.key('q');
    await done;
    const closing = t.writes[t.writes.length - 1];
    const after = closing.slice(closing.indexOf('\x1b[J') + 3);
    expect(after).toBe('\x1b[?25h');
  });

  it('keeps only the rows in the window and says so when it is partial', async () => {
    const t = makeViewer(60);
    const done = t.viewer.explore(manyKeys, { atPrompt: false });
    t.key('G'); // scroll the window to the end
    t.key('\x1b');
    await done;
    const closing = t.writes[t.writes.length - 1];
    const kept = closing.slice(closing.indexOf('\x1b[J') + 3);
    expect(kept).toContain('key99');
    expect(kept).not.toContain('key0:');
    expect(kept).toMatch(/rows \d+-\d+ of 101/);
    // A script-opened viewer has no prompt row to restore.
    expect(t.restored()).toBe(0);
  });

  it('honors a configured body-row limit and never exceeds the terminal', () => {
    const t = makeViewer(40);
    void t.viewer.explore(manyKeys);
    expect(t.viewer.currentBodyRows()).toBe(MAX_BODY_ROWS);
    expect(t.viewer.setMaxBodyRows(8)).toBe(8);
    expect(t.frameLines(t.writes[t.writes.length - 1])).toBe(8 + 2);
    // Asking for more than fits is limited to the terminal height minus overhead.
    expect(t.viewer.setMaxBodyRows(500)).toBe(40 - 5);
    // Below the minimum is raised to it.
    expect(t.viewer.setMaxBodyRows(1)).toBe(3);
    t.key('q');
  });

  it('closes on Ctrl+O as well as q', async () => {
    const t = makeViewer();
    const done = t.viewer.explore({ a: 1 }, { atPrompt: true });
    t.key('\x0f');
    await done;
    expect(t.restored()).toBe(1);
  });
});

describe('ShellExploreOps collapsedPreview', () => {
  const limits = { maxKeys: 6, maxItems: 6, colors: false };

  it('collapses every nested container, however deep', () => {
    const out = collapsedPreview(
      { users: [{ name: 'alice' }], meta: { a: { b: { c: 1 } } }, n: 1 },
      limits
    );
    expect(out.text).toBe('{users: Array(1), meta: {…}, n: 1}');
    expect(out.hidden).toBe(true);
  });

  it('reports nothing hidden for a flat object of primitives', () => {
    const out = collapsedPreview({ flat: 1, name: 'x', ok: true }, limits);
    expect(out.text).toBe("{flat: 1, name: 'x', ok: true}");
    expect(out.hidden).toBe(false);
  });

  it('summarizes arrays with a length prefix and flags long ones as hidden', () => {
    expect(collapsedPreview([1, 2, 3], limits)).toEqual({
      text: '(3) [1, 2, 3]',
      hidden: false,
    });
    const long = collapsedPreview([1, 2, 3, 4, 5, 6, 7, 8], limits);
    expect(long.text).toBe('(8) [1, 2, 3, 4, 5, 6, …]');
    expect(long.hidden).toBe(true);
  });

  it('prints empty containers as themselves, with nothing hidden', () => {
    expect(collapsedPreview({}, limits)).toEqual({ text: '{}', hidden: false });
    expect(collapsedPreview([], limits)).toEqual({ text: '[]', hidden: false });
  });

  it('flags a cut long string as hidden', () => {
    const out = collapsedPreview({ s: 'x'.repeat(80) }, limits);
    expect(out.hidden).toBe(true);
    expect(out.text).toContain('…');
  });

  it('names class instances and treats Map/Set as counts', () => {
    class Widget {
      id = 1;
    }
    expect(collapsedPreview(new Widget(), limits).text).toBe('Widget {id: 1}');
    expect(collapsedPreview(new Map([[1, 2]]), limits).text).toBe('Map(1)');
    expect(collapsedPreview(new Set([1, 2]), limits).text).toBe('Set(2)');
  });

  it('survives a throwing getter', () => {
    const value = {
      get bad(): number {
        throw new Error('boom');
      },
    };
    const out = collapsedPreview(value, limits);
    expect(out.text).toBe('{bad: <throws>}');
    expect(out.hidden).toBe(true);
  });

  it('leaves errors, dates and regular expressions to their own rendering', () => {
    expect(isCollapsibleResult({ a: 1 })).toBe(true);
    expect(isCollapsibleResult([1])).toBe(true);
    expect(isCollapsibleResult(new Error('x'))).toBe(false);
    expect(isCollapsibleResult(new Date())).toBe(false);
    expect(isCollapsibleResult(/x/)).toBe(false);
    expect(isCollapsibleResult('text')).toBe(false);
  });
});

/**
 * The console evaluates user code in a separate vm context, so the values it
 * produces come from another realm: `value instanceof Map` against the host's
 * Map is false for them. Everything here builds its values in a real second
 * realm, which is the case same-realm literals silently skip.
 */
describe('ShellExploreOps with values from another realm', () => {
  const limits = { maxKeys: 6, maxItems: 6, colors: false };
  const make = (code: string): unknown => vm.runInNewContext(code);

  it('recognizes Map and Set as counts, not as plain objects', () => {
    expect(
      collapsedPreview(make('new Map([[1, 2]])') as object, limits).text
    ).toBe('Map(1)');
    expect(
      collapsedPreview(make('new Set([1, 2])') as object, limits).text
    ).toBe('Set(2)');
    const root = buildRoot(make('new Map([["k", {a: 1}]])'));
    expandNode(root);
    expect(root.children?.map((c) => c.key)).toEqual(["'k'"]);
  });

  it('leaves errors, dates and regular expressions to their own rendering', () => {
    expect(isCollapsibleResult(make('new Error("x")'))).toBe(false);
    expect(isCollapsibleResult(make('new Date()'))).toBe(false);
    expect(isCollapsibleResult(make('/x/'))).toBe(false);
    expect(isCollapsibleResult(make('({a: 1})'))).toBe(true);
  });

  it('does not offer a Promise for exploring', () => {
    expect(isExplorableValue(make('Promise.resolve(1)'))).toBe(false);
  });

  it('summarizes foreign Date, RegExp and Error values nested inside an object', () => {
    const out = collapsedPreview(
      make(
        '({when: new Date(0), re: /a+/g, err: new Error("boom")})'
      ) as object,
      limits
    );
    expect(out.text).toContain('re: /a+/g');
    expect(out.text).toContain('err: [Error: boom]');
    expect(out.text).not.toContain('{…}');
  });
});
