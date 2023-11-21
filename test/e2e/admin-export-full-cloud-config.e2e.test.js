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
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo admin export-full-cloud-config -a
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo admin export-full-cloud-config --all --file test.json --use-string-arrays --no-decode
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo admin export-full-cloud-config -AD exportAllTestDir1
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo admin export-full-cloud-config -AxD exportAllTestDir2
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo admin export-full-cloud-config --all-separate --directory exportAllTestDir3 --use-string-arrays --no-decode --extract
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

const type = 'everything';

describe('frodo admin export-full-cloud-config', () => {
    test('"frodo admin export-full-cloud-config -a": should export everything to a single file', async () => {
        const exportFile = "Alpha.everything.json";
        const CMD = `frodo admin export-full-cloud-config -a`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo admin export-full-cloud-config --all --file test.json --use-string-arrays --no-decode": should export everything to a single file named test.json with no decoding variables and using string arrays', async () => {
        const exportFile = "test.json";
        const CMD = `frodo admin export-full-cloud-config --all --file ${exportFile} --use-string-arrays --no-decode`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo admin export-full-cloud-config -AD exportAllTestDir1": should export everything into separate files in the directory exportAllTestDir1', async () => {
        const exportDirectory = "exportAllTestDir1";
        const CMD = `frodo admin export-full-cloud-config -AD ${exportDirectory}`;
        await testExport(CMD, env, undefined, undefined, exportDirectory);
    });

    test('"frodo admin export-full-cloud-config -AxD exportAllTestDir2": should export everything into separate files in the directory exportAllTestDir2 with scripts extracted', async () => {
        const exportDirectory = "exportAllTestDir2";
        const CMD = `frodo admin export-full-cloud-config -AxD ${exportDirectory}`;
        await testExport(CMD, env, undefined, undefined, exportDirectory);
    });

    test('"frodo admin export-full-cloud-config --all-separate --directory exportAllTestDir3 --use-string-arrays --no-decode --extract": should export everything into separate files in the directory exportAllTestDir3 with scripts extracted, no decoding variables, and using string arrays', async () => {
        const exportDirectory = "exportAllTestDir3";
        const CMD = `frodo admin export-full-cloud-config --all-separate --directory ${exportDirectory} --use-string-arrays --no-decode --extract`;
        await testExport(CMD, env, undefined, undefined, exportDirectory);
    });
});
