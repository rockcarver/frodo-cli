/** See test/e2e/README.md for how to write and record e2e tests. */
import cp from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { getEnv, testif, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';
import { readFileSync, rmSync, writeFileSync } from 'fs';

const exec = promisify(cp.exec);

const connectionsFile = path.resolve('./test/e2e/env/Connections.json');
const connectionsDeleteFile = path.resolve('./test/e2e/env/ConnectionsDelete.json');

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] = connectionsDeleteFile;
process.env['FRODO_MASTER_KEY_PATH'] =
  path.resolve('./test/e2e/env/masterkey.key');
const env = getEnv(undefined, { preserveProfilePaths: true });

beforeAll(() => {
  // Verify environment variables are properly set to prevent accidentally writing to user's ~/.frodo/Connections.json
  expect(env.env.FRODO_CONNECTION_PROFILES_PATH).toContain(
    'ConnectionsDelete.json'
  );
  writeFileSync(connectionsDeleteFile, readFileSync(connectionsFile));
});

afterAll(() => {
  rmSync(connectionsDeleteFile);
});

describe('frodo conn delete', () => {
  testif(process.env['FRODO_MASTER_KEY'])(
    `"frodo conn delete ${c.host}": should delete the connection profile`,
    async () => {
      const CMD = `frodo conn delete ${c.host}`;
      const { stderr } = await exec(CMD, { ...env, cwd: process.cwd() });
      expect(normalizeSnapshotText(stderr)).toMatchSnapshot();
    }
  );
});
