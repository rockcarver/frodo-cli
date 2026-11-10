import cp from 'child_process';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

/**
 * The sub-command picker lists the commands in alphabetical order, the order
 * the help of the same command uses (sortSubcommands). It used to list them in
 * the order the group registered them, which nobody can predict.
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

const ENV = {
  FRODO_HOST: '',
  FRODO_REALM: '',
  FRODO_USERNAME: '',
  FRODO_PASSWORD: '',
  FRODO_SA_ID: '',
  FRODO_SA_JWK: '',
  FRODO_CREDENTIAL: '',
  FRODO_NO_PROMPT: '',
  NO_COLOR: '__FRODO_PTY_DELETE__',
};

/** The names the picker lists, in the order it lists them, from the last drawn frame. */
function pickerNames(plain) {
  const frame = plain.split('┌ ? Choose a sub-command').pop();
  return [...frame.matchAll(/^│ [› ] (\S+)/gm)].map((match) => match[1]);
}

suite('the sub-command picker, on a real terminal', () => {
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

  function pick(args, group) {
    const run = runShellScenario({
      homeDir: home,
      allowPrompting: true,
      args,
      env: ENV,
      actions: [
        {
          type: 'wait_plain',
          regex: `Choose a sub-command for '${group}'`,
          timeoutMs: 30000,
        },
        { type: 'sleep', ms: 500 },
        { type: 'capture', label: 'picker' },
      ],
    });
    return pickerNames(run.captures.picker.plain);
  }

  const alphabetical = (names) =>
    [...names].sort((left, right) => left.localeCompare(right));

  test('1: a group lists its commands alphabetically', () => {
    const names = pick(['journey'], 'journey');
    expect(names.length).toBeGreaterThan(5);
    expect(names).toEqual(alphabetical(names));
    expect(names).toContain('validate');
    expect(names.indexOf('delete')).toBeLessThan(names.indexOf('list'));
  });

  test('2: the root lists its groups alphabetically', () => {
    const names = pick([], 'frodo');
    // the picker shows one page of the list
    expect(names.length).toBeGreaterThan(10);
    expect(names).toEqual(alphabetical(names));
  });
});
