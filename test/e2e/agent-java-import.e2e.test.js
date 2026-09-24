/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java import -i frodo-test-java-agent -f test/e2e/exports/all/allAlphaAgents.java.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java import --agent-id frodo-test-java-agent --file test/e2e/exports/all/allAlphaAgents.java.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java import -i frodo-test-java-agent -f allAlphaAgents.java.agent.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java import -f test/e2e/exports/all/allAlphaAgents.java.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java import --file test/e2e/exports/all/allAlphaAgents.java.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java import -f allAlphaAgents.java.agent.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java import -af test/e2e/exports/all/allAlphaAgents.java.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java import --all --file test/e2e/exports/all/allAlphaAgents.java.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java import -af allAlphaAgents.java.agent.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java import -AD test/e2e/exports/all-separate/cloud/realm/root-alpha/agent
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java import --all-separate --directory test/e2e/exports/all-separate/cloud/realm/root-alpha/agent
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, stageFixture, clearFixture, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allAlphaJavaAgentsFileName = "allAlphaAgents.java.agent.json";
const allAlphaJavaAgentsExport = `${allDirectory}/${allAlphaJavaAgentsFileName}`;
const allSeparateJavaAgentsDirectory = `test/e2e/exports/all-separate/cloud/realm/root-alpha/agent`;
// const stagingCommand = `frodo agent java import -i frodo-test-java-agent -f ${allAlphaJavaAgentsExport}`;

describe('frodo agent java import', () => {
    // beforeEach(async () => {
    //     await stageFixture(stagingCommand, env);
    // });

    // afterEach(async () => {
    //     await clearFixture('frodo agent java delete -i frodo-test-java-agent', env);
    // });
    test(`"frodo agent java import -i frodo-test-java-agent -f ${allAlphaJavaAgentsExport}": should import the agent with the id "frodo-test-java-agent" from the file "${allAlphaJavaAgentsExport}"`, async () => {
        const CMD = `frodo agent java import -i frodo-test-java-agent -f ${allAlphaJavaAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent java import --agent-id frodo-test-java-agent --file ${allAlphaJavaAgentsExport}": should import the agent with the id "frodo-test-java-agent" from the file "${allAlphaJavaAgentsExport}"`, async () => {
        const CMD = `frodo agent java import --agent-id frodo-test-java-agent --file ${allAlphaJavaAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent java import -i frodo-test-java-agent -f ${allAlphaJavaAgentsFileName} -D ${allDirectory}": should import the agent with the id "frodo-test-java-agent" from the file "${allAlphaJavaAgentsExport}"`, async () => {
        const CMD = `frodo agent java import -i frodo-test-java-agent -f ${allAlphaJavaAgentsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent java import -f ${allAlphaJavaAgentsExport}": should import the first agent from the file "${allAlphaJavaAgentsExport}"`, async () => {
        const CMD = `frodo agent java import -f ${allAlphaJavaAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent java import --file ${allAlphaJavaAgentsExport}": should import the first agent from the file "${allAlphaJavaAgentsExport}"`, async () => {
        const CMD = `frodo agent java import --file ${allAlphaJavaAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent java import -f ${allAlphaJavaAgentsFileName} -D ${allDirectory}": should import the first agent from the file "${allAlphaJavaAgentsExport}"`, async () => {
        const CMD = `frodo agent java import -f ${allAlphaJavaAgentsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent java import -af ${allAlphaJavaAgentsExport}": should import all agents from the file "${allAlphaJavaAgentsExport}"`, async () => {
        const CMD = `frodo agent java import -af ${allAlphaJavaAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent java import --all --file ${allAlphaJavaAgentsExport}": should import all agents from the file "${allAlphaJavaAgentsExport}"`, async () => {
        const CMD = `frodo agent java import --all --file ${allAlphaJavaAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent java import -af ${allAlphaJavaAgentsFileName} -D ${allDirectory}": should import all agents from the file "${allAlphaJavaAgentsExport}"`, async () => {
        const CMD = `frodo agent java import -af ${allAlphaJavaAgentsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent java import -AD ${allSeparateJavaAgentsDirectory}": should import all agents from the ${allSeparateJavaAgentsDirectory} directory"`, async () => {
        const CMD = `frodo agent java import -AD ${allSeparateJavaAgentsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent java import --all-separate --directory ${allSeparateJavaAgentsDirectory}": should import all agents from the ${allSeparateJavaAgentsDirectory} directory"`, async () => {
        const CMD = `frodo agent java import --all-separate --directory ${allSeparateJavaAgentsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

});
