import cp from 'child_process';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { answerReady } from '../utils/ReadyStep.js';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * The realm picker of `frodo config export`, on a real terminal.
 *
 * The realm limits the export only with `-r`, `--realm-only`, a boolean flag
 * (the realm itself is the positional after the host). So the picker opens
 * only when `-r` is set, no realm was named and the command line was
 * incomplete anyway (the host is missing, records 0001 and 0030); every
 * complete command line, with or without `-r`, opens nothing and exports what
 * it always exported.
 *
 * Logins, the realm list and the export itself go to a fake AM with the
 * realms alpha and bravo (it answers 404 to what it does not know, so the
 * export reports errors; this test is about which realms it asked for). The
 * realms a run exported are read from the request log of the fake AM.
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

const noCredentials = {
  FRODO_HOST: '',
  FRODO_REALM: '',
  FRODO_USERNAME: '',
  FRODO_PASSWORD: '',
  FRODO_CREDENTIAL: '',
  FRODO_NO_PROMPT: '',
  FRODO_SA_ID: 'test-account',
  FRODO_SA_JWK: serviceAccountJwk,
  NO_COLOR: '__FRODO_PTY_DELETE__',
};

/** The last request of an export of that realm. */
const lastOf = (realm) =>
  new RegExp(`realms/${realm}/realm-config/agents/TrustedJwtIssuer`);

