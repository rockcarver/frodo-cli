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
To record and update snapshots, run the following commands in order.
Because destructive tests interfere with each other, they are split into phases.
Each phase must be recorded separately.

Phase 1 - Delete by ID (agent must exist for -i, then be absent for --agent-id):
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_RECORD_PHASE=1 npm run test:update e2e/agent-delete

Phase 2 - Delete all (agents must exist for -a, then be absent for --all):
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_RECORD_PHASE=2 npm run test:update e2e/agent-delete
*/
import {
    assertNoPollyReplayError,
    execWithRecordingProgress,
    getEnv,
    isRecordingMode,
    logRecordingProgress,
    stageFixture,
    verifyAuth,
} from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const isRecording = isRecordingMode();

const env = getEnv(c);

const stagedAgentImport =
    'frodo agent import -i frodo-test-ig-agent -f test/e2e/exports/all/allAlphaAgents.agent.json';
const deleteAgent = 'frodo agent delete -i frodo-test-ig-agent';
const deleteAllAgents = 'frodo agent delete -a';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('frodo agent delete', () => {

    beforeAll(async () => {
        if (isRecording) {
            logRecordingProgress('Verifying authentication before fixture staging');
            await verifyAuth(env);
            if (process.env['FRODO_RECORD_PHASE'] === '1') {
                logRecordingProgress(`Phase 1 - Staging fixture: ${stagedAgentImport}`);
                await stageFixture(stagedAgentImport, env);
                logRecordingProgress('Phase 1 - Fixture staging complete');
            }
            if (process.env['FRODO_RECORD_PHASE'] === '2') {
                logRecordingProgress(`Phase 2 - Staging fixture: ${stagedAgentImport}`);
                await stageFixture(stagedAgentImport, env);
                logRecordingProgress('Phase 2 - Fixture staging complete');
            }
            logRecordingProgress('Waiting 1000ms after staging to allow eventual consistency');
            await wait(1000);
        }
    });

    // afterAll(async () => {
    //     if (isRecording) {
    //         // Temporarily disabled during timing investigation.
    //         // Note: this suite is self-cleaning through delete operations in tests.
    //         logRecordingProgress('Recording complete - tests are self-cleaning');
    //     }
    // });

    // Phase 1: Delete by ID
    // -i succeeds (agent exists), then --agent-id with bogus id fails
    if (!isRecording || process.env['FRODO_RECORD_PHASE'] === '1') {
        test('"frodo agent delete -i frodo-test-ig-agent": should delete the agent with id \'frodo-test-ig-agent\'', async () => {
            const CMD = deleteAgent;
            const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
            expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
            expect(assertNoPollyReplayError(stderr, CMD)).toBe('');
        });

        test('"frodo agent delete --agent-id frodo-test-non-existing-ig-agent": should display error when the agent with id \'frodo-test-non-existing-ig-agent\' cannot be deleted since it does not exist', async () => {
            const CMD = 'frodo agent delete --agent-id frodo-test-non-existing-ig-agent';
            try {
                await execWithRecordingProgress(CMD, env, isRecording);
                throw new Error('Command should have failed with non-zero exit code');
            } catch (e) {
                if (e.message === 'Command should have failed with non-zero exit code') {
                    throw e;
                }
                expect(e.code).not.toBe(0);
                expect(assertNoPollyReplayError(e.stderr, CMD)).toMatchSnapshot();
            }
        });
    }

    // Phase 2: Delete all
    // -a succeeds (agents exist), then --all is a no-op (all already gone)
    if (!isRecording || process.env['FRODO_RECORD_PHASE'] === '2') {
        test('"frodo agent delete -a": should delete all agents', async () => {
            const CMD = deleteAllAgents;
            const { stdout } = await execWithRecordingProgress(CMD, env, isRecording);
            expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
        });

        test('"frodo agent delete --all": should do nothing when no agents can be deleted', async () => {
            const CMD = 'frodo agent delete --all';
            const { stderr } = await execWithRecordingProgress(CMD, env, isRecording);
            expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
        });
    }

});
