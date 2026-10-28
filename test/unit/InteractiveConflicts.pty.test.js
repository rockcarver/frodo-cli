import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

/**
 * Interactive mode must not assemble a command line the CLI itself rejects
 * (issue #967, cli record 0032), checked on a real terminal.
 * `frodo agent export` takes one of -i, -a, -A or -g; -A cannot be combined
 * with -f. Nothing here reaches a tenant: both prompts open before login, and
 * every scenario ends by dismissing the prompt.
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

// A complete connection, so the Connection page stays closed.
const connection = {
  FRODO_HOST: 'https://x.example.invalid/am',
  FRODO_REALM: '',
  FRODO_USERNAME: 'someone',
  FRODO_PASSWORD: 'not-a-real-password',
  FRODO_SA_ID: '',
  FRODO_SA_JWK: '',
  FRODO_CREDENTIAL: '',
  FRODO_NO_PROMPT: '',
  FRODO_CONNECTION_PROFILES_PATH: '__FRODO_PTY_DELETE__',
  NO_COLOR: '__FRODO_PTY_DELETE__',
};

suite('interactive mode and conflicting options, on a real terminal', () => {
  let home;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = createShellTestHome();
  });

  afterEach(() => {
    removeShellTestHome(home);
  });

  function run(args) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: {
        ...connection,
        FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
      },
      args,
      actions: [
        {
          type: 'wait_plain',
          regex: 'Choose what to export',
          timeoutMs: 20000,
        },
        { type: 'sleep', ms: 400 },
        { type: 'capture', label: 'picker' },
        { type: 'key', name: 'escape' },
        { type: 'sleep', ms: 800 },
      ],
    });
  }

  test('the one-of picker does not offer -A when -f was given, and says why', () => {
    const picker = run(['agent', 'export', '-f', 'out.json']).captures.picker
      .plain;
    expect(picker).toContain('-i, --agent-id');
    expect(picker).toContain('-a, --all');
    expect(picker).toContain('-g, --global');
    expect(picker).not.toMatch(/-A, --all-separate\s+--/);
    expect(picker).toContain('Not offered');
    expect(picker).toMatch(/-A, --all-separate[^\n]* \(with -f, --file/);
  });

  test('without -f the same picker offers -A', () => {
    const picker = run(['agent', 'export']).captures.picker.plain;
    expect(picker).toContain('-A, --all-separate');
    expect(picker).not.toContain('Not offered');
  });

  test('a saved default that conflicts with -f is skipped, so the picker still opens', () => {
    fs.mkdirSync(path.join(home, '.frodo'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.frodo', 'Defaults.json'),
      JSON.stringify({ 'frodo agent export': { allSeparate: true } })
    );
    // Applied, the default would satisfy the one-of group with -A, and the
    // command would run with -A and -f together. Skipped, the group is open.
    const picker = run(['agent', 'export', '-f', 'out.json']).captures.picker
      .plain;
    expect(picker).toContain('Choose what to export');
    expect(picker).not.toMatch(/-A, --all-separate\s+--/);
  });
});
