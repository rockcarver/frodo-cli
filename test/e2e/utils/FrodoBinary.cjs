/**
 * Resolves the frodo artifact of THIS checkout for the e2e tests.
 *
 * The e2e suites shell out to `frodo ...` (3,000+ command strings across 260
 * test files). To make those invocations always test this checkout's build -
 * never whatever `frodo` happens to be globally installed - getEnv() injects
 * a PATH whose first entry is the directory of this checkout's artifact, and
 * ensureFrodoArtifact() builds it on demand if it is missing.
 *
 * Two modes (selected with FRODO_TEST_BINARY=sea, default dev):
 *
 * - dev (default): a launcher shim whose directory is prepended to PATH; the
 *   shim execs `node dist/launch.cjs` - the npm/Docker entry. Build on
 *   demand = `npm run build:only` (~1.3s, works on any Node >= 20). This is
 *   the developer loop: no SEA build, no macOS signing, no Node 26 needed.
 *
 * - sea (FRODO_TEST_BINARY=sea): the real SEA binary at
 *   <repoRoot>/dist-sea/ (`frodo`, `frodo.exe` on Windows), produced by
 *   `npm run build:binary`. This is what CI's Test job runs, so CI exercises
 *   exactly the artifact the release jobs ship. Needs Node >= 25.5 for
 *   --build-sea (the build script guards this with a clear message).
 *
 * A lock file serializes concurrent builds (same pattern as ShellPty's dist
 * build lock).
 */
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const isSeaMode = process.env.FRODO_TEST_BINARY === 'sea';

const seaDir = path.join(repoRoot, 'dist-sea');
const seaBinaryName = process.platform === 'win32' ? 'frodo.exe' : 'frodo';
const seaBinaryPath = path.join(seaDir, seaBinaryName);

// Dev mode: directory holding the launcher shims (committed, see
// test/e2e/shims/), which exec `node dist/launch.cjs`.
const devShimDir = path.join(__dirname, '..', 'shims');
const devBuildLockPath = path.join(repoRoot, '.dist-build.lock');

const binaryDir = isSeaMode ? seaDir : devShimDir;
const binaryName = isSeaMode ? seaBinaryName : 'frodo';
const binaryPath = path.join(binaryDir, binaryName);
const buildLockPath = isSeaMode
  ? path.join(repoRoot, '.dist-sea-build.lock')
  : devBuildLockPath;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function binaryExists() {
  return fs.existsSync(binaryPath);
}

function buildScript() {
  return isSeaMode ? 'build:binary' : 'build:only';
}

function buildBinary() {
  try {
    const fd = fs.openSync(buildLockPath, 'wx');
    try {
      cp.execFileSync('npm', ['run', buildScript()], {
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
  throw new Error('Timed out waiting for the frodo build to complete.');
}

/**
 * Ensures this checkout's test artifact exists, building it on demand.
 *
 * - dev mode: `npm run build:only` (~1.3s, any Node that can run the
 *   bundle). If dist/ exists but predates the newest file under src/, it is
 *   rebuilt first, so local runs never silently test a stale build.
 * - sea mode: `npm run build:binary` (needs Node >= 25.5 for --build-sea;
 *   CI test jobs run on Node 26).
 */
function ensureFrodoArtifact() {
  if (binaryExists()) return binaryPath;
  buildBinary();
  if (!binaryExists()) {
    throw new Error(
      `frodo ${isSeaMode ? 'binary' : 'dist build'} not found and the on-demand build (${buildScript()}) did not produce one. Run 'npm run ${buildScript()}' and check for errors.`
    );
  }
  return binaryPath;
}

/**
 * A PATH whose first entry is the directory of this checkout's artifact, so
 * the bare `frodo` in the tests' command strings resolves to THIS checkout's
 * build. Prepend-only: the rest of PATH is preserved for the test process's
 * other child tools (python3, git, ...).
 */
function getTestBinaryPath() {
  const sep = process.platform === 'win32' ? ';' : ':';
  const existing = process.env.PATH || '';
  // de-dup: avoid the shim dir appearing twice in a long CI run
  const entries = existing.split(sep).filter((p) => p !== binaryDir);
  return [binaryDir, ...entries].join(sep);
}

module.exports = {
  repoRoot,
  isSeaMode,
  binaryDir,
  binaryName,
  binaryPath,
  ensureFrodoArtifact,
  getTestBinaryPath,
};
