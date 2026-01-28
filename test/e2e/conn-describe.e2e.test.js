/**
 * Follow this process to write e2e tests for the CLI project:
 *
 * 1. Test if all the necessary mocks for your tests already exist.
 *    In mock mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=1 FRODO_CONNECTION_PROFILES_PATH=./test/e2e/env/Connections.json FRODO_MASTER_KEY='<master key>' frodo conn describe https://openam-frodo-dev.forgeblocks.com/am
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
 *    $ FRODO_MOCK=record FRODO_CONNECTION_PROFILES_PATH=./test/e2e/env/Connections.json FRODO_MASTER_KEY='<master key>' frodo conn describe https://openam-frodo-dev.forgeblocks.com/am
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
 *    $ FRODO_MOCK=1 FRODO_CONNECTION_PROFILES_PATH=./test/e2e/env/Connections.json FRODO_MASTER_KEY='<master key>' frodo conn describe https://openam-frodo-dev.forgeblocks.com/am
 *
 * 4. Write your test.
 *    Make sure to use the exact command including number of arguments and params.
 *
 * 5. Create snapshots.
 *    To create snapshots for your tests, run the tests in update snapshot mode:
 * 
 *    $ FRODO_CONNECTION_PROFILES_PATH=./test/e2e/env/Connections.json FRODO_MASTER_KEY='<master key>' npm run test:update conn-describe
 * 
 * 6. Test you tests and recordings and snapshots.
 *    To test the whole package of tests, recordings, and snapshots, run the tests:
 * 
 *    $ FRODO_CONNECTION_PROFILES_PATH=./test/e2e/env/Connections.json FRODO_MASTER_KEY='<master key>' npm run test conn-describe
 * 
 * 7. Commit your test, your recordings, and snapshots to the repository.
 */
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, removeAnsiEscapeCodes, testif } from './utils/TestUtils';
import { connection as c, classic_connection as cc } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv();

describe('frodo conn describe', () => {
    testif(process.env['FRODO_MASTER_KEY'])(
        `"frodo conn describe ${c.host}": should describe the connection`,
        async () => {
            const CMD = `frodo conn describe ${c.host}`;
            const { stdout } = await exec(CMD, env);
            expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
        }
    );

    testif(process.env['FRODO_MASTER_KEY'])(
        `"frodo conn describe ${cc.host}": should describe the classic connection`,
        async () => {
            const CMD = `frodo conn describe ${cc.host}`;
            const { stdout } = await exec(CMD, env);
            expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
        }
    );

    testif(process.env['FRODO_MASTER_KEY'])(
        `"frodo conn describe --show-secrets ${c.host}": should describe the connection and show the associated secrets`,
        async () => {
            const CMD = `frodo conn describe --show-secrets ${c.host}`;
            const { stdout } = await exec(CMD, env);
            //Don't test with snapshot, otherwise the snapshot would contain secrets. Instead, just check to make sure "[present]" doesn't exist anywhere.
            expect(removeAnsiEscapeCodes(stdout).includes("[present]")).toBeFalsy();
        }
    );

    testif(process.env['FRODO_MASTER_KEY'])(
        `"frodo conn describe --show-secrets ${cc.host}": should describe the classic connection and show the associated secrets`,
        async () => {
            const CMD = `frodo conn describe --show-secrets ${cc.host}`;
            const { stdout } = await exec(CMD, env);
            //Don't test with snapshot, otherwise the snapshot would contain secrets. Instead, just check to make sure "[present]" doesn't exist anywhere.
            expect(removeAnsiEscapeCodes(stdout).includes("[present]")).toBeFalsy();
        }
    );
});
