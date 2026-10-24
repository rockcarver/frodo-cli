import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  assertFrame,
  FRAME_WIDTHS,
  HOSTILE_TEXTS,
  visibleLines,
} from '../utils/FrameAssertions.js';
import { createPromptHarness } from '../utils/PromptHarness.js';

// Render-level frame integrity for the single-select prompt (every picker:
// realms, entities, connection profiles, the shell menus): the frame follows
// the terminal width and survives hostile text. State is seeded by hook
// order, pinned by STATE below.

const harness = createPromptHarness();
jest.unstable_mockModule('@inquirer/core', () => harness.module);
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: Object.fromEntries(
    [
      'heading',
      'muted',
      'command',
      'positive',
      'negative',
      'warning',
      'emphasis',
    ].map((intent) => [intent, (text) => String(text)])
  ),
}));

const view = await harness.load(
  () => import('../../src/utils/interactive/EscapableSelectPrompt.ts')
);

/** The view's useState calls in order (a new hook before them shifts these). */
const STATE = { status: 0, query: 1, active: 2, escapeGraceOpen: 3, width: 4 };

const stdoutProperties = {
  isTTY: Object.getOwnPropertyDescriptor(process.stdout, 'isTTY'),
  columns: Object.getOwnPropertyDescriptor(process.stdout, 'columns'),
};

function setTerminal(columns, isTTY = true) {
  Object.defineProperty(process.stdout, 'columns', {
    configurable: true,
    value: columns,
  });
  Object.defineProperty(process.stdout, 'isTTY', {
    configurable: true,
    value: isTTY,
  });
}

const HOSTILE = {
  message: HOSTILE_TEXTS.longTitleText,
  choices: [
    {
      value: 'a',
      name: 'alpha',
      description: HOSTILE_TEXTS.tabbedStackTrace,
    },
    {
      value: 'b',
      name: HOSTILE_TEXTS.veryLongWord,
      description: HOSTILE_TEXTS.multiLine,
    },
    { value: 'c', name: HOSTILE_TEXTS.longDottedNames },
  ],
};

/** One sentence of about 130 characters: one row on a wide frame, two on the 120-column default. */
const LONG_SENTENCE = `${'word '.repeat(25)}end`;

function render(config, seed = {}) {
  for (const [index, value] of Object.entries(seed)) {
    harness.states[Number(index)] = value;
  }
  return harness.render(view, config);
}

beforeEach(() => {
  harness.reset();
});

afterEach(() => {
  for (const [key, descriptor] of Object.entries(stdoutProperties)) {
    if (descriptor) Object.defineProperty(process.stdout, key, descriptor);
    else delete process.stdout[key];
  }
});

describe('escapableSelect frames', () => {
  it.each(FRAME_WIDTHS)(
    'keeps the silhouette at %i columns with hostile choices, descriptions and a long title',
    (width) => {
      setTerminal(width);
      for (const active of [0, 1, 2]) {
        harness.reset();
        assertFrame(render(HOSTILE, { [STATE.active]: active }), width);
      }
      expect(harness.states[STATE.width]).toBe(width);
    }
  );

  it.each([
    ['a filter with matches', { [STATE.query]: 'a' }],
    ['a filter without matches', { [STATE.query]: 'zzz' }],
    ['the open escape grace', { [STATE.escapeGraceOpen]: true }],
  ])('keeps the silhouette with %s', (_label, seed) => {
    for (const width of FRAME_WIDTHS) {
      setTerminal(width);
      harness.reset();
      assertFrame(render(HOSTILE, seed), width);
    }
  });

  it('draws at the 120-column default when stdout is not a terminal', () => {
    setTerminal(200, false);
    assertFrame(render(HOSTILE), 120);
    expect(harness.states[STATE.width]).toBe(120);
  });

  it('uses the 40-column minimum on a narrower terminal', () => {
    setTerminal(30);
    assertFrame(render(HOSTILE), 40);
  });

  it('wraps a description to the frame it is drawn in, not to the default width', () => {
    const config = {
      message: 'Pick one',
      choices: [{ value: 'a', name: 'alpha', description: LONG_SENTENCE }],
    };
    setTerminal(156);
    // The whole sentence fits one row of the wide frame; at the 120-column
    // default it would be split over two.
    expect(
      visibleLines(render(config)).filter((line) =>
        line.includes(LONG_SENTENCE)
      )
    ).toHaveLength(1);
    harness.reset();
    setTerminal(60);
    const narrow = render(config);
    assertFrame(narrow, 60);
    expect(
      visibleLines(narrow).filter((line) => line.includes('word')).length
    ).toBeGreaterThan(2);
  });

  it('redraws at the new terminal width after a resize and removes its listener', () => {
    setTerminal(156);
    const first = render(HOSTILE);
    assertFrame(first, 156);
    const before = process.stdout.listenerCount('resize');
    const cleanups = harness.effects.map((effect) => effect());
    expect(process.stdout.listenerCount('resize')).toBe(before + 1);
    try {
      setTerminal(60);
      process.stdout.emit('resize');
      assertFrame(harness.render(view, HOSTILE), 60);
    } finally {
      for (const cleanup of cleanups) cleanup?.();
    }
    expect(process.stdout.listenerCount('resize')).toBe(before);
  });

  it('draws no frame once the prompt has concluded', () => {
    setTerminal(80);
    const output = render(HOSTILE, { [STATE.status]: 'done' });
    expect(output).not.toContain('┌');
  });
});
