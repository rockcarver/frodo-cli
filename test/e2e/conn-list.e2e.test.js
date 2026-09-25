/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_CONNECTION_PROFILES_PATH=./test/e2e/env/Connections.json FRODO_MASTER_KEY_PATH=./test/e2e/env/masterkey.key npm run test:update conn-list
FRODO_CONNECTION_PROFILES_PATH=./test/e2e/env/Connections.json FRODO_MASTER_KEY_PATH=./test/e2e/env/masterkey.key npm run test conn-list

FRODO_CONNECTION_PROFILES_PATH=~/temp/frodo/Connections.json FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo conn list
FRODO_CONNECTION_PROFILES_PATH=~/temp/frodo/Connections.json FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo conn list -l
FRODO_CONNECTION_PROFILES_PATH=~/temp/frodo/Connections.json FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo conn list --long
 */
import cp from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { getEnv, testif, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  path.resolve('./test/e2e/env/Connections.json');
process.env['FRODO_MASTER_KEY_PATH'] =
  path.resolve('./test/e2e/env/masterkey.key');
const env = getEnv(c, { preserveProfilePaths: true });

beforeAll(() => {
  // Verify environment variables are properly set to prevent accidentally writing to user's ~/.frodo/Connections.json
  expect(env.env.FRODO_CONNECTION_PROFILES_PATH).toContain(
    'Connections.json'
  );
});

describe('frodo conn list', () => {
  testif(process.env['FRODO_MASTER_KEY'] || process.env['FRODO_MASTER_KEY_PATH'])(
    '"frodo conn list": should list the connection hosts',
    async () => {
      const CMD = `frodo conn list`;
      const { stdout } = await exec(CMD, { ...env, cwd: process.cwd() });
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
    }
  );

  testif(process.env['FRODO_MASTER_KEY'] || process.env['FRODO_MASTER_KEY_PATH'])(
    '"frodo conn list -l": should list the connection hosts, service accounts, usernames, and log API keys.',
    async () => {
      const CMD = `frodo conn list -l`;
      const { stdout } = await exec(CMD, { ...env, cwd: process.cwd() });
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
    }
  );

  testif(process.env['FRODO_MASTER_KEY'] || process.env['FRODO_MASTER_KEY_PATH'])(
    '"frodo conn list --long": should list the connection hosts, service accounts, usernames, and log API keys.',
    async () => {
      const CMD = `frodo conn list --long`;
      const { stdout } = await exec(CMD, { ...env, cwd: process.cwd() });
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
    }
  );
});
