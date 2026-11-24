import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ensureFrodoArtifact, repoRoot } from '../e2e/utils/FrodoBinary.cjs';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import {
  engineWorkerCommand,
  frodoCommand,
  makeHome,
  removeHome,
  signInOverHttp,
  startFrodo,
} from '../utils/WebShell.js';

/**
 * The tab engine of `frodo shell --web` as a real process: the native binary
 * (FRODO_TEST_BINARY=sea) runs itself as the engine, npm and Docker run node
 * and the worker file; both run from `dist/` or the binary of this checkout.
 * Nothing here opens a browser: the console starts with --no-open, and a page
 * is played over plain HTTP.
 */
const run = process.platform === 'win32' ? describe.skip : describe;

run('the tab engine, as a process of the executable', () => {
  let home;
  let worker;

  beforeEach(() => {
    home = makeHome();
  });

  afterEach(() => {
    if (worker) {
      try {
        process.kill(-worker.pid, 'SIGKILL');
      } catch {
        // already gone
      }
      worker = undefined;
    }
    removeHome(home);
  });

  /** Starts the executable in worker mode and speaks its protocol. */
  function startWorker(env = { FRODO_ENGINE_WORKER: '1' }) {
    const [command, args] = engineWorkerCommand();
    worker = cp.spawn(command, args, {
      cwd: home,
      detached: true,
      env: {
        ...process.env,
        FRODO_TEST: '1',
        FRODO_NO_CACHE: 'true',
        FRODO_NO_UPDATE_CHECK: '1',
        FRODO_CONNECTION_PROFILES_PATH: '',
        NODE_OPTIONS: '',
        HOME: home,
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // the longest the worker may live, whatever a test does
    setTimeout(() => {
      try {
        process.kill(-worker.pid, 'SIGKILL');
      } catch {
        // already gone
      }
    }, 90_000).unref();
    let stdout = '';
    let stderr = '';
    let ended = false;
    worker.stdout.on('data', (c) => (stdout += c));
    worker.stderr.on('data', (c) => (stderr += c));
    worker.on('close', () => (ended = true));
    const replies = () =>
      stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return { notProtocol: line };
          }
        });
    return {
      stderr: () => stderr,
      replies,
      send: (message) => worker.stdin.write(`${JSON.stringify(message)}\n`),
      async reply(id, timeoutMs = 60_000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          const found = replies().find((r) => r.id === id);
          if (found) return found;
          // a process that ended will not answer: say so now, not after the timeout
          if (ended) break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error(
          `no reply to ${id}; stdout: ${stdout.slice(0, 300)}; stderr: ${stderr.slice(0, 300)}`
        );
      },
    };
  }

  const previewOf = (reply) => reply.outcome?.result?.preview;

  test('1: with the worker variable it is the engine: it answers the protocol and never reaches the command line', async () => {
    const engine = startWorker();

    engine.send({ op: 'eval', id: 1, code: '1 + 1' });
    expect(previewOf(await engine.reply(1))).toBe('2');
    engine.send({ op: 'complete', id: 2, line: 'frodo.au' });
    const completion = await engine.reply(2);
    expect(completion.candidates).toContain('frodo.authn');

    // the command line would have printed its version banner to the error output
    expect(engine.stderr()).not.toContain('You are running');
    // and every line of the output is protocol
    expect(engine.replies().filter((r) => r.notProtocol)).toEqual([]);

    engine.send({ op: 'dispose', id: 3 });
    await engine.reply(3);
  }, 120_000);

  test('10: an error raised on the side while an input runs is printed into the log and ends nothing: the input finishes with its own value, and the next input waits for it', async () => {
    const engine = startWorker();

    // a promise that nobody awaits is rejected and a timer throws, while the
    // input awaits something else; a second input is sent at once
    engine.send({
      op: 'eval',
      id: 1,
      code: 'var done = false; Promise.reject(new Error("side-rejection")); setTimeout(() => { throw new Error("side-timer") }, 20); await new Promise((r) => setTimeout(r, 250)); done = true; "own value"',
    });
    engine.send({ op: 'eval', id: 2, code: 'done' });
    const first = await engine.reply(1);
    expect(first.outcome.status).toBe('ok');
    expect(previewOf(first)).toBe('"own value"');
    expect(previewOf(await engine.reply(2))).toBe('true');

    const logged = engine
      .replies()
      .filter((r) => r.log)
      .map((r) => r.log)
      .join('');
    expect(logged).toContain('side-rejection');
    expect(logged).toContain('side-timer');

    engine.send({ op: 'dispose', id: 3 });
    await engine.reply(3);
  }, 120_000);

  test('11: the result of an input is `_` for the next one, and an error is `_error`, as in the terminal console', async () => {
    const engine = startWorker();

    engine.send({ op: 'eval', id: 1, code: '1 + 1' });
    expect(previewOf(await engine.reply(1))).toBe('2');
    engine.send({ op: 'eval', id: 2, code: '_ + 1' });
    expect(previewOf(await engine.reply(2))).toBe('3');
    // an input with nothing to show leaves `_` as it was
    engine.send({ op: 'eval', id: 3, code: 'var noResult = 1' });
    engine.send({ op: 'eval', id: 4, code: '_' });
    expect(previewOf(await engine.reply(4))).toBe('3');
    engine.send({ op: 'eval', id: 5, code: 'throw new Error("last-error")' });
    expect((await engine.reply(5)).outcome.status).toBe('error');
    engine.send({ op: 'eval', id: 6, code: '_error.message' });
    expect(previewOf(await engine.reply(6))).toBe('"last-error"');
    engine.send({ op: 'eval', id: 7, code: '_ = 9' });
    engine.send({ op: 'eval', id: 8, code: '1 + 1' });
    engine.send({ op: 'eval', id: 9, code: '_' });
    expect(previewOf(await engine.reply(9))).toBe('9');

    engine.send({ op: 'dispose', id: 10 });
    await engine.reply(10);
  }, 120_000);

  test('2: the engine removes the variable from its own environment, so a command that a script starts is an ordinary command', async () => {
    const engine = startWorker();

    engine.send({
      op: 'eval',
      id: 1,
      code: "'FRODO_ENGINE_WORKER' in process.env",
    });
    expect(previewOf(await engine.reply(1))).toBe('false');

    // A script of the console runs frodo again, as it may: that is the command
    // line (it prints its version), not another engine that would wait for input.
    const [command, args] = frodoCommand(['-v']);
    engine.send({
      op: 'eval',
      id: 2,
      code: `(() => { const r = require('node:child_process').spawnSync(${JSON.stringify(command)}, ${JSON.stringify(args)}, { encoding: 'utf8', input: '', timeout: 30000 }); return (r.stdout + r.stderr).includes('cli: v'); })()`,
    });
    expect(previewOf(await engine.reply(2))).toBe('true');

    engine.send({ op: 'dispose', id: 3 });
    await engine.reply(3);
  }, 120_000);

  test('3: without the variable the same executable is the command line, not an engine', async () => {
    const [command, args] = engineWorkerCommand();
    const result = cp.spawnSync(command, [...args, '-v'], {
      cwd: home,
      encoding: 'utf8',
      input: '{"op":"info","id":1}\n',
      timeout: 60_000,
      env: {
        ...process.env,
        FRODO_TEST: '1',
        FRODO_NO_CACHE: 'true',
        FRODO_NO_UPDATE_CHECK: '1',
        NODE_OPTIONS: '',
        HOME: home,
        FRODO_ENGINE_WORKER: undefined,
      },
    });
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).toContain('cli: v');
    expect(result.stdout).not.toContain('"op":"info"');
  }, 90_000);
});

