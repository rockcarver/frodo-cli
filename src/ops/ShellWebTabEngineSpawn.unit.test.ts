import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { PassThrough } from 'node:stream';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

/**
 * What `spawnTabEngine` hands to the operating system, with the executable and
 * the "is this the native binary" question both replaced: nothing is started.
 * In the native binary the child is the executable itself, with no script (the
 * executable would read a script path as a command) and the private worker
 * variable; everywhere else it is node and the worker file, never with the
 * variable.
 */

const actual = createRequire(import.meta.url)(
  'node:child_process'
) as typeof import('node:child_process');

let isSea = false;
const spawnMock = jest.fn((..._args: unknown[]) => fakeChild());

/** A child process that is not one: pipes and an exit that never comes. */
function fakeChild() {
  const child = new EventEmitter() as EventEmitter & Record<string, unknown>;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = jest.fn();
  return child;
}

jest.unstable_mockModule('node:child_process', () => ({
  ...actual,
  spawn: spawnMock,
}));
jest.unstable_mockModule('node:sea', () => ({
  default: { isSea: () => isSea },
}));

const { ENGINE_WORKER_ENV, spawnTabEngine } =
  await import('./ShellWebServerOps');

describe('spawnTabEngine', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    spawnMock.mockClear();
    delete process.env[ENGINE_WORKER_ENV];
    delete process.env.FRODO_TEST_WORKER_SCRIPT;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it('starts the executable itself, with no script and the worker variable, in the native binary', async () => {
    isSea = true;
    await spawnTabEngine();
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawnMock.mock.calls[0] as [
      string,
      string[],
      { env: NodeJS.ProcessEnv; stdio: string[] },
    ];
    expect(command).toBe(process.execPath);
    expect(args).toEqual([]);
    expect(options.env[ENGINE_WORKER_ENV]).toBe('1');
    expect(options.stdio).toEqual(['pipe', 'pipe', 'pipe']);
    // This process itself is not turned into an engine by it.
    expect(process.env[ENGINE_WORKER_ENV]).toBeUndefined();
  });

  it('starts node with the script, and without the worker variable, outside the native binary', async () => {
    isSea = false;
    process.env.FRODO_TEST_WORKER_SCRIPT = '/x/stub-worker.cjs';
    await spawnTabEngine();
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawnMock.mock.calls[0] as [
      string,
      string[],
      { env: NodeJS.ProcessEnv },
    ];
    expect(command).toBe(process.execPath);
    expect(args).toEqual(['/x/stub-worker.cjs']);
    expect(ENGINE_WORKER_ENV in options.env).toBe(false);
  });

  it('does not run the script of the test seam in the native binary', async () => {
    isSea = true;
    process.env.FRODO_TEST_WORKER_SCRIPT = '/x/stub-worker.cjs';
    await spawnTabEngine();
    const [, args, options] = spawnMock.mock.calls[0] as [
      string,
      string[],
      { env: NodeJS.ProcessEnv },
    ];
    expect(args).toEqual([]);
    expect(options.env[ENGINE_WORKER_ENV]).toBe('1');
  });

  it('starts nothing for an engine that the caller supplies', async () => {
    isSea = true;
    const engine = {} as never;
    await expect(spawnTabEngine(async () => engine)).resolves.toBe(engine);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
