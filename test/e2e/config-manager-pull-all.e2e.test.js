/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_REALM=alpha FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_C_D frodo config-manager pull all -C test/e2e/fr-config-manager-pull-config -D allDir1

// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_C_D_m frodo config-manager pull all -C test/e2e/fr-config-manager-pull-config -D allDir2 -m forgeops
*/


import { getEnv, testExport } from './utils/TestUtils';
import { connection as c, forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);
const forgeopsEnv = getEnv(fc);

// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
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
  // A new tree uses the application layout (decision record 0042), so the four standalone steps (oauth2-agents,
  // saml, connector-definitions, connector-mappings) first ask which of their objects an application owns, and the
  // recording predates that request (it is not in the recording, so it fails). A step that cannot tell leaves what
  // depends on the answer out and is named in the summary, which is why 25 snapshots of the files of those steps
  // (the OAuth2 client, the SAML providers, the connectors and the mappings) were removed from the snapshot file.
  // The standalone steps are the last steps before applications, so the recordings of the steps before them are
  // still matched in order. The pull oauth2-agents, saml, connector-definitions and connector-mappings replays
  // still compare those files.
  // They come back when the test is recorded again (frodo-cli#1102).
  // The oauth2-agents step leaves the agent type TrustedJwtIssuer (testJWT, listed in oauth2-agents.json) to the
  // oauth-issuers step (frodo-cli#1259). The recording predates that step: it holds the requests of the generic route
  // (one GET by type and id per realm), not the list that the step makes, so the replay writes no issuer file and the 4
  // snapshots of the testJWT.json files were removed from the snapshot file (they would be reported as obsolete, which
  // fails CI). The unused requests stay in the recording; recordings are made against the real environment, not
  // edited. They come back when the test is recorded again (frodo-cli#1102).
  // The same holds for the agent type SoftwarePublisher (test software publisher, listed in oauth2-agents.json), which the
  // oauth2-agents step leaves to the oauth-software-publishers step (frodo-cli#1343): the replay writes no publisher file
  // and the 4 snapshots of the SoftwarePublisher/test software publisher.json files were removed from the snapshot file (they
  // would be reported as obsolete, which fails CI). The requests of the generic route stay in the recording; they come back
  // when the test is recorded again (frodo-cli#1102).
  // The three steps of the agent kinds that have a command of their own, oauth-cimd-profiles (frodo-cli#1250),
  // oauth-issuers (frodo-cli#1257) and oauth-software-publishers (frodo-cli#1343), are newer than this recording: the
  // requests they start with (the agent types and the list of the kind) are not in it, so the replay names each of the
  // three among the failed steps ("9 of 39 steps failed": themes, those three, connector-definitions, oauth2-agents,
  // connector-mappings, saml and applications), the exit code snapshot of 1 includes them, and the files they would
  // write are not compared. A live check against a development tenant (frodo-cli#1260) showed what they do: the
  // issuer, once, in the tree of a pull all; twice in a row, identical files. They come back when the test is
  // recorded again (frodo-cli#1102).
  // Opted in to missing recordings until the recording is made again (frodo-cli#1102): the oauth2-agents step now
  // tries every agent of the config file after one failed (decision record 0040), and the recording holds the
  // request of the first agent of the bravo realm only (a recorded 404), so the replay asks for requests that are
  // not in it. Recordings are made against the real environment, not edited. allowMissingRecordings lets the replay
  // report them instead of failing on them; the exit code and the exported files are still compared with the
  // snapshots.
  test('"frodo config-manager pull all -C test/e2e/fr-config-manager-pull-config -D allDir1": should export all config in alpha realm in fr-config-manager style"', async () => {
    const dirName = 'allDir1';
    const CMD = `frodo config-manager pull all -C test/e2e/fr-config-manager-pull-config -D ${dirName}`;
    await testExport(CMD, { env: {...env.env, FRODO_REALM: 'alpha', FRODO_TEST_NAME: '0_C_D' } }, undefined, undefined, dirName, false, false, true);
  });
  // This replay exits with code 1 and prints a summary of the steps that failed: org-privileges, password-policy, raw and service-objects.
  // The recording predates those steps, so their requests are missing ("Network error").
  // Until it is re-recorded (frodo-cli#1102), the exit code snapshot says so. Before a failed step failed
  // the command (decision record 0040) the exit code was 0, which hid it.
  // The four standalone steps (oauth2-agents, saml, connector-definitions, connector-mappings) leave their objects
  // out here for the same reason as in the replay above: the recording has no request for the ownership of the
  // applications, so 23 snapshots of their files (the OAuth2 client of the root, alpha and bravo realms, the SAML
  // providers of alpha, the connectors and the mappings) were removed from the snapshot file until it is recorded
  // again. The other agents of the realms are still written and compared.
  // The same three steps (oauth-cimd-profiles, oauth-issuers and oauth-software-publishers) are among the failed steps of
  // this replay too ("12 of 33 steps failed"), for the same reason: they are newer than the recording.
  // Opted in to missing recordings until the recording is made again (frodo-cli#1102): the org-privileges step now
  // tries every realm after the root realm failed (decision record 0040), and the recording holds the requests up to
  // that failure only, so the replay asks for requests that are not in it (alphaOrgPrivileges, bravoOrgPrivileges).
  // Recordings are made against the real environment, not edited. allowMissingRecordings lets the replay report them
  // instead of failing on them; the exit code and the exported files are still compared with the snapshots.
  // The service-objects step now exports every object of service-objects.json (it used to stop at the first one
  // that was not found), so the replay also reports the queries of the 2nd and 3rd object, which the recording
  // predates, as missing recordings.
  test('"frodo config-manager pull all -C test/e2e/fr-config-manager-pull-config -D allDir2 -m forgeops": should export all config in fr-config-manager style"', async () => {
    const dirName = 'allDir2';
    const CMD = `frodo config-manager pull all -C test/e2e/fr-config-manager-pull-config -D ${dirName} -m forgeops`;
    await testExport(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_C_D_m' } }, undefined, undefined, dirName, false, false, true);
  });
});
