#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const launchArgs = [
  '--no-warnings',
  '--enable-source-maps',
  '--experimental-loader',
  require.resolve('./loader.js'),
  require.resolve('./app.js'),
];
const frodoArgs = process.argv.slice(2);

const frodo = spawn(process.execPath, [...launchArgs, ...frodoArgs], {
  stdio: 'inherit',
  shell: false,
});

frodo.on('exit', (code) => {
  process.exitCode = code;
});
