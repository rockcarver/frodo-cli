/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push journeys -D test/e2e/exports/fr-config-manager/forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push journeys -n ProgressiveProfile -D test/e2e/exports/fr-config-manager/forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push journeys -Fd -D test/e2e/exports/fr-config-manager/forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push journeys -d -D test/e2e/exports/fr-config-manager/forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push journeys -Fn ConfigManagerPushTest -d -D test/e2e/exports/fr-config-manager/forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_REALM=alpha frodo config-manager push journeys --directory test/e2e/exports/fr-config-manager/forgeops
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';


process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/fr-config-manager/forgeops";
describe('frodo config-manager push journeys', () => {
    test(`"frodo config-manager push journeys -D ${allDirectory}": should import the journeys"`, async () => {
        const CMD = `frodo config-manager push journeys -D ${allDirectory}`;
        await testSuccess(CMD, env);
    });
    test(`"frodo config-manager push journeys -n ProgressiveProfile -D ${allDirectory}": should import a specific journey by name"`, async () => {
        const CMD = `frodo config-manager push journeys -n ProgressiveProfile -D ${allDirectory}`;
        await testSuccess(CMD, env);
    });
    test(`"frodo config-manager push journeys -Fd -D ${allDirectory}": should resolve dependencies when importing"`, async () => {
        const CMD = `frodo config-manager push journeys -Fd -D ${allDirectory}`;
        await testSuccess(CMD, env);
    });
    test(`"frodo config-manager push journeys -d -D ${allDirectory}": should not resolve dependencies when no changes to scripts"`, async () => {
        const CMD = `frodo config-manager push journeys -d -D ${allDirectory}`;
        await testSuccess(CMD, env);
    });
    test(`"frodo config-manager push journeys -Fn ConfigManagerPushTest -d -D ${allDirectory}": should import a journey with dependencies"`, async () => {
        const CMD = `frodo config-manager push journeys -Fn ConfigManagerPushTest -d  -D ${allDirectory}`;
        await testSuccess(CMD, env);
    });
    test(`"frodo config-manager push journeys --directory ${allDirectory}": should import journeys into a specific realm"`, async () => {
        const CMD = `frodo config-manager push journeys --directory ${allDirectory}`;
        await testSuccess(CMD, {
            env: {
                ...env.env,
                FRODO_REALM: 'alpha'
            }
        });
    });
});
