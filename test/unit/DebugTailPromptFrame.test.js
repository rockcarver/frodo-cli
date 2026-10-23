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

// Render-level frame integrity for the debug tail prompt (frodo debug
// oauth|saml|sync|all|tail): the frame follows the terminal width and
// survives hostile event text. The mock follows JourneyDebugPrompt.test.js;
// state is seeded by hook order, pinned by STATE below.

let renderPrompt;
let keypress;
let stateIndex;
let states;
let effects;

jest.unstable_mockModule('@inquirer/core', () => ({
  createPrompt: (render) => {
    renderPrompt = render;
    return () => {};
  },
  ExitPromptError: class extends Error {},
  isDownKey: (key) => key.name === 'down',
  isUpKey: (key) => key.name === 'up',
  useEffect: (effect) => effects.push(effect),
  useKeypress: (handler) => {
    keypress = handler;
  },
  usePrefix: () => '?',
  useRef: () => ({ current: undefined }),
  useState: (initial) => {
    const index = stateIndex++;
    if (!(index in states)) {
      states[index] = typeof initial === 'function' ? initial() : initial;
    }
    return [
      states[index],
      (value) => {
        // Functional updates apply to the current state, as in inquirer.
        states[index] =
          typeof value === 'function' ? value(states[index]) : value;
      },
    ];
  },
}));

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

await import('../../src/utils/interactive/DebugTailPrompt.ts');
const { frameInnerWidth } =
  await import('../../src/utils/interactive/NavigationMenu.ts');

/** The prompt's useState calls in order (a new hook before them shifts these). */
const STATE = {
  events: 0,
  warning: 1,
  done: 2,
  escapeGrace: 3,
  width: 4,
  cursor: 5,
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

const CONFIG = {
  topic: 'oauth',
  hostLabel: 'volker-dev',
  realmLabel: 'alpha',
  readEvents: async () => [],
};

function render(config = CONFIG) {
  stateIndex = 0;
  return renderPrompt(config, () => {});
}

function eventsFrom(texts) {
  return texts.map((line, index) => ({
    timestamp: `2026-10-23T12:00:0${index % 10}Z`,
    line: `ERROR ThreadPoolScriptEvaluator: ${line}`,
  }));
}

beforeEach(() => {
  states = [];
  effects = [];
});

afterEach(() => {
  for (const [key, descriptor] of Object.entries(stdoutProperties)) {
    if (descriptor) Object.defineProperty(process.stdout, key, descriptor);
    else delete process.stdout[key];
  }
});

describe('debug tail frames', () => {
  const hostile = Object.values(HOSTILE_TEXTS);

  it.each(FRAME_WIDTHS)(
    'follow mode keeps an intact %i-column frame for hostile event lines',
    (width) => {
      setTerminal(width);
      states[STATE.events] = eventsFrom(hostile);
      const output = render();
      assertFrame(output, width);
    }
  );

  it.each(FRAME_WIDTHS)(
    'a multi-line event loses no text at %i columns',
    (width) => {
      setTerminal(width);
      states[STATE.events] = eventsFrom([HOSTILE_TEXTS.multiLine]);
      const drawn = visibleLines(render())
        .join('')
        .replace(/[\s│]+/g, '');
      expect(drawn).toContain('firstline');
      expect(drawn).toContain('secondline');
      expect(drawn).toContain('thirdline');
    }
  );

  it.each(FRAME_WIDTHS)(
    'review mode, the escape hint, a hostile warning and a long title keep an intact %i-column frame',
    (width) => {
      setTerminal(width);
      states[STATE.events] = eventsFrom(hostile);
      states[STATE.cursor] = 1;
      states[STATE.escapeGrace] = true;
      states[STATE.warning] = HOSTILE_TEXTS.tabbedStackTrace;
      const output = render({
        ...CONFIG,
        hostLabel: HOSTILE_TEXTS.longTitleText,
      });
      assertFrame(output, width);
      // The reviewed position rides the title (cut with an ellipsis when it does not fit).
      expect(output).toContain('Debugging oauth');
      expect(output).toContain('reviewing history');
    }
  );

  it.each(FRAME_WIDTHS)(
    'the empty state keeps an intact %i-column frame',
    (width) => {
      setTerminal(width);
      assertFrame(render(), width);
    }
  );

  it.each(FRAME_WIDTHS)(
    'fills each row to the %i-column frame and indents continuation rows past the timestamp',
    (width) => {
      setTerminal(width);
      states[STATE.events] = [
        {
          timestamp: '2026-10-23T12:00:00Z',
          line: `WARN Logger: ${'word '.repeat(80)}`,
        },
      ];
      const lines = visibleLines(render());
      const top = lines.findIndex((line) => line.startsWith('┌ ?'));
      const body = lines
        .slice(top + 1, -1)
        .map((line) => line.slice(2, -2).trimEnd());
      expect(body[0]).toMatch(/^12:00:00 WARN Logger: word/);
      for (const row of body.slice(1)) {
        expect(row.startsWith(' '.repeat(11))).toBe(true);
        expect(row[11]).not.toBe(' ');
      }
      // Rows are wrapped at the frame's inner width, not at a fixed one:
      // every row but the last is filled to within a word and the
      // timestamp column's slack of it.
      for (const row of body.slice(0, -1)) {
        expect(row.length).toBeGreaterThan(frameInnerWidth(width) - 8);
        expect(row.length).toBeLessThanOrEqual(frameInnerWidth(width));
      }
    }
  );

  it.each(FRAME_WIDTHS)(
    'the internal-error fallback keeps the frame at %i columns',
    (width) => {
      setTerminal(width);
      states[STATE.events] = [
        { timestamp: '2026-10-23T12:00:00Z', line: undefined },
      ];
      const output = render();
      expect(output).toContain('Internal error rendering this view');
      for (const line of visibleLines(output)) {
        expect(line.length).toBe(width);
      }
    }
  );

  it('wraps to the terminal width instead of a fixed 120', () => {
    const long = {
      timestamp: '2026-10-23T12:00:00Z',
      line: `WARN Logger: ${'word '.repeat(60)}`,
    };
    const rowsAt = (width) => {
      setTerminal(width);
      states = [];
      states[STATE.events] = [long];
      return render().split('\n').length;
    };
    expect(rowsAt(40)).toBeGreaterThan(rowsAt(80));
    expect(rowsAt(80)).toBeGreaterThan(rowsAt(156));
  });

  it('uses 120 columns when stdout is not a terminal', () => {
    setTerminal(200, false);
    states[STATE.events] = eventsFrom(hostile);
    assertFrame(render(), 120);
  });

  it('redraws at the new terminal width after a resize', () => {
    setTerminal(156);
    states[STATE.events] = eventsFrom(hostile);
    assertFrame(render(), 156);
    const cleanup = effects[0]();
    try {
      setTerminal(60);
      process.stdout.emit('resize');
      assertFrame(render(), 60);
    } finally {
      cleanup();
    }
  });

  it('pins the seeded state order (a new hook before the state shifts it)', () => {
    setTerminal(120);
    states[STATE.events] = eventsFrom(['one', 'two', 'three']);
    states[STATE.cursor] = 1;
    expect(render()).toContain('row 2/3');
    keypress({ name: 'down' });
    expect(states[STATE.cursor]).toBe(-1);
  });
});
