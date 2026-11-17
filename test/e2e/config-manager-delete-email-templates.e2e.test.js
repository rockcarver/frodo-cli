/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_n_m frodo config-manager delete email-templates -n frodoNameTest -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_y_m frodo config-manager delete email-templates -y -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_d_n_m frodo config-manager delete email-templates -d -n test -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_dry-run_m frodo config-manager delete email-templates --dry-run -m forgeops
*/
import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
// FRODO_TEST_NAME pins the recording identity of a command: the id its recording was made under.
const forgeopsEnv = getEnv(fc);

describe('frodo config-manager delete email-templates', () => {
    test(`"frodo config-manager delete email-templates -n frodoNameTest -m forgeops": should delete a specific email-template by name in forgeops"`, async () => {
        const CMD = `frodo config-manager delete email-templates -n frodoNameTest -m forgeops`;
        await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_n_m' } });
    });
    test(`"frodo config-manager delete email-templates -y -m forgeops": should delete the email-templates in forgeops"`, async () => {
        const CMD = `frodo config-manager delete email-templates -y -m forgeops`;
        await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_y_m' } });
    });
    test(`"frodo config-manager delete email-templates -d -n test -m forgeops": should dry-run delete a specific email-template by name in forgeops"`, async () => {
        const CMD = `frodo config-manager delete email-templates -d -n test -m forgeops`;
        await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_d_n_m' } });
    });
    test(`"frodo config-manager delete email-templates --dry-run -m forgeops": should delete the email-templates in forgeops"`, async () => {
        const CMD = `frodo config-manager delete email-templates --dry-run -m forgeops`;
        await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_dry-run_m' } });
    });
});