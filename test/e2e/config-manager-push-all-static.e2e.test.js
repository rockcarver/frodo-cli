/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_REALM=alpha FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_D frodo config-manager push all-static -D test/e2e/exports/fr-config-manager/cloud

// Cloud, all realms (no realm given, so nothing is filtered)
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_M.two_M.true_M.true2_M.true3_M.true3_M.obj.one_M.obj.two_M.obj2.obj3.msg_D frodo config-manager push all-static -M.two 2 -M.true true -M.true2 -M.true3 -M.true3 three -M.obj.one 1 -M.obj.two -M.obj2.obj3.msg hello -D test/e2e/exports/fr-config-manager/cloud

// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_D_m frodo config-manager push all-static -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
*/

import { getEnv, testSuccess, testFail } from './utils/TestUtils';
import { connection as c, forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);
const forgeopsEnv = getEnv(fc);

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

const cloudDir = 'test/e2e/exports/fr-config-manager/cloud';
const forgeopsDir = 'test/e2e/exports/fr-config-manager/forgeops';

describe('frodo config-manager push all-static', () => {
  test(`"frodo config-manager push all-static -D ${cloudDir}": should import all static configurations alpha to cloud in fr-config-manager style"`, async () => {
    const CMD = `frodo config-manager push all-static -D ${cloudDir}`;
    await testFail(CMD, { env: {...env.env, FRODO_REALM: 'alpha', FRODO_TEST_NAME: '0_D' } });
  });
  test(`"frodo config-manager push all-static ${dotNotationArgs} -D ${cloudDir}": should import all static configurations of all realms to cloud in fr-config-manager style"`, async () => {
    const CMD = `frodo config-manager push all-static ${dotNotationArgs} -D ${cloudDir}`;
    await testFail(CMD, { env: {...env.env, FRODO_TEST_NAME: '0_M.two_M.true_M.true2_M.true3_M.true3_M.obj.one_M.obj.two_M.obj2.obj3.msg_D' } });
  });
  test(`"frodo config-manager push all-static -D ${forgeopsDir} -m forgeops": should import all static configurations of all realms to forgeops in fr-config-manager style"`, async () => {
    const CMD = `frodo config-manager push all-static -D ${forgeopsDir} -m forgeops`;
    await testSuccess(CMD, { env: {...forgeopsEnv.env, FRODO_TEST_NAME: '0_D_m' } });
  });
});