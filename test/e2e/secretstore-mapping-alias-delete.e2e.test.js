/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore mapping alias delete -i ESV -s am.services.httpclient.mtls.clientcert.testClientCert.secret -a esv-test-client-cert
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore mapping alias delete -i ESV -t GoogleSecretManagerSecretStoreProvider -s am.services.httpclient.mtls.clientcert.testClientCert.secret -a esv-does-not-exist
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore mapping alias delete -i ESV -s am.services.httpclient.mtls.clientcert.testClientCert.secret --all

// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore mapping alias delete -gi EnvironmentAndSystemPropertySecretStore -t EnvironmentAndSystemPropertySecretStore -s am.services.httpclient.mtls.clientcert.testClientCert.secret -a alias -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore mapping alias delete --secretstore-id default-keystore --secretstore-type KeyStoreSecretStore --global --secret-id am.applications.agents.remote.consent.request.signing.ES256 --alias test4 --type classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore mapping alias delete --secretstore-id default-keystore --secretstore-type KeyStoreSecretStore --global --secret-id am.applications.agents.remote.consent.request.signing.ES256 --all --type classic
*/

import { getEnv, testFail, testSuccess } from './utils/TestUtils';
import { connection as c, classic_connection as cc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);
const classicEnv = getEnv(cc);

describe('frodo secretstore mapping alias delete', () => {
    test('"frodo secretstore mapping alias delete -i ESV -s am.services.httpclient.mtls.clientcert.testClientCert.secret -a esv-test-client-cert": Should fail when deleting the only alias esv-test-client-cert', async () => {
        const CMD = `frodo secretstore mapping alias delete -i ESV -s am.services.httpclient.mtls.clientcert.testClientCert.secret -a esv-test-client-cert`;
        await testFail(CMD, env)
    });
    test('"frodo secretstore mapping alias delete -i ESV -t GoogleSecretManagerSecretStoreProvider -s am.services.httpclient.mtls.clientcert.testClientCert.secret -a esv-does-not-exist": Should fail when alias does not exist', async () => {
        const CMD = `frodo secretstore mapping alias delete -i ESV -t GoogleSecretManagerSecretStoreProvider -s am.services.httpclient.mtls.clientcert.testClientCert.secret -a esv-does-not-exist`;
        await testFail(CMD, env)
    });
    // TODO: Need to re-create test config in frodo-dev and re-record the mock responses for this test to work again.
    test.skip('"frodo secretstore mapping alias delete -i ESV -s am.services.httpclient.mtls.clientcert.testClientCert.secret --all": Should delete all aliases except active one on ESV secretstore', async () => {
        const CMD = `frodo secretstore mapping alias delete -i ESV -s am.services.httpclient.mtls.clientcert.testClientCert.secret --all`;
        await testSuccess(CMD, env);
    });
    test('"frodo secretstore mapping alias delete -gi EnvironmentAndSystemPropertySecretStore -t EnvironmentAndSystemPropertySecretStore -s am.services.httpclient.mtls.clientcert.testClientCert.secret -a alias -m classic": should fail since EnvironmentAndSystemPropertySecretStore has no mappings', async () => {
        const CMD = `frodo secretstore mapping alias delete -gi EnvironmentAndSystemPropertySecretStore -t EnvironmentAndSystemPropertySecretStore -s am.services.httpclient.mtls.clientcert.testClientCert.secret -a alias -m classic`;
        await testFail(CMD, classicEnv)
    });
    test('"frodo secretstore mapping alias delete --secretstore-id default-keystore --secretstore-type KeyStoreSecretStore --global --secret-id am.applications.agents.remote.consent.request.signing.ES256 --alias test4 --type classic": Should delete the test4 alias on a global secretstore', async () => {
        const CMD = `frodo secretstore mapping alias delete --secretstore-id default-keystore --secretstore-type KeyStoreSecretStore --global --secret-id am.applications.agents.remote.consent.request.signing.ES256 --alias test4 --type classic`;
        await testSuccess(CMD, classicEnv);
    });
    test('"frodo secretstore mapping alias delete --secretstore-id default-keystore --secretstore-type KeyStoreSecretStore --global --secret-id am.applications.agents.remote.consent.request.signing.ES256 --all --type classic": Should delete the test4 alias on a global secretstore', async () => {
        const CMD = `frodo secretstore mapping alias delete --secretstore-id default-keystore --secretstore-type KeyStoreSecretStore --global --secret-id am.applications.agents.remote.consent.request.signing.ES256 --all --type classic`;
        await testSuccess(CMD, classicEnv);
  });
});
