import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

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

function assertFrame(output, width) {
  expect(output).not.toContain('Internal error');
  for (const line of output.split('\n')) {
    expect(line.length).toBe(width);
    expect(line).toMatch(/^[┌│└].*[┐│┘]$/);
  }
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
    const cleanup = effects[0]();
    try {
      setTerminal(60);
      process.stdout.emit('resize');
      assertFrame(render(), 60);
    } finally {
      cleanup();
    }
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
    assertFrame(render(), 40);
  });
});
