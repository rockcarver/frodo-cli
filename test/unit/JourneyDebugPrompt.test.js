import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { assertFrame } from '../utils/FrameAssertions.js';

let renderPrompt;
let keypress;
let stateIndex;
let states;
const effects = [];

jest.unstable_mockModule('@inquirer/core', () => ({
  createPrompt: (render) => {
    renderPrompt = render;
    return () => {};
  },
  ExitPromptError: class extends Error {},
  isDownKey: (key) => key.name === 'down',
  isEnterKey: (key) => key.name === 'enter',
  isSpaceKey: (key) => key.name === 'space',
  isUpKey: (key) => key.name === 'up',
  useEffect: (effect) => effects.push(effect),
  useKeypress: (handler) => {
    keypress = handler;
  },
  usePagination: ({ items, renderItem }) =>
    items
      .map((item, index) => renderItem({ item, isActive: index === 0 }))
      .join('\n'),
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
        states[index] = value;
      },
    ];
  },
}));

jest.unstable_mockModule('../../src/ops/JourneyDebugAggregator', () => ({
  JourneyDebugAggregator: class {
    getResolvedUserIdAlias() {
      return undefined;
    }
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

await import('../../src/utils/interactive/JourneyDebugPrompt.ts');

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

function render(config = {}) {
  stateIndex = 0;
  return renderPrompt(config, () => {});
}

const exception = [
  'TypeError: Cannot call method "get" of null (Success URL - Goto#62)',
  '\tat java.base/java.util.concurrent.FutureTask.report(FutureTask.java:124)',
  '\tat ' +
    'org.forgerock.openam.scripting.'.repeat(5) +
    'evaluateScript(Script.java:98)',
  '',
  'Caused by: javax.script.ScriptException: script failed',
  '\t... 11 common frames omitted',
].join('\r\n');

function loadSession() {
  const event = {
    id: 'event-1',
    at: Date.now(),
    source: 'AM',
    step: 'ThreadPoolScriptEvaluator',
    type: 'ERROR',
    outcome: 'Script terminated with exception',
    raw: {
      logger: 'org.forgerock.openam.scripting.ThreadPoolScriptEvaluator',
      exception,
    },
  };
  render();
  states[1] = [
    {
      transactionId: 'transaction-1',
      treeName: 'Login',
      status: 'failed',
      startedAt: event.at,
      lastEventAt: event.at,
      failureReason: exception,
      nodeCount: 1,
      events: [event],
    },
  ];
}

beforeEach(() => {
  states = [];
  effects.length = 0;
});

afterEach(() => {
  for (const [key, descriptor] of Object.entries(stdoutProperties)) {
    if (descriptor) Object.defineProperty(process.stdout, key, descriptor);
    else delete process.stdout[key];
  }
});

describe('journey debug frames', () => {
  it.each([156, 120, 100, 80, 60])(
    'keeps realistic list entries to one aligned row per journey at %i columns',
    (width) => {
      setTerminal(width);
      loadSession();
      const session = states[1][0];
      const reason =
        'ReferenceError: "x" is not defined (Success URL - Goto:62) because something went wrong during script evaluation';
      states[1] = [
        {
          ...session,
          treeName: 'Registration-with-a-rather-long-name',
          user: 'bob.jones@example.com',
          failureReason: reason,
        },
        {
          ...session,
          transactionId: 'transaction-2',
          treeName: 'Login',
          user: 'volker.scheuber@example.com',
          failureReason:
            'java.lang.NullPointerException\n\tat com.example.Foo.bar(Foo.java:12)',
        },
      ];
      const output = render();
      assertFrame(output, width);
      const lines = output.split('\n');
      const headerIndex = lines.findIndex((line) => line.includes('STATUS'));
      const header = lines[headerIndex];
      const rows = lines.slice(headerIndex + 1, -1);
      expect(rows).toHaveLength(states[1].length);
      const journeyStart = header.indexOf('JOURNEY');
      const userStart = header.indexOf('USER');
      const ageStart = header.indexOf('AGE');
      const detailStart = header.indexOf('DETAIL');
      for (const [index, row] of rows.entries()) {
        expect(row.slice(journeyStart, userStart).trim()).toBe(
          index === 0
            ? width >= 100
              ? 'Registration-with-a-rather-…'
              : width === 80
                ? 'Registra…'
                : 'Regist…'
            : 'Login'
        );
        expect(row.slice(userStart, ageStart).trim()).toMatch(
          index === 0 ? /^bob/ : /^vol/
        );
        expect(row.slice(ageStart, detailStart).trim()).toBe('0s');
        expect(row.slice(detailStart, detailStart + 2)).toBe('- ');
      }
      expect(rows[1]).not.toMatch(/[\n\r\t]/);
      if (width === 156) {
        expect(rows[0]).toContain(reason.slice(0, 70));
        expect(rows[1]).toContain(
          'java.lang.NullPointerException at com.example.Foo.bar(Foo.java:12)'
        );
      }
    }
  );

  it('aligns multiline event outcome continuations to OUTCOME at 80 columns', () => {
    setTerminal(80);
    loadSession();
    const event = states[1][0].events[0];
    event.step = 'Tree completed';
    event.outcome =
      'Script failed because a referenced value was missing during evaluation of the authentication journey.\n' +
      '\tat com.example.Foo.bar(Foo.java:12)\n' +
      'Caused by: java.lang.NullPointerException';
    render();
    keypress({ name: 'enter' });
    const output = render();
    assertFrame(output, 80);
    const lines = output.split('\n');
    const headerIndex = lines.findIndex((line) => line.includes('OUTCOME'));
    const outcomeColumn = lines[headerIndex].indexOf('OUTCOME');
    const rows = lines.slice(headerIndex + 1, -1);
    expect(rows.length).toBeGreaterThan(3);
    for (const row of rows.slice(1)) {
      expect(row.slice(2, outcomeColumn)).toBe(' '.repeat(outcomeColumn - 2));
    }
    const values = rows.map((row) => row.slice(outcomeColumn, -2).trimEnd());
    expect(values.join('').replace(/\s/g, '')).toBe(
      event.outcome.replace(/\s/g, '')
    );
    expect(values.some((value) => value.startsWith('    at '))).toBe(true);
    expect(values.some((value) => value.startsWith('Caused by:'))).toBe(true);
  });

  it.each([40, 60, 80, 120, 156, 240])(
    'fits list, journey detail, and multiline event detail to %i columns',
    (width) => {
      setTerminal(width);
      loadSession();
      assertFrame(render(), width);
      keypress({ name: 'enter' });
      const detail = render();
      expect(detail).toContain('Journey detail');
      assertFrame(detail, width);
      keypress({ name: 'enter' });
      const output = render();
      expect(output).toContain('Event detail');
      assertFrame(output, width);
      expect(output).not.toMatch(/[\t\r]/);

      const lines = output.split('\n');
      const start = lines.findIndex((line) => line.includes('Exception:'));
      const valueLines = lines
        .slice(start, -1)
        .map((line) => line.slice(13, -2).trimEnd());
      // Ignore wrap boundaries, but verify no stack-trace content was lost.
      expect(valueLines.join('').replace(/\s/g, '')).toBe(
        exception.replace(/\s/g, '')
      );
      expect(valueLines.some((line) => /^ {4}at(?: |$)/.test(line))).toBe(true);
      expect(valueLines).toContain('');
    }
  );

  it('uses 120 columns when stdout is not a terminal', () => {
    setTerminal(200, false);
    assertFrame(render(), 120);
  });

  it('uses 120 columns when the terminal reports no width', () => {
    setTerminal(undefined);
    assertFrame(render(), 120);
  });

  it('redraws at the new terminal width after resize and removes the listener', () => {
    setTerminal(156);
    loadSession();
    const initialListeners = process.stdout.listenerCount('resize');
    const cleanup = effects[0]();
    expect(process.stdout.listenerCount('resize')).toBe(initialListeners + 1);
    try {
      setTerminal(60);
      process.stdout.emit('resize');
      assertFrame(render(), 60);
    } finally {
      cleanup();
    }
    expect(process.stdout.listenerCount('resize')).toBe(initialListeners);
  });

  it('uses a 40-column minimum on a 30-column terminal', () => {
    setTerminal(30);
    assertFrame(render(), 40);
  });

  it('wraps empty-state text and bounds long filter titles', () => {
    setTerminal(40);
    assertFrame(render({ journeyId: 'a'.repeat(100) }), 40);
  });

  it('bounds deeply indented values and long raw-field labels', () => {
    setTerminal(40);
    loadSession();
    states[1][0].events[0].raw = {
      ['long'.repeat(30)]: ' '.repeat(100) + 'x'.repeat(100),
    };
    render();
    keypress({ name: 'enter' });
    render();
    keypress({ name: 'enter' });
    const output = render();
    assertFrame(output, 40);
    const labelRow = output.split('\n').find((line) => line.includes('Long'));
    const label = labelRow.slice(2, 36);
    expect(label).toHaveLength(34);
    expect(label).toBe('Long' + 'long'.repeat(7) + 'l…');
    expect(labelRow[36]).toBe(' ');
  });
});
