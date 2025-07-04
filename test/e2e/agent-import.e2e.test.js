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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent import -i frodo-test-ig-agent -f test/e2e/exports/all/allAlphaAgents.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent import --agent-id frodo-test-ig-agent --file test/e2e/exports/all/allAlphaAgents.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent import -i frodo-test-ig-agent -f allAlphaAgents.agent.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent import -f test/e2e/exports/all/allAlphaAgents.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent import --file test/e2e/exports/all/allAlphaAgents.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent import -f allAlphaAgents.agent.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent import -af test/e2e/exports/all/allAlphaAgents.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent import --all --file test/e2e/exports/all/allAlphaAgents.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent import -af allAlphaAgents.agent.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent import -AD test/e2e/exports/all-separate/cloud/realm/root-alpha/agent
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent import --all-separate --directory test/e2e/exports/all-separate/cloud/realm/root-alpha/agent
// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo agent import -i AgentService -gf test/e2e/exports/all/allGlobalAgents.agent.json -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo agent import -gf test/e2e/exports/all/allGlobalAgents.agent.json -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo agent import -gaf test/e2e/exports/all/allGlobalAgents.agent.json -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo agent import --global -AD test/e2e/exports/all-separate/classic/global/agent --type classic
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c, classic_connection as cc } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);
const classicEnv = getEnv(cc);

const allDirectory = "test/e2e/exports/all";
const allAlphaAgentsFileName = "allAlphaAgents.agent.json";
const allGlobalAgentsFileName = "allGlobalAgents.agent.json";
const allAlphaAgentsExport = `${allDirectory}/${allAlphaAgentsFileName}`;
const allGlobalAgentsExport = `${allDirectory}/${allGlobalAgentsFileName}`;
const allSeparateAgentsDirectory = `test/e2e/exports/all-separate/cloud/realm/root-alpha/agent`;
const allSeparateGlobalAgentsDirectory = `test/e2e/exports/all-separate/classic/global/agent`;

describe('frodo agent import', () => {
    test(`"frodo agent import -i frodo-test-ig-agent -f ${allAlphaAgentsExport}": should import the agent with the id "frodo-test-ig-agent" from the file "${allAlphaAgentsExport}"`, async () => {
        const CMD = `frodo agent import -i frodo-test-ig-agent -f ${allAlphaAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent import --agent-id frodo-test-ig-agent --file ${allAlphaAgentsExport}": should import the agent with the id "frodo-test-ig-agent" from the file "${allAlphaAgentsExport}"`, async () => {
        const CMD = `frodo agent import --agent-id frodo-test-ig-agent --file ${allAlphaAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent import -i frodo-test-ig-agent -f ${allAlphaAgentsFileName} -D ${allDirectory}": should import the agent with the id "frodo-test-ig-agent" from the file "${allAlphaAgentsExport}"`, async () => {
        const CMD = `frodo agent import -i frodo-test-ig-agent -f ${allAlphaAgentsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent import -f ${allAlphaAgentsExport}": should import the first agent from the file "${allAlphaAgentsExport}"`, async () => {
        const CMD = `frodo agent import -f ${allAlphaAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent import --file ${allAlphaAgentsExport}": should import the first agent from the file "${allAlphaAgentsExport}"`, async () => {
        const CMD = `frodo agent import --file ${allAlphaAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent import -f ${allAlphaAgentsFileName} -D ${allDirectory}": should import the first agent from the file "${allAlphaAgentsExport}"`, async () => {
        const CMD = `frodo agent import -f ${allAlphaAgentsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent import -af ${allAlphaAgentsExport}": should import all agents from the file "${allAlphaAgentsExport}"`, async () => {
        const CMD = `frodo agent import -af ${allAlphaAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent import --all --file ${allAlphaAgentsExport}": should import all agents from the file "${allAlphaAgentsExport}"`, async () => {
        const CMD = `frodo agent import --all --file ${allAlphaAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent import -af ${allAlphaAgentsFileName} -D ${allDirectory}": should import all agents from the file "${allAlphaAgentsExport}"`, async () => {
        const CMD = `frodo agent import -af ${allAlphaAgentsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent import -AD ${allSeparateAgentsDirectory}": should import all agents from the ${allSeparateAgentsDirectory} directory"`, async () => {
        const CMD = `frodo agent import -AD ${allSeparateAgentsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent import --all-separate --directory ${allSeparateAgentsDirectory}": should import all agents from the ${allSeparateAgentsDirectory} directory"`, async () => {
        const CMD = `frodo agent import --all-separate --directory ${allSeparateAgentsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent import -i AgentService -gf ${allGlobalAgentsExport} -m classic": should import the global agent with the id "AgentService" from the file "${allGlobalAgentsExport}"`, async () => {
        const CMD = `frodo agent import -i AgentService -gf ${allGlobalAgentsExport} -m classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent import -gf ${allGlobalAgentsExport} -m classic": should import the first global agent from the file "${allGlobalAgentsExport}"`, async () => {
        const CMD = `frodo agent import -gf ${allGlobalAgentsExport} -m classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent import -gaf ${allGlobalAgentsExport} -m classic": should import all global agents from the file "${allGlobalAgentsExport}"`, async () => {
        const CMD = `frodo agent import -gaf ${allGlobalAgentsExport} -m classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo agent import --global -AD ${allSeparateGlobalAgentsDirectory} --type classic": should import all global agents from the ${allSeparateGlobalAgentsDirectory} directory"`, async () => {
        const CMD = `frodo agent import --global -AD ${allSeparateGlobalAgentsDirectory} --type classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

});
