import { PassThrough } from 'node:stream';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { HistoryEntry } from './ShellHistoryOps';
import {
  createConsoleInput,
  scoreHistoryMatch,
  SearchHooks,
} from './ShellHistorySearchOps';

/**
 * The Ctrl+R search of the terminal console ranks with `scoreHistoryMatch`.
 * These tests pin the scoring rules and the list that the terminal console
 * builds from them.
 */

describe('scoreHistoryMatch', () => {
  it('scores an exact substring above everything else and names its characters', () => {
    expect(scoreHistoryMatch('abc', 'xxabcxx')).toEqual({
      score: 1007,
      indexes: [2, 3, 4],
    });
  });

  it('matches the characters of the query in order, not next to each other', () => {
    // a and b side by side (+1, +6), c after one skipped character (+1, -1)
    expect(scoreHistoryMatch('abc', 'abxc')).toEqual({
      score: 7,
      indexes: [0, 1, 3],
    });
  });

  it('takes the earliest place for each character', () => {
    // a at 0, then the first b after it (at 2), not the later one
    expect(scoreHistoryMatch('ab', 'axbxb')).toEqual({
      score: 1 + (1 - 1) - 2,
      indexes: [0, 2],
    });
  });

  it('subtracts the gap before every hit', () => {
    // a (+1); b after 1 skipped (+1 -1); c after 1 skipped (+1 -1)
    expect(scoreHistoryMatch('abc', 'axbxc')?.score).toBe(1);
    // a (+1); b after 3 skipped (+1 -3)
    expect(scoreHistoryMatch('ab', 'axxxb')?.score).toBe(-1);
  });

  it('subtracts the tail after the last hit', () => {
    // 7 for abxc, minus the 4 characters after the c
    expect(scoreHistoryMatch('abc', 'abxcyyyy')?.score).toBe(3);
  });

  it('does not match when a character is missing or comes too early', () => {
    expect(scoreHistoryMatch('abc', 'acb')).toBeNull();
    expect(scoreHistoryMatch('xyz', 'abc')).toBeNull();
    expect(scoreHistoryMatch('abcd', 'abc')).toBeNull();
    expect(scoreHistoryMatch('a', '')).toBeNull();
  });

  it('matches whatever the case of either side', () => {
    expect(scoreHistoryMatch('ABC', 'xabcx')).toEqual({
      score: 1005,
      indexes: [1, 2, 3],
    });
    expect(scoreHistoryMatch('aBc', 'A-b-C')).toEqual({
      score: 1,
      indexes: [0, 2, 4],
    });
  });

  it('matches every line when the query is empty, as an exact substring of none', () => {
    expect(scoreHistoryMatch('', 'anything')).toEqual({
      score: 1008,
      indexes: [],
    });
    expect(scoreHistoryMatch('', '')).toEqual({ score: 1000, indexes: [] });
  });

  it('matches letters outside ASCII, and counts positions in UTF-16 units', () => {
    expect(scoreHistoryMatch('é', 'café')).toEqual({
      score: 1004,
      indexes: [3],
    });
    expect(scoreHistoryMatch('CAFÉ', 'un café')).toEqual({
      score: 1007,
      indexes: [3, 4, 5, 6],
    });
    expect(scoreHistoryMatch('日本', 'run 日本語')?.indexes).toEqual([4, 5]);
    // an emoji is two units: found whole, and in a subsequence
    expect(scoreHistoryMatch('😀', 'say 😀')?.indexes).toEqual([4, 5]);
    expect(scoreHistoryMatch('ab', 'a😀b')?.indexes).toEqual([0, 3]);
    expect(scoreHistoryMatch('cafe', 'café')).toBeNull();
  });

  it('survives a line of a million characters, in bounded time', () => {
    const lines = [
      'a'.repeat(1_000_000),
      'ab'.repeat(500_000),
      `${'a'.repeat(999_999)}b`,
      '😀'.repeat(500_000),
    ];
    const queries = [
      `b${'a'.repeat(50)}`,
      `${'a'.repeat(5000)}b`,
      'abbbbbbbbbbbbbbbbbbbbbbbb',
      'zz',
      '😀a😀',
    ];
    const started = Date.now();
    for (const line of lines) {
      for (const query of queries) {
        const match = scoreHistoryMatch(query, line);
        expect(match === null || typeof match.score === 'number').toBe(true);
      }
    }
    // 20 scorings take a few milliseconds; this only catches a scorer that
    // is quadratic in the line (or throws), not a slow machine
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

/**
 * The console, driven the way a terminal drives it: bytes on a faked stdin,
 * the rendered frames collected from a faked stdout, the REPL's line buffer
 * (which holds the selection) collected from the hooks.
 */
describe('the Ctrl+R list of the terminal console', () => {
  const CTRL_R = '\x12';
  const DOWN = '\x1b[B';
  const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

  let stdin: PassThrough;
  let written: string[];
  let lines: string[];
  let teardown: (() => void) | undefined;

  beforeEach(() => {
    stdin = new PassThrough();
    written = [];
    lines = [];
    jest
      .spyOn(process, 'stdin', 'get')
      .mockReturnValue(stdin as unknown as typeof process.stdin);
    jest.spyOn(process.stdout, 'write').mockImplementation(((
      chunk: unknown
    ) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
  });

  afterEach(() => {
    teardown?.();
    teardown = undefined;
    jest.restoreAllMocks();
  });

  async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  /** Start the console on `history` (newest first) and open the search. */
  async function openSearch(history: HistoryEntry[]) {
    const search = createConsoleInput(() => history);
    const hooks: SearchHooks = {
      getLine: () => '',
      setLine: (line) => lines.push(line),
      refresh: () => undefined,
      sendEscape: () => undefined,
      onKeypress: () => undefined,
    };
    search.attachHooks(hooks);
    search.install();
    search.input.resume();
    teardown = () => search.close();
    await type(CTRL_R);
  }

  async function type(text: string): Promise<void> {
    stdin.write(text);
    await settle();
  }

  /** The last status line: the query, then `<cursor>/<total>`, or `no matches`. */
  function status(): string {
    const all = written.join('').replace(ANSI, '');
    const found = all.match(/\(fuzzy-search\)[^\n]*/g) ?? [];
    return found[found.length - 1] ?? '';
  }

  function total(): number | undefined {
    const counter = status().match(/ (\d+)\/(\d+)$/);
    return counter ? Number(counter[2]) : undefined;
  }

  /** The matches in the order of the list: walk down it with the arrow key. */
  async function ranked(query: string): Promise<string[]> {
    await type(query);
    const count = total() ?? 0;
    const order: string[] = [];
    for (let i = 0; i < count; i++) {
      order.push(lines[lines.length - 1]);
      await type(DOWN);
    }
    return order;
  }

  const entries = (...texts: string[]): HistoryEntry[] =>
    texts.map((text) => ({ text }));

  it('puts an exact substring above a subsequence, even a newer one', async () => {
    await openSearch(entries('x a b c', 'say abc please'));
    expect(await ranked('abc')).toEqual(['say abc please', 'x a b c']);
  });

  it('puts adjacent characters above scattered ones when the rest is no worse', async () => {
    // abxcyyyy: 7 for the pairs, 4 for the tail, 3 in all; axbxc: 1.
    // Without a bonus for neighbours the first would score -2 and lose.
    await openSearch(entries('axbxc', 'abxcyyyy'));
    expect(await ranked('abc')).toEqual(['abxcyyyy', 'axbxc']);
  });

  it('puts a short gap above a long one, the older entry above the newer', async () => {
    await openSearch(entries('axxxb', 'axb'));
    expect(await ranked('ab')).toEqual(['axb', 'axxxb']);
  });

  it('puts a short tail above a long one, the older entry above the newer', async () => {
    await openSearch(entries('axbyyyyy', 'axb'));
    expect(await ranked('ab')).toEqual(['axb', 'axbyyyyy']);
  });

  it('keeps entries of equal score newest first', async () => {
    await openSearch(entries('xa', 'ya', 'za', 'wa'));
    expect(await ranked('a')).toEqual(['xa', 'ya', 'za', 'wa']);
  });

  it('lists a duplicated entry once for each time it was run', async () => {
    await openSearch(entries('foo', 'bar', 'foo'));
    await type('foo');
    expect(total()).toBe(2);
  });

  it('shows at most 50 matches, the best of them', async () => {
    // 120 entries match; the oldest is the shortest, so the worst
    const history = entries(
      ...Array.from({ length: 119 }, (_, i) => `a-${i}-x`),
      'a'
    );
    await openSearch(history);
    const order = await ranked('a');
    expect(order).toHaveLength(50);
    expect(order).not.toContain('a');
    // an exact match scores 1000 plus the length of the line: the longest
    // lines first (as the web console's page has always ranked them), the
    // newest of those first
    expect(order[0]).toBe('a-100-x');
    expect(order[18]).toBe('a-118-x');
    expect(order[19]).toBe('a-10-x');
  });

  it('shows fewer than 50 when fewer match', async () => {
    await openSearch(entries('one', 'two', 'three'));
    await type('t');
    expect(total()).toBe(2);
  });

  it('lists the 50 newest entries when the query is empty', async () => {
    const history = entries(
      ...Array.from({ length: 120 }, (_, i) => `command-${i}`)
    );
    await openSearch(history);
    expect(total()).toBe(50);
    expect(lines[lines.length - 1]).toBe('command-0');
    // ... and not filtered by a query that was typed and erased again
    await type('zzz');
    expect(status()).toContain('no matches');
    await type('\x7f\x7f\x7f');
    expect(total()).toBe(50);
  });

  it('says so when nothing matches, and Enter then runs nothing', async () => {
    await openSearch(entries('one', 'two'));
    await type('zzz');
    expect(status()).toContain('no matches');
    const before = lines.length;
    await type('\r');
    // the draft is restored (an empty line), the search is closed
    expect(lines.slice(before)).toEqual(['']);
  });

  it('finds a word with an accent, typed as UTF-8, and no other', async () => {
    await openSearch(entries('cafe', 'café', 'tea'));
    await type('é');
    expect(total()).toBe(1);
    expect(lines[lines.length - 1]).toBe('café');
  });
});
