/** See test/e2e/README.md for how to write and record e2e tests. */

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
// Cloud IGA
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config export -NRag --use-string-arrays --no-coords -f testExportAllIGA1.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config export --all --only-custom --global --file testExportAllIGA2.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config export --no-metadata --read-only --all-separate -g --use-string-arrays --no-coords --directory exportAllTestDir11
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config export -cxAgD exportAllTestDir12
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
import { connection as c, iga_connection as ic, classic_connection as cc, forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const cloudEnv = getEnv(c);
const igaEnv = getEnv(ic);
const classicEnv = getEnv(cc);
const forgeopsEnv = getEnv(fc);

const type = 'config';

describe('frodo config export', () => {
  describe('Cloud', () => {
    // TODO: Re-record test (relies on missing Polly recordings caught by the replay-integrity guard)
    test.skip('"frodo config export -adND exportAllTestDir4": should export everything, including default scripts, to a single file', async () => {
      const exportFile = 'all.config.json';
      const exportDirectory = 'exportAllTestDir4';
      const CMD = `frodo config export -adND ${exportDirectory}`;
      await testExport(CMD, cloudEnv, type, exportFile, exportDirectory, false);
    });

    // TODO: Re-record test (relies on missing Polly recordings caught by the replay-integrity guard)
    test.skip('"frodo config export --all --modified-properties --file testExportAll.json --use-string-arrays --no-decode --no-coords": should export everything to a single file named testExportAll.json with no decoding variables, no journey coordinates, and using string arrays', async () => {
      const exportFile = 'testExportAll.json';
      const CMD = `frodo config export --all --modified-properties --file ${exportFile} --use-string-arrays --no-decode --no-coords`;
      await testExport(CMD, cloudEnv, type, exportFile);
    });

    // TODO: Re-record test (relies on missing Polly recordings caught by the replay-integrity guard)
    test.skip('"frodo config export -AD exportAllTestDir1": should export everything into separate files in the directory exportAllTestDir1', async () => {
      const exportDirectory = 'exportAllTestDir1';
      const CMD = `frodo config export -AD ${exportDirectory}`;
      await testExport(CMD, cloudEnv, undefined, undefined, exportDirectory, false);
    });

    // TODO: Re-record test (relies on missing Polly recordings caught by the replay-integrity guard)
    test.skip('"frodo config export -MAxD exportAllTestDir2": should export everything into separate files in the directory exportAllTestDir2', async () => {
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

    // TODO: Re-record test (relies on missing Polly recordings caught by the replay-integrity guard)
    test.skip('"frodo config export -raf testExportAllAlpha.json": should export all alpha realm config to a single file named testExportAllAlpha.json.', async () => {
      const exportFile = 'testExportAllAlpha.json';
      const CMD = `frodo config export -raf ${exportFile}`;
      await testExport(CMD, cloudEnv, type, exportFile);
    });

    // TODO: Re-record test (relies on missing Polly recordings caught by the replay-integrity guard)
    test.skip('"frodo config export -gAD exportAllTestDir9": should export all global config into separate files in the directory exportAllTestDir9', async () => {
      const exportDirectory = 'exportAllTestDir9';
      const CMD = `frodo config export -gAD ${exportDirectory}`;
      await testExport(CMD, cloudEnv, undefined, undefined, exportDirectory, false);
    });
  });

  // Cloud IGA Tests

  // TODO: Record test
  test.skip('"frodo config export -NRag --use-string-arrays --no-coords -f testExportAllIGA1.json": should export all global IGA configuration with no-coords, string arrays, and read only configuration.', async () => {
    const exportFile = 'testExportAllIGA1.json';
    const CMD = `frodo config export -NRag --use-string-arrays --no-coords -f ${exportFile}`;
    await testExport(CMD, igaEnv, type, exportFile, undefined, false, true);
  });

  // TODO: Record test
  test.skip('"frodo config export --all --only-custom --global --file testExportAllIGA2.json": should export all global IGA configuration with only custom request types.', async () => {
    const exportFile = 'testExportAllIGA2.json';
    const CMD = `frodo config export --all --only-custom --global --file ${exportFile}`;
    await testExport(CMD, igaEnv, type, exportFile, undefined, true, true);
  });

  // TODO: Record test
  test.skip('"frodo config export --no-metadata --read-only --all-separate -g --use-string-arrays --no-coords --directory exportAllTestDir11": should export all global IGA configuration separately with extracted scripts, no-coords, string arrays, and read only configuration.', async () => {
    const exportDirectory = 'exportAllTestDir11';
    const CMD = `frodo config export --no-metadata --read-only --all-separate -g --use-string-arrays --no-coords --directory ${exportDirectory}`;
    await testExport(CMD, igaEnv, type, undefined, exportDirectory, false, true);
  });

  // TODO: Record test
  test.skip('"frodo config export -cxAgD exportAllTestDir12": should export all global IGA configuration separately without extraction and only custom request types', async () => {
    const exportDirectory = 'exportAllTestDir12';
    const CMD = `frodo config export -cxAgD ${exportDirectory}`;
    await testExport(CMD, igaEnv, type, undefined, exportDirectory, true, true);
  });

  // Classic Env Tests
  describe('Classic', () => {
    // TODO: Re-record test (relies on missing Polly recordings caught by the replay-integrity guard)
    test.skip('"frodo config export -adND exportAllTestDir6 -m classic": should export everything, including default scripts, to a single file', async () => {
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

    // TODO: Re-record test (relies on missing Polly recordings caught by the replay-integrity guard)
    test.skip('"frodo config export --all-separate --no-metadata --default --directory exportAllTestDir8 --include-active-values --use-string-arrays --no-decode --no-coords --type classic": should export everything, including default scripts, into separate files in the directory exportAllTestDir8 with scripts, no decoding variables, no journey coordinates, separate mappings, and using string arrays', async () => {
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

    // TODO: Re-record test (relies on missing Polly recordings caught by the replay-integrity guard)
    test.skip('"frodo config export --realm-only -AD exportAllTestDir10 -m classic": should export all global config into separate files in the directory exportAllTestDir10', async () => {
      const exportDirectory = 'exportAllTestDir10';
      const CMD = `frodo config export --realm-only -AD ${exportDirectory} -m classic`;
      await testExport(CMD, classicEnv, undefined, undefined, exportDirectory, false);
    });

    // TODO: Re-record test (relies on missing Polly recordings caught by the replay-integrity guard)
    test.skip('"frodo config export --global-only -af testExportAllGlobal.json -m classic": should export all global config to a single file named testExportAllGlobal.json.', async () => {
      const exportFile = 'testExportAllGlobal.json';
      const CMD = `frodo config export --global-only -af ${exportFile} -m classic`;
      await testExport(CMD, classicEnv, type, exportFile);
    });
  });

  // Forgeops tests
  describe('Forgeops', () => {
    // TODO: Re-record test (relies on missing Polly recordings caught by the replay-integrity guard)
    test.skip('"frodo config export -AND exportAllTestDir11 --type forgeops": should export all separated files with extracted idm scripts.', async () => {
      const exportDirectory = 'exportAllTestDir11';
      const CMD = `frodo config export -AND ${exportDirectory} --type forgeops`;
      await testExport(CMD, forgeopsEnv, undefined, undefined, exportDirectory, false);
    });

    // TODO: Re-record test (relies on missing Polly recordings caught by the replay-integrity guard)
    test.skip('"frodo config export -xAND exportAllTestDir12 --type forgeops": should export all separated files without extracted idm scripts.', async () => {
      const exportDirectory = 'exportAllTestDir12';
      const CMD = `frodo config export -xAND ${exportDirectory} --type forgeops`;
      await testExport(CMD, forgeopsEnv, undefined, undefined, exportDirectory, false);
    });
  });
});
