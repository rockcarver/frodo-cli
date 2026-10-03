/**
 * Resolves the frodo SEA binary of THIS checkout for the e2e tests.
 *
 * The e2e suites shell out to `frodo ...` (3,000+ command strings across 260
 * test files). To make those invocations always test this checkout's build -
 * never whatever `frodo` happens to be globally installed - getEnv() injects
 * a PATH whose first entry is the directory of this checkout's binary, and
 * ensureFrodoBinary() builds the binary on demand if it is missing.
 *
 * The binary lives in <repoRoot>/dist-sea/ (`frodo`, `frodo.exe` on
 * Windows); `npm run build:binary` produces it. A lock file serializes
 * concurrent builds (same pattern as ShellPty's dist build lock).
 */
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const binaryDir = path.join(repoRoot, 'dist-sea');
const binaryName = process.platform === 'win32' ? 'frodo.exe' : 'frodo';
const binaryPath = path.join(binaryDir, binaryName);
const buildLockPath = path.join(repoRoot, '.dist-sea-build.lock');

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function binaryExists() {
  return fs.existsSync(binaryPath);
}

function buildBinary() {
  try {
    const fd = fs.openSync(buildLockPath, 'wx');
    try {
      cp.execFileSync('npm', ['run', 'build:binary'], {
        cwd: repoRoot,
        stdio: 'inherit',
        env: process.env,
      });
    } finally {
      fs.closeSync(fd);
      fs.rmSync(buildLockPath, { force: true });
    }
    return;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }

  // Another process holds the lock - wait for its build to finish.
  const start = Date.now();
  while (Date.now() - start < 600000) {
    if (binaryExists()) return;
    if (!fs.existsSync(buildLockPath)) {
      return buildBinary();
    }
    sleepSync(250);
  }
  throw new Error('Timed out waiting for the frodo binary build to complete.');
}

/**
 * Ensures this checkout's SEA binary exists, building it on demand
 * (`npm run build:binary` - needs Node >= 25.5 for --build-sea; CI test
 * jobs run on Node 26).
 */
function ensureFrodoBinary() {
  if (!binaryExists()) buildBinary();
  if (!binaryExists()) {
    throw new Error(
      `frodo binary not found at ${binaryPath} and the on-demand build did not produce one. Run 'npm run build:binary' and check for errors.`
    );
  }
  return binaryPath;
}

/**
 * A PATH whose first entry is this checkout's dist-sea directory, so the
 * bare `frodo` in the tests' command strings resolves to THIS checkout's
 * binary. Prepend-only: the rest of PATH is preserved for the test
 * process's other child tools (python3, git, ...).
 */
function getTestBinaryPath() {
  const sep = process.platform === 'win32' ? ';' : ':';
  const existing = process.env.PATH || '';
  // de-dup: avoid dist-sea appearing twice in a long CI run
  const entries = existing.split(sep).filter((p) => p !== binaryDir);
  return [binaryDir, ...entries].join(sep);
}

module.exports = {
  repoRoot,
  binaryDir,
  binaryName,
  binaryPath,
  ensureFrodoBinary,
  getTestBinaryPath,
};
