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
  createHistoryScorer,
  SearchHooks,
} from './ShellHistorySearchOps';
import { renderConsolePage } from './ShellWebPage';

/**
 * The Ctrl+R search of the terminal console and the history search of the
 * web console's page rank with ONE scorer, `createHistoryScorer`: the page
 * carries the source of that function. The rules are those of the package
 * that the terminal console used before (`fuzzysort`) where users met them:
 * a space in the query separates words that may match in any order, and of
 * two exact matches the shorter line ranks first. The letters are matched as
 * typed (the package also matched `cafe` to `café`; the scorer does not).
 * These tests pin the scoring rules, the list that the terminal console
 * builds from them, and that the page runs the very same text and builds its
 * own list from it the same way.
 */

/** The score of one line for one query: what most tests below ask for. */
function scoreHistoryMatch(query: string, line: string) {
  return createHistoryScorer(query)(line, true);
}

/**
 * The oracle: the scorer as it was while it still read the query anew for
 * every line (and left the search for a word in a line to `indexOf`). The
 * scorer that reads the query once must give its score and its marks for
 * every pair.
 */
function referenceScore(
  query: string,
  line: string
): { score: number; indexes: number[] } | null {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const t = line.toLowerCase();
  const marked = new Set<number>();
  let score = 0;
  for (const q of words) {
    const direct = t.indexOf(q);
    if (direct !== -1) {
      for (let k = 0; k < q.length; k++) marked.add(direct + k);
      score += 1000 + 6 * q.length - Math.min(line.length, 999);
      continue;
    }
    let pos = 0;
    let last = -2;
    for (let i = 0; i < q.length; i++) {
      const at = t.indexOf(q[i], pos);
      if (at === -1) return null;
      marked.add(at);
      score += at === last + 1 ? 6 : 1;
      score -= Math.max(0, at - pos);
      last = at;
      pos = at + 1;
    }
    score -= Math.max(0, line.length - pos);
  }
  return { score, indexes: Array.from(marked).sort((x, y) => x - y) };
}

/** A repeatable stream of numbers below `bound`. */
function randomBelow(start: number) {
  let seed = start;
  return (bound: number) => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return Math.floor((seed / 4294967296) * bound);
  };
}

