/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway delete -i frodo-test-ig-agent
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway delete --agent-id frodo-test-ig-agent
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway delete -a -y
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway delete --all -y
*/
import { clearFixture, getEnv, stageFixture, normalizeSnapshotText, exec } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';


process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const stagedAgentImport =
    'frodo agent gateway import -i frodo-test-ig-agent -f test/e2e/exports/all/allAlphaAgents.gateway.agent.json';
const deleteAgent = 'frodo agent gateway delete -i frodo-test-ig-agent';
const deleteAllAgents = 'frodo agent gateway delete -a -y';

describe('frodo agent gateway delete', () => {

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

    test('"frodo agent gateway delete -i frodo-test-ig-agent": should delete the agent gateway with id \'frodo-test-ig-agent\'', async () => {
        const CMD = deleteAgent;
        try {
            const { stdout } = await exec(CMD, env);
            expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
        } catch (e) {
            expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
        }
    });

    test('"frodo agent gateway delete --agent-id frodo-test-ig-agent": should display error when the agent gateway with id \'frodo-test-ig-agent\' cannot be deleted since it does not exist', async () => {
        const CMD = 'frodo agent gateway delete --agent-id frodo-test-ig-agent';
        try {
            await exec(CMD, env);
            fail("Command should've failed")
        } catch (e) {
            expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
        }
    });

    test('"frodo agent gateway delete -a -y": should delete all agent gateways', async () => {
        const CMD = deleteAllAgents;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    // The bulk delete says so when there is nothing to delete ("No identity gateway agents found to delete.", stderr): the snapshot
    // was edited by hand from the empty string (cli record 0040, bulk deletes part 3a).
    test('"frodo agent gateway delete --all -y": should do nothing when no agent gateways can be deleted', async () => {
        const CMD = 'frodo agent gateway delete --all -y';
        const { stderr } = await exec(CMD, env);
        expect(normalizeSnapshotText(stderr)).toMatchSnapshot()
    });

});
