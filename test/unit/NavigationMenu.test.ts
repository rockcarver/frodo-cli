import { afterEach, describe, expect, it } from '@jest/globals';
import {
  navigationMenuItems,
  renderFramedBox,
  renderNavigationMenu,
  stripAnsi,
} from '../../src/utils/interactive/NavigationMenu';

/**
 * Jest runs NO_COLOR, so renderNavigationMenu's colored text measures
 * with ANSI codes stripped -- the plain-width math is what these tests
 * pin (walls aligned, items present/absent by affordance).
 */
describe('navigationMenuItems (affordance-driven)', () => {
  it('select prompt: move/filter/enter/esc, no space, no left', () => {
    const items = navigationMenuItems({
      filter: true,
      enter: 'select',
      escape: 'back out',
    });
    expect(items.map((item) => `${item.keys} ${item.action}`)).toEqual([
      '↑↓ move',
      'type to filter',
      'enter select',
      'esc back out',
    ]);
  });

  it('right hint adds the segment item, arrow prefix stripped', () => {
    const items = navigationMenuItems({
      filter: true,
      enter: 'select',
      right: '3 options to configure',
    });
    expect(items.map((item) => `${item.keys} ${item.action}`)).toContain(
      '→ 3 options to configure'
    );
  });

  it('multi-select: space + left, enter reads commit', () => {
    const items = navigationMenuItems({
      filter: true,
      space: 'select',
      enter: 'commit',
      left: true,
    });
    const labels = items.map((item) => `${item.keys} ${item.action}`);
    expect(labels).toContain('space select');
    expect(labels).toContain('enter commit');
    expect(labels).toContain('← back');
  });
});

describe('renderNavigationMenu (box layout)', () => {
  it('aligns the walls across top, body, and bottom', () => {
    const box = renderNavigationMenu(
      navigationMenuItems({ filter: true, enter: 'select' }),
      120
    );
    const lines = box.split('\n');
    expect(lines).toHaveLength(3);
    const plain = lines.map((line) =>
      // eslint-disable-next-line no-control-regex
      line.replace(/\x1b\[[0-9;]*m/g, '')
    );
    const widths = plain.map((line) => [...line].length);
    expect(widths[0]).toBe(widths[1]);
    expect(widths[1]).toBe(widths[2]);
    expect(plain[0]).toMatch(/^┌ Navigate ─+┐$/);
    expect(plain[1]).toMatch(
      /^│ ↑↓ move · type to filter · enter select · esc back out\s+│$/
    );
    expect(plain[2]).toMatch(/^└─+┘$/);
  });

  it('wraps items onto multiple rows when they exceed the width', () => {
    const box = renderNavigationMenu(
      navigationMenuItems({
        filter: true,
        space: 'select',
        enter: 'commit',
        left: true,
      }),
      40
    );
    const lines = box.split('\n');
    // Title + at least two body rows + bottom: more than 3 lines.
    expect(lines.length).toBeGreaterThan(3);
    const plain = lines.map((line) =>
      // eslint-disable-next-line no-control-regex
      line.replace(/\x1b\[[0-9;]*m/g, '')
    );
    for (const line of plain) {
      expect([...line].length).toBeLessThanOrEqual(40);
    }
  });

  it('empty items render as an empty string', () => {
    expect(renderNavigationMenu([], 120)).toBe('');
  });
});

describe('renderFramedBox (the shared panel renderer)', () => {
  it('pads the title on both sides and aligns walls', () => {
    const box = renderFramedBox({
      title: { text: '? question', plain: '? question' },
      lines: [{ text: 'row', plain: 'row' }],
      width: 40,
    });
    const plain = box.split('\n').map(stripAnsi);
    const widths = plain.map((line) => [...line].length);
    expect(widths[0]).toBe(widths[1]);
    expect(widths[1]).toBe(widths[2]);
    // One space between wall and title content on BOTH sides -- the
    // Navigate menu's convention, uniform across every box.
    expect(plain[0]).toMatch(/^┌ \? question ─+┐$/);
    expect(plain[1]).toMatch(/^│ row\s+│$/);
  });

  it('measures a colored title on its PLAIN text (walls stay aligned)', () => {
    const colored = '\x1b[36m? colored\x1b[39m';
    const box = renderFramedBox({
      title: { text: colored, plain: '? colored' },
      lines: [],
      width: 30,
    });
    const plain = box.split('\n').map(stripAnsi);
    const widths = plain.map((line) => [...line].length);
    expect(widths[0]).toBe(widths[2]);
    expect(plain[0]).toMatch(/^┌ \? colored ─+┐$/);
  });

  it('measures the title on its own TEXT even when plain diverges', () => {
    // THE BARE-STUB PICKER BUG (user report 2026-10-12): the colored
    // title lacked the query echo while the measured plain carried it,
    // so the top wall came out 14 short (' query: config' long). The
    // renderer now measures the DRAWN text -- a divergent plain can no
    // longer skew the walls.
    const box = renderFramedBox({
      title: {
        text: `\x1b[36m?\x1b[39m Choose: \x1b[36m query: config\x1b[39m`,
        plain: `? Choose:`,
      },
      lines: [{ text: '› config', plain: '› config' }],
      width: 60,
    });
    const plain = box.split('\n').map(stripAnsi);
    const widths = plain.map((line) => [...line].length);
    expect(widths[0]).toBe(widths[1]);
    expect(widths[1]).toBe(widths[2]);
    expect(plain[0]).toMatch(/^┌ \? Choose:  query: config ─+┐$/);
  });

  it('accepts a plain-string title', () => {
    const box = renderFramedBox({
      title: 'Value for --retry',
      lines: [{ text: '› nothing', plain: '› nothing' }],
      width: 40,
    });
    expect(stripAnsi(box.split('\n')[0])).toMatch(
      /^┌ Value for --retry ─+┐$/
    );
  });

  it('stripAnsi removes SGR sequences only', () => {
    expect(stripAnsi('\x1b[36mtext\x1b[39m more')).toBe('text more');
    expect(stripAnsi('plain')).toBe('plain');
  });
});

afterEach(() => {
  // no module state to reset today; kept for symmetry with the other
  // zero-import module suites.
  expect(true).toBe(true);
});
