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

describe('escapableSelect Navigate menu keys', () => {
  const CHOICES = [
    { value: 'run', name: 'Run' },
    { value: 'edit', name: 'Edit options' },
    { value: 'cancel', name: 'Cancel' },
  ];
  /** The text of the Navigate box: the first framed box of the output. */
  const navigate = (config, seed = {}) => {
    setTerminal(120);
    return visibleLines(
      render({ message: 'Pick one', choices: CHOICES, ...config }, seed)
    )
      .slice(0, 3)
      .join('\n');
  };

  it('says select on Enter when the prompt does not say otherwise', () => {
    expect(navigate({})).toContain('[ENTER] select');
  });

  it('says what the prompt configures on Enter, and nothing else', () => {
    const menu = navigate({ enterLabel: 'next' });
    expect(menu).toContain('[ENTER] next');
    expect(menu).not.toContain('select');
  });

  it('asks a function label about the highlighted row, on every render', () => {
    const label = (highlighted) =>
      ({ run: 'run', edit: 'edit options', cancel: 'cancel' })[highlighted] ??
      '';
    expect(navigate({ enterLabel: label }, { [STATE.active]: 0 })).toContain(
      '[ENTER] run'
    );
    harness.reset();
    expect(navigate({ enterLabel: label }, { [STATE.active]: 1 })).toContain(
      '[ENTER] edit options'
    );
    harness.reset();
    expect(navigate({ enterLabel: label }, { [STATE.active]: 2 })).toContain(
      '[ENTER] cancel'
    );
  });

  it('hides the Enter key when a function label answers with nothing', () => {
    // a filter that matches no row: Enter does nothing, so the menu is silent about it
    const menu = navigate(
      { enterLabel: (highlighted) => (highlighted === undefined ? '' : 'run') },
      { [STATE.query]: 'zzz' }
    );
    expect(menu).not.toContain('[ENTER]');
    expect(menu).toContain('[ESC]');
  });

  it('says what Escape does, in the menu and in the hint after a first press', () => {
    const menu = navigate({ escapeLabel: 'cancel' });
    expect(menu).toContain('[ESC] cancel');
    expect(menu).not.toContain('back');
    harness.reset();
    setTerminal(120);
    const grace = visibleLines(
      render(
        { message: 'Pick one', choices: CHOICES, escapeLabel: 'cancel' },
        { [STATE.escapeGraceOpen]: true }
      )
    ).join('\n');
    expect(grace).toContain('esc again to exit all -- or wait to cancel');
    expect(grace).not.toContain('go back one level');
  });

  it('keeps the usual Escape wording when the prompt does not set one', () => {
    expect(navigate({})).toContain('[ESC] back · [ESC]×2 exit all');
  });
});

describe('escapableSelect intro lines', () => {
  const CHOICES = [
    { value: 'up', name: '..' },
    { value: 'a', name: 'alpha/' },
    { value: 'b', name: 'beta.json' },
  ];
  const intro = (lines) => ({
    message: 'Choose',
    choices: CHOICES,
    intro: lines,
  });

  it.each(FRAME_WIDTHS)(
    'keeps the silhouette at %i columns with hostile intro lines of both tones',
    (width) => {
      setTerminal(width);
      harness.reset();
      const output = render(
        intro([
          { text: `In /${HOSTILE_TEXTS.longDottedNames}` },
          { text: HOSTILE_TEXTS.tabbedStackTrace, tone: 'error' },
          { text: HOSTILE_TEXTS.multiLine },
          { text: HOSTILE_TEXTS.veryLongWord, tone: 'error' },
        ])
      );
      assertFrame(output, width);
    }
  );

  it('shows the intro above the list, with a blank row between them', () => {
    setTerminal(120);
    const rows = visibleLines(
      render(intro([{ text: 'In /work' }, { text: 'Files shown: .json' }]))
    );
    const where = rows.findIndex((row) => row.includes('In /work'));
    const filter = rows.findIndex((row) => row.includes('Files shown: .json'));
    const first = rows.findIndex((row) => row.includes('..'));
    expect(where).toBeGreaterThan(0);
    expect(filter).toBe(where + 1);
    expect(rows[filter + 1].replace(/[│\s]/g, '')).toBe('');
    expect(first).toBe(filter + 2);
  });

  it('keeps the intro when the filter matches no row', () => {
    setTerminal(120);
    const output = visibleLines(
      render(intro([{ text: 'In /work' }]), { [STATE.query]: 'zzz' })
    ).join('\n');
    expect(output).toContain('In /work');
    expect(output).toContain('(no matches -- backspace to edit)');
  });

  it('draws nothing extra without an intro', () => {
    setTerminal(120);
    const without = visibleLines(
      render({ message: 'Choose', choices: CHOICES })
    );
    harness.reset();
    const empty = visibleLines(render(intro([])));
    expect(empty).toEqual(without);
  });

  it('wraps a long intro line to the frame it is drawn in', () => {
    const sentence = `In /${'folder/'.repeat(14)}end`;
    setTerminal(156);
    expect(
      visibleLines(render(intro([{ text: sentence }]))).filter((row) =>
        row.includes(sentence)
      )
    ).toHaveLength(1);
    harness.reset();
    setTerminal(60);
    const narrow = render(intro([{ text: sentence }]));
    assertFrame(narrow, 60);
    expect(
      visibleLines(narrow).filter((row) => row.includes('folder/')).length
    ).toBeGreaterThan(1);
  });
});
