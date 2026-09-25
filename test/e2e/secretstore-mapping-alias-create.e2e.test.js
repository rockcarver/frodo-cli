/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore mapping alias create -i ESV -s am.services.httpclient.mtls.clientcert.testClientCert.secret -a esv-test-client-cert
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore mapping alias create -i ESV -t GoogleSecretManagerSecretStoreProvider -s am.services.httpclient.mtls.clientcert.testClientCert.secret -a esv-new --activate

// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore mapping alias create -gi EnvironmentAndSystemPropertySecretStore -t EnvironmentAndSystemPropertySecretStore -s am.services.httpclient.mtls.clientcert.testClientCert.secret -a alias -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore mapping alias create --secretstore-id default-keystore --secretstore-type KeyStoreSecretStore --global --secret-id am.applications.agents.remote.consent.request.signing.ES256 --alias new --type classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore mapping alias create --secretstore-id default-keystore --secretstore-type KeyStoreSecretStore --global --secret-id am.applications.agents.remote.consent.request.signing.ES256 --alias new2 --activate --type classic
*/

import { getEnv, testFail, testSuccess } from './utils/TestUtils';
import { connection as c, classic_connection as cc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);
const classicEnv = getEnv(cc);

describe('frodo secretstore mapping alias create', () => {
    test('"frodo secretstore mapping alias create -i ESV -s am.services.httpclient.mtls.clientcert.testClientCert.secret -a esv-test-client-cert": Should fail when creating duplicate alias esv-test-client-cert', async () => {
        const CMD = `frodo secretstore mapping alias create -i ESV -s am.services.httpclient.mtls.clientcert.testClientCert.secret -a esv-test-client-cert`;
        await testFail(CMD, env)
    });
    test('"frodo secretstore mapping alias create -i ESV -t GoogleSecretManagerSecretStoreProvider -s am.services.httpclient.mtls.clientcert.testClientCert.secret -a esv-new --activate": Should fail when only one alias is allowed', async () => {
        const CMD = `frodo secretstore mapping alias create -i ESV -t GoogleSecretManagerSecretStoreProvider -s am.services.httpclient.mtls.clientcert.testClientCert.secret -a esv-new --activate`;
        await testFail(CMD, env)
    });
    test('"frodo secretstore mapping alias create -gi EnvironmentAndSystemPropertySecretStore -t EnvironmentAndSystemPropertySecretStore -s am.services.httpclient.mtls.clientcert.testClientCert.secret -a alias -m classic": should fail since EnvironmentAndSystemPropertySecretStore has no mappings', async () => {
        const CMD = `frodo secretstore mapping alias create -gi EnvironmentAndSystemPropertySecretStore -t EnvironmentAndSystemPropertySecretStore -s am.services.httpclient.mtls.clientcert.testClientCert.secret -a alias -m classic`;
        await testFail(CMD, classicEnv)
    });
    test('"frodo secretstore mapping alias create --secretstore-id default-keystore --secretstore-type KeyStoreSecretStore --global --secret-id am.applications.agents.remote.consent.request.signing.ES256 --alias new --type classic": Should create the new alias on a global secretstore', async () => {
        const CMD = `frodo secretstore mapping alias create --secretstore-id default-keystore --secretstore-type KeyStoreSecretStore --global --secret-id am.applications.agents.remote.consent.request.signing.ES256 --alias new --type classic`;
        await testSuccess(CMD, classicEnv);
    });
    test('"frodo secretstore mapping alias create --secretstore-id default-keystore --secretstore-type KeyStoreSecretStore --global --secret-id am.applications.agents.remote.consent.request.signing.ES256 --alias new2 --activate --type classic": Should create and activate the new2 alias on a global secretstore', async () => {
        const CMD = `frodo secretstore mapping alias create --secretstore-id default-keystore --secretstore-type KeyStoreSecretStore --global --secret-id am.applications.agents.remote.consent.request.signing.ES256 --alias new2 --activate --type classic`;
        await testSuccess(CMD, classicEnv);
    });
});
