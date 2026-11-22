import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { verifyMcpProcessIdentity } from '../../src/ops/McpServerLockfile.ts';

/**
 * `frodo mcp server stop` signals the PID named in the lockfile only when the
 * process LOOKS like frodo (the guard against a recycled PID). The check reads
 * the command line of the live process, so these tests start real, idle node
 * processes with the command lines the CLI is started with and ask
 * `verifyMcpProcessIdentity` about them.
 *
 * Two generations of command line matter. A server started by a release that
 * still had the ESM loader runs as
 *   node --no-warnings --enable-source-maps --experimental-loader file:///.../dist/loader.cjs /.../dist/app.cjs mcp server start
 * and one started after the loader was removed runs as
 *   node --no-warnings --enable-source-maps /.../dist/app.cjs mcp server start
 * A newer `mcp server stop` has to recognise both: the old server can still be
 * running when the CLI is updated. Both are recognised through `app.cjs`, so
 * the name `loader.cjs` in the recogniser is defensive and redundant in
 * practice; it stays for one release after the removal so that a command line
 * that names only the old loader still counts, and one case pins that.
 *
 * The processes are fakes: the files in a temporary folder only write a ready
 * file and wait; they carry the names of the real entry files and nothing else.
 */
let dir;
let children;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-identity-'));
  children = [];
  fs.mkdirSync(path.join(dir, 'dist'));
  const idle = `require('node:fs').writeFileSync(process.env.FAKE_READY, String(process.pid)); setInterval(() => {}, 1000);`;
  for (const name of ['app.cjs', 'launch.cjs']) {
    fs.writeFileSync(path.join(dir, 'dist', name), idle);
  }
  // what the old launcher passed to --experimental-loader: a loader with no hooks
  fs.writeFileSync(
    path.join(dir, 'dist', 'loader.cjs'),
    'module.exports = {};'
  );
  fs.writeFileSync(path.join(dir, 'other.cjs'), idle);
  // the packaged command: brew, the native binary and the npm bin are all
  // started as a file called `frodo`
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.writeFileSync(path.join(dir, 'bin', 'frodo'), idle);
});

afterEach(() => {
  for (const child of children) child.kill('SIGKILL');
  fs.rmSync(dir, { recursive: true, force: true });
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Starts `node <args>` and returns its pid once the script has run (the command line is final by then). */
async function start(...args) {
  const ready = path.join(dir, `ready-${children.length}`);
  const child = cp.spawn(process.execPath, args, {
    stdio: 'ignore',
    env: { ...process.env, NODE_OPTIONS: '', FAKE_READY: ready },
  });
  children.push(child);
  for (let i = 0; i < 200 && !fs.existsSync(ready); i++) await wait(50);
  if (!fs.existsSync(ready))
    throw new Error(`fake process did not start: node ${args.join(' ')}`);
  return child.pid;
}

const dist = (name) => path.join(dir, 'dist', name);
const loaderUrl = () => `file://${dist('loader.cjs')}`;

describe('verifyMcpProcessIdentity recognises the frodo command lines', () => {
  test('the app process of a release without the loader', async () => {
    const pid = await start(
      '--no-warnings',
      '--enable-source-maps',
      dist('app.cjs'),
      'mcp',
      'server',
      'start'
    );
    const identity = verifyMcpProcessIdentity(pid);
    expect(identity.verified).toBe(true);
    expect(identity.looksLikeFrodo).toBe(true);
  });

  test('the app process started by a release that still had the loader', async () => {
    const pid = await start(
      '--no-warnings',
      '--enable-source-maps',
      '--experimental-loader',
      loaderUrl(),
      dist('app.cjs'),
      'mcp',
      'server',
      'start'
    );
    const identity = verifyMcpProcessIdentity(pid);
    expect(identity.verified).toBe(true);
    expect(identity.looksLikeFrodo).toBe(true);
  });

  test('a command line whose only frodo name is the old loader', async () => {
    const pid = await start(path.join(dir, 'other.cjs'), loaderUrl());
    const identity = verifyMcpProcessIdentity(pid);
    expect(identity.verified).toBe(true);
    expect(identity.looksLikeFrodo).toBe(true);
  });

  test('the packaged command, which has no entry file in its command line', async () => {
    const pid = await start(
      path.join(dir, 'bin', 'frodo'),
      'mcp',
      'server',
      'start'
    );
    const identity = verifyMcpProcessIdentity(pid);
    expect(identity.verified).toBe(true);
    expect(identity.looksLikeFrodo).toBe(true);
  });

  test('the launcher process', async () => {
    const pid = await start(dist('launch.cjs'), 'mcp', 'server', 'start');
    const identity = verifyMcpProcessIdentity(pid);
    expect(identity.verified).toBe(true);
    expect(identity.looksLikeFrodo).toBe(true);
  });

  test('an unrelated process is not frodo, whatever it is given as arguments', async () => {
    const pid = await start(
      path.join(dir, 'other.cjs'),
      'mcp',
      'server',
      'start'
    );
    const identity = verifyMcpProcessIdentity(pid);
    expect(identity.verified).toBe(true);
    expect(identity.looksLikeFrodo).toBe(false);
  });
});

describe('verifyMcpProcessIdentity refuses a name that only looks like a frodo name', () => {
  // The recogniser compares whole names; a name that merely contains one of the
  // frodo names (or ends in one) belongs to another program.
  test.each([
    'not-app.cjs',
    'not-launch.cjs',
    'xloader.cjs',
    'myfrodo',
    'app.cjs.bak',
  ])('%s', async (name) => {
    const pid = await start(
      path.join(dir, 'other.cjs'),
      path.join(dir, 'dist', name),
      'mcp',
      'server',
      'start'
    );
    const identity = verifyMcpProcessIdentity(pid);
    expect(identity.verified).toBe(true);
    expect(identity.looksLikeFrodo).toBe(false);
  });
});
