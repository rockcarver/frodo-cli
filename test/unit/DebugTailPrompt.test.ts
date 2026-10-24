import { afterEach, describe, expect, it } from '@jest/globals';
import {
  appendTailEvent,
  buildTailRows,
  formatTailTimestamp,
  resolveFollowCursor,
} from '../../src/utils/interactive/DebugTailPrompt';

/**
 * Jest runs NO_COLOR, so the colored render equals its plain text --
 * these tests pin the plain-width math (the same discipline as
 * NavigationMenu.test.ts): rows fit the width, the timestamp column is
 * stable, and the follow cursor behaves like `tail -f`.
 */
describe('formatTailTimestamp', () => {
  it('keeps only HH:MM:SS from an ISO timestamp', () => {
    expect(formatTailTimestamp('2026-10-15T01:23:45.678Z')).toBe('01:23:45');
  });

  it('handles a space-separated timestamp too', () => {
    expect(formatTailTimestamp('2026-10-15 01:23:45')).toBe('01:23:45');
  });

  it('renders a placeholder when the timestamp is missing', () => {
    expect(formatTailTimestamp(undefined)).toBe('--:--:--');
  });

  it('passes through a value that is not an ISO timestamp', () => {
    expect(formatTailTimestamp('unknown-shape')).toBe('unknown-shape');
  });
});

describe('appendTailEvent (ring buffer)', () => {
  it('appends in order below the cap', () => {
    const buffer = [{ line: 'one' }, { line: 'two' }];
    const next = appendTailEvent(buffer, { line: 'three' }, 5);
    expect(next.map((e) => e.line)).toEqual(['one', 'two', 'three']);
  });

  it('drops the OLDEST past the cap (latest wins)', () => {
    let buffer = [{ line: 'a' }, { line: 'b' }, { line: 'c' }];
    for (let i = 0; i < 3; i++) {
      buffer = appendTailEvent(buffer, { line: `n${i}` }, 4);
    }
    expect(buffer.map((e) => e.line)).toEqual(['c', 'n0', 'n1', 'n2']);
  });

  it('never mutates the input buffer', () => {
    const original = [{ line: 'a' }];
    const next = appendTailEvent(original, { line: 'b' }, 2);
    expect(original).toHaveLength(1);
    expect(next).toHaveLength(2);
  });
});

describe('resolveFollowCursor (tail -f follow semantics)', () => {
  it('a following cursor keeps the follow sentinel (-1) when events append', () => {
    // wasAtBottom=true -> still -1: staying the sentinel is what makes the
    // render's `cursorIndex === -1` check honest (the v3 re-record caught
    // the earlier version converting it to a numeric bottom index, which
    // stranded the '(reviewing history)' indicator forever).
    expect(resolveFollowCursor(true, 10, -1)).toBe(-1);
  });

  it('a detached cursor stays put when events append', () => {
    expect(resolveFollowCursor(false, 10, 3)).toBe(3);
  });

  it('a detached cursor clamps when the buffer ring dropped rows', () => {
    // Buffer capped at 10; the cursor sat at index 3 of 10 but 5 events
    // arrived and 5 old dropped -- it must clamp to the new last row.
    expect(resolveFollowCursor(false, 10, 12)).toBe(9);
  });
});

