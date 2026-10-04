import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
    binaryPath: seaBinaryPath,
    ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const driverPath = path.join(repoRoot, 'test', 'utils', 'shell_pty_driver.py');

function sleepSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function createShellTestHome() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-shell-'));
}

export function removeShellTestHome(homeDir) {
    fs.rmSync(homeDir, { recursive: true, force: true });
}

export function runShellScenario({ actions, homeDir, env = {}, args = ['shell'] }) {
    // The shell tests exercise the interactive shell of THIS checkout's build.
    // The SEA binary is the artifact customers run, so prefer it; build it on
    // demand if missing. The npm dist build stays as a fallback so the shell
    // tests remain runnable on a bare checkout without a Node >= 25.5.
    ensureFrodoArtifact();
    const scenarioHomeDir = homeDir ?? createShellTestHome();
    const scenario = {
        command: [seaBinaryPath, ...args],
        cwd: repoRoot,
        homeDir: scenarioHomeDir,
        env: {
            ...env,
            FRODO_TEST: '1',
            FRODO_NO_CACHE: 'true',
            TERM: 'xterm-256color',
            FRODO_CONNECTION_PROFILES_PATH: '',
            // Clear Jest's NODE_OPTIONS so --experimental-vm-modules and
            // similar flags don't interfere with the shell's own loader setup.
            NODE_OPTIONS: '',
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