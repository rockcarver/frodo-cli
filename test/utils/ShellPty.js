import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const distLaunchPath = path.join(repoRoot, 'dist', 'launch.cjs');
const distAppPath = path.join(repoRoot, 'dist', 'app.cjs');
const driverPath = path.join(repoRoot, 'test', 'utils', 'shell_pty_driver.py');
const buildLockPath = path.join(repoRoot, '.shell-pty-build.lock');

function sleepSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function distExists() {
    return fs.existsSync(distLaunchPath) && fs.existsSync(distAppPath);
}

function ensureCliBuilt() {
    if (distExists()) return;

    try {
        const fd = fs.openSync(buildLockPath, 'wx');
        try {
            cp.execFileSync('npm', ['run', 'build:only'], {
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

    const start = Date.now();
    while (Date.now() - start < 180000) {
        if (distExists()) return;
        if (!fs.existsSync(buildLockPath)) {
            return ensureCliBuilt();
        }
        sleepSync(250);
    }

    throw new Error('Timed out waiting for the CLI build to complete.');
}

export function createShellTestHome() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-shell-'));
}

export function removeShellTestHome(homeDir) {
    fs.rmSync(homeDir, { recursive: true, force: true });
}

export function runShellScenario({ actions, homeDir, env = {}, args = ['shell'] }) {
    ensureCliBuilt();

    const scenarioHomeDir = homeDir ?? createShellTestHome();
    const scenario = {
        command: [process.execPath, distLaunchPath, ...args],
        cwd: repoRoot,
        homeDir: scenarioHomeDir,
        env: {
            ...env,
            FRODO_TEST: '1',
            FRODO_NO_CACHE: 'true',
            TERM: 'xterm-256color',
        },
        actions,
    };

    const stdout = cp.execFileSync('python3', [driverPath], {
        cwd: repoRoot,
        input: JSON.stringify(scenario),
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
    });

    return {
        ...JSON.parse(stdout),
        homeDir: scenarioHomeDir,
    };
}