/** See test/e2e/README.md for how to write and record e2e tests. */
import path from 'path';
import { getEnv, testif, normalizeSnapshotText, exec } from './utils/TestUtils';
import { checkMasterKeyUsable } from './utils/MasterKeyGate';
import { connection as c, amster_connection as cc } from './utils/TestConfig';


process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    path.resolve('./test/e2e/env/Connections.json');

// Default the key path to the fixture (unset in a fresh checkout) BEFORE the
// gate and getEnv so both the check and the child use the same material.
process.env['FRODO_MASTER_KEY_PATH'] ||= path.resolve('./test/e2e/env/masterkey.key');

// Key-dependent tests run only when the available key (inline
// FRODO_MASTER_KEY, else the file at FRODO_MASTER_KEY_PATH) actually
// decrypts the committed fixture -- a stale/rotated/auto-generated key
// skips the suite instead of failing mid-run with raw crypto errors.
const hasUsableMasterKey = checkMasterKeyUsable();

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
