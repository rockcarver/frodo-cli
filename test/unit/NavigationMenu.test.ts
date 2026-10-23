import { afterEach, describe, expect, it } from '@jest/globals';
import {
  descriptionPanelLines,
  frameInnerWidth,
  frameStatusTitle,
  navigationMenuItems,
  renderFramedBox,
  renderNavigationMenu,
  stripAnsi,
  wrapLine,
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
      '[⏶⏷] move',
      'type to filter',
      '[ENTER] select',
      '[ESC] back out',
    ]);
  });

  it('right hint adds the segment item, bracketed', () => {
    const items = navigationMenuItems({
      filter: true,
      enter: 'select',
      right: '3 options',
    });
    expect(items.map((item) => `${item.keys} ${item.action}`)).toContain(
      '[⏵] 3 options'
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
    expect(labels).toContain('[space] select');
    expect(labels).toContain('[ENTER] commit');
    expect(labels).toContain('[⏴] back');
  });
});

describe('frameStatusTitle (the live dashboards’ title convention)', () => {
  it('joins heading main + muted suffixes with single spaces', () => {
    const { text, plain } = frameStatusTitle('Debugging journeys', [
      '(3 tracked)',
      '[journey~"demo"]',
    ]);
    expect(plain).toBe('Debugging journeys (3 tracked) [journey~"demo"]');
    // Jest runs NO_COLOR: the drawn text IS the plain text.
    expect(stripAnsi(text)).toBe(plain);
  });

  it('measures honest: the {text, plain} pair renders equal under stripAnsi', () => {
    // Force a non-NO_COLOR path by composing through the helper -- the
    // plain must always equal the stripped text, the invariant
    // renderFramedBox's wall math relies on (belt-and-braces per its
    // docs, but the helper's own contract is to keep them equal).
    const { text, plain } = frameStatusTitle('? Debugging oauth', [
      '(volker-dev · alpha)',
    ]);
    expect(stripAnsi(text)).toBe(plain);
  });

  it('empty suffixes yield just the main label', () => {
    const { text, plain } = frameStatusTitle('Event detail');
    expect(plain).toBe('Event detail');
    expect(stripAnsi(text)).toBe('Event detail');
  });

  it('feeds renderFramedBox with aligned walls', () => {
    const box = renderFramedBox({
      title: frameStatusTitle('Debugging journeys', ['(3 tracked)']),
      lines: [{ text: 'row', plain: 'row' }],
      width: 60,
    });
    const plain = box.split('\n').map(stripAnsi);
    const widths = plain.map((line) => [...line].length);
    expect(widths[0]).toBe(widths[1]);
    expect(widths[1]).toBe(widths[2]);
    expect(plain[0]).toMatch(/^┌ Debugging journeys \(3 tracked\) ─+┐$/);
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
      /^│ \[⏶⏷\] move · type to filter · \[ENTER\] select · \[ESC\] back out\s+│$/
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
    expect(stripAnsi(box.split('\n')[0])).toMatch(/^┌ Value for --retry ─+┐$/);
  });

  const frameWidths = (box: string) => [
    ...new Set(box.split('\n').map((line) => [...stripAnsi(line)].length)),
  ];

  it.each([20, 40, 120])(
    'keeps the silhouette at %i columns for rows with line breaks, tabs and overflow',
    (width) => {
      const hostile = 'line one\n\tindented line two\r\nline three';
      const box = renderFramedBox({
        title: 'A title',
        lines: [
          { text: 'fits', plain: 'fits' },
          { text: hostile, plain: hostile },
          { text: 'x'.repeat(200), plain: 'x'.repeat(200) },
          { text: '', plain: '' },
        ],
        width,
      });
      expect(frameWidths(box)).toEqual([width]);
      expect(box).not.toMatch(/[\t\r]/);
      for (const line of box.split('\n').slice(1, -1)) {
        expect(line).toMatch(/^│ .* │$/);
      }
      // Nothing is lost: the three lines of the hostile row survive.
      expect(box.replace(/[\s│]+/g, '')).toContain('lineone');
      expect(box.replace(/[\s│]+/g, '')).toContain('linethree');
    }
  );

  it('passes a row that fits through untouched, colors included', () => {
    const colored = '\x1b[36mcolored\x1b[39m row';
    const box = renderFramedBox({
      title: 'T',
      lines: [{ text: colored, plain: 'colored row' }],
      width: 40,
    });
    expect(box.split('\n')[1]).toBe(
      `│ ${colored}${' '.repeat(36 - 'colored row'.length)} │`
    );
  });

  it('trusts the drawn text over a plain that understates it', () => {
    const box = renderFramedBox({
      title: 'T',
      lines: [{ text: 'x'.repeat(100), plain: 'x' }],
      width: 40,
    });
    expect(frameWidths(box)).toEqual([40]);
  });

  it('keeps the walls aligned when plain overstates the drawn text', () => {
    const box = renderFramedBox({
      title: 'T',
      lines: [{ text: 'short', plain: 'y'.repeat(100) }],
      width: 40,
    });
    expect(frameWidths(box)).toEqual([40]);
  });

  it('wraps an overlong colored row to plain rows inside the frame', () => {
    const long = 'word '.repeat(20);
    const box = renderFramedBox({
      title: 'T',
      lines: [{ text: `\x1b[36m${long}\x1b[39m`, plain: long }],
      width: 40,
    });
    expect(box).not.toContain('\x1b');
    expect(frameWidths(box)).toEqual([40]);
  });

  it('cuts a title wider than the top bar with an ellipsis', () => {
    const box = renderFramedBox({
      title: {
        text: `\x1b[36m${'T'.repeat(100)}\x1b[39m`,
        plain: 'T'.repeat(100),
      },
      lines: [],
      width: 40,
    });
    const top = stripAnsi(box.split('\n')[0]);
    expect([...top].length).toBe(40);
    expect(top).toMatch(/^┌ T+… ┐$/);
  });

  it('stripAnsi removes SGR sequences only', () => {
    expect(stripAnsi('\x1b[36mtext\x1b[39m more')).toBe('text more');
    expect(stripAnsi('plain')).toBe('plain');
  });
});

