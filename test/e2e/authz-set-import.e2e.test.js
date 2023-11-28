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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -i 'test-policy-set' -f test/e2e/exports/all/allAlphaPolicySets.policyset.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import --set-id 'test-policy-set' --file test/e2e/exports/all/allAlphaPolicySets.policyset.authz.json --no-deps --prereqs
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -i 'test-policy-set' -f allAlphaPolicySets.policyset.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -f test/e2e/exports/all/allAlphaPolicySets.policyset.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import --file test/e2e/exports/all/allAlphaPolicySets.policyset.authz.json --no-deps --prereqs
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -f allAlphaPolicySets.policyset.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -af test/e2e/exports/all/allAlphaPolicySets.policyset.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import --all --file test/e2e/exports/all/allAlphaPolicySets.policyset.authz.json --no-deps --prereqs
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -af allAlphaPolicySets.policyset.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -AD test/e2e/exports/all-separate/authz/set
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import --all-separate --no-deps --prereqs --directory test/e2e/exports/all-separate/authz/set
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
const allAlphaPolicySetsFileName = "allAlphaPolicySets.policyset.authz.json";
const allAlphaPolicySetsExport = `${allDirectory}/${allAlphaPolicySetsFileName}`;
const allSeparatePolicySetsDirectory = `test/e2e/exports/all-separate/authz/set`;

describe('frodo authz set import', () => {
    test(`"frodo authz set import -i 'test-policy-set' -f ${allAlphaPolicySetsExport}": should import the policy set with the id "test-policy-set" from the file "${allAlphaPolicySetsExport}"`, async () => {
        const CMD = `frodo authz set import -i 'test-policy-set' -f ${allAlphaPolicySetsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz set import --set-id 'test-policy-set' --file ${allAlphaPolicySetsExport} --no-deps --prereqs": should import the policy set with the id "test-policy-set" from the file "${allAlphaPolicySetsExport}" with no dependencies`, async () => {
        const CMD = `frodo authz set import --set-id 'test-policy-set' --file ${allAlphaPolicySetsExport} --no-deps --prereqs`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz set import -i 'test-policy-set' -f ${allAlphaPolicySetsFileName} -D ${allDirectory}": should import the policy set with the id "test-policy-set" from the file "${allAlphaPolicySetsExport}"`, async () => {
        const CMD = `frodo authz set import -i 'test-policy-set' -f ${allAlphaPolicySetsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz set import -f ${allAlphaPolicySetsExport}": should import the first policy set from the file "${allAlphaPolicySetsExport}"`, async () => {
        const CMD = `frodo authz set import -f ${allAlphaPolicySetsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz set import --file ${allAlphaPolicySetsExport} --no-deps --prereqs": should import the first policy set from the file "${allAlphaPolicySetsExport}" with no dependencies`, async () => {
        const CMD = `frodo authz set import --file ${allAlphaPolicySetsExport} --no-deps --prereqs`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz set import -f ${allAlphaPolicySetsFileName} -D ${allDirectory}": should import the first policy set from the file "${allAlphaPolicySetsExport}"`, async () => {
        const CMD = `frodo authz set import -f ${allAlphaPolicySetsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz set import -af ${allAlphaPolicySetsExport}": should import all policy sets from the file "${allAlphaPolicySetsExport}"`, async () => {
        const CMD = `frodo authz set import -af ${allAlphaPolicySetsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz set import --all --file ${allAlphaPolicySetsExport} --no-deps --prereqs": should import all policy sets from the file "${allAlphaPolicySetsExport}" with no dependencies`, async () => {
        const CMD = `frodo authz set import --all --file ${allAlphaPolicySetsExport} --no-deps --prereqs`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz set import -af ${allAlphaPolicySetsFileName} -D ${allDirectory}": should import all policy sets from the file "${allAlphaPolicySetsExport}"`, async () => {
        const CMD = `frodo authz set import -af ${allAlphaPolicySetsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz set import -AD ${allSeparatePolicySetsDirectory}": should import all policy sets from the ${allSeparatePolicySetsDirectory} directory"`, async () => {
        const CMD = `frodo authz set import -AD ${allSeparatePolicySetsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz set import --all-separate --no-deps --prereqs --directory ${allSeparatePolicySetsDirectory}": should import all policy sets from the ${allSeparatePolicySetsDirectory} directory with no dependencies`, async () => {
        const CMD = `frodo authz set import --all-separate --no-deps --prereqs --directory ${allSeparatePolicySetsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

});
