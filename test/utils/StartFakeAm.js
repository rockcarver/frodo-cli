import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const fakeAmPath = fileURLToPath(new URL('./FakeAm.mjs', import.meta.url));

/**
 * Starts test/utils/FakeAm.mjs as a SEPARATE process (a terminal driver that
 * blocks this process's event loop could not be answered by an in-process
 * server) and resolves once it is listening.
 *
 * @param {object} [options]
 * @param {string} [options.recordPath] file the fake appends one JSON line per request to
 * @param {string} [options.journey] `password` for plain login, `service-account` for bearer login (default: the MFA journey)
 * @param {string} [options.grantError] makes the service-account journey refuse other token requests with `invalid_grant` and this description
 * @param {{ issuer?: string, allowedSubjects: string[] }} [options.issuer] what every trusted JWT issuer read answers with
 * @param {object[]} [options.trustedIssuers] OAuth2 trusted JWT issuers (plain shape, `null` for a setting that is not set) the realm-config/agents/TrustedJwtIssuer collection serves, stores and deletes; an empty array is a realm without issuers (default: only what `issuer` answers)
 * @param {object[]} [options.aiAgents] AI agents (`_id`, `_type`, settings sections) the realm-config/agents/AIAgent collection serves, stores and deletes; an empty array is a realm without AI agents (default: it answers 404). AM calls only, so log in with `-m classic`
 * @param {number} [options.sessionTtlSeconds] lifetime of the session of a plain login, from the moment it is looked up (default: it expires in 2099)
 * @param {'refuse' | 'hang'} [options.logout] makes the logout call fail with `400` (`refuse`) or never answer (`hang`); default: it succeeds
 * @param {'refuse'} [options.login] makes every login fail with `401 Login failure` once the credentials are posted; default: it succeeds
 * @param {number} [options.loginDelayMs] holds every authenticate answer for this many milliseconds (default: no delay)
 * @param {number} [options.usersCap] stops the AM users endpoint (not IDM) at this many results, in the list and in the count
 * @param {string[]} [options.oauth2Clients] client ids the OAuth2 client list of the realm answers with (default: it answers 404)
 * @param {string[]} [options.oauthCimdProfiles] ids of the CIMD profiles every realm holds; the realms then offer the agent type CIMDProfile, an empty array is none (default: the type is not offered, its type list answers 404)
 * @param {string[]} [options.oauthIssuers] ids of the OAuth2 trusted JWT issuers every realm holds; an empty array is none (default: the routes answer 404)
 * @param {string[]} [options.scripts] script names the script list of the realm answers with (default: it answers 404)
 * @param {string[]} [options.secrets] ids the list of environment secrets answers with (a cloud tenant; default: it answers 404)
 * @param {string[]} [options.serviceAccounts] ids of the service accounts a cloud tenant answers a read of `/openidm/managed/svcacct/<id>` for, which saving a connection profile with a service account asks for (default: every such read answers 404)
 * @param {string[]} [options.services] ids the list of AM services (realm and global) answers with (default: it answers 404)
 * @param {{ realms: Record<string, { _id: string, nextDescendents?: { _id: string, _type: { _id: string } }[] }[]>, global?: { _id: string, singleton?: boolean, nextDescendents?: object[] }[], unavailable?: string[] }} [options.realmServices] the AM services of each realm (`/` is the root realm) and the global ones, as a store that a delete changes: the list, one service, its next descendents, and the delete of a next descendent and of a service; the ids in `unavailable` answer the read of their next descendents with the Cloud `403`; a realm that is not named answers `404` (default: the routes answer as they do with `services`)
 * @param {{ stores: { _id: string, type: string }[], mappings?: Record<string, { secretId: string, aliases?: string[] }[]> }} [options.secretStores] the secret stores of the realm and their mappings (default: they answer 404)
 * @param {string[]} [options.trees] journey names the journey list of the realm answers with; an empty array is a realm without journeys (default: it answers 404)
 * @param {object[]} [options.users] managed users the fake serves under /openidm/managed/ (`_id`, `userName`, `givenName`, `sn`, `mail`)
 * @param {string[]} [options.managedTypes] managed object type names the fake's config entity answers with (for catalog enrichment)
 * @param {string[]} [options.realms] realm names the realm list answers with (default: it answers 404)
 * @param {{method: string, path: string, echo?: {text: string, padding?: number}}[]} [options.failRequests] requests that answer with HTTP 500 (path is a URL fragment); `echo` adds a `detail.echo` of that text, `@PADDING@` in it replaced by `padding` characters
 * @param {object[]} [options.logApiKeys] keys returned by the log API key list
 * @param {string[]} [options.agentTypes] ids the agent type list of the realm answers with; an empty array is a realm that offers no type (default: it answers 404)
 * @param {object[]} [options.cimdProfiles] CIMD profiles in the plain shape the fake serves, stores and deletes (default: the type's endpoints answer 404)
 * @param {boolean} [options.cimdCompleteOnCreate] makes a create of a CIMD profile answer with it completed by defaults, as the server does, while an update stores exactly what it is sent
 * @param {object[]} [options.features] IDM features the registry serves (`_id`, `installedVersion`, `availableVersions`, `validate`: the body the validate action answers with), reads and validate only (default: the registry answers 404)
 * @param {{ managed?: object, 'repo.ds'?: object }} [options.idmConfig] the IDM configuration `config/managed` and `config/repo.ds` answer with on a read; a write to them answers 500 (default: they answer 404)
 * @param {Record<string, object>} [options.idmEntities] IDM configuration objects by config id (`sync`, `provisioner.openicf/xyz`, ...) the fake serves on a read, replaces on a write (`_id` taken from the URL) and removes on a delete (it answers the object, `404` for an id it does not hold), and lists as IDM does (`GET /openidm/config?_queryFilter=true` or `_id sw '<prefix>'`, a string prefix that is case sensitive, with an exact total and `_fields` for top-level fields; any other filter answers 400); the request log holds every body (default: they answer 404)
 * @param {Record<string, object[]>} [options.managedObjects] managed objects by type name (`alpha_application`, the application records of realm alpha), as `{ <type>: [objects] }`, which the fake serves as `GET /openidm/managed/<type>?_queryFilter=true` with `_pageSize`, `_pagedResultsCookie` (the next offset, `null` on the last page) and `_fields` (the objects reduced to `_id`, `_rev` and those fields; every object is answered with a `_rev`, its own or a hash of its content); any other filter, a page size or a cookie that is not a number answers 400; a read of one object and every write are not served, and a type that is not in the object is answered by the routes after it (the users, then 404) (default: they answer as they do without the option)
 * @param {Record<string, Record<string, string>>} [options.journeys] journeys the fake serves, reads and deletes, as `{ <journey>: { <node id>: <node type> } }` (default: the routes answer 404)
 * @param {{ location: 'hosted' | 'remote', entityId: string, config: object }[]} [options.samlProviders] SAML entity providers served as AM serves them: stubs with the location, reads without a location, a PUT that replaces the config; a path with a wrong location answers 404 (default: the routes answer as they do without the option)
 * @param {Record<string, string>} [options.nodes] nodes that no journey holds (orphaned nodes), as `{ <node id>: <node type> }`, served by node type together with the nodes of `journeys`, and removed by a delete of the node (default: none)
 * @param {string} [options.accessToken] the `access_token` that the service-account journey answers a token request with (default: `fake-service-account-token`)
 * @param {string} [options.sessionToken] the `tokenId` that a plain login ends with (default: `fake-token`)
 * @param {boolean} [options.emptyCollections] answers every collection query the fake has no route for as an empty collection (`GET` with a `_queryFilter`, `POST` with `_action=nextdescendents`: `200` with no result), so a command that reads many kinds of configuration runs through on an empty tenant (default: they answer 404)
 * @param {{ apply?: object, states?: object[] }} [options.directConfiguration] makes the fake serve the direct configuration session of a Cloud tenant (init, apply, abort and state, and the service account scopes a login reads): `apply` is what the apply call answers (default `{ editable: false }`), `states` what the state reads answer one after the other, the last one again after that (default `[{ editable: false }]`); the request log shows every call (default: the session API answers 404)
 * @param {{ lock?: { result: string, promotionId?: string }, lockId?: string, lockRequest?: 'refuse' | 'refuse-but-lock' | 'conflict', foreignLockId?: string, lockPolls?: number, unlockPolls?: number, onLockRead?: Record<string, { result: string, promotionId?: string }>, unlockRequest?: 'refuse', status?: object | object[], promote?: object[], rollback?: object[] }} [options.promotion] makes the fake serve the environment promotion API of a Cloud tenant as a small state machine (the lock, the promotion status, the promote and rollback requests, and the service account scopes a login reads): the lock before the first request, the id a lock request gets, requests that are refused or that conflict with a lock of somebody else, state polls that answer `locking` or `unlocking` first (they wait for real), a hook that changes the lock just before the n-th state read, the status before any request (one answer, or a list with one per read), and one scripted run (`{ request: 'refuse' }` or `{ statuses: [...] }`) per promote and per rollback request; the request log shows every call and its body (default: the API answers 404). See the header of FakeAm.mjs for the details
 * @param {boolean} [options.cimdRootDenied] makes the root realm answer the type list and the profiles with the Cloud `403` "This operation is not available in PingOne Advanced Identity Cloud."
 * @returns {Promise<{ port: number, stop: () => void }>}
 */
