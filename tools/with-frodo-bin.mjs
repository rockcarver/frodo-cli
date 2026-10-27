#!/usr/bin/env node
/**
 * Prepends this checkout's dist-sea directory to PATH and execs the given
 * command. Used by the test scripts so that EVERY suite - including ones
 * that build their own env or use inherited env (test/client_cli/) -
 * resolves bare `frodo` to this checkout's SEA binary, never a global or
 * foreign install. CI no longer installs frodo globally, so without this
 * those suites would fail with "frodo: not found" (or silently test the
 * wrong build locally).
 *
 * The binary is built on demand if missing (see FrodoBinary.cjs).
 */
import { createRequire } from 'module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { staleBuildWarnings } from './StaleBuildCheck.mjs';

const require = createRequire(import.meta.url);
const { ensureFrodoArtifact, getTestBinaryPath } = require('../test/e2e/utils/FrodoBinary.cjs');

ensureFrodoArtifact();
process.env.PATH = getTestBinaryPath();

// An existing dist/ is never rebuilt here, and a linked frodo-lib has its own
// dist/. Warn (never fail) when either is older than its source.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const warning of staleBuildWarnings({ root })) {
  console.error(`\nWARNING: ${warning}\n`);
}

const [cmd, ...args] = process.argv.slice(2);
const child = import('node:child_process');
const { spawn } = await child;
const result = spawn(cmd, args, {
  stdio: 'inherit',
  env: process.env,
});
result.on('exit', (code) => process.exit(code ?? 1));
