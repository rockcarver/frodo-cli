import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
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
    worker.stdout.on('data', (c) => (stdout += c));
    worker.stderr.on('data', (c) => (stderr += c));
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
    shell = startFrodo({
      args: ['shell', '--web', '--no-open'],
      homeDir: home,
      env: { FRODO_TEST_WORKER_SCRIPT: path.join(dir, 'missing-worker.cjs') },
    });
    const call = await signInOverHttp(await shell.link());

    const first = await call('GET', '/api/session');
    expect(first.status).toBe(503);
    expect(first.json.error).toMatch(
      /^The console could not start an engine: \S/
    );
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
});
