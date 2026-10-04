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

const require = createRequire(import.meta.url);
const { ensureFrodoArtifact, getTestBinaryPath } = require('../test/e2e/utils/FrodoBinary.cjs');

ensureFrodoArtifact();
process.env.PATH = getTestBinaryPath();

const [cmd, ...args] = process.argv.slice(2);
const child = import('node:child_process');
const { spawn } = await child;
const result = spawn(cmd, args, {
  stdio: 'inherit',
  env: process.env,
});
result.on('exit', (code) => process.exit(code ?? 1));
