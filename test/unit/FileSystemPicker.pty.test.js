import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * The file system picker on a real terminal (record 0045): where the pass asks
 * for a path option as text, the user walks the file system instead. The
 * working directory of each run is a temporary tree, so the pages are known:
 *
 *   exports/  imports/{alpha.json,beta.txt}  config/  my files/  notes.txt  .hidden/
 *
 * The picker opens for a mandatory option that is missing (`config-manager
 * pull all` without -C), for the member of a one-of group the user chose (`journey
 * import`: -f), and for the value step of the invocation editor (--prompt). It
 * never opens for a complete command line.
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

const noCredentials = {
  FRODO_HOST: '',
  FRODO_REALM: '',
  FRODO_USERNAME: 'someone',
  FRODO_PASSWORD: 'not-a-password',
  FRODO_SA_ID: '',
  FRODO_SA_JWK: '',
  FRODO_CREDENTIAL: '',
  FRODO_NO_PROMPT: '',
  NO_COLOR: '__FRODO_PTY_DELETE__',
};

/** The page as last drawn: a capture holds every frame since the last clear. */
const lastFrame = (plain) => plain.split('┌ Navigate').pop();
/** The command under the frame: what follows the bottom wall of the panel (the terminal wraps a long one). */
const footer = (frame) => frame.split('└').pop().split('\n').slice(1).join('');
/** The rows of the list, as text. */
const rowsOf = (frame) =>
  frame
    .split('\n')
    .filter((line) => /^│ [› ] /.test(line))
    .map((line) => line.replace(/^│ [› ] /, '').replace(/\s*│$/, ''))
    .filter(Boolean);
/** The row the cursor is on. */
const cursorOf = (frame) =>
  frame
    .split('\n')
    .find((line) => /^│ › /.test(line))
    ?.replace(/^│ › /, '')
    .replace(/\s*│$/, '');

const down = (times = 1) =>
  Array.from({ length: times }, () => ({ type: 'key', name: 'down' }));
const settle = (ms = 400) => ({ type: 'sleep', ms });