describe('wrapLine / descriptionPanelLines (long descriptions)', () => {
  // The --type description that overflowed the options editor panel
  // (user report 2026-10-13): short enumerated rows, then one ~300-char
  // paragraph that pushed past the right wall.
  const DEPLOYMENT_TYPE_DESCRIPTION = [
    'Override auto-detected deployment type. Valid values for type:',
    'classic:  A classic Access Management-only deployment with custom layout and configuration.',
    'cloud:    A ForgeRock Identity Cloud environment.',
    'forgeops: A ForgeOps CDK or CDM deployment.',
    'The detected or provided deployment type controls certain behavior like obtaining an Identity Management admin token or not and whether to export/import referenced email templates or how to walk through the tenant admin login flow of Identity Cloud and handle MFA',
  ].join('\n');

  it('keeps a line that fits untouched', () => {
    expect(wrapLine('short line', 40)).toEqual(['short line']);
  });

  it('wraps on word boundaries, every row within the width', () => {
    const rows = wrapLine('one two three four five six seven eight', 15);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(15);
    expect(rows.join(' ')).toBe('one two three four five six seven eight');
  });

  it('repeats leading indentation on continuation rows', () => {
    const rows = wrapLine('    alpha beta gamma delta epsilon', 16);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      expect(row.startsWith('    ')).toBe(true);
      expect(row.length).toBeLessThanOrEqual(16);
    }
  });

  it('keeps aligned spacing between words across a wrap', () => {
    const rows = wrapLine(
      'cloud:    A ForgeRock Identity Cloud environment.',
      24
    );
    expect(rows[0]).toMatch(/^cloud:    A /);
  });

  it('hard-splits a word longer than a whole row', () => {
    const rows = wrapLine(`see ${'x'.repeat(30)} end`, 12);
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(12);
    expect(rows.join('').replace(/\s+/g, '')).toBe(`see${'x'.repeat(30)}end`);
  });

  it('measures the drawn text: ANSI is stripped before wrapping', () => {
    expect(wrapLine('\x1b[36mcolored\x1b[39m text', 40)).toEqual([
      'colored text',
    ]);
  });

  it('splits on line breaks (LF, CRLF, CR) and keeps blank lines', () => {
    expect(wrapLine('one\r\ntwo\rthree\n\nfour', 40)).toEqual([
      'one',
      'two',
      'three',
      '',
      'four',
    ]);
  });

  it('expands tabs so no control character reaches a frame', () => {
    expect(wrapLine('a\tb', 40)).toEqual(['a    b']);
  });

  it("keeps each line's own indentation (a stack trace)", () => {
    expect(
      wrapLine(
        'TypeError: boom\n\tat a.b.C(D.java:1)\n\tat e.f.G(H.java:2)',
        40
      )
    ).toEqual([
      'TypeError: boom',
      '    at a.b.C(D.java:1)',
      '    at e.f.G(H.java:2)',
    ]);
  });

  it('wraps a long indented stack frame with its indentation repeated', () => {
    const rows = wrapLine('\tat ' + 'word '.repeat(10), 20);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      expect(row.startsWith('    ')).toBe(true);
      expect(row.length).toBeLessThanOrEqual(20);
    }
  });

  it('drops an indent as wide as the row instead of splitting every word', () => {
    expect(wrapLine(`${' '.repeat(30)}alpha beta`, 20)).toEqual(['alpha beta']);
  });

  it('a trailing line break adds no row; empty text is one empty row', () => {
    expect(wrapLine('text\n', 40)).toEqual(['text']);
    expect(wrapLine('', 40)).toEqual(['']);
  });

  it('a long description keeps the panel walls aligned (the reported bug)', () => {
    const box = renderFramedBox({
      title: "? Optional options for 'list' (space to select):",
      lines: [
        { text: '○ › -m, --type <type>', plain: '○ › -m, --type <type>' },
        { text: '', plain: '' },
        ...descriptionPanelLines(DEPLOYMENT_TYPE_DESCRIPTION),
      ],
    });
    const plain = box.split('\n').map(stripAnsi);
    const widths = new Set(plain.map((line) => [...line].length));
    expect([...widths]).toEqual([120]);
    // Nothing was dropped: every word of the long paragraph survives.
    const body = plain.map((line) => line.replace(/^│ | *│$/g, '')).join(' ');
    expect(body.replace(/\s+/g, ' ')).toContain(
      'tenant admin login flow of Identity Cloud and handle MFA'
    );
  });

  it('wraps to a narrower frame width too', () => {
    const rows = descriptionPanelLines(DEPLOYMENT_TYPE_DESCRIPTION, 60);
    for (const row of rows) {
      expect(row.plain.length).toBeLessThanOrEqual(frameInnerWidth(60));
    }
  });
});

afterEach(() => {
  // no module state to reset today; kept for symmetry with the other
  // zero-import module suites.
  expect(true).toBe(true);
});