export async function startFakeAm({
  recordPath,
  journey,
  realms,
  grantError,
  issuer,
  trustedIssuers,
  aiAgents,
  users,
  managedTypes,
  oauth2Clients,
  oauthCimdProfiles,
  oauthIssuers,
  scripts,
  secrets,
  serviceAccounts,
  services,
  realmServices,
  secretStores,
  trees,
  usersCap,
  sessionTtlSeconds,
  logout,
  login,
  loginDelayMs,
  failRequests,
  logApiKeys,
  agentTypes,
  cimdProfiles,
  cimdCompleteOnCreate,
  cimdRootDenied,
  features,
  idmConfig,
  idmEntities,
  managedObjects,
  emptyCollections,
  journeys,
  nodes,
  samlProviders,
  accessToken,
  sessionToken,
  directConfiguration,
  promotion,
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-am-'));
  const written = (name, data) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, JSON.stringify(data));
    return file;
  };
  const child = cp.spawn(process.execPath, [fakeAmPath], {
    env: {
      ...process.env,
      ...(recordPath ? { FAKE_AM_RECORD: recordPath } : {}),
      ...(journey ? { FAKE_AM_JOURNEY: journey } : {}),
      ...(realms ? { FAKE_AM_REALMS: realms.join(',') } : {}),
      ...(grantError ? { FAKE_AM_GRANT_ERROR: grantError } : {}),
      ...(issuer
        ? { FAKE_AM_ISSUER_FILE: written('issuer.json', issuer) }
        : {}),
      ...(trustedIssuers
        ? {
            FAKE_AM_TRUSTED_ISSUERS_FILE: written(
              'trusted-issuers.json',
              trustedIssuers
            ),
          }
        : {}),
      ...(aiAgents
        ? { FAKE_AM_AI_AGENTS_FILE: written('ai-agents.json', aiAgents) }
        : {}),
      ...(users ? { FAKE_AM_USERS_FILE: written('users.json', users) } : {}),
      ...(managedTypes
        ? { FAKE_AM_MANAGED_TYPES: managedTypes.join(',') }
        : {}),
      ...(oauth2Clients
        ? { FAKE_AM_OAUTH2_CLIENTS: oauth2Clients.join(',') }
        : {}),
      ...(oauthCimdProfiles
        ? { FAKE_AM_OAUTH_CIMD_PROFILES: oauthCimdProfiles.join(',') }
        : {}),
      ...(oauthIssuers
        ? { FAKE_AM_OAUTH_ISSUERS: oauthIssuers.join(',') }
        : {}),
      ...(scripts ? { FAKE_AM_SCRIPTS: scripts.join(',') } : {}),
      ...(secrets ? { FAKE_AM_SECRETS: secrets.join(',') } : {}),
      ...(services ? { FAKE_AM_SERVICES: services.join(',') } : {}),
      ...(realmServices
        ? {
            FAKE_AM_SERVICES_FILE: written(
              'realm-services.json',
              realmServices
            ),
          }
        : {}),
      ...(serviceAccounts
        ? { FAKE_AM_SERVICE_ACCOUNTS: serviceAccounts.join(',') }
        : {}),
      ...(secretStores
        ? {
            FAKE_AM_SECRET_STORES_FILE: written(
              'secret-stores.json',
              secretStores
            ),
          }
        : {}),
      ...(trees ? { FAKE_AM_TREES: trees.join(',') } : {}),
      ...(usersCap ? { FAKE_AM_USERS_CAP: String(usersCap) } : {}),
      ...(sessionTtlSeconds
        ? { FAKE_AM_SESSION_TTL_SECONDS: String(sessionTtlSeconds) }
        : {}),
      ...(logout ? { FAKE_AM_LOGOUT: logout } : {}),
      ...(login ? { FAKE_AM_LOGIN: login } : {}),
      ...(loginDelayMs ? { FAKE_AM_LOGIN_DELAY_MS: String(loginDelayMs) } : {}),
      ...(failRequests
        ? { FAKE_AM_FAIL_REQUESTS: JSON.stringify(failRequests) }
        : {}),
      ...(logApiKeys
        ? { FAKE_AM_LOG_API_KEYS_FILE: written('log-keys.json', logApiKeys) }
        : {}),
      ...(agentTypes ? { FAKE_AM_AGENT_TYPES: agentTypes.join(',') } : {}),
      ...(cimdProfiles
        ? {
            FAKE_AM_CIMD_PROFILES_FILE: written(
              'cimd-profiles.json',
              cimdProfiles
            ),
          }
        : {}),
      ...(cimdCompleteOnCreate ? { FAKE_AM_CIMD_COMPLETE_ON_CREATE: '1' } : {}),
      ...(promotion
        ? {
            FAKE_AM_PROMOTION_FILE: written('promotion.json', promotion),
          }
        : {}),
      ...(cimdRootDenied ? { FAKE_AM_CIMD_ROOT_DENIED: '1' } : {}),
      ...(features
        ? { FAKE_AM_FEATURES_FILE: written('features.json', features) }
        : {}),
      ...(idmConfig
        ? { FAKE_AM_IDM_CONFIG_FILE: written('idm-config.json', idmConfig) }
        : {}),
      ...(idmEntities
        ? {
            FAKE_AM_IDM_ENTITIES_FILE: written(
              'idm-entities.json',
              idmEntities
            ),
          }
        : {}),
      ...(managedObjects
        ? {
            FAKE_AM_MANAGED_OBJECTS_FILE: written(
              'managed-objects.json',
              managedObjects
            ),
          }
        : {}),
      ...(emptyCollections ? { FAKE_AM_EMPTY_COLLECTIONS: '1' } : {}),
      ...(nodes ? { FAKE_AM_NODES_FILE: written('nodes.json', nodes) } : {}),
      ...(samlProviders
        ? { FAKE_AM_SAML_FILE: written('saml.json', samlProviders) }
        : {}),
      ...(journeys
        ? { FAKE_AM_JOURNEYS_FILE: written('journeys.json', journeys) }
        : {}),
      ...(accessToken ? { FAKE_AM_ACCESS_TOKEN: accessToken } : {}),
      ...(sessionToken ? { FAKE_AM_SESSION_TOKEN: sessionToken } : {}),
      ...(directConfiguration
        ? {
            FAKE_AM_DIRECT_CONFIGURATION_FILE: written(
              'direct-configuration.json',
              directConfiguration
            ),
          }
        : {}),
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const port = await new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const match = out.match(/PORT=(\d+)/);
      if (match) resolve(Number(match[1]));
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      reject(new Error(`fake AM exited early with code ${code}`))
    );
  });
  return {
    port,
    stop: () => {
      child.kill('SIGTERM');
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
