/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_D frodo config-manager push secret-mappings -D test/e2e/exports/fr-config-manager/cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_n_D frodo config-manager push secret-mappings -n am.services.iot.cert.verification -D test/e2e/exports/fr-config-manager/cloud
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);

const allDirectory = "test/e2e/exports/fr-config-manager/cloud";

// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
describe('frodo config-manager push secret-mappings', () => {
    test(`"frodo config-manager push secret-mappings -D ${allDirectory} ": should import the secret mapping into cloud"`, async () => {
        const CMD = `frodo config-manager push secret-mappings -D ${allDirectory} `;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_D' } });
    });

    test(`"frodo config-manager push secret-mappings -n am.services.iot.cert.verification -D ${allDirectory}": should import a specific secret mapping by name into cloud"`, async () => {
        const CMD = `frodo config-manager push secret-mappings -n am.services.iot.cert.verification -D ${allDirectory}`;
        await testSuccess(CMD, {
            env: {
                ...cloudEnv.env,
                FRODO_TEST_NAME: '0_n_D',
                FRODO_REALM: 'alpha'
            }
        }
    )});
});