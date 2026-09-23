/**
 * Follow this process to write e2e tests for the CLI project:
 *
 * 1. Test if all the necessary mocks for your tests already exist.
 *    In mock mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=1 frodo conn save https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com Sup3rS3cr3t!
 *
 *    If your command completes without errors and with the expected results,
 *    all the required mocks already exist and you are good to write your
 *    test and skip to step #4.
 *
 *    If, however, your command fails and you see errors like the one below,
 *    you know you need to record the mock responses first:
 *
 *    [Polly] [adapter:node-http] Recording for the following request is not found and `recordIfMissing` is `false`.
 *
 * 2. Record mock responses for your exact command.
 *    In mock record mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=record frodo conn save https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com Sup3rS3cr3t!
 *
 *    Wait until you see all the Polly instances (mock recording adapters) have
 *    shutdown before you try to run step #1 again.
 *    Messages like these indicate mock recording adapters shutting down:
 *
 *    Polly instance 'conn/4' stopping in 3s...
 *    Polly instance 'conn/4' stopping in 2s...
 *    Polly instance 'conn/save/3' stopping in 3s...
 *    Polly instance 'conn/4' stopping in 1s...
 *    Polly instance 'conn/save/3' stopping in 2s...
 *    Polly instance 'conn/4' stopped.
 *    Polly instance 'conn/save/3' stopping in 1s...
 *    Polly instance 'conn/save/3' stopped.
 *
 * 3. Validate your freshly recorded mock responses are complete and working.
 *    Re-run the exact command you want to test in mock mode (see step #1).
 *
 * 4. Write your test.
 *    Make sure to use the exact command including number of arguments and params.
 *
 * 5. Commit both your test and your new recordings to the repository.
 *    Your tests are likely going to reside outside the frodo-lib project but
 *    the recordings must be committed to the frodo-lib project.
 */

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
