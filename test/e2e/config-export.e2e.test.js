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
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config export -adND exportAllTestDir4
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config export --all --modified-properties --file testExportAll.json --use-string-arrays --no-decode --no-coords
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config export -AD exportAllTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config export -MAxD exportAllTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config export --all-separate --read-only --no-metadata --default --directory exportAllTestDir3 --use-string-arrays --no-decode --no-coords --no-extract
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config export -RAD exportAllTestDir5 --include-active-values
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config export -raf testExportAllAlpha.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config export -gAD exportAllTestDir9
// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config export -adND exportAllTestDir6 -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config export --all --modified-properties --read-only --file testExportAll2.json --include-active-values --use-string-arrays --no-decode --no-coords --type classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config export -RMAxD exportAllTestDir7 -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config export --all-separate --no-metadata --default --directory exportAllTestDir8 --include-active-values --use-string-arrays --no-decode --no-coords --type classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config export --realm-only -AD exportAllTestDir10 -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config export --global-only -af testExportAllGlobal.json -m classic
// Forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config export -AND exportAllTestDir11 --type forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config export -xAND exportAllTestDir12 --type forgeops
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c, classic_connection as cc, forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const cloudEnv = getEnv(c);
const classicEnv = getEnv(cc);
const forgeopsEnv = getEnv(fc);

const type = 'config';

