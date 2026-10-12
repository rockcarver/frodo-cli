import { afterEach, describe, expect, it } from '@jest/globals';
import {
  navigationMenuItems,
  renderNavigationMenu,
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
      'type filter',
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
      /^│ ↑↓ move · type filter · enter select · esc back out\s+│$/
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

afterEach(() => {
  // no module state to reset today; kept for symmetry with the other
  // zero-import module suites.
  expect(true).toBe(true);
});
