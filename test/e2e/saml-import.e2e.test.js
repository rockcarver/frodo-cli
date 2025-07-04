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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import -i iSPAzure -f test/e2e/exports/all/allAlphaProviders.saml.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import --no-deps --entity-id iSPAzure --file test/e2e/exports/all/allAlphaProviders.saml.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import -i iSPAzure -f allAlphaProviders.saml.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import -f test/e2e/exports/all/allAlphaProviders.saml.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import --no-deps --file test/e2e/exports/all/allAlphaProviders.saml.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import -f allAlphaProviders.saml.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import -af test/e2e/exports/all/allAlphaProviders.saml.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import --all --no-deps --file test/e2e/exports/all/allAlphaProviders.saml.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import -af allAlphaProviders.saml.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import -AD test/e2e/exports/all-separate/cloud/realm/root-alpha/saml
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import --all-separate --no-deps --directory test/e2e/exports/all-separate/cloud/realm/root-alpha/saml
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allAlphaSamlProvidersFileName = "allAlphaProviders.saml.json";
const allAlphaSamlProvidersExport = `${allDirectory}/${allAlphaSamlProvidersFileName}`;
const allSeparateSamlProvidersDirectory = "test/e2e/exports/all-separate/cloud/realm/root-alpha/saml";

describe('frodo saml import', () => {
    test(`"frodo saml import -i iSPAzure -f ${allAlphaSamlProvidersExport}": should import the saml provider with the id "iSPAzure" from the file "${allAlphaSamlProvidersExport}"`, async () => {
        const CMD = `frodo saml import -i iSPAzure -f ${allAlphaSamlProvidersExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml import --no-deps --entity-id iSPAzure --file ${allAlphaSamlProvidersExport}": should import the saml provider with the id "iSPAzure" from the file "${allAlphaSamlProvidersExport}"`, async () => {
        const CMD = `frodo saml import --no-deps --entity-id iSPAzure --file ${allAlphaSamlProvidersExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml import -i iSPAzure -f ${allAlphaSamlProvidersFileName} -D ${allDirectory}": should import the saml provider with the id "iSPAzure" from the file "${allAlphaSamlProvidersExport}"`, async () => {
        const CMD = `frodo saml import -i iSPAzure -f ${allAlphaSamlProvidersFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml import -f ${allAlphaSamlProvidersExport}": should import the first saml provider from the file "${allAlphaSamlProvidersExport}"`, async () => {
        const CMD = `frodo saml import -f ${allAlphaSamlProvidersExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml import --no-deps --file ${allAlphaSamlProvidersExport}": should import the first saml from the file "${allAlphaSamlProvidersExport}"`, async () => {
        const CMD = `frodo saml import --no-deps --file ${allAlphaSamlProvidersExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml import -f ${allAlphaSamlProvidersExport}": should import the first saml provider from the file "${allAlphaSamlProvidersExport}"`, async () => {
        const CMD = `frodo saml import -f ${allAlphaSamlProvidersFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml import -af ${allAlphaSamlProvidersExport}": should import all saml providers from the file "${allAlphaSamlProvidersExport}"`, async () => {
        const CMD = `frodo saml import -af ${allAlphaSamlProvidersExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml import --all --no-deps --file ${allAlphaSamlProvidersExport}": should import all saml providers from the file "${allAlphaSamlProvidersExport}"`, async () => {
        const CMD = `frodo saml import --all --no-deps --file ${allAlphaSamlProvidersExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml import -af ${allAlphaSamlProvidersExport}": should import all saml providers from the file "${allAlphaSamlProvidersExport}"`, async () => {
        const CMD = `frodo saml import -af ${allAlphaSamlProvidersFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml import -AD ${allSeparateSamlProvidersDirectory}": should import all saml providers from the '${allSeparateSamlProvidersDirectory}' directory"`, async () => {
        const CMD = `frodo saml import -AD ${allSeparateSamlProvidersDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml import --all-separate --no-deps --directory ${allSeparateSamlProvidersDirectory}": should import all saml providers from the '${allSeparateSamlProvidersDirectory}' directory"`, async () => {
        const CMD = `frodo saml import --all-separate --no-deps --directory ${allSeparateSamlProvidersDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
});
