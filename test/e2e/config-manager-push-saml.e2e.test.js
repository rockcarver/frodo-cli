/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push saml --env-file test/e2e/env/configManager1.env -D test/e2e/exports/fr-config-manager/forgeops/ -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push saml -n test-IDP -E IDP_URL_PLACEHOLDER=https://platform.dev.trivir.com/am/idpsaehandler/metaAlias/alpha/test -E HTTP_REDIRECT_PLACEHOLDER=urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push saml --env-file test/e2e/env/configManager1.env --directory test/e2e/exports/fr-config-manager/forgeops/ -m forgeops
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

const allDirectory = "test/e2e/exports/fr-config-manager/forgeops";
const envDir = "test/e2e/env/configManager1.env"

describe('frodo config-manager push saml', () => {
    test(`"frodo config-manager push saml --env-file ${envDir} -D ${allDirectory} -m forgeops": should import the saml into forgeops"`, async () => {
        const CMD = `frodo config-manager push saml --env-file ${envDir} -D ${allDirectory} -m forgeops`;
        await testSuccess(CMD, forgeopsEnv)
    });
    test(`"frodo config-manager push saml -n test-IDP -E IDP_URL_PLACEHOLDER=https://platform.dev.trivir.com/am/idpsaehandler/metaAlias/alpha/test6 -E HTTP_REDIRECT_PLACEHOLDER=urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect -D ${allDirectory} -m forgeops": should import a saml entity and update placeholders`, async () => {
        const CMD = `frodo config-manager push saml -n test-IDP -E IDP_URL_PLACEHOLDER=https://platform.dev.trivir.com/am/idpsaehandler/metaAlias/alpha/test -E HTTP_REDIRECT_PLACEHOLDER=urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect -D ${allDirectory} -m forgeops`;
        await testSuccess(CMD, {
            env: {
                ...forgeopsEnv.env,
                FRODO_REALM: "alpha"
            }
        });
    });
    test(`"frodo config-manager push saml --env-file ${envDir} --directory ${allDirectory} -m forgeops": should import the saml into forgeops alpha realm"`, async () => {
        const CMD = `frodo config-manager push saml --env-file ${envDir} --directory ${allDirectory} -m forgeops`;
        await testSuccess(CMD, {
            env: {
                ...forgeopsEnv.env,
                FRODO_REALM: "alpha"
            }
        });
        
    });
});
