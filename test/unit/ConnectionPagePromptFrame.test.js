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
// hostile text. State is seeded by hook order, pinned by STATE below. The
// second half is its behaviour once a login was made on it (record 0046): the
// status line, the Realm row and its choice box, the key hints.

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
  realm: 8,
  realmCursor: 9,
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

// -- record 0046: the page once it has logged in ----------------------------

const { connectionSnapshot } =
  await import('../../src/utils/interactive/ConnectionPageState.ts');

const fieldRows = (values = ['h', 'u', 'p']) =>
  ['host', 'username', 'password'].map((key, index) => ({
    key,
    label: key,
    value: values[index],
  }));

const REALM = {
  label: 'realm',
  defaultValue: 'alpha',
  defaultText: 'alpha',
  choices: [
    { value: 'alpha', name: 'alpha' },
    { value: 'bravo', name: 'bravo' },
    { value: 'charlie', name: 'charlie', description: 'inactive' },
  ],
  message: 'Choose a realm (default: alpha):',
};

/** A page that logged in with `rows`, offering the realms. */
const connectedConfig = (extra = {}) => ({
  message: 'Connection:',
  rows: fieldRows(),
  logsIn: true,
  connected: { who: 'someone', snapshot: connectionSnapshot(fieldRows()) },
  realm: REALM,
  ...extra,
});

/** Draws the view on the current state and delivers one key to the handler it registered. */
function press(config, key, line = '') {
  harness.stateIndex = 0;
  harness.refIndex = 0;
  harness.effects = [];
  const done = jest.fn();
  view(config, done);
  harness.keypress(key, { line, clearLine: () => {} });
  return done;
}

describe('connectionPage once logged in', () => {
  beforeEach(() => {
    setTerminal(100);
  });

  it('says who is logged in, shows the Realm row with its default, and Done says next', () => {
    const frame = render(connectedConfig());
    expect(frame).toContain('Connected as someone');
    expect(frame).toMatch(/realm: alpha \(default\)/);
    expect(frame).toContain('Done — continue with these values');
    expect(frame).toContain('[ENTER] next');
    expect(frame).not.toContain('Logging in');
  });

  it('opens on Done: Enter keeps the default realm', () => {
    render(connectedConfig());
    // three field rows, the Realm row, then Done
    expect(harness.states[STATE.active]).toBe(4);
  });

  it('shows no status and no Realm row on a page that has not logged in, and Done says connect', () => {
    const frame = render(
      {
        message: 'Connection:',
        rows: fieldRows(),
        logsIn: true,
      },
      { [STATE.active]: 3 }
    );
    expect(frame).not.toContain('Connected');
    expect(frame).not.toContain('realm:');
    expect(frame).toContain('Done — log in with these values');
    expect(frame).toContain('[ENTER] connect');
  });

  it('says next, not connect, on a page that does not log in', () => {
    const frame = render(
      { message: 'Connection:', rows: fieldRows(), logsIn: false },
      { [STATE.active]: 3 }
    );
    expect(frame).toContain('[ENTER] next');
    expect(frame).not.toContain('connect');
  });

  it('says next on an incomplete page: it cannot log in', () => {
    const frame = render(
      {
        message: 'Connection:',
        rows: fieldRows(['h', 'u', undefined]),
        logsIn: true,
      },
      { [STATE.active]: 3 }
    );
    expect(frame).toContain('[ENTER] next');
  });

  it('drops the status line, the Realm row and the connect label with an edit made after the login', () => {
    // the rows on the page are no longer the rows the login was made with
    const frame = render(connectedConfig(), {
      [STATE.rows]: fieldRows(['h', 'u', 'changed']),
      [STATE.active]: 3,
    });
    expect(frame).not.toContain('Connected');
    expect(frame).not.toContain('realm:');
    expect(frame).toContain('[ENTER] connect');
  });

  it('shows a field row as the key hint says: edit', () => {
    const frame = render(connectedConfig(), { [STATE.active]: 0 });
    expect(frame).toContain('[ENTER] edit');
  });

  it('shows the choice made on the row, without the default note', () => {
    const frame = render(connectedConfig(), { [STATE.realm]: 'bravo' });
    expect(frame).toMatch(/realm: bravo\s*│/);
    expect(frame).not.toMatch(/realm: bravo \(default\)/);
  });

  it.each(FRAME_WIDTHS)(
    'keeps the silhouette at %i columns with hostile text in the status, the notes and the realms',
    (width) => {
      setTerminal(width);
      harness.reset();
      const hostile = connectedConfig({
        connected: {
          who: HOSTILE_TEXTS.multiLine,
          snapshot: connectionSnapshot(fieldRows()),
        },
        realm: {
          ...REALM,
          defaultText: HOSTILE_TEXTS.longDottedNames,
          message: HOSTILE_TEXTS.longTitleText,
          choices: [
            { value: 'alpha', name: HOSTILE_TEXTS.veryLongWord },
            {
              value: 'bravo',
              name: HOSTILE_TEXTS.tabbedStackTrace,
              description: HOSTILE_TEXTS.deepIndent,
            },
          ],
        },
      });
      assertFrame(render(hostile), width);
      for (const seed of [
        { [STATE.editing]: 'realm' },
        { [STATE.editing]: 'realm', [STATE.draft]: 'b' },
        { [STATE.editing]: 'realm', [STATE.draft]: 'no match at all' },
        { [STATE.editing]: 'realm', [STATE.realmCursor]: 1 },
      ]) {
        harness.reset();
        assertFrame(render(hostile, seed), width);
      }
    }
  );

  it('keeps the silhouette with the failure shown, at every width', () => {
    for (const width of FRAME_WIDTHS) {
      setTerminal(width);
      harness.reset();
      assertFrame(
        render({
          message: 'Connection:',
          rows: fieldRows(),
          failure: HOSTILE_TEXTS.multiLine,
        }),
        width
      );
    }
  });
});

