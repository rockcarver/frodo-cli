/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_dry-run_c frodo config-manager delete telemetry --dry-run -c splunk
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_c_y frodo config-manager delete telemetry -c splunk -y
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_c_n frodo config-manager delete telemetry -c splunk -n frodo-test-splunk-1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_n frodo config-manager delete telemetry -n frodo-test-splunk-1
*/

import { getEnv, testFail, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
const env = getEnv(c);


describe('frodo config-manager delete telemetry', () => {
  test(`"frodo config-manager delete telemetry --dry-run -c splunk": should print a dry-run message for a Splunk exporter`, async () => {
    const CMD = `frodo config-manager delete telemetry --dry-run -c splunk`;
    await testSuccess(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_dry-run_c' } });
  });
  test(`"frodo config-manager delete telemetry -c splunk -y": should delete an splunk exporter by category`, async () => {
    const CMD = `frodo config-manager delete telemetry -c splunk -y`;
    await testSuccess(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_c_y' } });
  });
  test(`"frodo config-manager delete telemetry -c splunk -n frodo-test-splunk-1": should delete a Splunk exporter by name`, async () => {
    const CMD = `frodo config-manager delete telemetry -c splunk -n frodo-test-splunk-1`;
    await testSuccess(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_c_n' } });
  });
  test(`"frodo config-manager delete telemetry -n frodo-test-splunk-1": should fail when a name is supplied without a category`, async () => {
    const CMD = `frodo config-manager delete telemetry -n frodo-test-splunk-1`;
    await testFail(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_n' } });
  });
});

