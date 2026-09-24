/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent ai import -i testAgent -f test/e2e/exports/all/allAlphaAIAgents.ai.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent ai import -f test/e2e/exports/all/allAlphaAIAgents.ai.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent ai import -af test/e2e/exports/all/allAlphaAIAgents.ai.agent.json
*/

import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, stageFixture, clearFixture, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = 'test/e2e/exports/all';
const allAlphaAIAgentsFileName = 'allAlphaAIAgents.ai.agent.json';
const allAlphaAIAgentsExport = `${allDirectory}/${allAlphaAIAgentsFileName}`;
// const stagingCommand = `frodo agent ai import -i testAgent -f ${allAlphaAIAgentsExport}`;

describe('frodo agent ai import', () => {
  // beforeEach(async () => {
  //   if (process.env['FRODO_MOCK'] === 'record') {
  //     await stageFixture(stagingCommand, env);
  //   }
  // });

  // afterEach(async () => {
  //   if (process.env['FRODO_MOCK'] === 'record') {
  //     await clearFixture('frodo agent ai delete -i testAgent', env);
  //   }
  // });

  test(`"frodo agent ai import -i testAgent -f ${allAlphaAIAgentsExport}": should import testAgent from file`, async () => {
    const CMD = `frodo agent ai import -i testAgent -f ${allAlphaAIAgentsExport}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
  });

  test(`"frodo agent ai import -f ${allAlphaAIAgentsExport}": should import first AI agent from file`, async () => {
    const CMD = `frodo agent ai import -f ${allAlphaAIAgentsExport}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
  });

  test(`"frodo agent ai import -af ${allAlphaAIAgentsExport}": should import all AI agents from file`, async () => {
    const CMD = `frodo agent ai import -af ${allAlphaAIAgentsExport}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
  });
});
