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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable describe -i esv-neo-age
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable describe -ui esv-test-var-pi
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable describe -ui esv-test-var-pi -f test/e2e/exports/all/all.cloud.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable describe -ui esv-test-var-pi -D test/e2e/exports/all-separate/cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable describe --json --usage --variable-id esv-test-var-pi --file test/e2e/exports/all/all.cloud.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable describe --json --usage --variable-id esv-test-var-pi --directory test/e2e/exports/all-separate/cloud
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);

const allConfigFile = 'test/e2e/exports/all/all.cloud.json';
const allConfigDirectory = 'test/e2e/exports/all-separate/cloud';

describe('frodo esv variable describe', () => {
    test(`"frodo esv variable describe -i esv-neo-age": should describe the esv variable "esv-neo-age"`, async () => {
        const CMD = `frodo esv variable describe -i esv-neo-age`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo esv variable describe -ui esv-test-var-pi": should describe the esv variable "esv-test-var-pi" with usage`, async () => {
        const CMD = `frodo esv variable describe -ui esv-test-var-pi`;
        try {
            await exec(CMD, env);
            fail("Command should've failed")
        } catch (e) {
            expect(removeAnsiEscapeCodes(e.stderr)).toMatchSnapshot();
            expect(removeAnsiEscapeCodes(e.stdout)).toMatchSnapshot();
        }
    });

    test(`"frodo esv variable describe -ui esv-test-var-pi -f ${allConfigFile}": should describe the esv variable "esv-test-var-pi" with usage from file ${allConfigFile}`, async () => {
        const CMD = `frodo esv variable describe -ui esv-test-var-pi -f ${allConfigFile}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo esv variable describe -ui esv-test-var-pi -D ${allConfigDirectory}": should describe the esv variable "esv-test-var-pi" with usage from directory ${allConfigDirectory}`, async () => {
        const CMD = `frodo esv variable describe -ui esv-test-var-pi -D ${allConfigDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo esv variable describe --json --usage --variable-id esv-test-var-pi --file ${allConfigFile}": should describe the esv variable "esv-test-var-pi" with usage from file ${allConfigFile} and json output`, async () => {
        const CMD = `frodo esv variable describe --json --usage --variable-id esv-test-var-pi --file ${allConfigFile}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo esv variable describe --json --usage --variable-id esv-test-var-pi --directory ${allConfigDirectory}": should describe the esv variable "esv-test-var-pi" with usage from directory ${allConfigDirectory} and json output`, async () => {
        const CMD = `frodo esv variable describe --json --usage --variable-id esv-test-var-pi --directory ${allConfigDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
});
