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

const pack = async () => {
  packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-pack-'));
  installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-install-'));
  await exec(`npm pack ${repoRoot} --pack-destination ${packDir}`, {
    env: { ...process.env, NODE_OPTIONS },
    cwd: repoRoot,
    maxBuffer: 50 * 1024 * 1024,
  });
  const tarball = fs.readdirSync(packDir).find((f) => f.endsWith('.tgz'));
  fs.writeFileSync(path.join(installDir, 'package.json'), '{}');
  await exec(`npm install ${path.join(packDir, tarball)} --no-audit --no-fund`, {
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

  testif(hasDist)(
    'packed dist/ contains every relative require() target',
    async () => {
      const pkgDist = path.join(installDir, 'node_modules', '@rockcarver', 'frodo-cli', 'dist');
      const shipped = new Set(fs.readdirSync(pkgDist));
      const missing = [];
      for (const file of fs.readdirSync(pkgDist)) {
        if (!file.endsWith('.cjs')) continue;
        const source = fs.readFileSync(path.join(pkgDist, file), 'utf8');
        for (const match of source.matchAll(/require\("\.\/([^"]+)"\)/g)) {
          if (!shipped.has(match[1])) missing.push(`${file} -> ${match[1]}`);
        }
      }
      expect(missing).toEqual([]);
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
