/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_metadata.pushedAt_metadata.versionInfo.version_metadata.versionInfo.stable_metadata.versionInfo.rev_m frodo config-manager push config-metadata --metadata.pushedAt 2023-09-10T10:21:46Z --metadata.versionInfo.version 1.0 --metadata.versionInfo.stable true --metadata.versionInfo.rev 0675342640420f7ff6635d6a63d2c9c81b6feca7 -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_M.two_M.true_M.true2_M.true3_M.true3_M.obj.one_M.obj.two_M.obj2.obj3.msg_m frodo config-manager push config-metadata -M.two 2 -M.true true -M.true2 -M.true3 -M.true3 three -M.obj.one 1 -M.obj.two -M.obj2.obj3.msg hello -m forgeops
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

const metadataArgs = [
  '--metadata.pushedAt 2023-09-10T10:21:46Z',
  '--metadata.versionInfo.version 1.0',
  '--metadata.versionInfo.stable true',
  '--metadata.versionInfo.rev 0675342640420f7ff6635d6a63d2c9c81b6feca7',
].join(' ');
const dotNotationArgs = [
  '-M.two 2',
  '-M.true true',
  '-M.true2',
  '-M.true3',
  '-M.true3 three',
  '-M.obj.one 1',
  '-M.obj.two',
  '-M.obj2.obj3.msg hello',
].join(' ');

// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
describe('frodo config-manager push config-metadata', () => {
    test(`"frodo config-manager push config-metadata ${metadataArgs} -m forgeops": should import config-metadata into forgeops"`, async () => {
        const CMD = `frodo config-manager push config-metadata ${metadataArgs} -m forgeops `;
        await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_metadata.pushedAt_metadata.versionInfo.version_metadata.versionInfo.stable_metadata.versionInfo.rev_m' } });
    });
    test(`"frodo config-manager push config-metadata ${dotNotationArgs} -m forgeops": should correctly parse dot-notation options (string values, boolean defaults, duplicate-path arrays, and nested objects) and import config-metadata into forgeops"`, async () => {
        const CMD = `frodo config-manager push config-metadata ${dotNotationArgs} -m forgeops `;
        await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_M.two_M.true_M.true2_M.true3_M.true3_M.obj.one_M.obj.two_M.obj2.obj3.msg_m' } });
  });
});
