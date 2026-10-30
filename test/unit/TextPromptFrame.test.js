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

// Render-level frame integrity for the text prompt (promptInput and
// promptPassword: a missing option value, the host typed by hand, the
// search before a long list): the same three parts as every picker -- the
// Navigate menu, the question in a box, the command footer -- at every
// terminal width and with hostile text. State is seeded by hook order,
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
  () => import('../../src/utils/interactive/PromptGate.ts')
);

/** The view's useState calls in order (a new hook before them shifts these). */
const STATE = { value: 0, status: 1, width: 2 };

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

function render(config, seed = {}) {
  for (const [index, value] of Object.entries(seed)) {
    harness.states[Number(index)] = value;
  }
  return harness.render(view, { suppress: false, ...config });
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

describe('text prompt frames', () => {
  it.each(FRAME_WIDTHS)(
    'keeps the silhouette at %i columns with a long question and hostile typed text',
    (width) => {
      setTerminal(width);
      for (const typed of Object.values(HOSTILE_TEXTS)) {
        harness.reset();
        assertFrame(
          render(
            { message: HOSTILE_TEXTS.longTitleText },
            { [STATE.value]: typed }
          ),
          width
        );
      }
      expect(harness.states[STATE.width]).toBe(width);
    }
  );

  it('draws at the 120-column default when stdout is not a terminal', () => {
    setTerminal(200, false);
    assertFrame(render({ message: 'Enter a value for --iss <issuer>:' }), 120);
    expect(harness.states[STATE.width]).toBe(120);
  });

  it('is the Navigate menu, the boxed question and the entry row', () => {
    setTerminal(100);
    const lines = visibleLines(
      render(
        { message: 'Enter a value for --iss <issuer>:' },
        { [STATE.value]: 'https://issuer.example' }
      )
    );
    const text = lines.join('\n');
    expect(lines[0]).toMatch(/^┌ Navigate ─+┐$/);
    expect(text).toContain('[ENTER] commit');
    expect(text).toContain('[ESC] back out');
    expect(text).toContain('type a value');
    // keys that do nothing in a text prompt are not offered
    expect(text).not.toContain('move');
    expect(text).toMatch(/┌ \? Enter a value for --iss <issuer>: ─+┐/);
    expect(text).toMatch(/│ › https:\/\/issuer\.example +│/);
  });

  it('shows the default muted until something is typed', () => {
    setTerminal(100);
    expect(render({ message: 'q', default: 'alpha' })).toMatch(
      /│ › \(alpha\) +│/
    );
    harness.reset();
    expect(
      render({ message: 'q', default: 'alpha' }, { [STATE.value]: 'beta' })
    ).not.toContain('(alpha)');
  });
});

describe('text prompt footer', () => {
  it('shows a static footer as given, under the frame', () => {
    setTerminal(100);
    const lines = visibleLines(
      render({ message: 'q', preview: 'frodo admin x' })
    );
    expect(lines.at(-1)).toBe('frodo admin x');
    expect(lines.at(-2)).toMatch(/^└─+┘$/);
  });

  it('calls a footer function on every render with the text typed so far', () => {
    setTerminal(100);
    const preview = jest.fn((typed) => `frodo admin x --iss ${typed}`);
    render({ message: 'q', preview }, { [STATE.value]: 'abc' });
    expect(preview).toHaveBeenLastCalledWith('abc');
    expect(visibleLines(render({ message: 'q', preview })).at(-1)).toBe(
      'frodo admin x --iss abc'
    );
  });

  it('has no footer when none is given, and is still framed', () => {
    setTerminal(100);
    assertFrame(render({ message: 'q' }), 100);
  });
});

describe('hidden text prompt', () => {
  it('draws asterisks and never the secret, in the frame or in the footer', () => {
    setTerminal(100);
    const preview = jest.fn(() => 'frodo conn save --password');
    const output = render(
      { message: 'Enter a value for --password:', suppress: true, preview },
      { [STATE.value]: 's3cret-value' }
    );
    expect(output).not.toContain('s3cret-value');
    expect(output).toContain('************');
    expect(output).toContain('the value (hidden)');
    expect(preview).toHaveBeenCalledWith('');
    expect(preview).not.toHaveBeenCalledWith('s3cret-value');
  });

  it('does not show a default', () => {
    setTerminal(100);
    expect(
      render({ message: 'q', suppress: true, default: 'hunter2' })
    ).not.toContain('hunter2');
  });
});

describe('text prompt once settled', () => {
  it('is one line when done and when declined (the frame is erased either way)', () => {
    setTerminal(100);
    expect(
      render({ message: 'q' }, { [STATE.status]: 'done', [STATE.value]: 'x' })
    ).toBe('? q x');
    harness.reset();
    expect(render({ message: 'q' }, { [STATE.status]: 'declined' })).toBe(
      '? q (no input)'
    );
  });
});