const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;

(hasPty ? describe : describe.skip)('the worker variable on a terminal', () => {
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

  test('7: a variable left in the environment by mistake does not turn the command into an engine that says nothing', () => {
    // Standard input is a terminal here, as it is for a person at a prompt.
    const result = runShellScenario({
      homeDir: home,
      env: { FRODO_ENGINE_WORKER: '1', FRODO_NO_UPDATE_CHECK: '1' },
      args: ['-v'],
      actions: [{ type: 'wait_exit', timeoutMs: 60_000 }],
    });
    expect(result.exitCode).toBe(0);
    expect(result.plainOutput).toContain('cli: v');
  }, 90_000);

  test('9: a terminal for input is what counts, not one for output: with the output piped the command line still runs', () => {
    // `frodo -v | cat`: standard input is the terminal, standard output a pipe.
    const [command, args] = frodoCommand(['-v']);
    const scenario = {
      command: ['/bin/sh', '-c', '"$0" "$@" | cat', command, ...args],
      cwd: repoRoot,
      homeDir: home,
      env: {
        FRODO_ENGINE_WORKER: '1',
        FRODO_NO_UPDATE_CHECK: '1',
        FRODO_TEST: '1',
        FRODO_NO_CACHE: 'true',
        FRODO_CONNECTION_PROFILES_PATH: '',
        TERM: 'xterm-256color',
        NODE_OPTIONS: '',
      },
      actions: [{ type: 'wait_exit', timeoutMs: 30_000 }],
    };
    const result = JSON.parse(
      cp.execFileSync(
        'python3',
        [path.join(repoRoot, 'test', 'utils', 'shell_pty_driver.py')],
        { cwd: repoRoot, input: JSON.stringify(scenario), encoding: 'utf8' }
      )
    );
    expect(result.plainOutput).toContain('cli: v');
  }, 60_000);

  test('8: and the variable is not handed on to what the command runs', () => {
    // The terminal console of the command line runs JavaScript: ask it.
    const result = runShellScenario({
      homeDir: home,
      env: { FRODO_ENGINE_WORKER: '1', FRODO_NO_UPDATE_CHECK: '1' },
      args: ['shell'],
      actions: [
        { type: 'wait_prompt', timeoutMs: 60_000 },
        { type: 'send_line', text: 'typeof process.env.FRODO_ENGINE_WORKER' },
        { type: 'wait_plain', regex: "'undefined'", timeoutMs: 30_000 },
        { type: 'send_line', text: '.exit' },
        { type: 'wait_exit', timeoutMs: 30_000 },
      ],
    });
    expect(result.plainOutput).toContain("'undefined'");
  }, 120_000);
});

