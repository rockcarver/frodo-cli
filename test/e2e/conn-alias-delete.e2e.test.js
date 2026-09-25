/** See test/e2e/README.md for how to write and record e2e tests. */
import cp from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { getEnv, testif, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';
import { readFileSync, rmSync, writeFileSync } from 'fs';

const exec = promisify(cp.exec);
const connectionsFile = path.resolve('./test/e2e/env/Connections.json');
const connectionsAliasFile = path.resolve('./test/e2e/env/ConnectionsDeleteAlias.json');

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] = connectionsAliasFile;
process.env['FRODO_MASTER_KEY_PATH'] =
  path.resolve('./test/e2e/env/masterkey.key');
const env = getEnv(undefined, { preserveProfilePaths: true });

beforeAll(() => {
  // Verify environment variables are properly set to prevent accidentally writing to user's ~/.frodo/Connections.json
  expect(env.env.FRODO_CONNECTION_PROFILES_PATH).toContain(
    'ConnectionsDeleteAlias.json'
  );
  const originalProfiles = JSON.parse(readFileSync(connectionsFile, 'utf8'));
  const aliasProfiles = {
    ...originalProfiles,
    [c.host]: {
      ...originalProfiles[c.host],
      alias: 'testname',
    },
  };
  writeFileSync(connectionsAliasFile, JSON.stringify(aliasProfiles, null, 2));
});

afterAll(() => {
  rmSync(connectionsAliasFile);
});

describe('frodo conn alias delete', () => {
  testif(process.env['FRODO_MASTER_KEY'] || process.env['FRODO_MASTER_KEY_PATH'])(
    `"frodo conn alias delete ${c.host}": should delete the alias of the connection profile`,
    async () => {
      const CMD = `frodo conn alias delete ${c.host}`;
      const { stdout, stderr } = await exec(CMD, { ...env, cwd: process.cwd() });
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
      expect(normalizeSnapshotText(stderr)).toMatchSnapshot();
    }
  );
  testif(process.env['FRODO_MASTER_KEY'] || process.env['FRODO_MASTER_KEY_PATH'])(
    `"frodo conn alias delete ${c.host}": should fail to delete the nonexistent alias of the connection profile`,
    async () => {
      const profiles = JSON.parse(readFileSync(connectionsAliasFile, 'utf-8'));
      profiles[c.host] = {
        ...profiles[c.host],
        alias: '',
      };
      const CMD = `frodo conn alias delete ${c.host}`;
      try {
        await exec(CMD, { ...env, cwd: process.cwd() });
        throw new Error('Expected command to fail');
      } catch (e) {
        expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
        expect(normalizeSnapshotText(e.stdout)).toMatchSnapshot();
      }
      expect.assertions(2);
    }
  );
});
