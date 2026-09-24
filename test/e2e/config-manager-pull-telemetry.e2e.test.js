/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull telemetry -D telemetryTestDir
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull telemetry --category splunk -D telemetryTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull telemetry -c otlp -n test-otlp -D telemetryTestDir3
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull telemetry -n test-otlp -D telemetryTestDir4
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull telemetry -c otlp -D telemetryTestDir5
*/


import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);

describe('frodo config-manager pull telemetry', () => {
  test('"frodo config-manager pull telemetry": should export telemetry in fr-config-manager style"', async () => {
    const dirName = 'telemetryTestDir';
    const CMD = `frodo config-manager pull telemetry -D ${dirName}`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
  });

  test('"frodo config-manager pull telemetry --category splunk": should export only splunk exporters', async () => {
    const dirName = 'telemetryTestDir2';
    const CMD = `frodo config-manager pull telemetry --category splunk -D ${dirName}`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
  });
 
  test('"frodo config-manager pull telemetry -c otlp -n test-otlp": should export a single named exporter', async () => {
    const dirName = 'telemetryTestDir3';
    const CMD = `frodo config-manager pull telemetry -c otlp -n test-otlp -D ${dirName}`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
  });

  test('"frodo config-manager pull telemetry -n test-otlp": should export a single named exporter', async () => {
    const dirName = 'telemetryTestDir4';
    const CMD = `frodo config-manager pull telemetry -n test-otlp -D ${dirName}`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
  });

  test('"frodo config-manager pull telemetry -c otlp": should export only the otlp exporter', async () => {
    const dirName = 'telemetryTestDir5';
    const CMD = `frodo config-manager pull telemetry -c otlp -D ${dirName}`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
  });

});