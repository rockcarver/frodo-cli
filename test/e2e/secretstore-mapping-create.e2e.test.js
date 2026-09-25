/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore mapping create -i ESV -s am.services.httpclient.mtls.servertrustcerts.testServerCert.secret -a esv-test-server-cert
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore mapping create -i ESV -t GoogleSecretManagerSecretStoreProvider -s am.services.httpclient.mtls.servertrustcerts.testServerCert.secret -a esv-test-server-cert
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore mapping create --secretstore-id ESV --secret-id am.services.uma.pct.encryption --aliases esv-test-server-cert,esv-test-server-cert-2

// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore mapping create -gi EnvironmentAndSystemPropertySecretStore --secretstore-type EnvironmentAndSystemPropertySecretStore -s am.services.uma.pct.encryption -a new -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore mapping create --global -i default-keystore -s am.uma.resource.labels.mtls.cert -a new,new2,new3 -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore mapping create --global -i default-keystore -s am.uma.resource.sets.mtls.cert -a new,new2,new,new3 --type classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore mapping create -gi default-keystore -s unknown.label -a new -m classic
*/

import { getEnv, testFail, testSuccess } from './utils/TestUtils';
import { connection as c, classic_connection as cc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);
const classicEnv = getEnv(cc);

describe('frodo secretstore mapping create', () => {
    test('"frodo secretstore mapping create -i ESV -s am.services.httpclient.mtls.servertrustcerts.testServerCert.secret -a esv-test-server-cert": should create mapping for the ESV secret store', async () => {
        const CMD = `frodo secretstore mapping create -i ESV -s am.services.httpclient.mtls.servertrustcerts.testServerCert.secret -a esv-test-server-cert`;
        await testSuccess(CMD, env);
    });
    test('"frodo secretstore mapping create -i ESV -t GoogleSecretManagerSecretStoreProvider -s am.services.httpclient.mtls.servertrustcerts.testServerCert.secret -a esv-test-server-cert": should fail since mapping already exists', async () => {
        const CMD = `frodo secretstore mapping create -i ESV -t GoogleSecretManagerSecretStoreProvider -s am.services.httpclient.mtls.servertrustcerts.testServerCert.secret -a esv-test-server-cert`;
        await testFail(CMD, env)
    });
    test('"frodo secretstore mapping create --secretstore-id ESV --secret-id am.services.uma.pct.encryption --aliases esv-test-server-cert,esv-test-server-cert-2": should fail since only one alias is allowed for the mapping', async () => {
        const CMD = `frodo secretstore mapping create --secretstore-id ESV --secret-id am.services.uma.pct.encryption --aliases esv-test-server-cert,esv-test-server-cert-2`;
        await testFail(CMD, env)
    });
    test('"frodo secretstore mapping create -gi EnvironmentAndSystemPropertySecretStore --secretstore-type EnvironmentAndSystemPropertySecretStore -s am.services.uma.pct.encryption -a new -m classic": should fail since no mappings can exist for the EnvironmentAndSystemPropertySecretStore', async () => {
        const CMD = `frodo secretstore mapping create -gi EnvironmentAndSystemPropertySecretStore --secretstore-type EnvironmentAndSystemPropertySecretStore -s am.services.uma.pct.encryption -a new -m classic`;
        await testFail(CMD, classicEnv)
    });
    test('"frodo secretstore mapping create --global -i default-keystore -s am.uma.resource.labels.mtls.cert -a new,new2,new3 -m classic": should create mapping for the global default-keystore secret store', async () => {
        const CMD = `frodo secretstore mapping create --global -i default-keystore -s am.uma.resource.labels.mtls.cert -a new,new2,new3 -m classic`;
        await testSuccess(CMD, classicEnv);
    });
    test('"frodo secretstore mapping create --global -i default-keystore -s am.uma.resource.sets.mtls.cert -a new,new2,new,new3 --type classic": should fail due to duplicate aliases', async () => {
        const CMD = `frodo secretstore mapping create --global -i default-keystore -s am.uma.resource.sets.mtls.cert -a new,new2,new,new3 --type classic`;
        await testFail(CMD, classicEnv)
    });
    test('"frodo secretstore mapping create -gi default-keystore -s unknown.label -a new -m classic": should fail due to unknown label for the secret id', async () => {
        const CMD = `frodo secretstore mapping create -gi default-keystore -s unknown.label -a new -m classic`;
        await testFail(CMD, classicEnv)
    });
});