describe('connectionPage failure', () => {
  beforeEach(() => {
    setTerminal(100);
  });

  it('shows the failure in the frame, no Done row, and only close as the key', () => {
    const frame = render({
      message: 'Connection:',
      rows: fieldRows(),
      logsIn: true,
      failure: 'Error getting tokens: Login failure',
    });
    expect(frame).toContain(
      'Login failed: Error getting tokens: Login failure'
    );
    expect(frame).toContain('[ENTER] close');
    expect(frame).not.toContain('Done —');
    expect(frame).not.toContain('›');
  });

  it.each([['enter'], ['escape']])(
    '%s closes it and resolves the page; nothing is edited',
    (name) => {
      harness.reset();
      const done = press(
        { message: 'Connection:', rows: fieldRows(), failure: 'x' },
        { name }
      );
      expect(done).toHaveBeenCalledTimes(1);
      expect(done.mock.calls[0][0]).not.toBe(EXIT_ALL);
    }
  );

  it('ignores the other keys', () => {
    harness.reset();
    const done = press(
      { message: 'Connection:', rows: fieldRows(), failure: 'x' },
      { name: 'down' }
    );
    expect(done).not.toHaveBeenCalled();
  });
});

describe('connectionPage Realm row keys', () => {
  beforeEach(() => {
    setTerminal(100);
    harness.reset();
  });

  it('concludes with the rows and no realm when Done is pressed on the connected page', () => {
    const done = press(connectedConfig(), { name: 'enter' });
    expect(done).toHaveBeenCalledTimes(1);
    const result = done.mock.calls[0][0];
    expect(result.host).toBe('h');
    expect(result.realm).toBeUndefined();
    expect(result.rows).toHaveLength(3);
    expect(result.openEditor).toBeUndefined();
  });

  it('opens the realms on Enter at the Realm row, with the cursor on the row in effect', () => {
    // render once so the state exists, then move to the Realm row (index 3)
    render(connectedConfig());
    harness.states[STATE.active] = 3;
    harness.states[STATE.realm] = 'bravo';
    press(connectedConfig(), { name: 'enter' });
    expect(harness.states[STATE.editing]).toBe('realm');
    expect(harness.states[STATE.realmCursor]).toBe(1);
    expect(harness.states[STATE.draft]).toBe('');
  });

  it('picks the highlighted realm on Enter and closes the box', () => {
    render(connectedConfig());
    harness.states[STATE.editing] = 'realm';
    harness.states[STATE.realmCursor] = 1;
    press(connectedConfig(), { name: 'enter' });
    expect(harness.states[STATE.realm]).toBe('bravo');
    expect(harness.states[STATE.editing]).toBe(null);
  });

  it('keeps the default when the default is picked', () => {
    render(connectedConfig());
    harness.states[STATE.editing] = 'realm';
    harness.states[STATE.realm] = 'bravo';
    harness.states[STATE.realmCursor] = 0;
    press(connectedConfig(), { name: 'enter' });
    expect(harness.states[STATE.realm]).toBeUndefined();
  });

  it('picks from the narrowed list: the cursor is on the first match', () => {
    render(connectedConfig());
    harness.states[STATE.editing] = 'realm';
    harness.states[STATE.draft] = 'char';
    harness.states[STATE.realmCursor] = 0;
    press(connectedConfig(), { name: 'enter' });
    expect(harness.states[STATE.realm]).toBe('charlie');
  });

  it('moves the cursor within the list and clamps at both ends', () => {
    render(connectedConfig());
    harness.states[STATE.editing] = 'realm';
    harness.states[STATE.realmCursor] = 2;
    press(connectedConfig(), { name: 'down' });
    expect(harness.states[STATE.realmCursor]).toBe(2);
    press(connectedConfig(), { name: 'up' });
    expect(harness.states[STATE.realmCursor]).toBe(1);
    harness.states[STATE.realmCursor] = 0;
    press(connectedConfig(), { name: 'up' });
    expect(harness.states[STATE.realmCursor]).toBe(0);
  });

  it('narrows the list by what is typed and puts the cursor on the first match', () => {
    render(connectedConfig());
    harness.states[STATE.active] = 3;
    harness.states[STATE.editing] = 'realm';
    harness.states[STATE.realmCursor] = 2;
    press(connectedConfig(), { name: 'r' }, 'br');
    expect(harness.states[STATE.draft]).toBe('br');
    expect(harness.states[STATE.realmCursor]).toBe(0);
    const box = harness
      .render(view, connectedConfig())
      .split('Choose a realm')[1];
    // one row is left in the box: bravo, under the cursor
    const rows = box.split('\n').filter((line) => line.startsWith('│'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/^│ › bravo/);
  });

  it('does nothing on Enter when no realm matches', () => {
    render(connectedConfig());
    harness.states[STATE.editing] = 'realm';
    harness.states[STATE.draft] = 'zzz';
    harness.states[STATE.realm] = 'bravo';
    press(connectedConfig(), { name: 'enter' });
    expect(harness.states[STATE.realm]).toBe('bravo');
    expect(harness.states[STATE.editing]).toBe(null);
  });

  it('opens the grace window on Escape in the box instead of leaving the page', () => {
    render(connectedConfig());
    harness.states[STATE.editing] = 'realm';
    const done = press(connectedConfig(), { name: 'escape' });
    expect(done).not.toHaveBeenCalled();
    expect(harness.states[STATE.escapeGraceOpen]).toBe(true);
    expect(harness.states[STATE.editing]).toBe('realm');
  });

  it('forgets the realm chosen when a row is edited after the login', () => {
    render(connectedConfig());
    harness.states[STATE.realm] = 'bravo';
    harness.states[STATE.editing] = 'username';
    harness.states[STATE.draft] = 'someone-else';
    press(connectedConfig(), { name: 'enter' });
    expect(harness.states[STATE.realm]).toBeUndefined();
    expect(
      harness.states[STATE.rows].find((row) => row.key === 'username').value
    ).toBe('someone-else');
  });

  it('returns no realm when the page is no longer the one the login was made for', () => {
    render(connectedConfig());
    harness.states[STATE.realm] = 'bravo';
    harness.states[STATE.rows] = fieldRows(['other', 'u', 'p']);
    const done = press(connectedConfig(), { name: 'enter' });
    // Done was not on the Realm row's index any more, but the page concludes only
    // on Done: the active row is the first
    expect(done).not.toHaveBeenCalledWith(
      expect.objectContaining({ realm: 'bravo' })
    );
  });

  it('gives the footer the chosen realm, and the highlighted one while the box is open', () => {
    const preview = jest.fn(() => 'footer');
    const config = connectedConfig({ preview });
    render(config, { [STATE.realm]: 'bravo' });
    expect(preview).toHaveBeenLastCalledWith(expect.any(Array), {
      realm: 'bravo',
    });
    harness.reset();
    render(config, {
      [STATE.editing]: 'realm',
      [STATE.realm]: 'bravo',
      [STATE.realmCursor]: 2,
    });
    expect(preview).toHaveBeenLastCalledWith(expect.any(Array), {
      realm: 'bravo',
      highlightedRealm: 'charlie',
    });
    harness.reset();
    render(config);
    expect(preview).toHaveBeenLastCalledWith(expect.any(Array), {});
  });
});

describe('connectionPage editor key', () => {
  beforeEach(() => {
    setTerminal(100);
    harness.reset();
  });

  it('advertises the key and resolves with openEditor while the Realm row is shown', () => {
    const config = connectedConfig({ hint: '→ 26 options' });
    expect(render(config)).toContain('[⏵] 26 options');
    harness.reset();
    const done = press(config, { name: 'right' });
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0][0].openEditor).toBe(true);
  });

  it('is silent without the hint, and on a page without the Realm row', () => {
    harness.reset();
    expect(render(connectedConfig())).not.toContain('[⏵]');
    harness.reset();
    expect(press(connectedConfig(), { name: 'right' })).not.toHaveBeenCalled();
    harness.reset();
    const idle = {
      message: 'Connection:',
      rows: fieldRows(),
      logsIn: true,
      hint: '→ 26 options',
    };
    expect(render(idle)).not.toContain('[⏵]');
    harness.reset();
    expect(press(idle, { name: 'right' })).not.toHaveBeenCalled();
  });

  it('opens again with the realm that was chosen', () => {
    render(connectedConfig({ realmChoice: 'bravo' }));
    expect(harness.states[STATE.realm]).toBe('bravo');
  });
});
