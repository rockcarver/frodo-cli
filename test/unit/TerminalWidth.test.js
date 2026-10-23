import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

let stateIndex;
let states;
let effects;
let effectDeps;

jest.unstable_mockModule('@inquirer/core', () => ({
  useEffect: (effect, deps) => {
    effects.push(effect);
    effectDeps.push(deps);
  },
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

const { MIN_FRAME_WIDTH, terminalFrameWidth, useTerminalWidth } =
  await import('../../src/utils/interactive/TerminalWidth.ts');

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

/** One render pass of a component that calls the hook. */
function renderHook() {
  stateIndex = 0;
  return useTerminalWidth();
}

beforeEach(() => {
  states = [];
  effects = [];
  effectDeps = [];
});

afterEach(() => {
  for (const [key, descriptor] of Object.entries(stdoutProperties)) {
    if (descriptor) Object.defineProperty(process.stdout, key, descriptor);
    else delete process.stdout[key];
  }
});

describe('terminalFrameWidth', () => {
  it('follows the terminal columns on a TTY', () => {
    setTerminal(156);
    expect(terminalFrameWidth()).toBe(156);
    setTerminal(80);
    expect(terminalFrameWidth()).toBe(80);
  });

  it('never goes below the 40-column minimum', () => {
    expect(MIN_FRAME_WIDTH).toBe(40);
    setTerminal(30);
    expect(terminalFrameWidth()).toBe(40);
    setTerminal(40);
    expect(terminalFrameWidth()).toBe(40);
    setTerminal(41);
    expect(terminalFrameWidth()).toBe(41);
  });

  it('uses 120 columns when stdout is not a TTY, whatever it reports', () => {
    setTerminal(200, false);
    expect(terminalFrameWidth()).toBe(120);
  });

  it('uses 120 columns when the TTY reports no width', () => {
    setTerminal(undefined);
    expect(terminalFrameWidth()).toBe(120);
    setTerminal(0);
    expect(terminalFrameWidth()).toBe(120);
  });
});

describe('useTerminalWidth', () => {
  it('starts at the current frame width', () => {
    setTerminal(100);
    expect(renderHook()).toBe(100);
  });

  it('listens for resize while mounted and re-reads the width on each', () => {
    setTerminal(156);
    const before = process.stdout.listenerCount('resize');
    renderHook();
    expect(effects).toHaveLength(1);
    const cleanup = effects[0]();
    try {
      expect(process.stdout.listenerCount('resize')).toBe(before + 1);
      setTerminal(60);
      process.stdout.emit('resize');
      expect(renderHook()).toBe(60);
      setTerminal(20);
      process.stdout.emit('resize');
      expect(renderHook()).toBe(40);
    } finally {
      cleanup();
    }
  });

  it('removes its resize listener when the prompt closes', () => {
    setTerminal(156);
    const before = process.stdout.listenerCount('resize');
    renderHook();
    const cleanup = effects[0]();
    cleanup();
    expect(process.stdout.listenerCount('resize')).toBe(before);
  });

  it('registers its listener once on mount: the effect has an empty dependency list', () => {
    setTerminal(156);
    renderHook();
    expect(effectDeps).toEqual([[]]);
  });
});