run('frodo shell --web with real engine processes', () => {
  let home;
  let shell;
  let dir;

  beforeEach(() => {
    home = makeHome();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-engine-'));
  });

  afterEach(async () => {
    if (shell) {
      // a process left behind is a failure of the test, not only of cleanup
      expect(await shell.stop()).toBe(true);
      shell = undefined;
    }
    removeHome(home);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('4: a tab gets an engine, evaluates, completes, and nothing is left when the console stops', async () => {
    shell = startFrodo({
      args: ['shell', '--web', '--no-open'],
      homeDir: home,
    });
    const call = await signInOverHttp(await shell.link());

    const session = await call('GET', '/api/session');
    expect(session.status).toBe(200);
    expect(typeof session.json.engine).toBe('string');
    const engine = session.json.engine;

    const sum = await call('POST', '/api/eval', { code: '1 + 1' }, engine);
    expect(sum.status).toBe(200);
    expect(sum.json.status).toBe('ok');
    expect(sum.json.result.preview).toBe('2');

    const completion = await call(
      'POST',
      '/api/complete',
      { line: 'frodo.au' },
      engine
    );
    expect(completion.status).toBe(200);
    expect(completion.json.candidates).toContain('frodo.authn');

    expect(await shell.stop()).toBe(true);
    expect(shell.groupAlive()).toBe(false);
  }, 180_000);

  test('5: an engine that cannot start is answered with 503 and its reason, the terminal says it once, and the console stays up', async () => {
    // A home directory below a plain file: the engine cannot make its history
    // folder and ends with the reason, in the native binary as well as with npm
    // (the test seam for a worker script is not read by the binary). The
    // console itself starts: it keeps nothing in the home directory.
    const file = path.join(dir, 'a-file');
    fs.writeFileSync(file, '');
    shell = startFrodo({
      args: ['shell', '--web', '--no-open'],
      homeDir: path.join(file, 'home'),
    });
    const call = await signInOverHttp(await shell.link());

    const first = await call('GET', '/api/session');
    expect(first.status).toBe(503);
    expect(first.json.error).toMatch(
      /^The console could not start an engine: \S/
    );
    expect(first.json.error).toMatch(/ENOTDIR/);
    expect(first.json.error).not.toMatch(/Internal error/);
    const again = await call('GET', '/api/session');
    expect(again.status).toBe(503);

    // said in the terminal, once, with the same reason
    const told = shell
      .output()
      .split('\n')
      .filter((line) => line.includes('The console could not start an engine'));
    expect(told).toHaveLength(1);
    expect(told[0]).toContain(first.json.error);
    expect(shell.exited).toBe(false);
  }, 180_000);

  test('6: an engine that ends after it answered is described, replaced once, and the tab is told which engine it has now', async () => {
    shell = startFrodo({
      args: ['shell', '--web', '--no-open'],
      homeDir: home,
    });
    const call = await signInOverHttp(await shell.link());
    const session = await call('GET', '/api/session');
    expect(session.status).toBe(200);
    const first = session.json.engine;
    expect(session.headers.get('x-frodo-engine')).toBe(first);

    // a script that ends its own process, as a crash or a kill would
    const ended = await call(
      'POST',
      '/api/eval',
      { code: 'process.exit(3)' },
      first
    );
    expect(ended.status).toBe(503);
    expect(ended.json.error).toBe(
      'The console engine ended: The engine process ended with exit code 3. The next input starts a new engine; its variables are gone.'
    );
    const told = shell
      .output()
      .split('\n')
      .filter((line) => line.includes('The console engine ended'));
    expect(told).toHaveLength(1);

    // the tab still holds the old id: its next request gets a new engine and
    // is told which, and the request after that carries the new id
    const again = await call('POST', '/api/eval', { code: '6 * 7' }, first);
    expect(again.status).toBe(200);
    expect(again.json.result.preview).toBe('42');
    const second = again.headers.get('x-frodo-engine');
    expect(second).toMatch(/^[0-9a-f]{16}$/);
    expect(second).not.toBe(first);
    const third = await call('POST', '/api/eval', { code: '6 * 7' }, second);
    expect(third.status).toBe(200);
    expect(third.headers.get('x-frodo-engine')).toBe(second);
    expect(shell.exited).toBe(false);
  }, 180_000);
});
