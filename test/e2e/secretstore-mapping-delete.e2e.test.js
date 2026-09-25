/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore mapping delete -i ESV -s am.services.httpclient.mtls.servertrustcerts.testServerCert.secret
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore mapping delete -i ESV -t GoogleSecretManagerSecretStoreProvider -s unknown.label
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore mapping delete --all --secretstore-id ESV --secretstore-type GoogleSecretManagerSecretStoreProvider

// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore mapping delete -gi EnvironmentAndSystemPropertySecretStore -t EnvironmentAndSystemPropertySecretStore -s am.services.uma.pct.encryption -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore mapping delete --global -i default-keystore -s am.uma.resource.labels.mtls.cert --type classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore mapping delete -agi default-keystore -m classic
*/

import { getEnv, testFail, testSuccess } from './utils/TestUtils';
import { connection as c, classic_connection as cc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);
const classicEnv = getEnv(cc);

describe('frodo secretstore mapping delete', () => {
    test('"frodo secretstore mapping delete -i ESV -s am.services.httpclient.mtls.servertrustcerts.testServerCert.secret": should delete mapping in the ESV secret store', async () => {
        const CMD = `frodo secretstore mapping create -i ESV -s am.services.httpclient.mtls.servertrustcerts.testServerCert.secret -a esv-test-server-cert`;
        await testSuccess(CMD, env);
    });
    test('"frodo secretstore mapping delete -i ESV -t GoogleSecretManagerSecretStoreProvider -s unknown.label": should fail since mapping does not exist', async () => {
        const CMD = `frodo secretstore mapping delete -i ESV -t GoogleSecretManagerSecretStoreProvider -s unknown.label`;
        await testFail(CMD, env)
    });
    test('"frodo secretstore mapping delete --all --secretstore-id ESV --secretstore-type GoogleSecretManagerSecretStoreProvider": should delete all mappings in ESV secret store', async () => {
        const CMD = `frodo secretstore mapping delete --all --secretstore-id ESV --secretstore-type GoogleSecretManagerSecretStoreProvider`;
        await testSuccess(CMD, env)
    });
    test('"frodo secretstore mapping delete -gi EnvironmentAndSystemPropertySecretStore -t EnvironmentAndSystemPropertySecretStore -s am.services.uma.pct.encryption -m classic": should fail since no mappings can exist for the EnvironmentAndSystemPropertySecretStore', async () => {
        const CMD = `frodo secretstore mapping delete -gi EnvironmentAndSystemPropertySecretStore -t EnvironmentAndSystemPropertySecretStore -s am.services.uma.pct.encryption -m classic`;
        await testFail(CMD, classicEnv)
    });
    test('"frodo secretstore mapping delete --global -i default-keystore -s am.uma.resource.labels.mtls.cert --type classic": should delete mapping in the global default-keystore secret store', async () => {
        const CMD = `frodo secretstore mapping delete --global -i default-keystore -s am.uma.resource.labels.mtls.cert --type classic`;
        await testSuccess(CMD, classicEnv);
    });
    test('"frodo secretstore mapping delete -agi default-keystore -m classic": should delete all mappings in global default-keystore secret store', async () => {
        const CMD = `frodo secretstore mapping delete -agi default-keystore -m classic`;
        await testSuccess(CMD, classicEnv);
    });
});
