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
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -i 'Test Policy' -f test/e2e/exports/all/allAlphaPolicies.policy.authz.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import --policy-id 'Test Policy' --file test/e2e/exports/all/allAlphaPolicies.policy.authz.json --set-id test-policy-set --no-deps --prereqs
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -i 'Test Policy' -f allAlphaPolicies.policy.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -f test/e2e/exports/all/allAlphaPolicies.policy.authz.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import --file test/e2e/exports/all/allAlphaPolicies.policy.authz.json --set-id test-policy-set --no-deps --prereqs
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -f allAlphaPolicies.policy.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -af test/e2e/exports/all/allAlphaPolicies.policy.authz.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import --all --file test/e2e/exports/all/allAlphaPolicies.policy.authz.json --set-id test-policy-set --no-deps --prereqs
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -af allAlphaPolicies.policy.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -AD test/e2e/exports/all-separate/authz/policy
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import --all-separate --set-id test-policy-set --no-deps --prereqs --directory test/e2e/exports/all-separate/authz/policy
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
const allAlphaPoliciesFileName = "allAlphaPolicies.policy.authz.json";
const allAlphaPoliciesExport = `${allDirectory}/${allAlphaPoliciesFileName}`;
const allSeparatePoliciesSetsDirectory = `test/e2e/exports/all-separate/authz/policy`;

describe('frodo authz policy import', () => {
    test(`"frodo authz policy import -i 'Test Policy' -f ${allAlphaPoliciesExport}": should import the policy with the id "Test Policy" from the file "${allAlphaPoliciesExport}"`, async () => {
        const CMD = `frodo authz policy import -i 'Test Policy' -f ${allAlphaPoliciesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz policy import --policy-id 'Test Policy' --file ${allAlphaPoliciesExport} --set-id test-policy-set --no-deps --prereqs": should import the policy with the id "Test Policy" from the file "${allAlphaPoliciesExport}" with no dependencies`, async () => {
        const CMD = `frodo authz policy import --policy-id 'Test Policy' --file ${allAlphaPoliciesExport} --set-id test-policy-set --no-deps --prereqs`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz policy import -i 'Test Policy' -f ${allAlphaPoliciesFileName} -D ${allDirectory}": should import the policy with the id "Test Policy" from the file "${allAlphaPoliciesExport}"`, async () => {
        const CMD = `frodo authz policy import -i 'Test Policy' -f ${allAlphaPoliciesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz policy import -f ${allAlphaPoliciesExport}": should import the first policy from the file "${allAlphaPoliciesExport}"`, async () => {
        const CMD = `frodo authz policy import -f ${allAlphaPoliciesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz policy import --file ${allAlphaPoliciesExport} --set-id test-policy-set --no-deps --prereqs": should import the first policy from the file "${allAlphaPoliciesExport}" with no dependencies`, async () => {
        const CMD = `frodo authz policy import --file ${allAlphaPoliciesExport} --set-id test-policy-set --no-deps --prereqs`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz policy import -f ${allAlphaPoliciesFileName} -D ${allDirectory}": should import the first policy from the file "${allAlphaPoliciesExport}"`, async () => {
        const CMD = `frodo authz policy import -f ${allAlphaPoliciesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz policy import -af ${allAlphaPoliciesExport}": should import all policies from the file "${allAlphaPoliciesExport}"`, async () => {
        const CMD = `frodo authz policy import -af ${allAlphaPoliciesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz policy import --all --file ${allAlphaPoliciesExport} --set-id test-policy-set --no-deps --prereqs": should import all policies from the file "${allAlphaPoliciesExport}" with no dependencies`, async () => {
        const CMD = `frodo authz policy import --all --file ${allAlphaPoliciesExport} --set-id test-policy-set --no-deps --prereqs`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz policy import -af ${allAlphaPoliciesFileName} -D ${allDirectory}": should import all policies from the file "${allAlphaPoliciesExport}"`, async () => {
        const CMD = `frodo authz policy import -af ${allAlphaPoliciesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz policy import -AD ${allSeparatePoliciesSetsDirectory}": should import all policies from the ${allSeparatePoliciesSetsDirectory} directory"`, async () => {
        const CMD = `frodo authz policy import -AD ${allSeparatePoliciesSetsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz policy import --all-separate --set-id test-policy-set --no-deps --prereqs --directory ${allSeparatePoliciesSetsDirectory}": should import all policies from the ${allSeparatePoliciesSetsDirectory} directory with no dependencies`, async () => {
        const CMD = `frodo authz policy import --all-separate --set-id test-policy-set --no-deps --prereqs --directory ${allSeparatePoliciesSetsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

});
