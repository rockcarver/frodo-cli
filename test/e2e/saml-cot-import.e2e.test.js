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
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot import -i AzureCOT -f test/e2e/exports/all/allAlphaCirclesOfTrust.cot.saml.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot import --cot-id AzureCOT --file test/e2e/exports/all/allAlphaCirclesOfTrust.cot.saml.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot import -i AzureCOT -f allAlphaCirclesOfTrust.cot.saml.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot import -f test/e2e/exports/all/allAlphaCirclesOfTrust.cot.saml.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot import --file test/e2e/exports/all/allAlphaCirclesOfTrust.cot.saml.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot import -f allAlphaCirclesOfTrust.cot.saml.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot import -af test/e2e/exports/all/allAlphaCirclesOfTrust.cot.saml.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot import --all --file test/e2e/exports/all/allAlphaCirclesOfTrust.cot.saml.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot import -af allAlphaCirclesOfTrust.cot.saml.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot import -AD test/e2e/exports/all-separate/saml/cot
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot import --all-separate --directory test/e2e/exports/all-separate/saml/cot
*/
import cp from 'child_process';
import { promisify } from 'util';
import { removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = {
    env: process.env,
};
env.env.FRODO_HOST = c.host;
env.env.FRODO_SA_ID = c.saId;
env.env.FRODO_SA_JWK = c.saJwk;

const allDirectory = "test/e2e/exports/all";
const allAlphaCirclesOfTrustFileName = "allAlphaThemes.theme.json";
const allAlphaCirclesOfTrustExport = `${allDirectory}/${allAlphaCirclesOfTrustFileName}`;
const allSeparateCircleOfTrustsDirectory = `test/e2e/exports/all-separate/saml/cot`;

describe('frodo saml cot import', () => {
    test(`"frodo saml cot import -i AzureCOT -f ${allAlphaCirclesOfTrustExport}": should import the saml circle of trust with the id "AzureCOT" from the file "${allAlphaCirclesOfTrustExport}"`, async () => {
        const CMD = `frodo saml cot import -i AzureCOT -f ${allAlphaCirclesOfTrustExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml cot import --cot-id AzureCOT --file ${allAlphaCirclesOfTrustExport}": should import the saml circle of trust with the id "AzureCOT" from the file "${allAlphaCirclesOfTrustExport}"`, async () => {
        const CMD = `frodo saml cot import --cot-id AzureCOT --file ${allAlphaCirclesOfTrustExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml cot import -i AzureCOT -f ${allAlphaCirclesOfTrustFileName} -D ${allDirectory}": should import the saml circle of trust with the id "AzureCOT" from the file "${allAlphaCirclesOfTrustExport}"`, async () => {
        const CMD = `frodo saml cot import -i AzureCOT -f ${allAlphaCirclesOfTrustFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml cot import -f ${allAlphaCirclesOfTrustExport}": should import the first saml circle of trust from the file "${allAlphaCirclesOfTrustExport}"`, async () => {
        const CMD = `frodo saml cot import -f ${allAlphaCirclesOfTrustExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml cot import --file ${allAlphaCirclesOfTrustExport}": should import the first saml cot from the file "${allAlphaCirclesOfTrustExport}"`, async () => {
        const CMD = `frodo saml cot import --file ${allAlphaCirclesOfTrustExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml cot import -f ${allAlphaCirclesOfTrustFileName} -D ${allDirectory}": should import the first saml circle of trust from the file "${allAlphaCirclesOfTrustExport}"`, async () => {
        const CMD = `frodo saml cot import -f ${allAlphaCirclesOfTrustFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml cot import -af ${allAlphaCirclesOfTrustExport}": should import all saml circle of trusts from the file "${allAlphaCirclesOfTrustExport}"`, async () => {
        const CMD = `frodo saml cot import -af ${allAlphaCirclesOfTrustExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml cot import --all --file ${allAlphaCirclesOfTrustExport}": should import all saml circle of trusts from the file "${allAlphaCirclesOfTrustExport}"`, async () => {
        const CMD = `frodo saml cot import --all --file ${allAlphaCirclesOfTrustExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml cot import -af ${allAlphaCirclesOfTrustFileName} -D ${allDirectory}": should import all saml circle of trusts from the file "${allAlphaCirclesOfTrustExport}"`, async () => {
        const CMD = `frodo saml cot import -af ${allAlphaCirclesOfTrustFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml cot import -AD ${allSeparateCircleOfTrustsDirectory}": should import all saml circle of trusts from the ${allSeparateCircleOfTrustsDirectory} directory"`, async () => {
        const CMD = `frodo saml cot import -AD ${allSeparateCircleOfTrustsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo saml cot import --all-separate --directory ${allSeparateCircleOfTrustsDirectory}": should import all saml circle of trusts from the ${allSeparateCircleOfTrustsDirectory} directory"`, async () => {
        const CMD = `frodo saml cot import --all-separate --directory ${allSeparateCircleOfTrustsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

});
