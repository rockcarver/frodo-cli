#!/usr/bin/env node
/**
 * Builds the native SEA binary: SEA bundle (tsdown.sea.config.mts ->
 * dist-sea/app.cjs) + `node --build-sea sea-config.json`.
 *
 * Platform notes:
 * - --build-sea needs Node >= 25.5; checked up front with a clear message
 *   (node itself only says "bad option: --build-sea").
 * - The build output is UNSIGNED on every platform (the SEA build strips
 *   signatures from the host Node binary it embeds). On macOS every
 *   executable must be signed or it is killed at first exec (V8 cannot
 *   reserve its code range without the JIT entitlement), so this script
 *   ad-hoc signs the binary with the repo's allow-jit entitlements.
 *   Release pipelines replace the ad-hoc signature with Developer ID +
 *   notarization. Linux and Windows need no signing step for a locally
 *   built binary.
 * - On Windows node --build-sea emits an extensionless `frodo`, which
 *   CreateProcess will not execute; copied to frodo.exe (this absorbs the
 *   Copy-Item the Windows CI job previously had to do itself).
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const repoRoot = resolve(require.resolve('../package.json'), '..');
const seaBundle = join(repoRoot, 'dist-sea', 'app.cjs');
const binaryName = process.platform === 'win32' ? 'frodo.exe' : 'frodo';
const binaryPath = join(repoRoot, 'dist-sea', binaryName);

const [major] = process.versions.node.split('.').map(Number);
if (major < 26) {
  console.error(
    `\nError: building the SEA binary needs Node >= 26 (--build-sea was stabilized in 25.5); you are running ${process.versions.node}.\n` +
      `Either run 'nvm use 26' (macOS/Linux) or switch your Node version (Windows), then re-run this command.\n` +
      `If you only need the JS build (npm package / Docker), use 'npm run build:only' instead - it works on any Node.\n`
  );
  process.exit(1);
}

// 1. Bundle: single self-contained CJS file at dist-sea/app.cjs (the file
// sea-config.json's main points at).
execFileSync('npm', ['run', 'build:sea-bundle'], {
  cwd: repoRoot,
  stdio: 'inherit',
});

// 2. Embed the bundle into the Node runtime.
execFileSync('node', ['--build-sea', 'sea-config.json'], {
  cwd: repoRoot,
  stdio: 'inherit',
});

// 3. Windows: make it executable under its PATHEXT-resolvable name.
if (process.platform === 'win32') {
  copyFileSync(join(repoRoot, 'dist-sea', 'frodo'), binaryPath);
}

// 4. macOS: ad-hoc sign with the JIT entitlement. Without it the binary is
// killed at startup (V8 CodeRange reservation fails under the runtime
// hardening that --options runtime enables; an unsigned binary gets an
// entitlement-less auto-signature at first exec). Release jobs re-sign with
// Developer ID + notarize, replacing this signature.
if (process.platform === 'darwin') {
  const tmp = mkdtempSync(join(tmpdir(), 'frodo-sea-ent-'));
  const entitlements = join(tmp, 'allow-jit.plist');
  writeFileSync(
    entitlements,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>
`
  );
  execFileSync(
    'codesign',
    ['-s', '-', '--options', 'runtime', '--entitlements', entitlements, '--force', binaryPath],
    { cwd: repoRoot, stdio: 'inherit' }
  );
}

if (!existsSync(binaryPath)) {
  console.error(`Error: SEA binary was not produced at ${binaryPath}`);
  process.exit(1);
}
console.log(`SEA binary ready: dist-sea/${binaryName}`);
