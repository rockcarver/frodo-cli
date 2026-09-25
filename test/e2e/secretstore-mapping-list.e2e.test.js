/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore mapping list -i ESV
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore mapping list -l -i ESV -t GoogleSecretManagerSecretStoreProvider

// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore mapping list -gi EnvironmentAndSystemPropertySecretStore -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore mapping list --long --secretstore-id default-keystore --secretstore-type KeyStoreSecretStore --global --type classic
*/

import { getEnv, testFail, testSuccess } from './utils/TestUtils';
import { connection as c, classic_connection as cc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);
const classicEnv = getEnv(cc);

describe('frodo secretstore mapping list', () => {
    test('"frodo secretstore mapping list -i ESV": should list the secret store mappings for the ESV secret store', async () => {
        const CMD = `frodo secretstore mapping list -i ESV`;
        await testSuccess(CMD, env);
    });
    test('"frodo secretstore mapping list -l -i ESV -t GoogleSecretManagerSecretStoreProvider": should list the secret store mappings for the ESV secret store with extra details', async () => {
        const CMD = `frodo secretstore mapping list -l -i ESV -t GoogleSecretManagerSecretStoreProvider`;
        await testSuccess(CMD, env);
    });
    test('"frodo secretstore mapping list -gi EnvironmentAndSystemPropertySecretStore -m classic": should fail since EnvironmentAndSystemPropertySecretStore has no mappings', async () => {
        const CMD = `frodo secretstore mapping list -gi EnvironmentAndSystemPropertySecretStore -m classic`;
        await testFail(CMD, classicEnv)
    });
    test('"frodo secretstore mapping list --long --secretstore-id default-keystore --secretstore-type KeyStoreSecretStore --global --type classic": should list the secret store mappings for the global keystore secret store', async () => {
        const CMD = `frodo secretstore mapping list --long --secretstore-id default-keystore --secretstore-type KeyStoreSecretStore --global --type classic`;
        await testSuccess(CMD, classicEnv);
    });
});
