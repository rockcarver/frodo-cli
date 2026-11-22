/**
 * Smoke test for the PUBLISHED npm package shape.
 *
 * The files-allowlist class of release defect (5.0.0-6): the build
 * emitted a dynamically-imported chunk (ColorTheme-*.cjs) that the
 * package.json `files` allowlist did not list, so npm shipped app.cjs
 * with a require() pointing at a file that was never published -- the
 * package installed fine and crashed on first run. Local dist/ tests
 * (including npm-entry.smoke.e2e.test.js) run the unpacked dist and can
 * never see this.
 *
 * This suite packs the tarball exactly as npm publish would (respecting
 * `files`), installs it into a throwaway prefix, and asserts the real
 * user path works: `npx frodo -v` and `-h`. It also asserts that every
 * relative require() inside the packed dist/ resolves to a shipped
 * file, so ANY future missing-chunk failure is caught here with a
 * precise message instead of at a customer.
 *
 * The same defect class, second instance: `files` once listed only the
 * top-level `dist/*.cjs`, so the web shell's worker
 * (dist/cli/shell/engine-worker.cjs, spawned by `frodo shell --web`) was
 * never published although the build emits it. The suite therefore also
 * lists the tarball and asserts the worker and its map are in it, that
 * every built .cjs and map under dist/ (any depth) is shipped, and that
 * nothing outside the build output, licence, README and changelog is.
 *
 * Skipped when dist/ is missing (same contract as the other e2e
 * suites: build first).
 */
import cp from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { repoRoot } from './utils/FrodoBinary.cjs';

const exec = promisify(cp.exec);
const testif = (condition) => (condition ? test : test.skip);

const distDir = path.join(repoRoot, 'dist');
const launchPath = path.join(distDir, 'launch.cjs');
const NODE_OPTIONS = ''; // clear jest's flags for the child

const hasDist = fs.existsSync(launchPath);

let packDir;
let installDir;
let tarballPath;

const pack = async () => {
  packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-pack-'));
  installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-install-'));
  await exec(`npm pack ${repoRoot} --pack-destination ${packDir}`, {
    env: { ...process.env, NODE_OPTIONS },
    cwd: repoRoot,
    maxBuffer: 50 * 1024 * 1024,
  });
  const tarball = fs.readdirSync(packDir).find((f) => f.endsWith('.tgz'));
  tarballPath = path.join(packDir, tarball);
  fs.writeFileSync(path.join(installDir, 'package.json'), '{}');
  await exec(`npm install ${tarballPath} --no-audit --no-fund`, {
    env: { ...process.env, NODE_OPTIONS },
    cwd: installDir,
    maxBuffer: 50 * 1024 * 1024,
  });
};

describe('published npm package (npm pack + fresh install)', () => {  beforeAll(async () => {
    if (hasDist) await pack();
  });

  afterAll(() => {
    for (const dir of [packDir, installDir]) {
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // Every file the tarball holds, as `package/<path>` (npm's fixed prefix).
  const tarballEntries = async () => {
    const { stdout } = await exec(`tar -tzf ${tarballPath}`, {
      maxBuffer: 50 * 1024 * 1024,
    });
    return stdout.split('\n').filter((entry) => entry && !entry.endsWith('/'));
  };

  // Every file below `dir`, as paths relative to `dir` with forward slashes.
  const walk = (dir, prefix = '') =>
    fs.readdirSync(path.join(dir, prefix), { withFileTypes: true }).flatMap((entry) => {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      return entry.isDirectory() ? walk(dir, rel) : [rel];
    });

  testif(hasDist)(
    'packed dist/ contains every relative require() target',
    async () => {
      const pkgDist = path.join(installDir, 'node_modules', '@rockcarver', 'frodo-cli', 'dist');
      const missing = [];
      for (const file of walk(pkgDist)) {
        if (!file.endsWith('.cjs')) continue;
        const source = fs.readFileSync(path.join(pkgDist, file), 'utf8');
        // Targets resolve against the requiring file's own folder: the
        // worker in dist/cli/shell/ reaches the shared chunks with ../../.
        for (const match of source.matchAll(/require\("(\.\.?\/[^"]+)"\)/g)) {
          const target = path.join(pkgDist, path.dirname(file), match[1]);
          if (!fs.existsSync(target)) missing.push(`${file} -> ${match[1]}`);
        }
      }
      expect(missing).toEqual([]);
    }
  );

  testif(hasDist)(
    'the tarball contains the web shell worker and its source map',
    async () => {
      // ShellWebServerOps.workerScriptPath() spawns this exact file.
      const entries = await tarballEntries();
      const missing = [
        'package/dist/cli/shell/engine-worker.cjs',
        'package/dist/cli/shell/engine-worker.cjs.map',
      ].filter((entry) => !entries.includes(entry));
      expect(missing).toEqual([]);
    }
  );

  testif(hasDist)(
    'the tarball contains every built .cjs and map under dist/, at any depth',
    async () => {
      const entries = new Set(await tarballEntries());
      const missing = walk(distDir)
        .filter((file) => /\.cjs(\.map)?$/.test(file))
        .map((file) => `package/dist/${file}`)
        .filter((entry) => !entries.has(entry));
      expect(missing).toEqual([]);
    }
  );

  testif(hasDist)(
    'the tarball contains only the build output, licence, README and changelog',
    async () => {
      const allowed = [
        /^package\/package\.json$/,
        /^package\/LICENSE$/,
        /^package\/README\.md$/,
        /^package\/CHANGELOG\.md$/,
        /^package\/dist\/.+\.cjs(\.map)?$/,
      ];
      const unexpected = (await tarballEntries()).filter(
        (entry) => !allowed.some((pattern) => pattern.test(entry))
      );
      expect(unexpected).toEqual([]);
    }
  );

  testif(hasDist)(
    'fresh install: frodo -v reports versions',
    async () => {
      const { stdout } = await exec(
        `node ${path.join(installDir, 'node_modules', '.bin', 'frodo')} -v`,
        { env: { ...process.env, NODE_OPTIONS }, cwd: installDir }
      );
      expect(stdout).toMatch(/cli:\s+v\d+\.\d+\.\d+/);
      expect(stdout).toMatch(/lib:\s+v\d+\.\d+\.\d+/);
    }
  );

  testif(hasDist)(
    'fresh install: frodo -h prints usage',
    async () => {
      const { stdout } = await exec(
        `node ${path.join(installDir, 'node_modules', '.bin', 'frodo')} -h`,
        { env: { ...process.env, NODE_OPTIONS }, cwd: installDir }
      );
      expect(stdout).toMatch(/Usage:/);
    }
  );
});