/** The realm in the path of a realm-scoped request. */
const realmOf = (url) => url.match(/\/realms\/root\/realms\/([^/]+)\//)?.[1];

/** The picker as last drawn: a capture holds every frame since the last clear. */
const lastFrame = (plain) => plain.split('┌ Navigate').pop();
const footer = (frame) => frame.split('└').pop();

const ENTER = { type: 'key', name: 'enter' };
const DOWN = { type: 'key', name: 'down' };
const ESCAPE = { type: 'key', name: 'escape' };

suite('the realm picker of frodo config export, on a real terminal', () => {
  let home;
  let outDir;
  let recordPath;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(async () => {
    home = createShellTestHome();
    // the run writes where it is told to (-D), never into the checkout
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-ce-out-'));
    recordPath = path.join(home, 'requests.jsonl');
    fakeAm = await startFakeAm({
      journey: 'service-account',
      realms: ['alpha', 'bravo'],
      recordPath,
    });
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    removeShellTestHome(home);
    fs.rmSync(outDir, { recursive: true, force: true });
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

  /** The realms (sorted, once each) that the export asked for. */
  const realmsExported = () =>
    [
      ...new Set(
        requests()
          .map((request) => realmOf(request.url))
          .filter(Boolean)
      ),
    ].sort();

  /**
   * `frodo config export` with the host left out: the host is asked for, the
   * pass logs in and the picker opens (or does not), then the Ready step is
   * answered with Run. `choose` are the keys
   * after the host was entered; `picker` is whether the picker is expected,
   * `waitFor` the request that proves the export got as far as it should.
   */
  function withoutHost({ flags, choose = [], picker, waitFor, env = {} }) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: {
        ...noCredentials,
        ...env,
        FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
      },
      args: ['config', 'export', ...flags, '-D', outDir, '--type', 'cloud'],
      actions: [
        { type: 'wait_plain', regex: 'AM base URL:', timeoutMs: 60000 },
        { type: 'send_line', text: host() },
        // the host prompt put a prompt on the screen, so the pass ends in the Ready step;
        // the realm picker needs the login, which the pass makes, so it comes first
        // (records 0001, 0044)
        ...(picker
          ? [
              {
                type: 'wait_plain',
                regex: 'Choose a realm',
                timeoutMs: 60000,
              },
              { type: 'sleep', ms: 500 },
              { type: 'capture', label: 'picker' },
              { type: 'clear_output' },
              ...choose,
            ]
          : []),
        ...answerReady(),
        {
          type: 'wait_request',
          path: recordPath,
          regex: waitFor.source,
          timeoutMs: 100000,
        },
        { type: 'sleep', ms: 2500 },
        { type: 'capture', label: 'after' },
      ],
    });
  }

  /** A complete command line: the host (and what follows it) is given. */
  function withHost({ flags, operands = [], waitFor, directoryInFlags }) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: {
        ...noCredentials,
        FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
      },
      args: [
        'config',
        'export',
        ...flags,
        ...(directoryInFlags ? [] : ['-D', outDir]),
        host(),
        ...operands,
        '--type',
        'cloud',
      ],
      actions: [
        {
          type: 'wait_request',
          path: recordPath,
          regex: waitFor.source,
          timeoutMs: 100000,
        },
        { type: 'sleep', ms: 2500 },
      ],
    });
  }

  describe('-r with the host left out: the picker opens', () => {
    const flags = ['-a', '-r'];

    test('it offers the realms, the deployment default first, and no All realms row', () => {
      const run = withoutHost({
        flags,
        choose: [ENTER],
        picker: true,
        waitFor: lastOf('alpha'),
      });
      const frame = lastFrame(run.captures.picker.plain);
      expect(run.captures.picker.plain).toContain(
        'Choose a realm (default: alpha):'
      );
      const rows = [...frame.matchAll(/^│ ([› ]) (.+?)\s*│$/gm)].filter((row) =>
        ['alpha', 'bravo', 'All realms'].includes(row[2])
      );
      expect(rows.map((row) => row[2])).toEqual(['alpha', 'bravo']);
      expect(rows[0][1]).toBe('›');
      expect(run.captures.picker.plain).not.toContain('All realms');
      // the footer is the command as the default would run it
      expect(footer(frame)).toMatch(/frodo config export .* alpha /);
    });

    test('Enter keeps alpha and exports alpha only', () => {
      withoutHost({
        flags,
        choose: [ENTER],
        picker: true,
        waitFor: lastOf('alpha'),
      });
      expect(realmsExported()).toEqual(['alpha']);
    });

    test('Escape keeps alpha and exports alpha only', () => {
      withoutHost({
        flags,
        choose: [ESCAPE],
        picker: true,
        waitFor: lastOf('alpha'),
      });
      expect(realmsExported()).toEqual(['alpha']);
    });

    test('bravo exports bravo only, and the command line says so', () => {
      const run = withoutHost({
        flags,
        choose: [DOWN, ENTER],
        picker: true,
        waitFor: lastOf('bravo'),
      });
      expect(realmsExported()).toEqual(['bravo']);
      expect(run.captures.after.plain).toMatch(
        /frodo config export \S+ bravo /
      );
    });

    test('with -g as well (global config plus the realm) it opens', () => {
      withoutHost({
        flags: ['-a', '-r', '-g'],
        choose: [DOWN, ENTER],
        picker: true,
        waitFor: lastOf('bravo'),
      });
      expect(realmsExported()).toEqual(['bravo']);
    });

    test('a realm named in the environment opens no picker and is used', () => {
      const run = withoutHost({
        flags,
        picker: false,
        waitFor: lastOf('bravo'),
        env: { FRODO_REALM: 'bravo' },
      });
      expect(run.plainOutput).not.toContain('Choose a realm');
      expect(realmsExported()).toEqual(['bravo']);
    });
  });

  describe('the host left out, but no -r: no picker, the same export', () => {
    test('-a exports every realm and opens no picker', () => {
      const run = withoutHost({
        flags: ['-a'],
        picker: false,
        waitFor: lastOf('bravo'),
      });
      expect(run.plainOutput).not.toContain('Choose a realm');
      expect(realmsExported()).toEqual(['alpha', 'bravo']);
    });

    test('-a -g exports no realm and opens no picker', () => {
      const run = withoutHost({
        flags: ['-a', '-g'],
        picker: false,
        waitFor: /\/environment\/variables/,
      });
      expect(run.plainOutput).not.toContain('Choose a realm');
      expect(realmsExported()).toEqual([]);
    });

    test('-A exports every realm and opens no picker', () => {
      const run = withoutHost({
        flags: ['-A'],
        picker: false,
        waitFor: lastOf('bravo'),
      });
      expect(run.plainOutput).not.toContain('Choose a realm');
      expect(realmsExported()).toEqual(['alpha', 'bravo']);
    });
  });

  describe('a complete command line opens nothing and exports what it always did', () => {
    test('-a exports the global config and every realm', () => {
      const run = withHost({ flags: ['-a'], waitFor: lastOf('bravo') });
      expect(run.plainOutput).not.toContain('Choose a realm');
      expect(realmsExported()).toEqual(['alpha', 'bravo']);
    });

    test('-ar exports the active realm (alpha) and opens no picker', () => {
      const run = withHost({ flags: ['-a', '-r'], waitFor: lastOf('alpha') });
      expect(run.plainOutput).not.toContain('Choose a realm');
      expect(realmsExported()).toEqual(['alpha']);
    });

    test('-ar with the realm after the host exports that realm and opens no picker', () => {
      const run = withHost({
        flags: ['-a', '-r'],
        operands: ['bravo'],
        waitFor: lastOf('bravo'),
      });
      expect(run.plainOutput).not.toContain('Choose a realm');
      expect(realmsExported()).toEqual(['bravo']);
    });

    test('the usage example -rgAND exports the global config and alpha and opens no picker', () => {
      // the example as written: `frodo config export -rgAND <dir> <connection>`
      const run = withHost({
        flags: ['-rgAND', outDir],
        directoryInFlags: true,
        waitFor: lastOf('alpha'),
      });
      expect(run.plainOutput).not.toContain('Choose a realm');
      expect(realmsExported()).toEqual(['alpha']);
    });
  });

  test('without a terminal -r and no host fail as the other commands do: no host, no picker, no request', () => {
    const run = runShellScenario({
      homeDir: home,
      allowPrompting: false,
      env: {
        ...noCredentials,
        FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
      },
      args: ['config', 'export', '-a', '-r', '-D', outDir, '--type', 'cloud'],
      actions: [{ type: 'sleep', ms: 4000 }],
    });
    expect(run.plainOutput).toContain('No host specified');
    expect(run.plainOutput).not.toContain('Choose a realm');
    expect(requests()).toEqual([]);
  });
});
