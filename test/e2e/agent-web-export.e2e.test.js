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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web export --agent-id frodo-test-web-agent
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web export -i frodo-test-web-agent -f my-frodo-test-web-agent.web.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web export -Ni frodo-test-web-agent -D agentWebExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web export -a --file my-allAlphaAgents.web.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web export -NaD agentWebExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web export --all-separate --no-metadata --directory agentWebExportTestDir3
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);

const type = 'web.agent';

describe('frodo agent web export', () => {
    test('"frodo agent web export --agent-id frodo-test-web-agent": should export the web agent with agent id "frodo-test-web-agent"', async () => {
        const exportFile = "frodo-test-web-agent.web.agent.json";
        const CMD = `frodo agent web export --agent-id frodo-test-web-agent`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo agent web export -i frodo-test-web-agent -f my-frodo-test-web-agent.web.agent.json": should export the web agent with agent id "frodo-test-web-agent" into file named test.json', async () => {
        const exportFile = "my-frodo-test-web-agent.web.agent.json";
        const CMD = `frodo agent web export -i frodo-test-web-agent -f ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo agent web export -Ni frodo-test-web-agent -D agentWebExportTestDir1": should export the web agent with agent id "frodo-test-web-agent" into the directory agentWebExportTestDir1', async () => {
        const exportDirectory = "agentWebExportTestDir1";
        const CMD = `frodo agent web export -Ni frodo-test-web-agent -D ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo agent web export --all": should export all web agents to a single file', async () => {
        const exportFile = "allAlphaAgents.web.agent.json";
        const CMD = `frodo agent web export --all`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo agent web export -NaD agentWebExportTestDir2": should export all web agents to a single file in the directory agentWebExportTestDir2', async () => {
        const exportDirectory = "agentWebExportTestDir2";
        const CMD = `frodo agent web export -NaD ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo agent web export -A": should export all web agents to separate files', async () => {
        const CMD = `frodo agent web export -A`;
        await testExport(CMD, env, type);
    });

    test('"frodo agent web export --all-separate --no-metadata --directory agentWebExportTestDir3": should export all web agents to separate files in the directory agentWebExportTestDir3', async () => {
        const exportDirectory = "agentWebExportTestDir3";
        const CMD = `frodo agent web export --all-separate --no-metadata --directory ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });
});