describe('buildTailRows (panel rendering)', () => {
  it('prefixes the muted timestamp column on the first row of each event', () => {
    const rows = buildTailRows(
      [{ timestamp: '2026-10-15T01:23:45Z', line: 'OAuth2 GET /x → 200' }],
      10,
      116
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].plain).toBe('01:23:45 OAuth2 GET /x → 200');
  });

  it('indents continuation rows past the timestamp column', () => {
    const longLine = 'OAuth2 GET /very/long/path '.repeat(12).trim();
    const rows = buildTailRows(
      [{ timestamp: '2026-10-15T01:23:45Z', line: longLine }],
      10,
      60
    );
    expect(rows.length).toBeGreaterThan(1);
    // Every continuation row is exactly 11 spaces of indent + content.
    for (const row of rows.slice(1)) {
      expect(row.plain.startsWith(' '.repeat(11))).toBe(true);
    }
    // Re-joining all rows recovers the full line's content.
    const rejoined = rows
      .map((r) => r.plain.slice(11))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    expect(rejoined).toContain('OAuth2 GET /very/long/path');
  });

  describe('without an explicit inner width', () => {
    const isTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    const columns = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    const restore = (key: string, descriptor?: PropertyDescriptor) => {
      if (descriptor) Object.defineProperty(process.stdout, key, descriptor);
      else delete (process.stdout as unknown as Record<string, unknown>)[key];
    };
    afterEach(() => {
      restore('isTTY', isTTY);
      restore('columns', columns);
    });
    const setTerminal = (cols: number | undefined, tty: boolean) => {
      Object.defineProperty(process.stdout, 'columns', {
        configurable: true,
        value: cols,
      });
      Object.defineProperty(process.stdout, 'isTTY', {
        configurable: true,
        value: tty,
      });
    };
    const rowsFor = (line: string) =>
      buildTailRows([{ timestamp: '2026-10-15T01:23:45Z', line }]).length;

    it('defaults to the 120-column frame (116 inside) when stdout is not a terminal', () => {
      setTerminal(200, false);
      const fits = 'x'.repeat(116 - 11); // timestamp column + text exactly fills the row
      expect(rowsFor(fits)).toBe(1);
      expect(rowsFor(fits + 'y')).toBe(2);
    });

    it("defaults to the terminal's frame width on a terminal", () => {
      setTerminal(80, true);
      const fits = 'x'.repeat(76 - 11);
      expect(rowsFor(fits)).toBe(1);
      expect(rowsFor(fits + 'y')).toBe(2);
    });
  });

  it('keeps every row within the given inner width', () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      timestamp: '2026-10-15T01:23:4' + i + 'Z',
      line: `event ${i} ` + 'x'.repeat(120),
    }));
    const rows = buildTailRows(events, 20, 60);
    for (const row of rows) {
      expect(row.plain.length).toBeLessThanOrEqual(60);
    }
  });

  it('a multi-line event (stack trace) never carries a control character into a row', () => {
    const line =
      'ERROR ScriptEvaluator: TypeError: boom\n\tat java.base/java.util.concurrent.FutureTask.report(FutureTask.java:124)\n\nCaused by: x';
    const rows = buildTailRows(
      [{ timestamp: '2026-10-15T01:23:45Z', line }],
      20,
      60
    );
    for (const row of rows) {
      expect(row.plain).not.toMatch(/[\t\r\n]/);
      expect(row.plain.length).toBeLessThanOrEqual(60);
    }
    expect(rows[0].plain).toBe(
      '01:23:45 ERROR ScriptEvaluator: TypeError: boom'
    );
    // The tab-indented frame keeps its indentation past the timestamp column.
    expect(rows.some((row) => /^ {11} {4}at(?: |$)/.test(row.plain))).toBe(
      true
    );
    // The blank line survives as a blank row; the cause is not lost.
    expect(rows.some((row) => row.plain.trim() === '')).toBe(true);
    expect(rows.some((row) => row.plain.includes('Caused by: x'))).toBe(true);
  });

  it('returns at most `limit` visual rows ending at the newest event', () => {
    const events = Array.from({ length: 30 }, (_, i) => ({
      line: `event ${i}`,
    }));
    const rows = buildTailRows(events, 10, 116);
    expect(rows).toHaveLength(10);
    expect(rows[rows.length - 1].plain).toContain('event 29');
  });

  it('a detached window ends at the given index (review history, not the tail)', () => {
    // The v3 re-record caught this live (2026-10-15): the review window
    // used to ignore the cursor entirely -- the newest rows kept sliding
    // in UNDER the '(reviewing history)' indicator.
    const events = Array.from({ length: 30 }, (_, i) => ({
      line: `event ${i}`,
    }));
    const rows = buildTailRows(events, 10, 116, 5);
    expect(rows).toHaveLength(6); // only events 0..5 exist in the window
    expect(rows[rows.length - 1].plain).toContain('event 5');
    expect(rows.map((r) => r.plain).join(' ')).not.toContain('event 29');
  });

  it('an out-of-range window index clamps to the newest event', () => {
    const events = Array.from({ length: 30 }, (_, i) => ({
      line: `event ${i}`,
    }));
    const rows = buildTailRows(events, 10, 116, 999);
    expect(rows[rows.length - 1].plain).toContain('event 29');
  });

  it('renders no rows for an empty buffer', () => {
    expect(buildTailRows([], 10)).toEqual([]);
  });
});
