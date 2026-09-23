#!/usr/bin/env node

// PingOne Advanced Identity Cloud allows only ONE log-streaming exporter
// configuration per tenant at a time (confirmed against
// https://docs.pingidentity.com/pingoneaic/tenants/audit-debug-logs-push-api.md),
// so telemetry-related e2e tests that create an exporter must start from a
// genuinely empty state or they collide with whatever a prior test left
// behind. There is no `frodo telemetry delete` CLI command yet (see
// frodo-lib's src/ops/cloud/TelemetryOps.ts -- the op exists, just not a CLI
// wrapper), so this is a standalone stopgap script for recording-mode setup
// only. It uses frodo-lib's CJS build directly (not the ESM one, which
// real-ESM Jest can't load, and not `@rockcarver/frodo-lib` package
// resolution, since this script isn't run from inside a package that
// depends on it) via an explicit relative path into the linked package.

const path = require('node:path');
const { frodo } = require(
  path.join(__dirname, '..', '..', '..', 'node_modules', '@rockcarver', 'frodo-lib', 'dist', 'index.js')
);

const host = process.argv[2];
if (!host) {
  console.error('Usage: node deleteAllTelemetry.cjs <host>');
  process.exit(1);
}

(async () => {
  const { state, conn, login } = frodo;
  const { telemetry } = frodo.cloud;
  state.setHost(host);
  await conn.loadConnectionProfileByHost(host);
  await login.getTokens();
  const deleted = await telemetry.deleteTelemetry();
  console.log(`[deleteAllTelemetry] Deleted ${deleted.length} exporter(s) on ${host}.`);
})().catch((e) => {
  console.error('[deleteAllTelemetry] Failed:', e.message || e);
  process.exit(1);
});
