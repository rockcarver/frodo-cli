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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web import -i frodo-test-web-agent -f test/e2e/exports/all/allAlphaAgents.web.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web import --agent-id frodo-test-web-agent --file test/e2e/exports/all/allAlphaAgents.web.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web import -i frodo-test-web-agent -f allAlphaAgents.web.agent.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web import -f test/e2e/exports/all/allAlphaAgents.web.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web import --file test/e2e/exports/all/allAlphaAgents.web.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web import -f allAlphaAgents.web.agent.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web import -af test/e2e/exports/all/allAlphaAgents.web.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web import --all --file test/e2e/exports/all/allAlphaAgents.web.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web import -af allAlphaAgents.web.agent.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web import -AD test/e2e/exports/all-separate/cloud/realm/root-alpha/agent
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web import --all-separate --directory test/e2e/exports/all-separate/cloud/realm/root-alpha/agent
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allAlphaWebAgentsFileName = "allAlphaAgents.web.agent.json";
const allAlphaWebAgentsExport = `${allDirectory}/${allAlphaWebAgentsFileName}`;
const allSeparateWebAgentsDirectory = `test/e2e/exports/all-separate/cloud/realm/root-alpha/agent`;

describe('frodo agent web import', () => {
    test(`"frodo agent web import -i frodo-test-web-agent -f ${allAlphaWebAgentsExport}": should import the agent with the id "frodo-test-web-agent" from the file "${allAlphaWebAgentsExport}"`, async () => {
        const CMD = `frodo agent web import -i frodo-test-web-agent -f ${allAlphaWebAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent web import --agent-id frodo-test-web-agent --file ${allAlphaWebAgentsExport}": should import the agent with the id "frodo-test-web-agent" from the file "${allAlphaWebAgentsExport}"`, async () => {
        const CMD = `frodo agent web import --agent-id frodo-test-web-agent --file ${allAlphaWebAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent web import -i frodo-test-web-agent -f ${allAlphaWebAgentsFileName} -D ${allDirectory}": should import the agent with the id "frodo-test-web-agent" from the file "${allAlphaWebAgentsExport}"`, async () => {
        const CMD = `frodo agent web import -i frodo-test-web-agent -f ${allAlphaWebAgentsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent web import -f ${allAlphaWebAgentsExport}": should import the first agent from the file "${allAlphaWebAgentsExport}"`, async () => {
        const CMD = `frodo agent web import -f ${allAlphaWebAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent web import --file ${allAlphaWebAgentsExport}": should import the first agent from the file "${allAlphaWebAgentsExport}"`, async () => {
        const CMD = `frodo agent web import --file ${allAlphaWebAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent web import -f ${allAlphaWebAgentsFileName} -D ${allDirectory}": should import the first agent from the file "${allAlphaWebAgentsExport}"`, async () => {
        const CMD = `frodo agent web import -f ${allAlphaWebAgentsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent web import -af ${allAlphaWebAgentsExport}": should import all agents from the file "${allAlphaWebAgentsExport}"`, async () => {
        const CMD = `frodo agent web import -af ${allAlphaWebAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent web import --all --file ${allAlphaWebAgentsExport}": should import all agents from the file "${allAlphaWebAgentsExport}"`, async () => {
        const CMD = `frodo agent web import --all --file ${allAlphaWebAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent web import -af ${allAlphaWebAgentsFileName} -D ${allDirectory}": should import all agents from the file "${allAlphaWebAgentsExport}"`, async () => {
        const CMD = `frodo agent web import -af ${allAlphaWebAgentsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent web import -AD ${allSeparateWebAgentsDirectory}": should import all agents from the ${allSeparateWebAgentsDirectory} directory"`, async () => {
        const CMD = `frodo agent web import -AD ${allSeparateWebAgentsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent web import --all-separate --directory ${allSeparateWebAgentsDirectory}": should import all agents from the ${allSeparateWebAgentsDirectory} directory"`, async () => {
        const CMD = `frodo agent web import --all-separate --directory ${allSeparateWebAgentsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

});
