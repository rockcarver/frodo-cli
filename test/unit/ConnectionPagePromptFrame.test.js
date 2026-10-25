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
} from '../utils/FrameAssertions.js';
import { createPromptHarness } from '../utils/PromptHarness.js';

// Render-level frame integrity for the connection page (host / username /
// password): the panel and the menu follow the terminal width and survive
// hostile text. State is seeded by hook order, pinned by STATE below.

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
  () => import('../../src/utils/interactive/ConnectionPagePrompt.ts')
);
const { EXIT_ALL } = await import('../../src/utils/interactive/ExitAll.ts');

/** The view's useState calls in order (a new hook before them shifts these). */
const STATE = {
  rows: 0,
  active: 1,
  status: 2,
  editing: 3,
  draft: 4,
  resolving: 5,
  escapeGraceOpen: 6,
  width: 7,
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
  rows: [
    {
      key: 'host',
      label: 'Host',
      value: HOSTILE_TEXTS.multiLine,
      note: HOSTILE_TEXTS.longDottedNames,
    },
    { key: 'username', label: 'Username', value: HOSTILE_TEXTS.veryLongWord },
    { key: 'password', label: 'Password', value: 'secret' },
  ],
};

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

describe('connectionPage frames', () => {
  it.each(FRAME_WIDTHS)(
    'keeps the silhouette at %i columns with hostile rows and a long title',
    (width) => {
      setTerminal(width);
      for (const active of [0, 1, 3]) {
        harness.reset();
        assertFrame(render(HOSTILE, { [STATE.active]: active }), width);
      }
      expect(harness.states[STATE.width]).toBe(width);
    }
  );

  it.each([
    [
      'an edited host',
      { [STATE.editing]: 'host', [STATE.draft]: HOSTILE_TEXTS.longDottedNames },
    ],
    ['re-resolving credentials', { [STATE.resolving]: true }],
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

  it('draws no frame once the page has concluded', () => {
    setTerminal(80);
    expect(render(HOSTILE, { [STATE.status]: 'done' })).not.toContain('┌');
  });
});

describe('connectionPage behaviour', () => {
  const rowsOf = (values) =>
    ['host', 'username', 'password'].map((key, index) => ({
      key,
      label: key,
      value: values[index],
    }));

  it.each([
    ['only the password is missing', ['h', 'u', undefined], 2],
    ['username and password are missing', ['h', undefined, undefined], 1],
    ['the password is empty', ['h', 'u', ''], 2],
    ['the host is missing', [undefined, 'u', 'p'], 0],
    ['every row has a value', ['h', 'u', 'p'], 0],
  ])('opens on the first row without a value: %s', (_label, values, row) => {
    setTerminal(100);
    harness.reset();
    render({ message: 'Connection:', rows: rowsOf(values) });
    expect(harness.states[STATE.active]).toBe(row);
  });

  it('renders a preview function with the current rows on every render', () => {
    setTerminal(100);
    const preview = jest.fn(
      (rows) => `command with ${rows.map((row) => row.value ?? '-').join(' ')}`
    );
    const config = {
      message: 'Connection:',
      rows: rowsOf(['h', 'u', undefined]),
      preview,
    };
    expect(render(config)).toContain('command with h u -');
    // A value committed on the page reaches the footer in the next frame.
    harness.states[STATE.rows] = rowsOf(['h', 'u', 'p']);
    expect(harness.render(view, config)).toContain('command with h u p');
  });

  it('renders a preview string as given', () => {
    setTerminal(100);
    expect(
      render({
        message: 'Connection:',
        rows: rowsOf(['h', 'u', 'p']),
        preview: 'a fixed footer',
      })
    ).toContain('a fixed footer');
  });

  it('cancels the command on a single escape, with no second prompt behind it', () => {
    setTerminal(100);
    harness.reset();
    harness.stateIndex = 0;
    harness.refIndex = 0;
    harness.effects = [];
    const done = jest.fn();
    view({ message: 'Connection:', rows: rowsOf(['h', 'u', undefined]) }, done);
    harness.keypress({ name: 'escape' }, { line: '', clearLine: () => {} });
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(EXIT_ALL);
    expect(harness.states[STATE.status]).toBe('escaped');
    // No grace window: nothing waits for a second press.
    expect(harness.states[STATE.escapeGraceOpen]).toBe(false);
  });
});
