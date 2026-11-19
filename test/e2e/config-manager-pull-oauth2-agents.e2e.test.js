/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_D_f_m frodo config-manager pull oauth2-agents -D configManagerExportOauth2AgentsDir0 -f test/e2e/fr-config-manager-pull-config/oauth2-agents.json -m forgeops
*/

import { getEnv, testExport } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] = './test/e2e/env/Connections.json';

const env = getEnv(fc);
const configFile = 'test/e2e/fr-config-manager-pull-config/oauth2-agents.json';

// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
describe('frodo config-manager pull oauth2-agents', () => {
    // The config file lists the agent type TrustedJwtIssuer (testJWT) for /, alpha and bravo. Since frodo-cli#1259 the
    // command leaves it to `config-manager pull oauth-issuers`: it skips the entries with a warning and neither reads
    // nor writes an issuer, so the 3 snapshots of the testJWT.json files were removed from the snapshot file (they would
    // be reported as obsolete, which fails CI). The recording still holds the GET of each issuer; the replay does not
    // ask for them, and recordings are made against the real environment, not edited.
    // The config file also lists the agent type SoftwarePublisher (test software publisher) for /, alpha and bravo, which
    // the command leaves to `config-manager pull oauth-software-publishers` since frodo-cli#1343: the 3 snapshots of the
    // SoftwarePublisher/test software publisher.json files were removed from the snapshot file in the same way, and the
    // GET of each publisher stays in the recording unused.
    test(`"frodo config-manager pull oauth2-agents -D configManagerExportOauth2AgentsDir0 -f ${configFile} -m forgeops": should export all agents from all realms in fr-config manager style.`, async () => {
        const dirName = 'configManagerExportOauth2AgentsDir0';
        const CMD = `frodo config-manager pull oauth2-agents -D ${dirName} -f ${configFile} -m forgeops`;
        await testExport(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_D_f_m' } }, undefined, undefined, dirName, false);
    });
});