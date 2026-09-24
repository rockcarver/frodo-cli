/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push telemetry -c otlp --env TELEMETRY_HEADER_OTLP_TEST_OTLP_API_KEY=test-value --env TELEMETRY_HEADER_OTLP_TEST_OTLP_API_SECRET=test-value -D test/e2e/exports/fr-config-manager/cloud 
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push telemetry -c otlp -n test-otlp -E TELEMETRY_HEADER_OTLP_TEST_OTLP_API_KEY=test-value -E TELEMETRY_HEADER_OTLP_TEST_OTLP_API_SECRET=test-value -D test/e2e/exports/fr-config-manager/cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push telemetry -c splunk --name test -D test/e2e/exports/fr-config-manager/cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push telemetry -c splunk -D test/e2e/exports/fr-config-manager/cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push telemetry -E TELEMETRY_HEADER_OTLP_TEST_OTLP_API_KEY=all-test -E TELEMETRY_HEADER_OTLP_TEST_OTLP_API_SECRET=all-secret -D test/e2e/exports/fr-config-manager/cloud
*/

import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, isRecordingMode, logRecordingProgress, testFail, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);
const isRecording = isRecordingMode();

const telemetryDir = 'test/e2e/exports/fr-config-manager/cloud';

// PingOne AIC allows only ONE log-streaming exporter configuration per
// tenant at a time (see test/e2e/README.md's telemetry note), so every
// exporter-creating test below must start from a clean slate in recording
// mode, or it collides with whatever the previous test just created.
async function resetTelemetry() {
  if (!isRecording) return;
  logRecordingProgress('Resetting telemetry exporters before next recording');
  await exec(`node test/e2e/utils/deleteAllTelemetry.cjs ${c.host}`);
}

describe('frodo config-manager push telemetry', () => {
  beforeEach(resetTelemetry);

  test(`"frodo config-manager push telemetry -c otlp --env TELEMETRY_HEADER_OTLP_TEST_OTLP_API_KEY=test-value --env TELEMETRY_HEADER_OTLP_TEST_OTLP_API_SECRET=test-value -D ${telemetryDir}": should import otlp telemetry by category and update placeholder values`, async () => {
    const CMD = `frodo config-manager push telemetry -c otlp --env TELEMETRY_HEADER_OTLP_TEST_OTLP_API_KEY=test-value --env TELEMETRY_HEADER_OTLP_TEST_OTLP_API_SECRET=test-value  -D ${telemetryDir}`;
    await testSuccess(CMD, env);
  });

  test(`"frodo config-manager push telemetry -c otlp -n test-otlp -E TELEMETRY_HEADER_OTLP_TEST_OTLP_API_KEY=test-value -E TELEMETRY_HEADER_OTLP_TEST_OTLP_API_SECRET=test-value -D ${telemetryDir}": should import otlp telemetry by name and update placeholder values`, async () => {
    const CMD = `frodo config-manager push telemetry -c otlp -n test-otlp -E TELEMETRY_HEADER_OTLP_TEST_OTLP_API_KEY=test-value -E TELEMETRY_HEADER_OTLP_TEST_OTLP_API_SECRET=test-value -D ${telemetryDir}`;
    await testSuccess(CMD, env);
  });

  test(`"frodo config-manager push telemetry -c splunk --name test -D ${telemetryDir}": should import splunk telemetry by name`, async () => {
    const CMD = `frodo config-manager push telemetry -c splunk --name test -D ${telemetryDir}`;
    await testSuccess(CMD, env);
  });

  test(`"frodo config-manager push telemetry -c splunk -D ${telemetryDir}": should import splunk telemetry by category`, async () => {
    const CMD = `frodo config-manager push telemetry -c splunk -D ${telemetryDir}`;
    await testSuccess(CMD, env);
  });
  test(`"frodo config-manager push telemetry -E TELEMETRY_HEADER_OTLP_TEST_OTLP_API_KEY=all-test -E TELEMETRY_HEADER_OTLP_TEST_OTLP_API_SECRET=all-secret -D ${telemetryDir}": should fail to import all telemetry config`, async () => {
    const CMD = `frodo config-manager push telemetry -E TELEMETRY_HEADER_OTLP_TEST_OTLP_API_KEY=all-test -E TELEMETRY_HEADER_OTLP_TEST_OTLP_API_SECRET=all-secret -D ${telemetryDir}`;
    await testFail(CMD, env);
  });
});
