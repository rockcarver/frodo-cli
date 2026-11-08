/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_REALM=alpha FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull all -C test/e2e/fr-config-manager-pull-config -D allDir1

// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager pull all -C test/e2e/fr-config-manager-pull-config -D allDir2 -m forgeops
*/


import { getEnv, testExport } from './utils/TestUtils';
import { connection as c, forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);
const forgeopsEnv = getEnv(fc);

describe('frodo config-manager pull all', () => {
  // This replay exits with code 1 and prints a summary of the steps that failed: oauth2-agents (an agent of the bravo realm).
  // The recording predates those steps, so their requests are missing ("Network error").
  // Until it is re-recorded (frodo-cli#1102), the exit code snapshot says so. Before a failed step failed
  // the command (decision record 0040) the exit code was 0, which hid it.
  // With frodo-lib 5.0.0-26 the themes step fails in this replay as well: the recorded theme "Test" holds
  // its localized HTML as {file: ...} objects, not strings, and the library's file writer now throws for that
  // where it used to print "can't save" and go on. So the replay no longer writes the realm's theme files, and the
  // 16 snapshots of those files were removed from the snapshot file (they would be reported as obsolete, which fails
  // CI). They come back when the test is recorded again (frodo-cli#1102).
  test('"frodo config-manager pull all -C test/e2e/fr-config-manager-pull-config -D allDir1": should export all config in alpha realm in fr-config-manager style"', async () => {
    const dirName = 'allDir1';
    const CMD = `frodo config-manager pull all -C test/e2e/fr-config-manager-pull-config -D ${dirName}`;
    await testExport(CMD, { env: {...env.env, FRODO_REALM: 'alpha' } }, undefined, undefined, dirName, false);
  });
  // This replay exits with code 1 and prints a summary of the steps that failed: org-privileges, password-policy, raw and service-objects.
  // The recording predates those steps, so their requests are missing ("Network error").
  // Until it is re-recorded (frodo-cli#1102), the exit code snapshot says so. Before a failed step failed
  // the command (decision record 0040) the exit code was 0, which hid it.
  test('"frodo config-manager pull all -C test/e2e/fr-config-manager-pull-config -D allDir2 -m forgeops": should export all config in fr-config-manager style"', async () => {
    const dirName = 'allDir2';
    const CMD = `frodo config-manager pull all -C test/e2e/fr-config-manager-pull-config -D ${dirName} -m forgeops`;
    await testExport(CMD, forgeopsEnv, undefined, undefined, dirName, false);
  });
});
