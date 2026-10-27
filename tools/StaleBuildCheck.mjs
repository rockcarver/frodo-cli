/**
 * Detects a build that is older than its source, the usual reason for a test
 * that fails or passes locally but not in CI (and the reverse).
 *
 * Two builds matter:
 *
 * - The library. A linked frodo-lib (`npm run link`) is a symlink in
 *   node_modules, so the tests run the clone's built `dist/`, not the pinned
 *   package CI installs. `git pull` or a branch switch in the clone moves the
 *   source forward and leaves `dist/` behind.
 * - This checkout's own build. The test scripts build it only when it is
 *   missing, so an existing one is never refreshed after a change to `src/`.
 *   The default (dev) mode runs `dist/launch.cjs`; `npm run test:binary`
 *   (FRODO_TEST_BINARY=sea, what CI runs) runs the SEA binary
 *   `dist-sea/frodo`, and the npm-entry smoke suite runs `dist/launch.cjs`
 *   in both modes, so `dist/launch.cjs` is always checked.
 *
 * Only a warning is produced; the caller decides what to do with it. Stat
 * calls only, no builds and no network.
 *
 * Opt out with FRODO_SKIP_STALE_CHECK=1. Skipped in CI, where the build is
 * fresh and the library is the published package.
 */
import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'test', 'tests', 'dist']);
// A build writes generated sources just before it writes dist/, and file systems
// round times, so a source must be clearly newer than the build to count.
const TOLERANCE_MS = 2000;

/** Build input: code and JSON, but not tests or snapshots. */
function isBuildInput(name) {
  const code = /\.[cm]?[jt]sx?$/.test(name) || /\.json$/.test(name);
  const test = /\.(test|spec)\.[cm]?[jt]sx?$/.test(name);
  return code && !test;
}

/**
 * The source files of `srcDir` that were modified after `builtAtMs`.
 * Test files, snapshots and test folders are not build input and are ignored.
 */
function newerSources(srcDir, builtAtMs) {
  const newer = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (entry.isFile() && isBuildInput(entry.name)) {
        const mtime = fs.statSync(full).mtimeMs;
        if (mtime > builtAtMs + TOLERANCE_MS) newer.push({ file: full, mtime });
      }
    }
  };
  walk(srcDir);
  return newer.sort((a, b) => b.mtime - a.mtime);
}

function describeNewer(newer, base) {
  const count = `${newer.length} source file${newer.length === 1 ? '' : 's'} newer`;
  return `${count}, newest ${path.relative(base, newer[0].file)}`;
}

/**
 * Warnings about stale builds for the checkout at `root`.
 * @param {{ root: string, env?: NodeJS.ProcessEnv }} options
 * @returns {string[]} one message per stale build, empty when everything is fresh
 */
export function staleBuildWarnings({
  root,
  env = process.env,
  platform = process.platform,
}) {
  if (env.FRODO_SKIP_STALE_CHECK === '1' || env.CI === 'true') return [];
  const warnings = [];
  const see =
    'See .claude/skills/run-the-tests/SKILL.md. Silence with FRODO_SKIP_STALE_CHECK=1.';

  // 1. The linked library: only a symlink means the tests run a local build.
  const linkPath = path.join(root, 'node_modules', '@rockcarver', 'frodo-lib');
  let linked = false;
  try {
    linked = fs.lstatSync(linkPath).isSymbolicLink();
  } catch {
    // not installed: nothing to check
  }
  if (linked) {
    const libRoot = fs.realpathSync(linkPath);
    const libDist = path.join(libRoot, 'dist', 'index.js');
    if (!fs.existsSync(libDist)) {
      warnings.push(
        `The linked frodo-lib at ${libRoot} has no dist/index.js. ` +
          `Run \`npm run build\` there before testing. ${see}`
      );
    } else {
      const newer = newerSources(
        path.join(libRoot, 'src'),
        fs.statSync(libDist).mtimeMs
      );
      if (newer.length > 0) {
        warnings.push(
          `The linked frodo-lib at ${libRoot} has a dist/ older than its source ` +
            `(${describeNewer(newer, libRoot)}). The tests run that stale build, so snapshots ` +
            `can fail here while CI, which installs the published package, passes. ` +
            `Run \`npm run build\` there (not while tests are running). ${see}`
        );
      }
    }
  }

  // 2. This checkout's own build. The test scripts build it only when it is
  // missing, so an existing one is never refreshed.
  const sea = env.FRODO_TEST_BINARY === 'sea';
  const rebuild = sea ? 'npm run build:binary' : 'npx tsdown';
  const artifacts = [
    { label: 'dist/', file: path.join(root, 'dist', 'launch.cjs') },
  ];
  if (sea) {
    const name = platform === 'win32' ? 'frodo.exe' : 'frodo';
    artifacts.push({
      label: 'dist-sea/',
      file: path.join(root, 'dist-sea', name),
    });
  }
  for (const { label, file } of artifacts) {
    if (!fs.existsSync(file)) continue; // the test scripts build a missing one
    const newer = newerSources(
      path.join(root, 'src'),
      fs.statSync(file).mtimeMs
    );
    if (newer.length > 0) {
      warnings.push(
        `This checkout's ${label} is older than src/ (${describeNewer(newer, root)}). ` +
          `The test scripts do not rebuild an existing ${label}, so the tests would run old code. ` +
          `Run \`${rebuild}\` first. ${see}`
      );
    }
  }
  return warnings;
}
