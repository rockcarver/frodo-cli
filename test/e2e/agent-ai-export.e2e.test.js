/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-volker-dev.forgeblocks.com/am frodo agent ai export --agent-id banking-assistant
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-volker-dev.forgeblocks.com/am frodo agent ai export -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-volker-dev.forgeblocks.com/am frodo agent ai export -A
*/

import { getEnv, testExport, stageFixture, clearFixture } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const type = 'ai.agent';
// const stagingCommand = `frodo agent ai import -i testAgent -f test/e2e/exports/all/allAlphaAgents.ai.agent.json`;

describe('frodo agent ai export', () => {
  // beforeEach(async () => {
  //   await stageFixture(stagingCommand, env);
  // });

  // afterEach(async () => {
  //   await clearFixture('frodo agent ai delete -i testAgent', env);
  // });

  test('"frodo agent ai export --agent-id banking-assistant": should export AI agent banking-assistant', async () => {
    const exportFile = 'banking-assistant.ai.agent.json';
    const CMD = 'frodo agent ai export --agent-id banking-assistant';
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo agent ai export -a": should export all AI agents to single file', async () => {
    const exportFile = 'allAlphaAIAgents.ai.agent.json';
    const CMD = 'frodo agent ai export -a';
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo agent ai export -A": should export all AI agents to separate files', async () => {
    const CMD = 'frodo agent ai export -A';
    await testExport(CMD, env, type);
  });
});