/** A repeatable corpus: random lines, and queries cut out of them. */
function corpus(): [string, string][] {
  const next = randomBelow(20261122);
  const alphabet = [...'abcdeABCDE  \t--__//..xyz019é日😀'];
  const pick = () => alphabet[next(alphabet.length)];
  const pairs: [string, string][] = [
    ['', ''],
    ['', 'a'],
    ['a', ''],
    ['abc', 'abc'],
    ['ABC', 'abc'],
    ['😀', '😀'],
    ['é', 'café'],
    ['i', 'İstanbul'],
    [' ', 'a b'],
    ['b a', 'a b'],
    ['a  a', 'a'],
    ['\tÉ\n😀', 'café 😀'],
    ['ab ab ab', 'xxabxx'],
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
        query = [...line].map((c) => (next(2) ? c.toUpperCase() : c)).join('');
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

/**
 * Lines and words that are long, on a small alphabet so that they repeat
 * themselves: the word times the line is above what `indexOf` is trusted
 * with, where the scorer searches for an exact word another way.
 */
function longCorpus(): [string, string][] {
  const next = randomBelow(1123);
  const pairs: [string, string][] = [];
  for (let n = 0; n < 200; n++) {
    const alphabet = n % 3 === 0 ? 'ab' : n % 3 === 1 ? 'abc' : 'aab';
    const line = Array.from(
      { length: 400 + next(300) },
      () => alphabet[next(alphabet.length)]
    ).join('');
    const length = 260 + next(140);
    const start = next(line.length - length + 1);
    let word = line.slice(start, start + length);
    switch (n % 4) {
      case 1: // one character changed: mostly not in the line, a subsequence
        word = `${word.slice(0, 100)}${word[100] === 'a' ? 'b' : 'a'}${word.slice(101)}`;
        break;
      case 2: // the start of the word, and then the start again: a border
        word = `${word.slice(0, 130)}${word.slice(0, 130)}`;
        break;
      case 3: // a run, and one more character
        word = `${alphabet[0].repeat(length - 1)}${alphabet[alphabet.length - 1]}`;
        break;
      default:
    }
    pairs.push([word, line]);
  }
  // Fibonacci words, which are full of their own starts: a word and a line
  // that hold the partial matches (and the starts of matches inside partial
  // matches) that a search for a word must not lose
  const fibonacci = (length: number) => {
    let previous = 'a';
    let word = 'ab';
    while (word.length < length) [previous, word] = [word, word + previous];
    return word.slice(0, length);
  };
  // Around the two rules that choose the search: a word of more than 300
  // characters, and a word times a line above 100,000 (at it and one over,
  // with the word at the start, in the middle, at the end, and not in the line)
  const edges: [number, number][] = [
    [299, 335],
    [299, 334],
    [300, 333],
    [300, 334],
    [301, 332],
    [301, 333],
    [302, 331],
    [302, 332],
    [400, 250],
    [400, 251],
    [1000, 100],
    [1000, 101],
    [301, 1000],
    [300, 1000],
    [5, 20000],
    [5, 20001],
  ];
  for (const [wordLength, lineLength] of edges) {
    const line = Array.from({ length: lineLength }, () => 'ab'[next(2)]).join(
      ''
    );
    for (const at of [
      0,
      Math.floor((lineLength - wordLength) / 2),
      lineLength - wordLength,
    ]) {
      const word = line.slice(at, at + wordLength);
      pairs.push([word, line]);
      pairs.push([
        `${word.slice(0, -1)}${word.endsWith('a') ? 'b' : 'a'}`,
        line,
      ]);
    }
  }
  for (let n = 0; n < 90; n++) {
    const line = fibonacci(1100).slice(next(100));
    const length = 260 + next(140);
    const start = next(line.length - length + 1);
    let word = line.slice(start, start + length);
    if (n % 3 === 1) word = fibonacci(length);
    if (n % 3 === 2) {
      // the last character changed: it is not in the line, after a long match
      word = `${word.slice(0, -1)}${word.endsWith('a') ? 'b' : 'a'}`;
    }
    pairs.push([word, line]);
  }
  return pairs;
}

/** The milliseconds of the quickest of some runs (three, or as many as asked). */
function quickest(run: () => void, runs = 3): number {
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const started = performance.now();
    run();
    best = Math.min(best, performance.now() - started);
  }
  return best;
}

/** The text of the page between the two marks around the search code. */
let pageSearchText: string | undefined;
function carriedText(): string {
  if (pageSearchText === undefined) {
    const page = renderConsolePage({ nonce: 'abc', csrf: 'def' });
    const [, afterBegin] = page.split('// history-search:begin');
    const [carried] = (afterBegin ?? '').split('// history-search:end');
    if (!carried) throw new Error('the page does not carry the search');
    pageSearchText = carried;
  }
  return pageSearchText;
}

type FakeNode = {
  tag: string;
  className: string;
  children: FakeNode[];
  textContent: string;
  appendChild(child: FakeNode): FakeNode;
};

/** Enough of a DOM node for the page's list: children, and text that nests. */
function fakeNode(tag: string, className = '', text = ''): FakeNode {
  let own = text;
  const node: FakeNode & Record<string, unknown> = {
    tag,
    className,
    children: [],
    appendChild(child: FakeNode) {
      node.children.push(child);
      return child;
    },
    addEventListener: () => undefined,
    querySelector: () => null,
  } as FakeNode & Record<string, unknown>;
  Object.defineProperty(node, 'textContent', {
    get: () => own + node.children.map((c) => c.textContent).join(''),
    set: (value: string) => {
      own = value;
      node.children = [];
    },
  });
  return node;
}

/**
 * The search code of the page (its scorer, `runSearch`, the candidate rows
 * and `renderSearch`), the very text that the page carries, run in a context
 * that has the history and a fake DOM.
 */
function loadPageSearch(history: HistoryEntry[]) {
  const candidates = fakeNode('div');
  const count = fakeNode('span');
  const sandbox: Record<string, unknown> = {
    history,
    search: null,
    SEARCH_VISIBLE: 8,
    searchQueryEl: fakeNode('span'),
    searchCountEl: count,
    searchCandsEl: candidates,
    el: (tag: string, cls?: string, text?: string) =>
      fakeNode(tag, cls ?? '', text ?? ''),
    document: {
      createElement: (tag: string) => fakeNode(tag),
      createTextNode: (text: string) => fakeNode('#text', '', text),
    },
  };
  vm.runInNewContext(carriedText(), sandbox);
  const run = sandbox.runSearch as (query: string) => number[];
  const render = sandbox.renderSearch as () => void;
  return {
    /** The texts of the list that `runSearch` builds, in order. */
    list: (query: string) => run(query).map((idx) => history[idx].text),
    /** The first rows of the list as drawn: the text and the marked runs. */
    rows: (query: string) => {
      sandbox.search = { query, matches: run(query), cursor: 0 };
      render();
      return candidates.children.map((row) => ({
        text: row.children
          .filter((c) => c.className !== 'when')
          .map((c) => c.textContent)
          .join(''),
        marked: row.children
          .filter((c) => c.className === 'match')
          .map((c) => c.textContent),
      }));
    },
    counter: () => count.textContent,
  };
}

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

describe('the scorer that reads the query once', () => {
  it('gives the score and the marks of the scorer that read the query for every line', () => {
    const pairs = corpus();
    expect(pairs.length).toBeGreaterThanOrEqual(500);
    let matches = 0;
    for (const [query, line] of pairs) {
      const expected = referenceScore(query, line);
      expect(scoreHistoryMatch(query, line)).toEqual(expected);
      if (expected) matches += 1;
    }
    // a corpus where nothing, or everything, matches proves nothing
    expect(matches).toBeGreaterThan(100);
    expect(pairs.length - matches).toBeGreaterThan(50);
  });

  it('does so for long words and lines too, where it does not leave the search to indexOf', () => {
    const pairs = longCorpus();
    let matches = 0;
    let beyond = 0;
    for (const [query, line] of pairs) {
      const expected = referenceScore(query, line);
      expect(scoreHistoryMatch(query, line)).toEqual(expected);
      if (expected) matches += 1;
      // beyond this the scorer does not trust indexOf (see the scorer)
      if (query.length > 300 && query.length * line.length > 100000) {
        beyond += 1;
      }
    }
    expect(beyond).toBeGreaterThanOrEqual(150);
    expect(matches).toBeGreaterThan(30);
    expect(pairs.length - matches).toBeGreaterThan(30);
    // a word that is in the line as it stands, found by the other search
    const found = pairs.filter(([query, line]) =>
      line.toLowerCase().includes(query.toLowerCase())
    );
    expect(found.length).toBeGreaterThan(30);
  });

  it('works out the marks only when asked, and then scores the same', () => {
    const scorer = createHistoryScorer('export config');
    const line = 'frodo config export -A';
    const marked = scorer(line, true);
    expect(marked?.indexes).toHaveLength(12);
    expect(scorer(line)).toEqual({ score: marked?.score, indexes: [] });
    expect(scorer(line, false)).toEqual({ score: marked?.score, indexes: [] });
    // and a line that does not match is null either way
    expect(scorer('frodo journey list')).toBeNull();
    expect(scorer('frodo journey list', true)).toBeNull();
    // the same for a word that is a subsequence
    const fuzzy = createHistoryScorer('cnf');
    expect(fuzzy(line)?.score).toBe(fuzzy(line, true)?.score);
    expect(fuzzy(line)?.indexes).toEqual([]);
  });

  it('keeps nothing from one line for the next', () => {
    const scorer = createHistoryScorer('abc export');
    const score = (line: string) => scorer(line, true);
    const first = score('frodo abc export');
    const second = score('xxabxc ex port');
    expect(first).not.toEqual(second);
    expect(score('frodo abc export')).toEqual(first);
    expect(score('xxabxc ex port')).toEqual(second);
    expect(first).toEqual(scoreHistoryMatch('abc export', 'frodo abc export'));
  });

  describe('on input made to be slow', () => {
    /**
     * Quick: under 100 ms, or under 60 times what one pass over the line
     * costs on this machine at this moment. The scorer's search for a long
     * word takes about 10 such passes; what indexOf takes for the inputs
     * below is hundreds of passes and more, however fast the machine is.
     */
    function expectQuick(line: string, run: () => void) {
      const pass = quickest(() => line.toLowerCase().indexOf('\u0000'));
      expect(quickest(run)).toBeLessThan(Math.max(100, 60 * pass));
    }

    it('says at once that a word of 5000 characters is not in a line of a million characters', () => {
      const line = 'a'.repeat(1_000_000);
      const word = `${'a'.repeat(2500)}b${'a'.repeat(2500)}`;
      expect(scoreHistoryMatch(word, line)).toBeNull();
      expectQuick(line, () => scoreHistoryMatch(word, line));
    });

    it('says at once that a word of 2000 characters is not in a line of 4 million characters', () => {
      const line = 'a'.repeat(4_000_000);
      const word = `${'a'.repeat(1000)}b${'a'.repeat(1000)}`;
      expect(scoreHistoryMatch(word, line)).toBeNull();
      expectQuick(line, () => scoreHistoryMatch(word, line));
    });

    it('says at once that a word of 1000 or 2000 characters is not in a line of a million characters', () => {
      const line = 'a'.repeat(1_000_000);
      const word = `${'a'.repeat(1000)}b${'a'.repeat(1000)}`;
      expect(scoreHistoryMatch(word, line)).toBeNull();
      expectQuick(line, () => scoreHistoryMatch(word, line));
      const other = `${'a'.repeat(500)}b${'a'.repeat(500)}`;
      expect(scoreHistoryMatch(other, line)).toBeNull();
      expectQuick(line, () => scoreHistoryMatch(other, line));
    });

    it('leaves a short word to indexOf, however long the lines are', () => {
      // 40 scripts of 200,000 characters, in lower case, as the history of
      // someone who pastes scripts holds: a word of 5, 8 or 200 characters is
      // searched for about as fast as one pass over the line (up to 2.5 times it is allowed), not 5 to 30 times slower
      const lines = Array.from(
        { length: 40 },
        (_, i) =>
          `${'const journeys = await frodo.journey.readjourneys();\n'.repeat(3800)}${i}`
      );
      for (const word of ['zzzzz', 'journeyx', 'z'.repeat(200)]) {
        const scorer = createHistoryScorer(word);
        // (this first pass also makes the strings flat, which costs time once)
        expect(lines.every((line) => scorer(line) === null)).toBe(true);
        const pass = quickest(
          () =>
            lines.forEach((line) => {
              const t = line.toLowerCase();
              t.indexOf(word);
              t.indexOf(word[0]);
            }),
          9
        );
        const scoring = quickest(
          () => lines.forEach((line) => scorer(line)),
          9
        );
        expect(scoring).toBeLessThan(2.5 * pass + 1);
      }
    });

    it('finds such a word as a subsequence when the line has the letters but not next to each other', () => {
      // 1000 a, b, 1000 a: the b has an x before it, so no exact match
      const line = `${'a'.repeat(500_000)}xb${'a'.repeat(1000)}`;
      const word = `${'a'.repeat(1000)}b${'a'.repeat(1000)}`;
      // the first a +1, 999 more +6; b after 499,001 skipped: +1 -499,001;
      // 1000 a side by side after it +6 each; no tail
      expect(scoreHistoryMatch(word, line)).toMatchObject({ score: -487005 });
      expectQuick(line, () => scoreHistoryMatch(word, line));
    });

    it('finds such a word as an exact match at the end of the line', () => {
      const line = `${'a'.repeat(999_999)}b`;
      const word = `${'a'.repeat(1000)}b`;
      const match = scoreHistoryMatch(word, line);
      // 1000 + 6 x 1001 - 999
      expect(match?.score).toBe(6007);
      expect(match?.indexes).toHaveLength(1001);
      expect(match?.indexes[0]).toBe(998_999);
      expect(match?.indexes[1000]).toBe(999_999);
      expectQuick(line, () => scoreHistoryMatch(word, line));
    });

    it('scores a word repeated 2000 times as often as it is repeated, for the price of one', () => {
      const line = `${'a'.repeat(1_000_000)}xbxc`;
      const once = scoreHistoryMatch('abc', line);
      // a +1; b after 1,000,000 skipped +1 -1,000,000; c after 1 skipped: +1 -1
      expect(once?.score).toBe(-999_998);
      const query = Array.from({ length: 2000 }, () => 'abc').join(' ');
      const many = scoreHistoryMatch(query, line);
      expect(many).toEqual({ score: 2000 * -999_998, indexes: once?.indexes });
      const single = quickest(() => scoreHistoryMatch('abc', line));
      expect(quickest(() => scoreHistoryMatch(query, line))).toBeLessThan(
        Math.max(100, 50 * single)
      );
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
      .mockImplementation(() => stdin as unknown as typeof process.stdin);
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

  it('lists what the page lists for the same history and query', async () => {
    const history = entries(
      'frodo journey export -A -d journeys --verbose',
      'frodo journey list',
      'frodo esv secret list -l',
      'frodo script export -a',
      'frodo config export -A',
      'frodo conn list',
      'frodo journey import -A',
      'ls',
      'cat package.json',
      'frodo config-manager pull journeys',
      'frodo conn list',
      'git status',
      'node dist/launch.cjs info',
      'export CONFIG=1',
      ...Array.from({ length: 50 }, (_, i) => `frodo app list -n ${i}`)
    );
    const page = loadPageSearch(history);
    for (const query of [
      'export config',
      'list',
      'cnf',
      'fje',
      'e',
      'frodo ',
      'frodo',
      'EXPORT',
      'zzz',
    ]) {
      // a new session for each query
      teardown?.();
      stdin = new PassThrough();
      written = [];
      lines = [];
      await openSearch(history);
      expect(await ranked(query)).toEqual(page.list(query));
    }
  });

  it('reads the query once for each keystroke, not once for each entry', async () => {
    await openSearch(
      entries(
        ...Array.from({ length: 300 }, (_, i) => `frodo app list -n ${i}`)
      )
    );
    // the scorer reads the query with split(/\s+/): count those reads
    const split = jest.spyOn(String.prototype, 'split');
    await type('frodo');
    const reads = split.mock.calls.filter(
      ([separator]) =>
        Object.prototype.toString.call(separator) === '[object RegExp]' &&
        (separator as RegExp).source === '\\s+'
    ).length;
    split.mockRestore();
    // 5 bytes, 5 lists of 300 entries: 5 reads (not 1500), and not none
    expect(reads).toBeGreaterThan(0);
    expect(reads).toBeLessThanOrEqual(5);
    expect(total()).toBe(50);
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
  const entries = (...texts: string[]): HistoryEntry[] =>
    texts.map((text) => ({ text }));

  it('carries the text of the scorer of the terminal console', () => {
    expect(carriedText()).toContain(createHistoryScorer.toString());
  });

  it('scores 500 queries, and long ones, the way the terminal console and the oracle do', () => {
    const createScorer = vm.runInNewContext(
      `${carriedText()}\ncreateHistoryScorer`
    );
    const pairs = [...corpus(), ...longCorpus()];
    expect(pairs.length).toBeGreaterThanOrEqual(700);
    let matches = 0;
    let words = 0;
    for (const [query, line] of pairs) {
      const expected = scoreHistoryMatch(query, line);
      // the page's function lives in another realm: compare as JSON
      const carried = JSON.stringify(createScorer(query)(line, true));
      expect(carried).toBe(JSON.stringify(expected));
      expect(carried).toBe(JSON.stringify(referenceScore(query, line)));
      if (expected) matches += 1;
      if (expected && /\S\s+\S/.test(query)) words += 1;
    }
    // a corpus where nothing, or everything, matches proves nothing
    expect(matches).toBeGreaterThan(130);
    expect(pairs.length - matches).toBeGreaterThan(80);
    // ... and one where queries of several words match
    expect(words).toBeGreaterThan(50);
  });

  describe('the list that the page builds', () => {
    it('puts the best match first, and the shorter of two exact matches before the longer', () => {
      const page = loadPageSearch(
        entries('frodo esv secret list -l', 'x l i s t', 'frodo conn list')
      );
      expect(page.list('list')).toEqual([
        'frodo conn list',
        'frodo esv secret list -l',
        'x l i s t',
      ]);
    });

    it('finds the words of the query in any order', () => {
      const page = loadPageSearch(
        entries('frodo journey list', 'frodo config export -A')
      );
      expect(page.list('export config')).toEqual(['frodo config export -A']);
    });

    it('keeps entries of equal score newest first', () => {
      const page = loadPageSearch(entries('xa', 'ya', 'za', 'wa'));
      expect(page.list('a')).toEqual(['xa', 'ya', 'za', 'wa']);
    });

    it('lists 50 of 51 matching entries, the best 50', () => {
      // 'a' is the oldest, the shortest and so the best; the oldest of the
      // others, the one of 6 characters at the end, is the one left out
      const page = loadPageSearch(
        entries(...Array.from({ length: 50 }, (_, i) => `a-${i}-x`), 'a')
      );
      const list = page.list('a');
      expect(list).toHaveLength(50);
      expect(list[0]).toBe('a');
      expect(list[1]).toBe('a-0-x');
      expect(list[49]).toBe('a-48-x');
      expect(list).not.toContain('a-49-x');
    });

    it('lists the 50 newest entries for an empty query, and for white space', () => {
      const history = entries(
        ...Array.from({ length: 120 }, (_, i) => `command-${i}`)
      );
      const page = loadPageSearch(history);
      const newest = history.slice(0, 50).map((entry) => entry.text);
      expect(page.list('')).toEqual(newest);
      expect(page.list('  ')).toEqual(newest);
    });

    it('reads the query once for the whole list, not once for each entry', () => {
      const page = loadPageSearch(
        entries(
          ...Array.from({ length: 3000 }, (_, i) => `frodo app list -n ${i}`)
        )
      );
      // the same list as for one word: every score is 2000 times as large
      const repeated = Array.from({ length: 2000 }, () => 'frodo').join(' ');
      expect(page.list(repeated)).toEqual(page.list('frodo'));
      const single = quickest(() => page.list('frodo'));
      expect(quickest(() => page.list(repeated))).toBeLessThan(
        Math.max(200, 20 * single)
      );
    });

    it('lists nothing when a word matches nowhere, and says so', () => {
      const page = loadPageSearch(entries('one', 'two'));
      expect(page.list('one zzz')).toEqual([]);
      page.rows('one zzz');
      expect(page.counter()).toBe('no matches');
    });
  });

  describe('the rows that the page draws', () => {
    it('marks the characters of every word of the query', () => {
      const page = loadPageSearch(entries('frodo config export -A'));
      expect(page.rows('export config')).toEqual([
        { text: 'frodo config export -A', marked: ['config', 'export'] },
      ]);
      // c, n and f are not together in the line; export is
      expect(page.rows('cnf export')).toEqual([
        { text: 'frodo config export -A', marked: ['c', 'nf', 'export'] },
      ]);
      expect(page.counter()).toBe(' 1/1');
    });

    it('marks nothing when there is no query', () => {
      const page = loadPageSearch(entries('one', 'two'));
      expect(page.rows('')).toEqual([
        { text: 'one', marked: [] },
        { text: 'two', marked: [] },
      ]);
    });

    it('draws 8 rows at a time', () => {
      const page = loadPageSearch(
        entries(...Array.from({ length: 20 }, (_, i) => `x${i}`))
      );
      expect(page.rows('x')).toHaveLength(8);
      expect(page.counter()).toBe(' 1/20');
    });
  });
});
