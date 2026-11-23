import { PassThrough } from 'node:stream';
import vm from 'node:vm';
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
import { renderConsolePage } from './ShellWebPage';

/**
 * The Ctrl+R search of the terminal console and the history search of the
 * web console's page rank with ONE scorer, `scoreHistoryMatch`: the page
 * carries the source of that function. The rules are those of the package
 * that the terminal console used before (`fuzzysort`) where users met them:
 * a space in the query separates words that may match in any order, and of
 * two exact matches the shorter line ranks first. These tests pin the
 * scoring rules, the list that the terminal console builds from them, and
 * that the page runs the very same text.
 */

describe('scoreHistoryMatch', () => {
  it('scores an exact substring above everything else and names its characters', () => {
    // 1000, plus 6 for each character of the query, minus the length of the line
    expect(scoreHistoryMatch('abc', 'xxabcxx')).toEqual({
      score: 1000 + 18 - 7,
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
      score: 1000 + 18 - 5,
      indexes: [1, 2, 3],
    });
    expect(scoreHistoryMatch('aBc', 'A-b-C')).toEqual({
      score: 1,
      indexes: [0, 2, 4],
    });
  });

  it('matches every line, marks nothing and scores alike when the query has no word', () => {
    // equal scores keep the history in order: the newest entry first
    for (const query of ['', ' ', '   ', '\t \n']) {
      expect(scoreHistoryMatch(query, 'anything')).toEqual({
        score: 0,
        indexes: [],
      });
      expect(scoreHistoryMatch(query, '')).toEqual({ score: 0, indexes: [] });
    }
  });

  it('ranks the shorter of two exact matches first', () => {
    // 1000 + 24 - 15, and 1000 + 24 - 24
    expect(scoreHistoryMatch('list', 'frodo conn list')?.score).toBe(1009);
    expect(scoreHistoryMatch('list', 'frodo esv secret list -l')?.score).toBe(
      1000
    );
  });

  it('ranks an exact match above a subsequence however long the line is', () => {
    const exact = scoreHistoryMatch('ab', `${'x'.repeat(2000)}ab`);
    const scattered = scoreHistoryMatch('ab', 'a-b');
    // the length counts up to 999 characters: 1000 + 12 - 999
    expect(exact?.score).toBe(13);
    expect(scattered?.score).toBe(1);
  });

  it('matches letters outside ASCII, and counts positions in UTF-16 units', () => {
    expect(scoreHistoryMatch('é', 'café')).toEqual({
      score: 1000 + 6 - 4,
      indexes: [3],
    });
    expect(scoreHistoryMatch('CAFÉ', 'un café')).toEqual({
      score: 1000 + 24 - 7,
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
      'b a b a b a',
      `a ${'b'.repeat(2000)}`,
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

describe('scoreHistoryMatch with several words', () => {
  // 22 characters: frodo(0-4) config(6-11) export(13-18) -A(20-21)
  const line = 'frodo config export -A';

  it('finds the words in any order, and marks all of them', () => {
    // each word is an exact match: 1000 + 36 - 22
    const marks = [6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18];
    expect(scoreHistoryMatch('export config', line)).toEqual({
      score: 2028,
      indexes: marks,
    });
    expect(scoreHistoryMatch('config export', line)).toEqual({
      score: 2028,
      indexes: marks,
    });
  });

  it('adds up the score of each word, an exact word above a fuzzy one', () => {
    // cnf is not in the line as it stands: c (+1, -6 skipped), n (+1, -1),
    // f next to the n (+6), 12 characters of tail: -11; export: 1014
    expect(scoreHistoryMatch('cnf export', line)).toEqual({
      score: 1003,
      indexes: [6, 8, 9, 13, 14, 15, 16, 17, 18],
    });
  });

  it('needs every word to match', () => {
    expect(scoreHistoryMatch('export nothing', line)).toBeNull();
    expect(scoreHistoryMatch('nothing export', line)).toBeNull();
    expect(scoreHistoryMatch('export config zzz', line)).toBeNull();
  });

  it('does not match a word that is longer than the line', () => {
    expect(scoreHistoryMatch('abcdef x', 'abc x')).toBeNull();
    expect(scoreHistoryMatch('a toolongword', 'a')).toBeNull();
    expect(scoreHistoryMatch('abcdef', 'abc')).toBeNull();
  });

  it('counts a repeated word each time and does not need it twice in the line', () => {
    // 2 x (1000 + 12 - 6)
    expect(scoreHistoryMatch('ab ab', 'xxabxx')).toEqual({
      score: 2012,
      indexes: [2, 3],
    });
  });

  it('lets words overlap and marks each character once', () => {
    // 2 x (1000 + 18 - 4)
    expect(scoreHistoryMatch('abc bcd', 'abcd')).toEqual({
      score: 2028,
      indexes: [0, 1, 2, 3],
    });
  });

  it('ignores the case of the words, and any run or kind of white space between them', () => {
    const plain = scoreHistoryMatch('export config', line);
    expect(plain).not.toBeNull();
    expect(scoreHistoryMatch('EXPORT Config', line)).toEqual(plain);
    expect(scoreHistoryMatch('  export \t config\n ', line)).toEqual(plain);
  });

  it('matches words outside ASCII, an emoji and a word that is a subsequence', () => {
    // 日本: 1000 + 12 - 7, 語: 1000 + 6 - 7
    expect(scoreHistoryMatch('日本 語', 'run 日本語')).toEqual({
      score: 2004,
      indexes: [4, 5, 6],
    });
    // é: 1000 + 6 - 4, caf: 1000 + 18 - 4
    expect(scoreHistoryMatch('é CAF', 'café')).toEqual({
      score: 2016,
      indexes: [0, 1, 2, 3],
    });
    // the emoji (two units): 1000 + 12 - 4; ab as a subsequence: a +1, b +1 -2
    expect(scoreHistoryMatch('😀 ab', 'a😀b')).toEqual({
      score: 1008,
      indexes: [0, 1, 2, 3],
    });
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

  it('puts the shorter of two exact matches first, the older entry above the newer', async () => {
    await openSearch(entries('frodo esv secret list -l', 'frodo conn list'));
    expect(await ranked('list')).toEqual([
      'frodo conn list',
      'frodo esv secret list -l',
    ]);
  });

  it('finds the words of the query in any order', async () => {
    await openSearch(
      entries('frodo journey list', 'frodo config export -A', 'ls')
    );
    expect(await ranked('export config')).toEqual(['frodo config export -A']);
  });

  it('needs every word of the query, and a space after the last one adds none', async () => {
    await openSearch(
      entries('frodo journey list', 'frodo config export -A', 'ls')
    );
    await type('frodo zzz');
    expect(status()).toContain('no matches');
    await type('\x7f\x7f\x7f');
    expect(total()).toBe(2);
    await type('\x7f\x7f\x7f\x7f\x7f\x7f');
    expect(await ranked('list ')).toEqual(['frodo journey list']);
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
    // 120 entries match; the oldest is the shortest, so the best
    const history = entries(
      ...Array.from({ length: 119 }, (_, i) => `a-${i}-x`),
      'a'
    );
    await openSearch(history);
    const order = await ranked('a');
    expect(order).toHaveLength(50);
    // the shorter the line the better: 'a' (the oldest), the ten of 5
    // characters, then those of 6 characters, the newest of them first; the
    // limit cuts the rest, not the best
    expect(order[0]).toBe('a');
    expect(order[1]).toBe('a-0-x');
    expect(order[10]).toBe('a-9-x');
    expect(order[11]).toBe('a-10-x');
    expect(order[49]).toBe('a-48-x');
    expect(order).not.toContain('a-49-x');
    expect(order).not.toContain('a-100-x');
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

  it('lists the 50 newest entries, as for an empty query, when the query is only spaces', async () => {
    const history = entries(
      ...Array.from({ length: 120 }, (_, i) => `command-${i}`)
    );
    await openSearch(history);
    await type('  ');
    expect(total()).toBe(50);
    expect(lines[lines.length - 1]).toBe('command-0');
    // the list is the newest 50 in order of age
    const order = await ranked('');
    expect(order).toHaveLength(50);
    expect(order[0]).toBe('command-0');
    expect(order[49]).toBe('command-49');
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

describe('the history search of the web console page', () => {
  const page = renderConsolePage({ nonce: 'abc', csrf: 'def' });

  /** The text between the two marks that the page carries around the scorer. */
  function carriedText(): string {
    const [, afterBegin] = page.split('// history-score:begin');
    const [carried] = (afterBegin ?? '').split('// history-score:end');
    if (!carried) throw new Error('the page does not carry the scorer');
    return carried;
  }

  /** A repeatable corpus: random lines, and queries cut out of them. */
  function corpus(): [string, string][] {
    let seed = 20261122;
    const next = (bound: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return Math.floor((seed / 4294967296) * bound);
    };
    const alphabet = [...'abcdeABCDE  \t--__//..xyz019é日😀'];
    const pick = () => alphabet[next(alphabet.length)];
    const pairs: [string, string][] = [
      ['', ''],
      ['', 'a'],
      ['a', ''],
      ['abc', 'abc'],
      ['ABC', 'abc'],
      ['😀', '😀'],
      ['é', 'café'],
      ['i', 'İstanbul'],
      [' ', 'a b'],
      ['b a', 'a b'],
      ['a  a', 'a'],
      ['\tÉ\n😀', 'café 😀'],
    ];
    for (let n = 0; n < 500; n++) {
      const line = Array.from({ length: next(40) }, pick).join('');
      let query: string;
      switch (n % 5) {
        case 0: // unrelated
          query = Array.from({ length: 1 + next(4) }, pick).join('');
          break;
        case 1: // a piece of the line
          query = line.slice(next(line.length + 1), 1 + next(line.length + 1));
          break;
        case 2: // the line with characters dropped: a subsequence
          query = [...line].filter(() => next(3) > 0).join('');
          break;
        case 3: // the line with the case changed
          query = [...line]
            .map((c) => (next(2) ? c.toUpperCase() : c))
            .join('');
          break;
        default: {
          // two pieces of the line, the second one first
          const cut = next(line.length + 1);
          query = `${line.slice(cut, cut + 1 + next(6))} ${line.slice(0, next(cut + 1))}`;
        }
      }
      pairs.push([query, line]);
    }
    return pairs;
  }

  it('carries the text of the scorer of the terminal console', () => {
    expect(carriedText()).toContain(scoreHistoryMatch.toString());
  });

  it('scores 500 queries the way the terminal console does', () => {
    const scoreMatch = vm.runInNewContext(`${carriedText()}\nscoreMatch`);
    const pairs = corpus();
    expect(pairs.length).toBeGreaterThanOrEqual(500);
    let matches = 0;
    let words = 0;
    for (const [query, line] of pairs) {
      const expected = scoreHistoryMatch(query, line);
      // the page's function lives in another realm: compare as JSON
      expect(JSON.stringify(scoreMatch(query, line))).toBe(
        JSON.stringify(expected)
      );
      if (expected) matches += 1;
      if (expected && /\S\s+\S/.test(query)) words += 1;
    }
    // a corpus where nothing, or everything, matches proves nothing
    expect(matches).toBeGreaterThan(100);
    expect(pairs.length - matches).toBeGreaterThan(50);
    // ... and one where queries of several words match
    expect(words).toBeGreaterThan(50);
  });

  it('asks that scorer for the score and for the characters to mark', () => {
    expect(page).toMatch(/var m = scoreMatch\(query, history\[i\]\.text\);/);
    expect(page).toMatch(/hits\.push\(\{ idx: i, score: m\.score \}\)/);
    expect(page).toMatch(/m \? m\.indexes : \[\]/);
  });
});
