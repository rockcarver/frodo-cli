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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot export --cot-id AzureCOT
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot export -i AzureCOT -f my-AzureCOT.cot.saml.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot export -Ni AzureCOT -D samlCotExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot export -a --file my-allAlphaCirclesOfTrust.cot.saml.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot export -NaD samlCotExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot export --all-separate --no-metadata --directory samlCotExportTestDir3
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);

const type = 'cot.saml';

describe('frodo saml cot export', () => {
    test('"frodo saml cot export --cot-id AzureCOT": should export the saml circles of trust with id "AzureCOT"', async () => {
        const exportFile = "AzureCOT.cot.saml.json";
        const CMD = `frodo saml cot export --cot-id AzureCOT`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo saml cot export -i AzureCOT -f my-AzureCOT.cot.saml.json": should export the saml circles of trust with id "AzureCOT" into file named my-AzureCOT.cot.saml.json', async () => {
        const exportFile = "my-AzureCOT.cot.saml.json";
        const CMD = `frodo saml cot export -i AzureCOT -f ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo saml cot export -Ni AzureCOT -D samlCotExportTestDir1": should export the saml circles of trust with id "AzureCOT" into the directory named samlCotExportTestDir1', async () => {
        const exportDirectory = "samlCotExportTestDir1";
        const CMD = `frodo saml cot export -Ni AzureCOT -D ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo saml cot export --all": should export all saml circles of trust to a single file', async () => {
        const exportFile = "allAlphaCirclesOfTrust.cot.saml.json";
        const CMD = `frodo saml cot export --all`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo saml cot export -a --file my-allAlphaCirclesOfTrust.cot.saml.json": should export all saml circles of trust to a single file named my-allAlphaCirclesOfTrust.cot.saml.json', async () => {
        const exportFile = "my-allAlphaCirclesOfTrust.cot.saml.json";
        const CMD = `frodo saml cot export -a --file ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo saml cot export -NaD samlCotExportTestDir2": should export all saml circles of trust to a single file in the directory samlCotExportTestDir2', async () => {
        const exportDirectory = "samlCotExportTestDir2";
        const CMD = `frodo saml cot export -NaD ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo saml cot export -A": should export all saml circles of trust to separate files', async () => {
        const CMD = `frodo saml cot export -A`;
        await testExport(CMD, env, type);
    });

    test('"frodo saml cot export --all-separate --no-metadata --directory samlCotExportTestDir3": should export all saml circles of trust to separate files in the directory samlCotExportTestDir3', async () => {
        const exportDirectory = "samlCotExportTestDir3";
        const CMD = `frodo saml cot export --all-separate --no-metadata --directory ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });
});
