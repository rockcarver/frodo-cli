/** See test/e2e/README.md for how to write and record e2e tests. */

/*
//Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push csp -D test/e2e/exports/fr-config-manager/cloud 
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push csp -n enforced -D test/e2e/exports/fr-config-manager/cloud 
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push csp --name test-only -D test/e2e/exports/fr-config-manager/cloud 
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push csp --name report-only --directory test/e2e/exports/fr-config-manager/cloud 
*/

import { getEnv, testSuccess, testFail } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);

const allDirectory = "test/e2e/exports/fr-config-manager/cloud";

// FRODO_TEST_NAME pins the recording's identity (the last segment of its path): the id stays when flags are renamed.
describe('frodo config-manager push csp', () => {
    test(`"frodo config-manager push csp -D ${allDirectory} ": should import the csp into cloud"`, async () => {
        const CMD = `frodo config-manager push csp -D ${allDirectory} `;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_D' } });
    });
    test(`"frodo config-manager push csp -n enforced -D ${allDirectory} ": should import the 'enforced' CSP into cloud"`, async () => {
        const CMD = `frodo config-manager push csp -n enforced -D ${allDirectory} `;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_n_D' } });
    });
    test(`"frodo config-manager push csp --name test-only -D ${allDirectory} ": should fail to import the 'test-only' CSP into cloud"`, async () => {
        const CMD = `frodo config-manager push csp --name test-only -D ${allDirectory} `;
        await testFail(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_name_D' } });
    });
    test(`"frodo config-manager push csp --name report-only --directory ${allDirectory} ": should import the 'report-only' CSP into cloud"`, async () => {
        const CMD = `frodo config-manager push csp --name report-only --directory ${allDirectory} `;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_name_directory' } });
    });
});