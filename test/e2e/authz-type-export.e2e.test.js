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
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo authz type export -n URL
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo authz type export --type-name URL
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo authz type export -n URL -f test.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo authz type export -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo authz type export --type-id 76656a38-5f8e-401b-83aa-4ccb74ce88d2
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo authz type export -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -f test.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo authz type export -a
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo authz type export --all
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo authz type export -a --file test.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo authz type export -A
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo authz type export --all-separate
*/
import { testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = {
    env: process.env,
};
env.env.FRODO_HOST = c.host;
env.env.FRODO_SA_ID = c.saId;
env.env.FRODO_SA_JWK = c.saJwk;

const type = 'resourcetype.authz';

describe('frodo authz type export', () => {
    test('"frodo authz type export -n URL": should export the resource type named "URL"', async () => {
        const CMD = `frodo authz type export -n URL`;
        const exportFile = "URL.resourcetype.authz.json";
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo authz type export --type-name URL": should export the resource type named "URL"', async () => {
        const CMD = `frodo authz type export --type-name URL`;
        const exportFile = "URL.resourcetype.authz.json";
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo authz type export -n URL -f test.json": should export the resource type named "URL" into file named test.json', async () => {
        const CMD = `frodo authz type export -n URL -f test.json`;
        const exportFile = "test.json";
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo authz type export -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2": should export the resource type with id "76656a38-5f8e-401b-83aa-4ccb74ce88d2"', async () => {
        const CMD = `frodo authz type export -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2`;
        const exportFile = "76656a38-5f8e-401b-83aa-4ccb74ce88d2.resourcetype.authz.json";
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo authz type export --type-id 76656a38-5f8e-401b-83aa-4ccb74ce88d2": should export the resource type with id "76656a38-5f8e-401b-83aa-4ccb74ce88d2"', async () => {
        const CMD = `frodo authz type export --type-id 76656a38-5f8e-401b-83aa-4ccb74ce88d2`;
        const exportFile = "76656a38-5f8e-401b-83aa-4ccb74ce88d2.resourcetype.authz.json";
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo authz type export -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -f test.json": should export the resource type with id "76656a38-5f8e-401b-83aa-4ccb74ce88d2" into file named test.json', async () => {
        const CMD = `frodo authz type export -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -f test.json`;
        const exportFile = "test.json";
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo authz type export -a": should export all resource types to a single file', async () => {
        const CMD = `frodo authz type export -a`;
        const exportFile = "allAlphaResourceTypes.resourcetype.authz.json";
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo authz type export --all": should export all resource types to a single file', async () => {
        const CMD = `frodo authz type export --all`;
        const exportFile = "allAlphaResourceTypes.resourcetype.authz.json";
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo authz type export -a --file test.json": should export all resource types to a single file named test.json', async () => {
        const CMD = `frodo authz type export -a --file test.json`;
        const exportFile = "test.json";
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo authz type export -A": should export all resource types to separate files', async () => {
        const CMD = `frodo authz type export -A`;
        await testExport(CMD, env, type);
    });

    test('"frodo authz type export --all-separate": should export all resource types to separate files', async () => {
        const CMD = `frodo authz type export --all-separate`;
        await testExport(CMD, env, type);
    });
});