suite('the file system picker, on a real terminal', () => {
  let home;
  let base;
  let work;
  let outside;
  let fakeAm;
  let recordPath;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(async () => {
    home = createShellTestHome();
    // realpath: the tree is reported by the process as it resolves it. The
    // working directory has a folder of its own to sit in, so the folder above
    // it holds nothing but it and the folder to pick from outside it: the
    // temporary folder of the machine is busy and long.
    base = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-picker-'))
    );
    work = path.join(base, 'work');
    outside = path.join(base, 'outside');
    fs.mkdirSync(work);
    fs.mkdirSync(outside);
    for (const folder of [
      'exports',
      'imports',
      'config',
      'my files',
      '.hidden',
    ]) {
      fs.mkdirSync(path.join(work, folder));
    }
    fs.writeFileSync(path.join(work, 'imports', 'alpha.json'), '{}');
    fs.writeFileSync(path.join(work, 'imports', 'beta.txt'), 'x');
    fs.writeFileSync(path.join(work, 'notes.txt'), 'x');
    fs.writeFileSync(path.join(work, 'saml.json'), '[]');
    fs.writeFileSync(path.join(work, '.secret'), 'x');
    recordPath = path.join(home, 'requests.jsonl');
    fakeAm = await startFakeAm({
      journey: 'password',
      trees: ['zion-login'],
      recordPath,
    });
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    removeShellTestHome(home);
    fs.rmSync(base, { recursive: true, force: true });
  });

  const host = () => `http://127.0.0.1:${fakeAm.port}/am`;

  const requests = () =>
    fs.existsSync(recordPath)
      ? fs
          .readFileSync(recordPath, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];

  /** The requests that are a login or a command, not the anonymous probe of the host that every run starts with. */
  const loginRequests = () =>
    requests().filter((request) => !/\/oauth2\/authorize/.test(request.url));

  /** Runs frodo in the temporary tree, on the fake AM, with prompting on. */
  function run(args, actions, { cwd = work } = {}) {
    return runShellScenario({
      homeDir: home,
      cwd,
      allowPrompting: true,
      env: {
        ...noCredentials,
        FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
      },
      args: [...args, '--type', 'classic'],
      actions,
    });
  }

  /** `config-manager pull all` without -C: the config folder is a mandatory folder to read. */
  const pullAll = (actions, options) =>
    run(['config-manager', 'pull', 'all', host()], actions, options);

  const toPicker = [
    { type: 'wait_plain', regex: 'Choose the folder for', timeoutMs: 30000 },
    settle(),
  ];

  describe('a mandatory folder that is missing', () => {
    test('opens in the working directory: the folder shown, folders first, hidden entries left out, the command live in the footer', () => {
      const result = pullAll([
        ...toPicker,
        { type: 'capture', label: 'page' },
        { type: 'clear_output' },
        ...down(1), // `..` is no pick
        settle(),
        { type: 'capture', label: 'up' },
      ]);
      const page = lastFrame(result.captures.page.plain);
      expect(page).toContain(
        'Choose the folder for -C, --config-folder <config-folder-path>:'
      );
      expect(page).toContain(`In ${work}`);
      expect(rowsOf(page)).toEqual([
        'Use this folder',
        '..',
        'config/',
        'exports/',
        'imports/',
        'my files/',
      ]);
      expect(cursorOf(page)).toBe('Use this folder');
      expect(page).not.toContain('.hidden');
      expect(page).not.toContain('notes.txt');
      // the footer is the command with what the cursor is on: the folder it is in
      expect(footer(page)).toContain(
        `config-manager pull all ${host()} --type classic --config-folder .`
      );
      // on a row that is no pick it is the command as it stands
      const up = lastFrame(result.captures.up.plain);
      expect(cursorOf(up)).toBe('..');
      expect(footer(up)).toContain('config-manager pull all');
      expect(footer(up)).not.toContain('--config-folder');
      // the keys: Enter says next, Escape ends the pick
      expect(page).toContain('[ENTER] next');
      expect(page).toContain('[ESC] cancel the pick');
    });

    test('opens a folder on Enter, goes back with `..` to the folder it came from, and uses a folder', () => {
      const result = pullAll([
        ...toPicker,
        ...down(2), // config/
        { type: 'key', name: 'enter' },
        { type: 'sleep', ms: 600 },
        { type: 'capture', label: 'inside' },
        { type: 'clear_output' },
        // inside: Use this folder, `..`; go back
        ...down(1),
        { type: 'key', name: 'enter' },
        { type: 'sleep', ms: 600 },
        { type: 'capture', label: 'back' },
      ]);
      const inside = lastFrame(result.captures.inside.plain);
      expect(inside).toContain(`In ${path.join(work, 'config')}`);
      expect(rowsOf(inside)).toEqual(['Use this folder', '..']);
      // the command already shows the folder the cursor is on: Use this folder
      expect(footer(inside)).toContain('--config-folder config');
      const back = lastFrame(result.captures.back.plain);
      expect(back).toContain(`In ${work}`);
      // the cursor is on the folder it came from
      expect(cursorOf(back)).toBe('config/');
    });

    test('commits a folder inside the working directory as a relative path the command can be typed with', () => {
      const result = pullAll([
        ...toPicker,
        ...down(3), // exports/
        { type: 'key', name: 'enter' },
        settle(600),
        { type: 'key', name: 'enter' }, // Use this folder
        { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 30000 },
        settle(),
        { type: 'capture', label: 'ready' },
      ]);
      const ready = lastFrame(result.captures.ready.plain);
      expect(footer(ready)).toContain('--config-folder exports');
      expect(footer(ready)).not.toContain(work);
    });

    test('commits a folder outside the working directory as an absolute path', () => {
      const result = pullAll([
        ...toPicker,
        ...down(1), // `..`
        { type: 'key', name: 'enter' },
        settle(600),
        // the folder above holds `outside/` and `work/`, the cursor on work/
        { type: 'key', name: 'up' },
        settle(),
        { type: 'key', name: 'enter' }, // open it
        settle(600),
        { type: 'key', name: 'enter' }, // Use this folder
        { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 30000 },
        settle(),
        { type: 'capture', label: 'ready' },
      ]);
      const ready = lastFrame(result.captures.ready.plain);
      expect(footer(ready)).toContain(`--config-folder ${outside}`);
    });

    test('quotes a name with a space, so the command shown can be typed again', () => {
      const result = pullAll([
        ...toPicker,
        ...down(5), // my files/
        { type: 'key', name: 'enter' },
        settle(600),
        { type: 'key', name: 'enter' }, // Use this folder
        { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 30000 },
        settle(),
        { type: 'capture', label: 'ready' },
      ]);
      expect(footer(lastFrame(result.captures.ready.plain))).toContain(
        "--config-folder 'my files'"
      );
    });

    test('Escape declines the pick: the command is not run', () => {
      const result = pullAll([
        ...toPicker,
        { type: 'key', name: 'escape' },
        { type: 'wait_exit', timeoutMs: 30000 },
      ]);
      expect(result.exitCode).toBe(1);
      expect(result.plainOutput).toContain(
        "required option '-C, --config-folder <config-folder-path>' not specified"
      );
      // nothing but the anonymous probe of the host reached the tenant: no login
      expect(loginRequests()).toEqual([]);
    });
  });

  describe('a file of a one-of group', () => {
    const importJourney = (actions, options) =>
      run(['journey', 'import', host()], actions, options);
    const toMembers = [
      { type: 'wait_plain', regex: 'Choose what to import', timeoutMs: 30000 },
      settle(),
    ];

    test('the member -f is chosen, then its file is picked: files shown, and the extension of the option does not hide any', () => {
      const result = importJourney([
        ...toMembers,
        { type: 'capture', label: 'members' },
        // -f is the third member (-a, -A, -f, -i)
        ...down(2),
        { type: 'key', name: 'enter' },
        { type: 'wait_plain', regex: 'Choose the file for', timeoutMs: 30000 },
        settle(),
        { type: 'capture', label: 'page' },
        { type: 'clear_output' },
        ...down(2), // config/ exports/ ... first file
      ]);
      expect(lastFrame(result.captures.members.plain)).toContain(
        '-f, --file <file>'
      );
      const page = lastFrame(result.captures.page.plain);
      expect(page).toContain('Choose the file for -f, --file <file>:');
      expect(rowsOf(page)).toEqual([
        '..',
        'config/',
        'exports/',
        'imports/',
        'my files/',
        'notes.txt',
        'saml.json',
      ]);
      // reading: nothing is made here
      expect(page).not.toContain('New file');
      expect(page).not.toContain('New folder');
    });

    test('picks a file in a sub-folder, and the command shows it relative to the working directory', () => {
      const result = importJourney([
        ...toMembers,
        ...down(2),
        { type: 'key', name: 'enter' },
        { type: 'wait_plain', regex: 'Choose the file for', timeoutMs: 30000 },
        settle(),
        // the cursor starts on the first entry: config/. imports/ is two rows down
        ...down(2),
        { type: 'key', name: 'enter' },
        { type: 'wait_plain', regex: 'alpha\\.json', timeoutMs: 30000 },
        settle(),
        { type: 'capture', label: 'inside' },
        // `..`, alpha.json, beta.txt: the cursor is on the first file
        { type: 'key', name: 'enter' },
        { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 30000 },
        settle(),
        { type: 'capture', label: 'ready' },
      ]);
      expect(rowsOf(lastFrame(result.captures.inside.plain))).toEqual([
        '..',
        'alpha.json',
        'beta.txt',
      ]);
      expect(footer(lastFrame(result.captures.ready.plain))).toContain(
        '--file imports/alpha.json'
      );
    });

    test('Escape declines the pick, and the group stays unsatisfied: the command is not run', () => {
      const result = importJourney([
        ...toMembers,
        ...down(2),
        { type: 'key', name: 'enter' },
        { type: 'wait_plain', regex: 'Choose the file for', timeoutMs: 30000 },
        settle(),
        { type: 'key', name: 'escape' },
        { type: 'wait_exit', timeoutMs: 30000 },
      ]);
      expect(result.exitCode).toBe(1);
      expect(result.plainOutput).toMatch(/one of '.*' is required/);
      expect(loginRequests()).toEqual([]);
    });
  });

  describe('an extension filter', () => {
    test('shows the folders and the files of the extension, and says so', () => {
      const result = run(
        ['config-manager', 'pull', 'saml', host()],
        [
          {
            type: 'wait_plain',
            regex: 'Choose the file for',
            timeoutMs: 30000,
          },
          settle(),
          { type: 'capture', label: 'page' },
        ]
      );
      const page = lastFrame(result.captures.page.plain);
      expect(page).toContain('Files shown: .json');
      expect(rowsOf(page)).toEqual([
        '..',
        'config/',
        'exports/',
        'imports/',
        'my files/',
        'saml.json',
      ]);
      expect(page).not.toContain('notes.txt');
      // the files of a folder are filtered too
    });
  });

  describe('the invocation editor', () => {
    const exportJourney = (actions, options) =>
      run(
        ['journey', 'export', host(), '-i', 'zion-login', '--prompt'],
        actions,
        options
      );
    const toEditor = [
      {
        type: 'wait_plain',
        regex: "Optional options for 'export'",
        timeoutMs: 30000,
      },
      settle(500),
    ];
    /** Types the filter, marks the first match and commits the page. */
    const markAndCommit = (filter) => [
      { type: 'send', text: filter },
      settle(),
      { type: 'key', name: 'space' },
      settle(),
      { type: 'clear_output' },
      { type: 'key', name: 'enter' },
    ];

    test('the value step of -f is the picker, writing a file: New file, New folder, and the files of the folder', () => {
      const result = exportJourney([
        ...toEditor,
        ...markAndCommit('--file'),
        {
          type: 'wait_plain',
          regex: 'Choose or name the file',
          timeoutMs: 30000,
        },
        settle(),
        { type: 'capture', label: 'page' },
      ]);
      const page = lastFrame(result.captures.page.plain);
      expect(page).toContain('Choose or name the file for -f, --file <file>:');
      expect(rowsOf(page)).toEqual([
        'New file…',
        'New folder…',
        '..',
        'config/',
        'exports/',
        'imports/',
        'my files/',
        'notes.txt',
        'saml.json',
      ]);
      // the likely pick when a file is written: a new one, whose name is asked for
      expect(cursorOf(page)).toBe('New file…');
      expect(page).toContain('[ENTER] ask for a name');
    });

    test('an existing file is picked to be written over: Enter commits it to the option', () => {
      const result = exportJourney([
        ...toEditor,
        ...markAndCommit('--file'),
        {
          type: 'wait_plain',
          regex: 'Choose or name the file',
          timeoutMs: 30000,
        },
        settle(),
        ...down(7), // notes.txt
        settle(),
        { type: 'capture', label: 'page' },
        { type: 'key', name: 'enter' },
        { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 30000 },
        settle(),
        { type: 'capture', label: 'ready' },
      ]);
      const page = lastFrame(result.captures.page.plain);
      expect(cursorOf(page)).toBe('notes.txt');
      expect(page).toContain('[ENTER] commit');
      expect(footer(page)).toContain('--file notes.txt');
      expect(footer(lastFrame(result.captures.ready.plain))).toContain(
        '--file notes.txt'
      );
    });

    test('a new file is named and committed, but not made', () => {
      const result = exportJourney([
        ...toEditor,
        ...markAndCommit('--file'),
        {
          type: 'wait_plain',
          regex: 'Choose or name the file',
          timeoutMs: 30000,
        },
        settle(),
        { type: 'key', name: 'enter' }, // New file…
        { type: 'wait_plain', regex: 'Name of the new file', timeoutMs: 30000 },
        settle(),
        { type: 'send', text: 'journey-export.json' },
        settle(),
        { type: 'key', name: 'enter' },
        { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 30000 },
        settle(),
        { type: 'capture', label: 'ready' },
      ]);
      expect(footer(lastFrame(result.captures.ready.plain))).toContain(
        '--file journey-export.json'
      );
      expect(fs.existsSync(path.join(work, 'journey-export.json'))).toBe(false);
    });

    /** `journey export` with -f given, and the options page committed after the option was unmarked and marked again. */
    const exportWithFile = (file, actions) =>
      run(
        [
          'journey',
          'export',
          host(),
          '-i',
          'zion-login',
          '-f',
          file,
          '--prompt',
        ],
        [
          ...toEditor,
          { type: 'send', text: '--file' },
          settle(),
          { type: 'key', name: 'space' }, // marked already: this unmarks it
          settle(),
          { type: 'key', name: 'space' }, // and this marks it again: its value is asked for
          settle(),
          { type: 'clear_output' },
          { type: 'key', name: 'enter' },
          {
            type: 'wait_plain',
            regex: 'Choose or name the file',
            timeoutMs: 30000,
          },
          settle(),
          ...actions,
        ]
      );

    test('an option that has a value is asked for again when it is marked again: the picker opens where the value is, and Escape leaves the value', () => {
      const result = exportWithFile('notes.txt', [
        { type: 'capture', label: 'page' },
        { type: 'key', name: 'escape' },
        { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 30000 },
        settle(),
        { type: 'capture', label: 'ready' },
      ]);
      const page = lastFrame(result.captures.page.plain);
      expect(page).toContain(`In ${work}`);
      expect(cursorOf(page)).toBe('notes.txt');
      expect(footer(lastFrame(result.captures.ready.plain))).toContain(
        '--file notes.txt'
      );
    });

    test('a file picked replaces the value', () => {
      const result = exportWithFile('notes.txt', [
        ...down(1), // saml.json
        { type: 'key', name: 'enter' },
        { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 30000 },
        settle(),
        { type: 'capture', label: 'ready' },
      ]);
      const ready = footer(lastFrame(result.captures.ready.plain));
      expect(ready).toContain('--file saml.json');
      expect(ready).not.toContain('notes.txt');
    });

    test('a value that is not there yet starts in its folder, and is offered as the name of the new file', () => {
      const result = exportWithFile('exports/new.json', [
        { type: 'capture', label: 'page' },
        { type: 'key', name: 'enter' }, // the cursor is on New file…
        { type: 'wait_plain', regex: 'Name of the new file', timeoutMs: 30000 },
        settle(),
        { type: 'capture', label: 'name' },
        { type: 'key', name: 'enter' }, // the suggestion
        { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 30000 },
        settle(),
        { type: 'capture', label: 'ready' },
      ]);
      expect(lastFrame(result.captures.page.plain)).toContain(
        `In ${path.join(work, 'exports')}`
      );
      expect(lastFrame(result.captures.name.plain)).toContain('(new.json)');
      expect(footer(lastFrame(result.captures.ready.plain))).toContain(
        '--file exports/new.json'
      );
    });

    test('shows the dot files for --env-file, whose value usually is one, and reads: no New file', () => {
      const result = exportJourney([
        ...toEditor,
        ...markAndCommit('--env-file'),
        { type: 'wait_plain', regex: 'Choose the file for', timeoutMs: 30000 },
        settle(),
        { type: 'capture', label: 'page' },
      ]);
      const page = lastFrame(result.captures.page.plain);
      expect(page).toContain('Choose the file for --env-file <file>:');
      expect(rowsOf(page)).toEqual([
        '..',
        '.hidden/',
        'config/',
        'exports/',
        'imports/',
        'my files/',
        '.secret',
        'notes.txt',
        'saml.json',
      ]);
    });

    test('Escape in the picker leaves the option without a value', () => {
      const result = exportJourney([
        ...toEditor,
        ...markAndCommit('--file'),
        {
          type: 'wait_plain',
          regex: 'Choose or name the file',
          timeoutMs: 30000,
        },
        settle(),
        { type: 'key', name: 'escape' },
        { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 30000 },
        settle(),
        { type: 'capture', label: 'ready' },
      ]);
      const ready = lastFrame(result.captures.ready.plain);
      expect(footer(ready)).toContain('journey export');
      expect(footer(ready)).not.toContain('--file');
    });

    test('a new folder is asked for by name, refused with the reason until it is a name, then made and entered', () => {
      const result = exportJourney([
        ...toEditor,
        ...markAndCommit('--directory'),
        {
          type: 'wait_plain',
          regex: 'Choose or create the folder',
          timeoutMs: 30000,
        },
        settle(),
        { type: 'capture', label: 'page' },
        // Use this folder, New folder…
        ...down(1),
        { type: 'key', name: 'enter' },
        {
          type: 'wait_plain',
          regex: 'Name of the new folder',
          timeoutMs: 30000,
        },
        settle(),
        { type: 'send', text: 'a/b' },
        settle(),
        { type: 'key', name: 'enter' },
        { type: 'sleep', ms: 500 },
        { type: 'capture', label: 'separator' },
        { type: 'key', name: 'ctrl_u' },
        { type: 'send', text: 'config' },
        settle(),
        { type: 'key', name: 'enter' },
        { type: 'sleep', ms: 500 },
        { type: 'capture', label: 'existing' },
        { type: 'key', name: 'ctrl_u' },
        { type: 'send', text: '..' },
        settle(),
        { type: 'key', name: 'enter' },
        { type: 'sleep', ms: 500 },
        { type: 'capture', label: 'dots' },
        { type: 'key', name: 'ctrl_u' },
        { type: 'send', text: 'fresh' },
        settle(),
        { type: 'key', name: 'enter' },
        { type: 'sleep', ms: 800 },
        { type: 'capture', label: 'entered' },
        { type: 'clear_output' },
        // inside the new folder the cursor is on Use this folder
        { type: 'key', name: 'enter' },
        { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 30000 },
        settle(),
        { type: 'capture', label: 'ready' },
      ]);
      const page = lastFrame(result.captures.page.plain);
      expect(rowsOf(page).slice(0, 3)).toEqual([
        'Use this folder',
        'New folder…',
        '..',
      ]);
      const hint = (label) => lastFrame(result.captures[label].plain);
      expect(hint('separator')).toMatch(/A name has no \/ or \\ in it/);
      expect(hint('existing')).toContain('"config" exists already');
      expect(hint('dots')).toContain('".." is not a name');
      expect(hint('entered')).toContain(`In ${path.join(work, 'fresh')}`);
      expect(fs.statSync(path.join(work, 'fresh')).isDirectory()).toBe(true);
      // nothing else was made
      expect(fs.readdirSync(work).sort()).toEqual(
        [
          '.hidden',
          '.secret',
          'config',
          'exports',
          'fresh',
          'imports',
          'my files',
          'notes.txt',
          'saml.json',
        ].sort()
      );
      expect(footer(lastFrame(result.captures.ready.plain))).toContain(
        '--directory fresh'
      );
    });
  });

  describe('a command line that is complete', () => {
    /** Runs to the end: the login to the fake AM, then whatever the command does. */
    function runToEnd(args) {
      return run(args, [{ type: 'wait_exit', timeoutMs: 60000 }]);
    }

    test('opens no picker, however many path options it has: the command runs', () => {
      const result = runToEnd([
        'config-manager',
        'pull',
        'all',
        host(),
        '--config-folder',
        'config',
      ]);
      expect(result.plainOutput).toContain(`Exporting to ${work}`);
      expect(result.plainOutput).not.toContain('Navigate');
      expect(result.plainOutput).not.toContain('Choose the');
    });

    test('opens no picker for an optional -f and -D: the command has defaults for them', () => {
      const result = runToEnd([
        'journey',
        'export',
        host(),
        '-i',
        'zion-login',
      ]);
      expect(result.plainOutput).toContain(
        'Error exporting journey zion-login'
      );
      expect(result.plainOutput).not.toContain('Navigate');
      expect(result.plainOutput).not.toContain('Choose');
    });

    test('opens no picker for an import whose file is given, even when the file is not there', () => {
      const result = runToEnd([
        'journey',
        'import',
        host(),
        '-f',
        'missing.json',
      ]);
      expect(result.plainOutput).toContain('ENOENT');
      expect(result.plainOutput).not.toContain('Navigate');
      expect(result.plainOutput).not.toContain('Choose');
    });
  });
});
