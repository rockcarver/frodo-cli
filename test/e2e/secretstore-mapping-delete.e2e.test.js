/**
 * Follow this process to write e2e tests for the CLI project:
 *
 * 1. Test if all the necessary mocks for your tests already exist.
 *    In mock mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=1 frodo conn save https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com Sup3rS3cr3t!
 *
 *    If your command completes without errors and with the expected results,
 *    all the required mocks already exist and you are good to write your
 *    test and skip to step #4.
 *
 *    If, however, your command fails and you see errors like the one below,
 *    you know you need to record the mock responses first:
 *
 *    [Polly] [adapter:node-http] Recording for the following request is not found and `recordIfMissing` is `false`.
 *
 * 2. Record mock responses for your exact command.
 *    In mock record mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=record frodo conn save https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com Sup3rS3cr3t!
 *
 *    Wait until you see all the Polly instances (mock recording adapters) have
 *    shutdown before you try to run step #1 again.
 *    Messages like these indicate mock recording adapters shutting down:
 *
 *    Polly instance 'conn/4' stopping in 3s...
 *    Polly instance 'conn/4' stopping in 2s...
 *    Polly instance 'conn/save/3' stopping in 3s...
 *    Polly instance 'conn/4' stopping in 1s...
 *    Polly instance 'conn/save/3' stopping in 2s...
 *    Polly instance 'conn/4' stopped.
 *    Polly instance 'conn/save/3' stopping in 1s...
 *    Polly instance 'conn/save/3' stopped.
 *
 * 3. Validate your freshly recorded mock responses are complete and working.
 *    Re-run the exact command you want to test in mock mode (see step #1).
 *
 * 4. Write your test.
 *    Make sure to use the exact command including number of arguments and params.
 *
 * 5. Commit both your test and your new recordings to the repository.
 *    Your tests are likely going to reside outside the frodo-lib project but
 *    the recordings must be committed to the frodo-lib project.
 */

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

process.env['FRODO_MOCK'] = '1';
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
