/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_D_m frodo config-manager push password-policy -D test/e2e/exports/fr-config-manager/cloud -m cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_REALM=alpha FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_D_m frodo config-manager push password-policy -D test/e2e/exports/fr-config-manager/cloud -m cloud

// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_D_m frodo config-manager push password-policy -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_REALM=alpha FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_D_m frodo config-manager push password-policy -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc, connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);
const forgeopsEnv = getEnv(fc);

const cloudAllDirectory = "test/e2e/exports/fr-config-manager/cloud";
const forgeopsAllDirectory = "test/e2e/exports/fr-config-manager/forgeops";

// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
describe('frodo config-manager push password-policy', () => {
    describe('Cloud', () => {
        test(`"frodo config-manager push password-policy -D ${cloudAllDirectory} -m cloud": should import the password policy into AIC"`, async () => {
            const CMD = `frodo config-manager push password-policy -D ${cloudAllDirectory} -m cloud`;
            await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_D_m' } });
        });

        test(`"FRODO_REALM=alpha frodo config-manager push password-policy -D ${cloudAllDirectory} -m cloud": should import a specific password policy by name into AIC"`, async () => {
            const CMD = `frodo config-manager push password-policy -D ${cloudAllDirectory} -m cloud`;
            await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_D_m', FRODO_REALM: 'alpha' } });
        });
    });

    describe.skip('ForgeOps', () => {
        test(`"frodo config-manager push password-policy -D ${forgeopsAllDirectory} -m forgeops": should import the password policy into forgeops"`, async () => {
            const CMD = `frodo config-manager push password-policy -D ${forgeopsAllDirectory} -m forgeops`;
            await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_D_m' } });
        });

        test(`"FRODO_REALM=alpha frodo config-manager push password-policy -D ${forgeopsAllDirectory} -m forgeops": should import a specific password policy by name into forgeops"`, async () => {
            const CMD = `frodo config-manager push password-policy -D ${forgeopsAllDirectory} -m forgeops`;
            await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_D_m', FRODO_REALM: 'alpha' } });
        });
    });
});
