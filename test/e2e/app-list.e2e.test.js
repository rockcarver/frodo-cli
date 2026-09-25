/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-volker-demo.forgeblocks.com/am frodo app list
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-volker-demo.forgeblocks.com/am frodo app list -l
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME='rootNoPrefix' frodo app list -lm forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME='rootPrefix' frodo app list --long --use-realm-prefix-on-managed-objects --type forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME='alphaNoPrefix' FRODO_REALM=alpha frodo app list -lm forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME='alphaPrefix' FRODO_REALM=alpha frodo app list --long --use-realm-prefix-on-managed-objects --type forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME='alphaBravoNoPrefix' FRODO_REALM=alpha/bravo frodo app list -lm forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME='alphaBravoPrefix' FRODO_REALM=alpha/bravo frodo app list --long --use-realm-prefix-on-managed-objects --type forgeops
 */
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c, forgeops_connection as fc } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);
const forgeopsEnv = getEnv(fc);

describe('frodo app list', () => {
    test('"frodo app list": should list the ids of the apps', async () => {
        const CMD = `frodo app list`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo app list -l": should list the ids, statuses, client types, grant types, scopes, and redirect URIs of the apps', async () => {
        const CMD = `frodo app list -l`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo app list -lm forgeops": should list the ids, statuses, client types, grant types, scopes, and redirect URIs of "application" managed objects', async () => {
        const CMD = `frodo app list -lm forgeops`;
        const { stdout } = await exec(CMD, {
            env: {
                ...forgeopsEnv.env,
                FRODO_TEST_NAME: 'rootNoPrefix',
            }
        });
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo app list --long --use-realm-prefix-on-managed-objects --type forgeops": should list the ids, statuses, client types, grant types, scopes, and redirect URIs of "application" managed objects', async () => {
        const CMD = `frodo app list --long --use-realm-prefix-on-managed-objects --type forgeops`;
        const { stdout } = await exec(CMD, {
            env: {
                ...forgeopsEnv.env,
                FRODO_TEST_NAME: 'rootPrefix'
            }
        });
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo app list -lm forgeops": should list the ids, statuses, client types, grant types, scopes, and redirect URIs of "application" managed objects', async () => {
        const CMD = `frodo app list -lm forgeops`;
        const { stdout } = await exec(CMD, {
            env: {
                ...forgeopsEnv.env,
                FRODO_REALM: 'alpha',
                FRODO_TEST_NAME: 'alphaNoPrefix'
            }
        });
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo app list --long --use-realm-prefix-on-managed-objects --type forgeops": should list the ids, statuses, client types, grant types, scopes, and redirect URIs of "alpha_application" managed objects', async () => {
        const CMD = `frodo app list --long --use-realm-prefix-on-managed-objects --type forgeops`;
        const { stdout } = await exec(CMD, {
            env: {
                ...forgeopsEnv.env,
                FRODO_REALM: 'alpha',
                FRODO_TEST_NAME: 'alphaPrefix'
            }
        });
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo app list -lm forgeops": should list the ids, statuses, client types, grant types, scopes, and redirect URIs of "application" managed objects', async () => {
        const CMD = `frodo app list -lm forgeops`;
        const { stdout } = await exec(CMD, {
            env: {
                ...forgeopsEnv.env,
                FRODO_REALM: 'alpha/bravo',
                FRODO_TEST_NAME: 'alphaBravoNoPrefix'
            }
        });
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo app list --long --use-realm-prefix-on-managed-objects --type forgeops": should list the ids, statuses, client types, grant types, scopes, and redirect URIs of "bravo_application" managed objects', async () => {
        const CMD = `frodo app list --long --use-realm-prefix-on-managed-objects --type forgeops`;
        const { stdout } = await exec(CMD, {
            env: {
                ...forgeopsEnv.env,
                FRODO_REALM: 'alpha/bravo',
                FRODO_TEST_NAME: 'alphaBravoPrefix'
            }
        });
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
