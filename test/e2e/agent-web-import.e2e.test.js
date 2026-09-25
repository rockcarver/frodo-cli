/** See test/e2e/README.md for how to write and record e2e tests. */

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
import { getEnv, stageFixture, clearFixture, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allAlphaWebAgentsFileName = "allAlphaAgents.web.agent.json";
const allAlphaWebAgentsExport = `${allDirectory}/${allAlphaWebAgentsFileName}`;
const allSeparateWebAgentsDirectory = `test/e2e/exports/all-separate/cloud/realm/root-alpha/agent`;
// const stagingCommand = `frodo agent web import -i frodo-test-web-agent -f ${allAlphaWebAgentsExport}`;

describe('frodo agent web import', () => {
    // beforeEach(async () => {
    //     await stageFixture(stagingCommand, env);
    // });

    // afterEach(async () => {
    //     await clearFixture('frodo agent web delete -i frodo-test-web-agent', env);
    // });

    test(`"frodo agent web import -i frodo-test-web-agent -f ${allAlphaWebAgentsExport}": should import the agent with the id "frodo-test-web-agent" from the file "${allAlphaWebAgentsExport}"`, async () => {
        const CMD = `frodo agent web import -i frodo-test-web-agent -f ${allAlphaWebAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent web import --agent-id frodo-test-web-agent --file ${allAlphaWebAgentsExport}": should import the agent with the id "frodo-test-web-agent" from the file "${allAlphaWebAgentsExport}"`, async () => {
        const CMD = `frodo agent web import --agent-id frodo-test-web-agent --file ${allAlphaWebAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent web import -i frodo-test-web-agent -f ${allAlphaWebAgentsFileName} -D ${allDirectory}": should import the agent with the id "frodo-test-web-agent" from the file "${allAlphaWebAgentsExport}"`, async () => {
        const CMD = `frodo agent web import -i frodo-test-web-agent -f ${allAlphaWebAgentsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent web import -f ${allAlphaWebAgentsExport}": should import the first agent from the file "${allAlphaWebAgentsExport}"`, async () => {
        const CMD = `frodo agent web import -f ${allAlphaWebAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent web import --file ${allAlphaWebAgentsExport}": should import the first agent from the file "${allAlphaWebAgentsExport}"`, async () => {
        const CMD = `frodo agent web import --file ${allAlphaWebAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent web import -f ${allAlphaWebAgentsFileName} -D ${allDirectory}": should import the first agent from the file "${allAlphaWebAgentsExport}"`, async () => {
        const CMD = `frodo agent web import -f ${allAlphaWebAgentsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent web import -af ${allAlphaWebAgentsExport}": should import all agents from the file "${allAlphaWebAgentsExport}"`, async () => {
        const CMD = `frodo agent web import -af ${allAlphaWebAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent web import --all --file ${allAlphaWebAgentsExport}": should import all agents from the file "${allAlphaWebAgentsExport}"`, async () => {
        const CMD = `frodo agent web import --all --file ${allAlphaWebAgentsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent web import -af ${allAlphaWebAgentsFileName} -D ${allDirectory}": should import all agents from the file "${allAlphaWebAgentsExport}"`, async () => {
        const CMD = `frodo agent web import -af ${allAlphaWebAgentsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent web import -AD ${allSeparateWebAgentsDirectory}": should import all agents from the ${allSeparateWebAgentsDirectory} directory"`, async () => {
        const CMD = `frodo agent web import -AD ${allSeparateWebAgentsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo agent web import --all-separate --directory ${allSeparateWebAgentsDirectory}": should import all agents from the ${allSeparateWebAgentsDirectory} directory"`, async () => {
        const CMD = `frodo agent web import --all-separate --directory ${allSeparateWebAgentsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
