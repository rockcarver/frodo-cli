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

// Render-level frame integrity for the multi-select prompt (the options
// editor): the panel, the inline value editor boxes and the menu follow the
// terminal width and survive hostile text. State is seeded by hook order,
// pinned by STATE below.

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
  () => import('../../src/utils/interactive/EscapableMultiSelectPrompt.ts')
);

/** The view's useState calls in order (a new hook before them shifts these). */
const STATE = {
  status: 0,
  query: 1,
  expanded: 2,
  selected: 3,
  editing: 4,
  editingChoices: 5,
  draft: 6,
  pickerActive: 7,
  active: 8,
  escapeGraceOpen: 9,
  leftGuard: 10,
  width: 11,
};

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
      name: '-a, --all',
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

describe('escapableMultiSelect frames', () => {
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
    [
      'the left-key guard',
      { [STATE.leftGuard]: HOSTILE_TEXTS.longDottedNames },
    ],
    ['marked options', { [STATE.selected]: new Set(['a', 'c']) }],
  ])('keeps the silhouette with %s', (_label, seed) => {
    for (const width of FRAME_WIDTHS) {
      setTerminal(width);
      harness.reset();
      assertFrame(render(HOSTILE, seed), width);
    }
  });

  it.each([
    [
      'the enum picker box',
      {
        [STATE.editing]: 'a',
        [STATE.editingChoices]: ['one', HOSTILE_TEXTS.veryLongWord, 'three'],
      },
    ],
    [
      'the free-text value box',
      {
        [STATE.editing]: 'a',
        [STATE.editingChoices]: [],
        [STATE.draft]: HOSTILE_TEXTS.multiLine + HOSTILE_TEXTS.veryLongWord,
      },
    ],
  ])('draws %s at the terminal width, below the panel', (_label, seed) => {
    for (const width of FRAME_WIDTHS) {
      setTerminal(width);
      harness.reset();
      const output = render(HOSTILE, seed);
      assertFrame(output, width);
      // The value editor is its own framed box: a third top wall (menu, panel, box).
      expect(
        visibleLines(output).filter((line) => line.startsWith('┌')).length
      ).toBe(3);
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

  it('wraps a highlighted option description to the frame it is drawn in', () => {
    const config = {
      message: 'Options',
      choices: [{ value: 'a', name: '-a, --all', description: LONG_SENTENCE }],
    };
    setTerminal(156);
    const wide = visibleLines(render(config)).filter((line) =>
      line.includes('word word word')
    );
    expect(wide).toHaveLength(1);
    expect(wide[0]).toContain('end');
  });

  it("wraps a group header's member list to the frame it is drawn in", () => {
    const config = {
      message: 'Options',
      groups: [{ id: 'g1', label: 'Group one' }],
      choices: [
        { value: 'flat', name: '--flat' },
        ...['alpha', 'bravo', 'charlie', 'delta'].map((name) => ({
          value: name,
          name: `--${name}-option-with-a-long-name`,
          group: 'g1',
        })),
      ],
    };
    setTerminal(156);
    // The header row follows the one flat option.
    const output = render(config, { [STATE.active]: 1 });
    const rows = visibleLines(output).filter((line) =>
      line.includes('Group one:')
    );
    expect(rows).toHaveLength(1);
    // Four members make about 147 characters: one row at 156 columns, two at the 120-column default.
    expect(rows[0]).toContain('--delta-option-with-a-long-name');
  });

  it('redraws at the new terminal width after a resize and removes its listener', () => {
    setTerminal(156);
    assertFrame(render(HOSTILE), 156);
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
    expect(render(HOSTILE, { [STATE.status]: 'done' })).not.toContain('┌');
  });
});
