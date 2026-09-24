/** See test/e2e/README.md for how to write and record e2e tests. */
import cp from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { getEnv, testif, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c, amster_connection as cc } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    path.resolve('./test/e2e/env/Connections.json');

const hasInlineMasterKey = Boolean(process.env['FRODO_MASTER_KEY']?.trim());
const candidateMasterKeyPath = process.env['FRODO_MASTER_KEY_PATH'] ||
    path.resolve('./test/e2e/env/masterkey.key');
const hasMasterKeyFile = fs.existsSync(candidateMasterKeyPath);
const hasUsableMasterKey = hasInlineMasterKey || hasMasterKeyFile;

if (!hasInlineMasterKey && hasMasterKeyFile) {
    process.env['FRODO_MASTER_KEY_PATH'] = candidateMasterKeyPath;
}
const cloudEnv = getEnv(c, { preserveProfilePaths: true });
const classicEnv = getEnv(cc, { preserveProfilePaths: true });

beforeAll(() => {
    // Verify environment variables are properly set to prevent accidentally writing to user's ~/.frodo/Connections.json
    expect(cloudEnv.env.FRODO_CONNECTION_PROFILES_PATH).toContain(
        'Connections.json'
    );
});

describe('frodo conn describe', () => {
    describe('Cloud', () => {
        testif(hasUsableMasterKey)(
            `"frodo conn describe ${c.host}": should describe the connection`,
            async () => {
                const CMD = `frodo conn describe ${c.host}`;
                const { stdout } = await exec(CMD, { ...cloudEnv, cwd: process.cwd() });
                expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
            }
        );

        testif(hasUsableMasterKey)(
            `"frodo conn describe --show-secrets ${c.host}": should describe the connection and show the associated secrets`,
            async () => {
                const CMD = `frodo conn describe --show-secrets ${c.host}`;
                const { stdout } = await exec(CMD, { ...cloudEnv, cwd: process.cwd() });
                //Don't test with snapshot, otherwise the snapshot would contain secrets. Instead, just check to make sure "[present]" doesn't exist anywhere.
                expect(stdout.includes("[present]")).toBeFalsy();
            }
        );
    });

    describe('Classic', () => {
        testif(hasUsableMasterKey)(
            `"frodo conn describe ${cc.host}": should describe the classic connection`,
            async () => {
                const CMD = `frodo conn describe ${cc.host}`;
                const { stdout } = await exec(CMD, { ...classicEnv, cwd: process.cwd() });
                expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
            }
        );

        testif(hasUsableMasterKey)(
            `"frodo conn describe --show-secrets ${cc.host}": should describe the classic connection and show the associated secrets`,
            async () => {
                const CMD = `frodo conn describe --show-secrets ${cc.host}`;
                const { stdout } = await exec(CMD, { ...classicEnv, cwd: process.cwd() });
                //Don't test with snapshot, otherwise the snapshot would contain secrets. Instead, just check to make sure "[present]" doesn't exist anywhere.
                expect(stdout.includes("[present]")).toBeFalsy();
            }
        );
    });
});
