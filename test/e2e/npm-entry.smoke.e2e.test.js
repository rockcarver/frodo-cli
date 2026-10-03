/**
 * Smoke tests for the npm-package entry point (dist/launch.cjs).
 *
 * The SEA binary (dist-sea/frodo) is the artifact customers get from
 * Homebrew and the release zips, and the e2e suites exercise it. But the
 * npm install (`npx frodo`) and the Docker image run `node dist/launch.cjs`
 * instead - a different launcher with its own signal-forwarding wrapper.
 * These tests keep that path covered explicitly.
 *
 * Unlike the other e2e suites, these do NOT need mocks or credentials:
 * they only assert the entry boots and reports version/help.
 */
import cp from 'child_process';
import { promisify } from 'util';
import path from 'path';

import { repoRoot } from './utils/FrodoBinary.cjs';

const exec = promisify(cp.exec);
const launchPath = path.join(repoRoot, 'dist', 'launch.cjs');

const NODE_OPTIONS = ''; // clear jest's flags for the child

describe('npm package entry (node dist/launch.cjs)', () => {
  test('-v reports the CLI and lib versions', async () => {
    const { stdout } = await exec(
      `node ${launchPath} -v`,
      { env: { ...process.env, NODE_OPTIONS }, cwd: repoRoot }
    );
    expect(stdout).toMatch(/cli:\s+v\d+\.\d+\.\d+/);
    expect(stdout).toMatch(/lib:\s+v\d+\.\d+\.\d+/);
    expect(stdout).toMatch(/node:\s+v\d+/);
  });

  test('-h prints usage', async () => {
    const { stdout } = await exec(
      `node ${launchPath} -h`,
      { env: { ...process.env, NODE_OPTIONS }, cwd: repoRoot }
    );
    expect(stdout).toMatch(/Usage:/);
    expect(stdout).toMatch(/frodo/);
  });

  test('journey -h prints subcommand help (commander wiring loads)', async () => {
    const { stdout } = await exec(
      `node ${launchPath} journey -h`,
      { env: { ...process.env, NODE_OPTIONS }, cwd: repoRoot }
    );
    expect(stdout).toMatch(/Usage:/);
    expect(stdout).toMatch(/journey/);
  });
});
