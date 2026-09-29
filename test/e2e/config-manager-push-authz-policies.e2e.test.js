/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push authz-policies -FD test/e2e/exports/fr-config-manager/forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push authz-policies -D test/e2e/exports/fr-config-manager/forgeops
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/fr-config-manager/forgeops";

describe('frodo config-manager push authz-policies', () => {
    test(`"frodo config-manager push authz-policies -FD ${allDirectory}": should import the authz-policies"`, async () => {
        const CMD = `frodo config-manager push authz-policies -FD ${allDirectory}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo config-manager push authz-policies -D ${allDirectory}": should not import the authz-policies when no changes are made"`, async () => {
        const CMD = `frodo config-manager push authz-policies -D ${allDirectory}`;
        await testSuccess(CMD, env);
    });
});