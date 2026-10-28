/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull journeys -D ConfigJourneytestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull journeys -cD ConfigJourneytestDir4 --pull-dependencies

// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_REALM=alpha FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager pull journeys -D testDir12 -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_REALM=bravo FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager pull journeys -n BravoTestRegistration -D testDir13 -m forgeops
*/


import { getEnv, testExport } from './utils/TestUtils';
import { connection as c, forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);
const forgeopsEnv = getEnv(fc);

describe('frodo config-manager pulls', () => {
  test('"frodo config-manager pull journeys -D ConfigJourneytestDir1": should export the journeys in fr-config-manager style"', async () => {
      const dirName = 'ConfigJourneytestDir1';
      const CMD = `frodo config-manager pull journeys -D ${dirName}`;
      await testExport(CMD, env, undefined, undefined, dirName, false);
    });
    test('"frodo config-manager pull journeys -D ConfigJourneyTestDir2 -m forgeops": should export the journeys in alpha realm in fr-config-manager style"', async () => {
      const dirName = 'ConfigJourneyTestDir2';
      const CMD = `frodo config-manager pull journeys -D ${dirName} -m forgeops`;
      await testExport(CMD, { env: {...forgeopsEnv.env, FRODO_REALM: 'alpha' } }, undefined, undefined, dirName, false);
    });
    test('"frodo config-manager pull journeys -n BravoTestRegistration -D ConfigJourneytestDir3 -m forgeops": should export journey with name: BravoTestRegistration from bravo realm in fr-config-manager style"', async () => {
      const dirName = 'ConfigJourneytestDir3';
      const CMD = `frodo config-manager pull journeys -n BravoTestRegistration -D ${dirName} -m forgeops`;
      await testExport(CMD, { env: {...forgeopsEnv.env, FRODO_REALM: 'bravo' } }, undefined, undefined, dirName, false);
    });
    test('"frodo config-manager pull journeys -cD ConfigJourneytestDir4 --pull-dependencies": should export the journeys in fr-config-manager style"', async () => {
      const dirName = 'ConfigJourneytestDir4';
      const CMD = `frodo config-manager pull journeys -cD ${dirName} --pull-dependencies`;
      await testExport(CMD, env, undefined, undefined, dirName, false);
    });
});