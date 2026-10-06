/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager delete locales -y -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager delete locales -n fr -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager delete locales --dry-run -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager delete locales -d -n fr -m forgeops
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

describe('frodo config-manager delete locales', () => {
    test(`"frodo config-manager delete locales -y -m forgeops": should delete all locales in forgeops"`, async () => {
        const CMD = `frodo config-manager delete locales -y -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });
    test(`"frodo config-manager delete locales -n fr -m forgeops": should delete a specific locale by name in forgeops"`, async () => {
        const CMD = `frodo config-manager delete locales -n fr -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });
    test(`"frodo config-manager delete locales --dry-run -m forgeops": should delete all locales in forgeops"`, async () => {
        const CMD = `frodo config-manager delete locales --dry-run -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });
    test(`"frodo config-manager delete locales -d -n fr -m forgeops": should delete a specific locale by name in forgeops"`, async () => {
        const CMD = `frodo config-manager delete locales -d -n fr -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });
});