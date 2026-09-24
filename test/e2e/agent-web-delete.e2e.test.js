/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web delete -i frodo-test-web-agent
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web delete --agent-id frodo-test-web-agent
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web delete -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web delete --all
*/
import cp from 'child_process';
import { promisify } from 'util';
import { clearFixture, getEnv, stageFixture, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const stagedAgentImport =
    'frodo agent import -i frodo-test-web-agent -f test/e2e/exports/all/allAlphaAgents.agent.json';
const deleteAgent = 'frodo agent web delete -i frodo-test-web-agent';
const deleteAllAgents = 'frodo agent web delete -a';

describe('frodo agent web delete', () => {

    // in recording mode, setup test data before recording and cleanup after
    // in replay mode, tests run with mock data from HAR files (no setup/teardown needed)
    beforeAll(async () => {
        if (process.env['FRODO_MOCK'] === 'record') {
            await stageFixture(stagedAgentImport, env);
        }
    });

    afterAll(async () => {
        if (process.env['FRODO_MOCK'] === 'record') {
            await clearFixture(deleteAgent, env);
            await clearFixture(deleteAllAgents, env);
        }
    });

    test('"frodo agent web delete -i frodo-test-web-agent": should delete the web agent with id \'frodo-test-web-agent\'', async () => {
        const CMD = deleteAgent;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo agent web delete --agent-id frodo-test-web-agent": should display error when the web agent with id \'frodo-test-web-agent\' cannot be deleted since it does not exist', async () => {
        const CMD = 'frodo agent web delete --agent-id frodo-test-web-agent';
        try {
            await exec(CMD, env);
            fail("Command should've failed")
        } catch (e) {
            expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
        }
    });

    test('"frodo agent web delete -a": should delete all web agents', async () => {
        const CMD = deleteAllAgents;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo agent web delete --all": should do nothing when no web agent can be deleted', async () => {
        const CMD = 'frodo agent web delete --all';
        const { stderr } = await exec(CMD, env);
        expect(normalizeSnapshotText(stderr)).toMatchSnapshot()
    });

});
