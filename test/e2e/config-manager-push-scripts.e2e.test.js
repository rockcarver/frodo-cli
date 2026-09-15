/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push scripts -FD test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_REALM=/ frodo config-manager push scripts --directory test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_REALM=alpha frodo config-manager push scripts --force-update --name testing -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_REALM=/ frodo config-manager push scripts -Ff 'Debug,~Next' -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

const allDirectory = "test/e2e/exports/fr-config-manager/forgeops";

describe('frodo config-manager push scripts', () => {
    test(`"frodo config-manager push scripts -FD ${allDirectory} -m forgeops": should import the scripts into forgeops`, async () => {
        const CMD = `frodo config-manager push scripts -FD ${allDirectory} -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });
    test(`"frodo config-manager push scripts --directory ${allDirectory} -m forgeops": should not import the scripts into forgeops when no changes made`, async () => {
        const CMD = `frodo config-manager push scripts --directory ${allDirectory} -m forgeops`;
        await testSuccess(CMD, {
            env: {
                ...forgeopsEnv.env,
                FRODO_REALM: '/'
            }
        });
    });
    test(`"frodo config-manager push scripts --force-update --name testing -D ${allDirectory} -m forgeops": should import the scripts into forgeops`, async () => {
        const CMD = `frodo config-manager push scripts --force-update --name testing -D ${allDirectory} -m forgeops`;
        await testSuccess(CMD, {
            env: {
                ...forgeopsEnv.env,
                FRODO_REALM: 'alpha'
            }
        });
    });
    test(`"frodo config-manager push scripts -Ff 'Debug,~Next' -D ${allDirectory} -m forgeops": should import the scripts into forgeops`, async () => {
        const CMD = `frodo config-manager push scripts -Ff 'Debug,~Next' -D ${allDirectory} -m forgeops`;
        await testSuccess(CMD, {
            env: {
                ...forgeopsEnv.env,
                FRODO_REALM: '/'
            }
        });
    });
});