describe('frodo config export', () => {
  describe('Cloud', () => {
    test('"frodo config export -adND exportAllTestDir4": should export everything, including default scripts, to a single file', async () => {
      const exportFile = 'all.config.json';
      const exportDirectory = 'exportAllTestDir4';
      const CMD = `frodo config export -adND ${exportDirectory}`;
      await testExport(CMD, cloudEnv, type, exportFile, exportDirectory, false);
    });

    test('"frodo config export --all --modified-properties --file testExportAll.json --use-string-arrays --no-decode --no-coords": should export everything to a single file named testExportAll.json with no decoding variables, no journey coordinates, and using string arrays', async () => {
      const exportFile = 'testExportAll.json';
      const CMD = `frodo config export --all --modified-properties --file ${exportFile} --use-string-arrays --no-decode --no-coords`;
      await testExport(CMD, cloudEnv, type, exportFile);
    });

    test('"frodo config export -AD exportAllTestDir1": should export everything into separate files in the directory exportAllTestDir1', async () => {
      const exportDirectory = 'exportAllTestDir1';
      const CMD = `frodo config export -AD ${exportDirectory}`;
      await testExport(CMD, cloudEnv, undefined, undefined, exportDirectory, false);
    });

    test('"frodo config export -MAxD exportAllTestDir2": should export everything into separate files in the directory exportAllTestDir2', async () => {
      const exportDirectory = 'exportAllTestDir2';
      const CMD = `frodo config export -MAxD ${exportDirectory}`;
      await testExport(CMD, cloudEnv, undefined, undefined, exportDirectory, false);
    });

    test('"frodo config export --all-separate --read-only --no-metadata --default --directory exportAllTestDir3 --use-string-arrays --no-decode --no-coords --no-extract": should export everything, including default scripts, into separate files in the directory exportAllTestDir3 with scripts, no decoding variables, no journey coordinates, separate mappings, and using string arrays', async () => {
      const exportDirectory = 'exportAllTestDir3';
      const CMD = `frodo config export --all-separate --read-only --no-metadata --default --directory ${exportDirectory} --use-string-arrays --no-decode --no-coords --no-extract`;
      await testExport(CMD, cloudEnv, undefined, undefined, exportDirectory, false);
    });

    test('"frodo config export -RAD exportAllTestDir5 --include-active-values": should export everything including secret values into separate files in the directory exportAllTestDir5', async () => {
      const exportDirectory = 'exportAllTestDir5';
      const CMD = `frodo config export -RAD ${exportDirectory} --include-active-values`;
      await testExport(CMD, cloudEnv, undefined, undefined, exportDirectory, false);
    });

    test('"frodo config export -raf testExportAllAlpha.json": should export all alpha realm config to a single file named testExportAllAlpha.json.', async () => {
      const exportFile = 'testExportAllAlpha.json';
      const CMD = `frodo config export -raf ${exportFile}`;
      await testExport(CMD, cloudEnv, type, exportFile);
    });

    test('"frodo config export -gAD exportAllTestDir9": should export all global config into separate files in the directory exportAllTestDir9', async () => {
      const exportDirectory = 'exportAllTestDir9';
      const CMD = `frodo config export -gAD ${exportDirectory}`;
      await testExport(CMD, cloudEnv, undefined, undefined, exportDirectory, false);
    });
  });

  // Classic Env Tests
  describe('Classic', () => {
    test('"frodo config export -adND exportAllTestDir6 -m classic": should export everything, including default scripts, to a single file', async () => {
      const exportFile = 'all.config.json';
      const exportDirectory = 'exportAllTestDir6';
      const CMD = `frodo config export -adND ${exportDirectory} -m classic`;
      await testExport(CMD, classicEnv, type, exportFile, exportDirectory, false);
    });

    // TODO: Re-record test
    test.skip('"frodo config export --all --modified-properties --read-only --file testExportAll2.json --include-active-values --use-string-arrays --no-decode --no-coords --type classic": should export everything to a single file named testExportAll2.json with no decoding variables, no journey coordinates, and using string arrays', async () => {
      const exportFile = 'testExportAll2.json';
      const CMD = `frodo config export --all --modified-properties --read-only --file ${exportFile} --include-active-values --use-string-arrays --no-decode --no-coords --type classic`;
      await testExport(CMD, classicEnv, type, exportFile);
    });

    // TODO: Re-record test
    test.skip('"frodo config export -RMAxD exportAllTestDir7 -m classic": should export everything into separate files in the directory exportAllTestDir7 with scripts and mappings separate', async () => {
      const exportDirectory = 'exportAllTestDir7';
      const CMD = `frodo config export -RMAxD ${exportDirectory} -m classic`;
      await testExport(
        CMD,
        classicEnv,
        undefined,
        undefined,
        exportDirectory,
        false
      );
    });

    test('"frodo config export --all-separate --no-metadata --default --directory exportAllTestDir8 --include-active-values --use-string-arrays --no-decode --no-coords --type classic": should export everything, including default scripts, into separate files in the directory exportAllTestDir8 with scripts, no decoding variables, no journey coordinates, separate mappings, and using string arrays', async () => {
      const exportDirectory = 'exportAllTestDir8';
      const CMD = `frodo config export --all-separate --no-metadata --default --directory ${exportDirectory} --include-active-values --use-string-arrays --no-decode --no-coords --type classic`;
      await testExport(
        CMD,
        classicEnv,
        undefined,
        undefined,
        exportDirectory,
        false
      );
    });

    test('"frodo config export --realm-only -AD exportAllTestDir10 -m classic": should export all global config into separate files in the directory exportAllTestDir10', async () => {
      const exportDirectory = 'exportAllTestDir10';
      const CMD = `frodo config export --realm-only -AD ${exportDirectory} -m classic`;
      await testExport(CMD, classicEnv, undefined, undefined, exportDirectory, false);
    });

    test('"frodo config export --global-only -af testExportAllGlobal.json -m classic": should export all global config to a single file named testExportAllGlobal.json.', async () => {
      const exportFile = 'testExportAllGlobal.json';
      const CMD = `frodo config export --global-only -af ${exportFile} -m classic`;
      await testExport(CMD, classicEnv, type, exportFile);
    });
  });

  // Forgeops tests
  describe('Forgeops', () => {
    test('"frodo config export -AND exportAllTestDir11 --type forgeops": should export all separated files with extracted idm scripts.', async () => {
      const exportDirectory = 'exportAllTestDir11';
      const CMD = `frodo config export -AND ${exportDirectory} --type forgeops`;
      await testExport(CMD, forgeopsEnv, undefined, undefined, exportDirectory, false);
    });

    test('"frodo config export -xAND exportAllTestDir12 --type forgeops": should export all separated files without extracted idm scripts.', async () => {
      const exportDirectory = 'exportAllTestDir12';
      const CMD = `frodo config export -xAND ${exportDirectory} --type forgeops`;
      await testExport(CMD, forgeopsEnv, undefined, undefined, exportDirectory, false);
    });
  });
});
