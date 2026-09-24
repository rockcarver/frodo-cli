/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway import -i frodo-test-ig-agent -f test/e2e/exports/all/allAlphaAgents.gateway.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway import --agent-id frodo-test-ig-agent --file test/e2e/exports/all/allAlphaAgents.gateway.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway import -i frodo-test-ig-agent -f allAlphaAgents.gateway.agent.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway import -f test/e2e/exports/all/allAlphaAgents.gateway.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway import --file test/e2e/exports/all/allAlphaAgents.gateway.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway import -f allAlphaAgents.gateway.agent.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway import -af test/e2e/exports/all/allAlphaAgents.gateway.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway import --all --file test/e2e/exports/all/allAlphaAgents.gateway.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway import -af allAlphaAgents.gateway.agent.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway import -AD test/e2e/exports/all-separate/cloud/realm/root-alpha/agent
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway import --all-separate --directory test/e2e/exports/all-separate/cloud/realm/root-alpha/agent
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, stageFixture, clearFixture, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allAlphaGatewayAgentsFileName = "allAlphaAgents.gateway.agent.json";
const allAlphaGatewayAgentsExport = `${allDirectory}/${allAlphaGatewayAgentsFileName}`;
const allSeparateGatewayAgentsDirectory = `test/e2e/exports/all-separate/cloud/realm/root-alpha/agent`;
// const stagingCommand = `frodo agent gateway import -i frodo-test-ig-agent -f ${allAlphaGatewayAgentsExport}`;

describe('frodo agent gateway import', () => {
    // beforeEach(async () => {
    //     await stageFixture(stagingCommand, env);
    // });

    // afterEach(async () => {
    //     await clearFixture('frodo agent gateway delete -i frodo-test-ig-agent', env);
    // });
    test(`"frodo agent gateway import -i frodo-test-ig-agent -f ${allAlphaGatewayAgentsExport}": should import the agent with the id "frodo-test-ig-agent" from the file "${allAlphaGatewayAgentsExport}"`, async () => {
        const CMD = `frodo agent gateway import -i frodo-test-ig-agent -f ${allAlphaGatewayAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent gateway import --agent-id frodo-test-ig-agent --file ${allAlphaGatewayAgentsExport}": should import the agent with the id "frodo-test-ig-agent" from the file "${allAlphaGatewayAgentsExport}"`, async () => {
        const CMD = `frodo agent gateway import --agent-id frodo-test-ig-agent --file ${allAlphaGatewayAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent gateway import -i frodo-test-ig-agent -f ${allAlphaGatewayAgentsFileName} -D ${allDirectory}": should import the agent with the id "frodo-test-ig-agent" from the file "${allAlphaGatewayAgentsExport}"`, async () => {
        const CMD = `frodo agent gateway import -i frodo-test-ig-agent -f ${allAlphaGatewayAgentsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent gateway import -f ${allAlphaGatewayAgentsExport}": should import the first agent from the file "${allAlphaGatewayAgentsExport}"`, async () => {
        const CMD = `frodo agent gateway import -f ${allAlphaGatewayAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent gateway import --file ${allAlphaGatewayAgentsExport}": should import the first agent from the file "${allAlphaGatewayAgentsExport}"`, async () => {
        const CMD = `frodo agent gateway import --file ${allAlphaGatewayAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent gateway import -f ${allAlphaGatewayAgentsFileName} -D ${allDirectory}": should import the first agent from the file "${allAlphaGatewayAgentsExport}"`, async () => {
        const CMD = `frodo agent gateway import -f ${allAlphaGatewayAgentsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent gateway import -af ${allAlphaGatewayAgentsExport}": should import all agents from the file "${allAlphaGatewayAgentsExport}"`, async () => {
        const CMD = `frodo agent gateway import -af ${allAlphaGatewayAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent gateway import --all --file ${allAlphaGatewayAgentsExport}": should import all agents from the file "${allAlphaGatewayAgentsExport}"`, async () => {
        const CMD = `frodo agent gateway import --all --file ${allAlphaGatewayAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent gateway import -af ${allAlphaGatewayAgentsFileName} -D ${allDirectory}": should import all agents from the file "${allAlphaGatewayAgentsExport}"`, async () => {
        const CMD = `frodo agent gateway import -af ${allAlphaGatewayAgentsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent gateway import -AD ${allSeparateGatewayAgentsDirectory}": should import all agents from the ${allSeparateGatewayAgentsDirectory} directory"`, async () => {
        const CMD = `frodo agent gateway import -AD ${allSeparateGatewayAgentsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent gateway import --all-separate --directory ${allSeparateGatewayAgentsDirectory}": should import all agents from the ${allSeparateGatewayAgentsDirectory} directory"`, async () => {
        const CMD = `frodo agent gateway import --all-separate --directory ${allSeparateGatewayAgentsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

});
