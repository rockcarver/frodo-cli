#!/usr/bin/env node
/**
 * A minimal fake ForgeRock AM for driving the REAL frodo CLI through a
 * terminal in tests: it answers the few endpoints a username/password login
 * with an MFA code step touches, and records every request to a file.
 *
 * Run it as a SEPARATE process (`node test/utils/FakeAm.mjs`): the PTY
 * driver blocks the test's event loop, so an in-process server could not
 * answer. It prints `PORT=<n>` on stdout once it listens, and appends one
 * JSON line per request (`{ method, url, body }`) to the file named by
 * FAKE_AM_RECORD.
 *
 * The scripted journey (`POST .../authenticate`):
 *   1. no callbacks posted -> NameCallback "User Name" + PasswordCallback
 *   2. credentials posted  -> NameCallback "Enter verification code"
 *   3. the code posted     -> a session token
 * The session lookup that follows is answered with 401 on purpose: the
 * tests are about the prompt, and a deterministic failure afterwards keeps
 * the CLI's last words stable.
 *
 * FAKE_AM_REALMS=alpha,bravo makes the realm list endpoint answer with those
 * realms (otherwise it answers 404, as every unknown path does): a system with
 * more than one realm is what makes the CLI offer its realm picker.
 *
 * FAKE_AM_JOURNEY=password selects a plain login instead (no code step,
 * and the session lookup succeeds), for tests that need a command to get
 * past login without anyone typing: step 2 returns the session token and
 * everything after it is answered 404, so a command that goes on to write
 * something fails deterministically on its first write.
 *
 * FAKE_AM_JOURNEY=service-account also answers the token endpoint, so a
 * service-account login can reach post-auth realm selection and commands.
 * FAKE_AM_GRANT_ERROR=<text> makes that endpoint refuse every request that
 * is not the service-account login itself (`client_id=service-account`) with
 * `400 invalid_grant` and the text as its description, like AM does for an
 * RFC7523 assertion it does not accept.
 *
 * FAKE_AM_ISSUER_FILE=<path> names a JSON file `{ issuer?, allowedSubjects }`
 * the fake answers every trusted JWT issuer read with. FAKE_AM_USERS_FILE=<path>
 * names a JSON array of managed users (`_id`, `userName`, `givenName`, `sn`,
 * `mail`) the fake serves under `/openidm/managed/`, with IDM's `_queryFilter`
 * reduced to what the frodo user picker sends: `true`, and `or`-ed
 * `field sw|co|eq "text"` terms (an `and` group counts as `or`; `cn` is the
 * first and last name, `uid` the user name).
 * `_pageSize=0` answers the count. The same users are served by the AM users
 * endpoint (`.../json/realms/root/realms/<realm>/users`, which a classic
 * deployment has instead of IDM): AM's shape, with the attributes as lists and
 * the username filtered as `uid`. FAKE_AM_USERS_CAP=<n> makes that endpoint
 * stop at n results, in the list and in the count, as AM does at the data
 * store's maximum results (1000 by default).
 * FAKE_AM_TRUSTED_ISSUERS_FILE=<path> names a JSON array of OAuth2 trusted JWT
 * issuers in the plain shape (a setting that is not set is `null`) the fake
 * serves as a collection (`.../realm-config/agents/TrustedJwtIssuer`), the way
 * AM does: the query answers the issuers as they are, a read by id answers one
 * with every setting wrapped in `{ inherited, value }` (no `value` for a setting
 * that is not set) or `404`, `PUT` stores one (`201` for a new id, `200`
 * otherwise; `400 Invalid attribute specified.` for a body with `_rev`, which AM
 * refuses) and `DELETE` removes one (`404` for a missing id). The issuers are
 * kept in memory for the life of the process, whatever the realm of the URL.
 * It wins over FAKE_AM_ISSUER_FILE when both are set. An empty array is a realm
 * without issuers.
 * FAKE_AM_AI_AGENTS_FILE=<path> names a JSON array of AI agents (objects with `_id`,
 * `_type` and the settings sections AM holds, e.g. `coreOAuth2ClientConfig`) the fake
 * serves as a collection (`.../realm-config/agents/AIAgent`): the query (`_queryFilter=true`
 * or `_id eq '<id>'`) and a read by id answer the agents as they are (`404` for a missing id), `PUT` stores one (`201` for a
 * new id, `200` otherwise) and `DELETE` removes one (`404` for a missing id). The agents
 * are kept in memory for the life of the process, whatever the realm of the URL. An empty
 * array is a realm without AI agents. Only the AM calls are served, so use a classic
 * login (`-m classic`): a cloud login reads the agent identities from IDM as well.
 * FAKE_AM_OAUTH2_CLIENTS=<id,id,...> makes the OAuth2 client list of the realm
 * (`.../realm-config/agents/OAuth2Client`) answer with those client ids, the way
 * the OAuth2 client picker of the admin commands reads it.
 * FAKE_AM_OAUTH_CIMD_PROFILES=<id,id,...> makes every realm offer the agent type
 * CIMDProfile (the agent type list `.../realm-config/agents?_action=getAllTypes`
 * lists it; without the variable the list answers 404, a deployment that does not
 * have the type) and hold CIMD profiles of those ids (an empty value: none). The
 * profiles are the same in every realm and live as long as the fake: the list
 * (`.../agents/CIMDProfile?_queryFilter=true`) answers with them in the plain
 * shape, a `GET` of one id (`.../agents/CIMDProfile/<id>`, ignoring case, as AM
 * does; `404` when missing) answers in the wrapped shape (`{ inherited, value }`
 * per property, as AM answers a read by id), a `PUT` stores the body (`201` for a new id, which the server completes
 * with a default group the body lacks, `200` for an existing one, which stores
 * exactly the body; ids are matched ignoring case, as AM does) and refuses a `_rev` in it with `400
 * Invalid attribute specified`, and a `DELETE` removes one (`404` when missing).
 * FAKE_AM_OAUTH_ISSUERS=<id,id,...> makes every realm hold OAuth2 trusted JWT
 * issuers of those ids (an empty value: none; without the variable the routes
 * answer 404). The issuers are the same in every realm and live as long as the
 * fake: the list (`.../agents/TrustedJwtIssuer?_queryFilter=true`) answers with
 * them in the plain shape (ids only matter), the single read answers with every
 * property wrapped as `{ inherited, value }`, a `PUT` stores the body (`201` for a
 * new id, which the server completes with a default property the body lacks,
 * `200` for an existing one, which stores exactly the body; a `_rev` in it is
 * refused with `400 Invalid attribute specified.`, and so is a top-level
 * attribute that AM does not know, which AM answers with the attributes it
 * accepts in `detail.validAttributes`, the way the library's retry reads it) and
 * a `DELETE` removes one (`404` when missing). Ids are matched exactly.
 * FAKE_AM_SCRIPTS=<name,name,...> makes the script list of the realm
 * (`.../scripts`) answer with scripts of those names, the way the script
 * picker of the script commands reads it.
 * FAKE_AM_SECRETS=<id,id,...> makes the list of environment secrets
 * (`/environment/secrets`, a cloud tenant) answer with secrets of those ids; an
 * empty value is a tenant without secrets. Without it the list answers 404. The
 * calls that delete a secret or add a version to one are answered `200`, and
 * reading one of them answers its skeleton.
 * FAKE_AM_SERVICE_ACCOUNTS=<id,id,...> makes the read of one service account of
 * a cloud tenant (`GET /openidm/managed/svcacct/<id>`, what saving a connection
 * profile with a service account asks for) answer with an account of that id;
 * any other id answers 404. Without it every such read answers 404.
 * FAKE_AM_SERVICES=<id,id,...> makes the list of the AM services of the realm
 * and of the global ones (`.../services?_action=nextdescendents`) answer with
 * services of those ids; an empty value is a realm without services. Without it
 * the list answers 404. Deleting one is answered `200`.
 * FAKE_AM_SERVICES_FILE=<path> names a JSON object `{ realms: { "<realm>": [service, ...] },
 * global?: [service, ...], unavailable?: [id, ...] }` the fake serves as the AM services of
 * each realm (`/` is the root realm) and the global ones, as a store that a delete changes
 * (it answers every request for the services of a realm or the global ones, so FAKE_AM_SERVICES
 * is not used with it). A service is `{ _id, nextDescendents?: [{ _id, _type: { _id } }] }`. The list
 * (`POST .../services?_action=nextdescendents`), one service (`GET .../services/<id>`, which
 * answers `_id: ""` as AM does) and its next descendents (`POST .../services/<id>?_action=nextdescendents`)
 * are served; `DELETE .../services/<id>/<type>/<descendent id>` removes a next descendent and
 * `DELETE .../services/<id>` the service with the ones it still has; `404` for an id that
 * is not held and for a realm that the file does not name. The ids in `unavailable` answer the
 * read of their next descendents with the Cloud `403` "This operation is not available in
 * PingOne Advanced Identity Cloud.". A service whose id has a slash in it is read and deleted by
 * the whole rest of the path. The store lives as long as the fake; the request log shows
 * every call. A failing read or delete is made with FAKE_AM_FAIL_REQUESTS.
 * FAKE_AM_SECRET_STORES_FILE=<path> names a JSON file `{ stores: [{ _id, type }],
 * mappings: { <store id>: [{ secretId, aliases }] } }` the fake serves the secret
 * stores of the realm (`.../secrets/stores?_action=nextdescendents`) and their
 * mappings from; creating or replacing a mapping is answered `200`, and a `DELETE`
 * of one mapping removes it (`404` for an id that the store does not hold; ids are
 * matched exactly); a `DELETE` of any other path under a store is answered `404`
 * like every path the fake does not know.
 * FAKE_AM_TREES=<name,name,...> makes the journey list of the realm
 * (`.../authenticationtrees/trees`) answer with trees of those names; an empty
 * value is a realm without journeys. Without it the list answers 404. The
 * trees themselves are not served, so a command that reads one fails on it.
 * FAKE_AM_JOURNEYS_FILE=<path> names a JSON object `{ "<journey>": { "<node id>": "<node type>" } }`
 * the fake serves as journeys that can be read and deleted: a read of one
 * (`.../authenticationtrees/trees/<journey>`) answers it with its nodes (`404` once it was
 * deleted), `DELETE` of it removes it and answers it as AM does (`200`, with its nodes),
 * and `DELETE .../authenticationtrees/nodes/<type>/<id>` answers `200`. The journeys are
 * listed too (`GET .../authenticationtrees/trees`, unless FAKE_AM_TREES answers the list).
 * FAKE_AM_NODES_FILE=<path> names a JSON object `{ "<node id>": "<node type>" }` of nodes that
 * no journey holds (orphaned nodes), served with the nodes of the journeys by node type
 * (`POST .../authenticationtrees/nodes?_action=getAllTypes`, `GET .../nodes/<type>`);
 * `DELETE .../nodes/<type>/<id>` removes one of them. The authentication settings of the realm
 * (`GET .../realm-config/authentication`) answer with `ldapService` as the default journeys.
 * FAKE_AM_SAML_FILE=<path> names a JSON array `[{ "location": "hosted" | "remote", "entityId": "<id>",
 * "config": { ... } }]` of SAML entity providers, served the way AM serves them (the shape of the
 * recorded reads): the stubs (`GET .../realm-config/saml2?_queryFilter=true`, or `entityId eq '<id>'`)
 * are `{ _id, _rev, entityId, location, roles }`, with the unpadded base64 of the entity id as `_id`;
 * `GET .../saml2/<location>/<_id>` answers `{ _id, _rev, entityId, ...config }` and has no
 * `entityLocation`; `PUT` to the same path REPLACES the config by the body (without `_id`, `_rev` and
 * `entityId`) and answers with the provider and a new `_rev`. A path with another location, or an id
 * that is not one (`.../saml2/undefined/<_id>`), answers `404`. The providers are kept in memory.
 * The failing answers come from FAKE_AM_FAIL_REQUESTS.
 * FAKE_AM_ACCESS_TOKEN=<text> is the `access_token` that the token endpoint of the service-account
 * journey answers with (default: `fake-service-account-token`). FAKE_AM_SESSION_TOKEN=<text> is
 * the `tokenId` that a plain login ends with (default: `fake-token`).
 * FAKE_AM_SESSION_TTL_SECONDS=<n> gives the session of a plain login a lifetime
 * of n seconds from the lookup (default: it expires in 2099).
 * The logout call (`POST .../sessions?_action=logout`) is answered like AM
 * answers it; every request is recorded, so a test counts the logouts in the
 * request log. FAKE_AM_LOGOUT=refuse makes AM refuse it (`400`), and
 * FAKE_AM_LOGOUT=hang makes it never answer.
 * FAKE_AM_LOGIN=refuse makes AM refuse the credentials of every login: the
 * authenticate call that carries callbacks is answered `401 Login failure`, as
 * AM answers a wrong password. A login is one authenticate call without
 * callbacks (it starts the journey), so a test counts the logins in the
 * request log by counting those.
 * FAKE_AM_LOGIN_DELAY_MS=<n> holds every authenticate answer for n ms, so a
 * terminal test can see what the CLI shows while a login is running.
 * FAKE_AM_FAIL_REQUESTS='[{"method":"GET","path":"/realm-config/authentication"}]'
 * makes every request with that method whose URL contains that path answer
 * `500` with the message `fake tenant operation failed`. It is checked before
 * every other route, after the request was recorded, so a test sees the failing
 * request in the request log and the CLI sees a failed operation behind a login
 * that worked. An entry that has `"echo": {"text": "...@PADDING@...", "padding": 70000}`
 * answers with a `detail.echo` of that text, `@PADDING@` replaced by that many `x`
 * (the answer of a tenant that echoes what it was sent; it is too long for the
 * environment, so the fake writes it).
 * An entry that has `"nth": 2` fails only the second request that matches it (the first and the third
 * and every later one are answered as if the entry were not there): a test that needs the second
 * write of a run to be refused and the others to go through. Without `nth` every matching request fails.
 * FAKE_AM_FEATURES_FILE=<path> names a JSON array of IDM tenant-configuration features
 * (`_id`, `installedVersion`, `availableVersions`, and `validate`, the body the validate
 * action answers with: default `{ status: 200, success: true, message: 'Validate
 * complete.', failures: [] }`) the fake serves as the feature registry of a Cloud tenant
 * (`GET /openidm/feature`, `GET /openidm/feature/<id>` and `POST ...?_action=validate`;
 * an id that is not listed answers `404`; the install action is not served). Without it
 * the registry answers 404.
 * FAKE_AM_IDM_CONFIG_FILE=<path> names a JSON object `{ managed, "repo.ds" }` the fake
 * serves as `GET /openidm/config/managed` and `GET /openidm/config/repo.ds`. Only reads
 * are answered: a write to them is answered `500`, so a test that must not change the
 * tenant sees it in the request log.
 * FAKE_AM_IDM_ENTITIES_FILE=<path> names a JSON object `{ "<config id>": { ...the object IDM serves } }`
 * (for example `sync` or `provisioner.openicf/xyz`) the fake serves as `GET /openidm/config/<id>`
 * and takes `PUT /openidm/config/<id>` for: the body replaces the entity (with `_id` taken
 * from the URL, as IDM does) and is answered with `200`. The request log holds the body of
 * every write. An id that is not in the object answers `404`; `managed` and `repo.ds` stay
 * with FAKE_AM_IDM_CONFIG_FILE above when that one is given. The same objects are listed as IDM
 * lists configuration: `GET /openidm/config?_queryFilter=true` answers all of them, and
 * `?_queryFilter=_id sw '<prefix>'` those whose id starts with the prefix (a string prefix, as
 * in IDM: `mapping` also finds `mappingFoo`; the match is case sensitive, which is the fake's
 * choice and was not checked against IDM), in the order the fake holds them, as IDM answers a
 * configuration list: `{ result, resultCount, pagedResultsCookie: null,
 * totalPagedResultsPolicy: 'EXACT', totalPagedResults: <the count>, remainingPagedResults: -1 }`.
 * `_fields=<name,name>` reduces each object to its `_id` and the top-level fields named (a
 * field that the object does not have is not made up); `_fields=*` and JSON pointers such as
 * `a/b` are NOT honoured and select nothing. An object that was written with a `PUT` is listed
 * and one that was deleted is not. Any other filter answers `400` with a message, because an
 * empty list would read as "nothing is there"; a paging or sorting parameter that the fake does
 * not know is ignored silently (what IDM does with it was not checked). `DELETE
 * /openidm/config/<id>` removes the object and answers it with `200`, as IDM does, and `404` for an
 * id that is not there. Only `GET` lists and only `DELETE` deletes: any other method is answered
 * as it was before. A request for which a test needs a failure is answered by FAKE_AM_FAIL_REQUESTS
 * above: `{ "method": "DELETE", "path": "/openidm/config/provisioner.openicf/zion" }` fails that one
 * delete and no other (the path is a fragment, so give the whole id). The list answers only
 * when this file is given; the request without a `_queryFilter` is answered as it was before.
 * FAKE_AM_MANAGED_OBJECTS_FILE=<path> names a JSON object `{ "<managed type name>": [objects] }`
 * (for example `alpha_application`, the application records of realm alpha) the fake serves as
 * `GET /openidm/managed/<type>?_queryFilter=true`: `_pageSize=<n>` (a positive number; without it
 * all objects) with `_pagedResultsCookie` (the offset of the next page as a string, `null` in the
 * answer of the last page; the cookie of IDM is opaque), and `_fields=<name,name>`, which reduces
 * each object to its `_id`, its `_rev` and the top-level fields named (a field that the object
 * does not have is not made up; `_fields=*` and JSON pointers are NOT honoured). Every object is
 * answered with a `_rev`, as IDM does: the one it holds, else a hash of its content. The totals
 * are `NONE`, `-1` and `-1`, as recorded for a managed list. Any other filter, or a page size or
 * cookie that is not a number the fake understands, answers `400`; a paging or sorting parameter
 * that the fake does not know is ignored silently. The objects are read only: one object of the
 * type (`.../<type>/<id>`) and every write are not served, and a type that the object does not
 * hold is answered by the routes that follow (the users of FAKE_AM_USERS_FILE, then `404`).
 * FAKE_AM_IDM_SCHEMA_PROPERTIES_FILE=<path> names a JSON object `{ "<managed type>": { "<property>": { ...the definition } } }`
 * (the relationship properties that the IDM v2 schema API holds; `{}` is a tenant that holds none) the fake serves as
 * `GET /openidm/schema/managed/<type>/properties/<property>` (the definition, `404` for a property it does not hold) and
 * takes `PUT` for: the body replaces the definition of that property, whatever it holds (a type and a property that are
 * not in the object are created), and is answered with `200` and the body. The query is ignored (`waitForCompletion`).
 * The route is the v2 API of IDM 7.5 or later: a request without the header `accept-api-version: resource=2.0` is
 * answered `400`, so a test that sees a write succeed has seen the header. The request log holds the body of every write.
 * Without the option every request for this route answers `404`, as an IDM below 7.5 does, which is how a test sees a
 * tenant without the endpoint. A write that must fail is made to fail by FAKE_AM_FAIL_REQUESTS: `{ "method": "PUT",
 * "path": "/properties/<property>" }` fails that one property and no other. The managed configuration itself is served,
 * stored and changed by FAKE_AM_IDM_ENTITIES_FILE above (`managed`, and `repo.ds` for a pull).
 * FAKE_AM_DIRECT_CONFIGURATION_FILE=<path> names a JSON object `{ apply?, states? }` that makes the
 * fake serve the direct configuration session of a Cloud tenant, and the list of service account
 * scopes that a service account login reads (`GET /environment/scopes/service-accounts`, which
 * names the scopes of the session API). `PUT /environment/direct-configuration/session/init`
 * answers `{ editable: true }` and `.../abort` answers `{ editable: false }`; `.../apply` answers
 * `apply` (default `{ editable: false }`, as the real tenant does); `GET .../state` answers the next
 * entry of `states` (default `[{ editable: false }]`) and then the last one again, so a test scripts
 * the statuses a wait polls through. The request log holds every call. Without the option the whole
 * session API answers 404.
 * FAKE_AM_PROMOTION_FILE=<path> names a JSON object that makes the fake serve the environment promotion API of
 * a Cloud tenant (`/environment/promotion/...`, and the service account scopes that a service account login
 * reads) as a small state machine: the lock (`GET .../lock/state`, `POST .../lock`, `DELETE .../lock/<id>`), the
 * promotion status (`GET .../promote`) and the requests that start work (`POST .../promote`, `POST .../rollback`).
 * A lock request takes the lock at once and answers `locking`, so the first read of the state says `locked`
 * (`lockPolls: n` makes the next n reads say `locking` first); an unlock request frees it at once and answers
 * `unlocking`, so the first read says `unlocked` (`unlockPolls: n` makes the next n reads say `unlocking` first).
 * Without those two members there is no waiting in the fake, and a command that waits for either goes round no
 * sleeping loop: the library sleeps 10 seconds between two polls, so a test that sets them waits for real. What is
 * taken from the recordings of the platform: the paths, the status codes (202), the answers `locking`, `locked`,
 * `unlocking` and `unlocked`, and the shapes of the status. What is INVENTED, so that nobody reads it as a fact
 * about the platform: the `409` for a second lock request (and a lock request that conflicts: `lockRequest:
 * 'conflict'`, below), the `409` for an unlock with the id of another lock, and that every read answers
 * the state of the moment (the platform may answer a state read differently while it works). An unlock request
 * for any other id than the one of the lock is answered `409` and changes nothing. The object has these members,
 * all optional:
 * `lock` (the state before the first request: `{ result, promotionId }`, default `{ result: 'unlocked' }`),
 * `lockId` (the id that a lock request gets), `lockRequest` (`refuse` answers it `500` and takes no lock,
 * `refuse-but-lock` answers `500` and takes the lock, `conflict` answers `409` and leaves the lock of somebody
 * else, `foreignLockId`, held), `onLockRead` (`{ "<n>": { result, promotionId } }`: the lock becomes that just
 * before the n-th state read is answered, which is somebody else locking between two reads of one command),
 * `unlockRequest` (`refuse` answers `500` and keeps the lock), `status` (the status that the reads answer before
 * any promote or rollback request, default `READY`; an array answers one entry per read, the last one again) and
 * `promote` and `rollback`: one entry per request of that kind, in order (a request with no entry left is
 * answered `409`). An entry is `{ request: 'refuse' }` (answered `500`, no work starts) or `{ statuses: [...] }`:
 * the statuses that the reads after the request answer one after the other, the last one again after that. A
 * status is the object of the platform with the members the script leaves out filled in (`globalLock`,
 * `promotionId` = the id of the lock, `type`, `timeStamp`, `blockingError`). The request log holds every call and
 * its body. Without the option the whole API answers 404.
 * FAKE_AM_EMPTY_COLLECTIONS=1 makes the fake answer every collection query it has no
 * route for as an empty collection, the way a realm that holds nothing answers it: a
 * `GET` with a `_queryFilter` and a `POST` with `_action=nextdescendents` get `200`
 * with an empty `result`. It is checked last, so every route above still wins. A
 * command that reads many kinds of configuration (`config export`) then runs through
 * on an empty tenant without a route for each kind; the request log shows what it asked for.
 * FAKE_AM_LOG_API_KEYS_FILE=<path> names a JSON array of log API keys
 * (`api_key_id`, `name`) the fake serves as the log API key list (`GET /keys`)
 * and one key (`GET /keys/<id>`), and it makes the fake answer the OAuth2
 * authorize and access token calls a cloud login with a user name and password
 * makes.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';

const recordPath = process.env.FAKE_AM_RECORD;
// A plain login's session lasts until 2099 unless FAKE_AM_SESSION_TTL_SECONDS
// gives it a lifetime from the moment it is looked up. A test that keeps a
// process running (and so a token refresh timer) needs a realistic expiry:
// Node cannot wait for a timer that is more than about 24 days away.
const sessionTtlSeconds = Number(process.env.FAKE_AM_SESSION_TTL_SECONDS);
const sessionExpiry = () =>
  sessionTtlSeconds > 0
    ? new Date(Date.now() + sessionTtlSeconds * 1000).toISOString()
    : '2099-01-01T00:00:00Z';
const plainLogin = process.env.FAKE_AM_JOURNEY === 'password';
const loginRefused = process.env.FAKE_AM_LOGIN === 'refuse';
const loginDelayMs = Number(process.env.FAKE_AM_LOGIN_DELAY_MS) || 0;
const serviceAccountLogin = process.env.FAKE_AM_JOURNEY === 'service-account';
const realms = (process.env.FAKE_AM_REALMS ?? '').split(',').filter(Boolean);
const readJson = (file) =>
  file ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
const issuer = readJson(process.env.FAKE_AM_ISSUER_FILE);
const users = readJson(process.env.FAKE_AM_USERS_FILE);
const trustedIssuers = readJson(process.env.FAKE_AM_TRUSTED_ISSUERS_FILE)?.map(
  (issuer) => ({ ...issuer })
);
const aiAgents = readJson(process.env.FAKE_AM_AI_AGENTS_FILE)?.map((agent) => ({
  ...agent,
}));
const features = readJson(process.env.FAKE_AM_FEATURES_FILE);
const idmConfig = readJson(process.env.FAKE_AM_IDM_CONFIG_FILE);
const idmEntities = readJson(process.env.FAKE_AM_IDM_ENTITIES_FILE);
const idmSchemaProperties = readJson(
  process.env.FAKE_AM_IDM_SCHEMA_PROPERTIES_FILE
);
const managedObjects = readJson(process.env.FAKE_AM_MANAGED_OBJECTS_FILE);
const failRequests = JSON.parse(process.env.FAKE_AM_FAIL_REQUESTS ?? '[]');
const directConfiguration = readJson(
  process.env.FAKE_AM_DIRECT_CONFIGURATION_FILE
);
// how many state reads the fake has answered, which picks the next scripted answer
let directConfigurationStateReads = 0;
const promotionScript = readJson(process.env.FAKE_AM_PROMOTION_FILE);
// what the promotion API holds: the lock, the scripted requests still to come and the work that runs
const promotion = promotionScript && {
  lock: { result: 'unlocked', ...promotionScript.lock },
  runs: {
    promote: [...(promotionScript.promote ?? [])],
    rollback: [...(promotionScript.rollback ?? [])],
  },
  current: undefined,
  lockReads: 0,
  statusReads: 0,
  lockPollsLeft: 0,
  unlockPollsLeft: 0,
};
const emptyCollections = process.env.FAKE_AM_EMPTY_COLLECTIONS === '1';
const logApiKeys = readJson(process.env.FAKE_AM_LOG_API_KEYS_FILE);
const oauth2Clients = (process.env.FAKE_AM_OAUTH2_CLIENTS ?? '')
  .split(',')
  .filter(Boolean);
const cimdProfileIds = process.env.FAKE_AM_OAUTH_CIMD_PROFILES;
const cimdProfiles = new Map();
for (const _id of (cimdProfileIds ?? '').split(',').filter(Boolean)) {
  cimdProfiles.set(_id.toLowerCase(), {
    _id,
    _rev: '-1',
    _type: { _id: 'CIMDProfile', name: 'CIMD Profile', collection: true },
    cimdConfig: {
      cimdClientIdUrlPatterns: [`https://${_id}.example.com/*`],
      cimdSsrfProtectionEnabled: true,
    },
  });
}
const trustedJwtIssuerIds = process.env.FAKE_AM_OAUTH_ISSUERS;
const trustedJwtIssuers = new Map();
for (const _id of (trustedJwtIssuerIds ?? '').split(',').filter(Boolean)) {
  trustedJwtIssuers.set(_id, {
    _id,
    _rev: '-1',
    _type: {
      _id: 'TrustedJwtIssuer',
      name: 'OAuth2 Trusted JWT Issuer',
      collection: true,
    },
    issuer: `https://${_id}.example.com`,
    allowedSubjects: [],
    consentedScopesClaim: 'scope',
  });
}
// the read of one object wraps every property, as AM does
const wrapJwtIssuer = (object) =>
  Object.fromEntries(
    Object.entries(object).map(([key, value]) =>
      key.startsWith('_') ||
      (value && typeof value === 'object' && 'inherited' in value)
        ? [key, value]
        : [key, { inherited: false, value }]
    )
  );
const scripts = (process.env.FAKE_AM_SCRIPTS ?? '').split(',').filter(Boolean);
const idList = (value) =>
  value === undefined ? undefined : value.split(',').filter(Boolean);
const secrets = idList(process.env.FAKE_AM_SECRETS);
const services = idList(process.env.FAKE_AM_SERVICES);
// the stateful store of the services of each realm (FAKE_AM_SERVICES_FILE): a delete changes it
const realmServices = readJson(process.env.FAKE_AM_SERVICES_FILE);
const serviceAccounts = idList(process.env.FAKE_AM_SERVICE_ACCOUNTS);
const secretStores = readJson(process.env.FAKE_AM_SECRET_STORES_FILE);
const agentTypes = idList(process.env.FAKE_AM_AGENT_TYPES);
// the profiles of FAKE_AM_CIMD_PROFILES_FILE (a list that the `oauth cimd` tests
// read, store and delete); FAKE_AM_OAUTH_CIMD_PROFILES keeps its own map above
const cimdProfileList = readJson(process.env.FAKE_AM_CIMD_PROFILES_FILE);
const cimdRootDenied = process.env.FAKE_AM_CIMD_ROOT_DENIED === '1';
const cimdCompleteOnCreate =
  process.env.FAKE_AM_CIMD_COMPLETE_ON_CREATE === '1';
// the top-level attributes of an OAuth2 trusted JWT issuer that AM accepts (it lists them in the
// detail of the 400 that it answers for any other); _id and _type are not among them
const TRUSTED_JWT_ISSUER_ATTRIBUTES = [
  'agentgroup',
  'allowedSubjects',
  'consentedScopesClaim',
  'issuer',
  'jwkSet',
  'jwkStoreCacheMissCacheTime',
  'jwksCacheTimeout',
  'jwksUri',
  'resourceOwnerIdentityClaim',
];

const CLOUD_NOT_AVAILABLE = {
  code: 403,
  reason: 'Forbidden',
  message:
    'This operation is not available in PingOne Advanced Identity Cloud.',
};

/** A property that is wrapped already (a file that a pull wrote and a push sent back stays as it is). */
function isWrappedMember(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'inherited' in value
  );
}

/** The CIMD profile the way a read by id answers it: the members of the groups wrapped. */
function wrapCimdProfile(profile) {
  const wrapped = {};
  for (const [key, value] of Object.entries(profile)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      key.endsWith('Config') &&
      key !== 'overrideOAuth2ClientConfig'
    ) {
      wrapped[key] = Object.fromEntries(
        Object.entries(value).map(([member, memberValue]) => [
          member,
          memberValue === null
            ? { inherited: false }
            : isWrappedMember(memberValue)
              ? memberValue
              : { inherited: false, value: memberValue },
        ])
      );
    } else {
      wrapped[key] = value;
    }
  }
  return wrapped;
}
const journeys = (() => {
  const wanted = readJson(process.env.FAKE_AM_JOURNEYS_FILE);
  return wanted
    ? new Map(Object.entries(wanted).map(([id, nodes]) => [id, { ...nodes }]))
    : undefined;
})();
const orphanNodes = (() => {
  const wanted = readJson(process.env.FAKE_AM_NODES_FILE);
  return wanted ? new Map(Object.entries(wanted)) : undefined;
})();
const samlProviders = (() => {
  const wanted = readJson(process.env.FAKE_AM_SAML_FILE);
  return wanted
    ? new Map(
        wanted.map(({ location, entityId, config }) => {
          const id64 = Buffer.from(entityId).toString('base64url');
          return [id64, { id64, location, entityId, config, revision: 1 }];
        })
      )
    : undefined;
})();
const accessToken =
  process.env.FAKE_AM_ACCESS_TOKEN ?? 'fake-service-account-token';
const sessionToken = process.env.FAKE_AM_SESSION_TOKEN ?? 'fake-token';
let cimdRevision = 0;
const trees =
  process.env.FAKE_AM_TREES === undefined
    ? undefined
    : process.env.FAKE_AM_TREES.split(',').filter(Boolean);

/** An issuer as a read by id answers it: every setting wrapped, `value` missing when it is not set. */
function wrapIssuer(issuer) {
  return Object.fromEntries(
    Object.entries(issuer).map(([key, value]) => [
      key,
      key.startsWith('_') || key === 'agentgroup'
        ? value
        : value === null || value === undefined
          ? { inherited: false }
          : { inherited: false, value },
    ])
  );
}

/** The issuer a request body holds, with its wrapped settings made plain again. */
function plainIssuer(id, body) {
  return {
    ...Object.fromEntries(
      Object.entries(body).map(([key, value]) => [
        key,
        value && typeof value === 'object' && 'inherited' in value
          ? (value.value ?? null)
          : value,
      ])
    ),
    _id: id,
  };
}

/** The users an IDM or AM `_queryFilter` of the shapes above selects. */
function selectUsers(filter) {
  if (filter === 'true') return users;
  const terms = [...filter.matchAll(/(\w+) (sw|co|eq) "((?:[^"\\]|\\.)*)"/g)];
  return users.filter((user) =>
    terms.some(([, field, operator, quoted]) => {
      const wanted = quoted.replace(/\\(.)/g, '$1').toLowerCase();
      const have = String(
        field === 'uid'
          ? user.userName
          : field === 'cn'
            ? `${user.givenName} ${user.sn}`
            : (user[field] ?? '')
      ).toLowerCase();
      if (operator === 'co') return have.includes(wanted);
      return operator === 'eq' ? have === wanted : have.startsWith(wanted);
    })
  );
}
/**
 * Answers a request for the AM services of a realm or the global ones (`.../services...`) from
 * the store of FAKE_AM_SERVICES_FILE, or returns false when the request is not one or there is no
 * such store. `send(status, payload)` writes the answer.
 */
function serveRealmServices(req, send) {
  if (!realmServices) return false;
  const [path, query = ''] = req.url.split('?');
  const route = path.match(
    /\/json\/(global-config|realms\/root(?:\/realms\/[^/]+)*\/realm-config)\/services(?:\/(.*))?$/
  );
  if (!route) return false;
  const notFound = () =>
    send(404, { code: 404, reason: 'Not Found', message: 'Not Found' });
  const page = (result) => ({
    result,
    resultCount: result.length,
    pagedResultsCookie: null,
    totalPagedResultsPolicy: 'NONE',
    totalPagedResults: -1,
    remainingPagedResults: -1,
  });
  const names = [...route[1].matchAll(/\/realms\/([^/]+)/g)].map(
    ([, name]) => name
  );
  const realm = names.length > 0 ? names.join('/') : '/';
  const list =
    route[1] === 'global-config'
      ? realmServices.global
      : realmServices.realms?.[realm];
  if (!list) {
    notFound();
    return true;
  }
  const decode = (text) => {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  };
  const nextDescendents = query.includes('_action=nextdescendents');
  // an id with a slash in it (a tenant may list one) is the service that the whole rest of the path names
  const whole = list.find(({ _id }) => _id === decode(route[2] ?? ''));
  const [rawId, ...splitTail] = (route[2] ?? '').split('/');
  const tail = whole ? [] : splitTail;
  const service = whole ?? list.find(({ _id }) => _id === decode(rawId));
  if (route[2] === undefined) {
    if (req.method !== 'POST' || !nextDescendents) return false;
    send(
      200,
      page(
        list.map(({ _id }) => ({
          _id,
          name: _id,
          _type: { _id, name: _id, collection: true },
        }))
      )
    );
    return true;
  }
  if (tail.length === 0 && req.method === 'GET') {
    if (!service) {
      notFound();
    } else {
      send(200, {
        _id: '',
        _rev: '1',
        _type: { _id: service._id, name: service._id, collection: true },
      });
    }
    return true;
  }
  if (tail.length === 0 && req.method === 'POST' && nextDescendents) {
    if (!service) {
      notFound();
    } else if ((realmServices.unavailable ?? []).includes(service._id)) {
      send(403, CLOUD_NOT_AVAILABLE);
    } else {
      send(200, page(service.nextDescendents ?? []));
    }
    return true;
  }
  if (req.method !== 'DELETE') return false;
  if (!service) {
    notFound();
    return true;
  }
  if (tail.length === 0) {
    // the service goes with the next descendents it still has
    list.splice(list.indexOf(service), 1);
    send(200, { _id: service._id });
    return true;
  }
  const descendents = service.nextDescendents ?? [];
  const type = decode(tail[0]);
  const descendentId = decode(tail.slice(1).join('/'));
  const index = descendents.findIndex(
    (descendent) =>
      descendent._id === descendentId && descendent._type?._id === type
  );
  if (index < 0) {
    notFound();
  } else {
    descendents.splice(index, 1);
    send(200, {});
  }
  return true;
}
/**
 * Answers a request for the AI agent collection (`.../realm-config/agents/AIAgent`
 * and `.../AIAgent/<id>`) from `aiAgents`, or returns false when the request is not
 * one. `send(status, payload)` writes the answer.
 */
function serveAiAgents(req, body, send) {
  const route = req.url
    .split('?')[0]
    .match(/\/realm-config\/agents\/AIAgent(?:\/([^/]+))?$/);
  if (!aiAgents || !route) return false;
  const notFound = { code: 404, reason: 'Not Found', message: 'Not Found' };
  const id = route[1] && decodeURIComponent(route[1]);
  const index = aiAgents.findIndex(({ _id }) => _id === id);
  if (!id && req.method === 'GET') {
    // `_queryFilter=true` selects every agent, `_id eq '<id>'` the one with that id
    const filter = new URL(req.url, 'http://fake').searchParams.get(
      '_queryFilter'
    );
    const byId = filter?.match(/^_id eq '(.*)'$/);
    const result = byId
      ? aiAgents.filter(({ _id }) => _id === byId[1])
      : aiAgents;
    send(200, {
      result,
      resultCount: result.length,
      pagedResultsCookie: null,
      totalPagedResultsPolicy: 'EXACT',
      totalPagedResults: result.length,
      remainingPagedResults: -1,
    });
  } else if (id && req.method === 'GET') {
    send(index < 0 ? 404 : 200, index < 0 ? notFound : aiAgents[index]);
  } else if (id && req.method === 'PUT') {
    const stored = { ...(body ? JSON.parse(body) : {}), _id: id, _rev: '1' };
    if (index < 0) aiAgents.push(stored);
    else aiAgents[index] = stored;
    send(index < 0 ? 201 : 200, stored);
  } else if (id && req.method === 'DELETE') {
    if (index < 0) send(404, notFound);
    else send(200, aiAgents.splice(index, 1)[0]);
  } else {
    return false;
  }
  return true;
}
const LOCK_DESCRIPTIONS = {
  unlocked: 'Environment unlocked',
  locking: 'Environment lock in progress',
  locked: 'Environment locked',
  unlocking: 'Environment unlock in progress',
  error: 'Environment lock error',
};

/** The lock the way the lock state read answers it. */
function promotionLockState() {
  const { result, promotionId } = promotion.lock;
  const environment = {
    ...(promotionId ? { promotionId } : {}),
    proxyState: result === 'unlocked' ? 'unlocked' : 'locked',
    state: result,
  };
  return {
    description: LOCK_DESCRIPTIONS[result] ?? result,
    lowerEnv: environment,
    ...(promotionId ? { promotionId } : {}),
    result,
    upperEnv: environment,
  };
}

/** The promotion status the way a read answers it, the script's members over the filled-in ones. */
function promotionStatus(scripted, type) {
  const { result, promotionId } = promotion.lock;
  return {
    blockingError: false,
    globalLock: result === 'unlocked' ? 'UNLOCKED' : 'LOCKED',
    ...(promotionId ? { promotionId } : {}),
    timeStamp: new Date().toISOString(),
    type,
    ...scripted,
  };
}

/**
 * Answers a request for the environment promotion API (`/environment/promotion/...`,
 * and the service account scopes) from `promotion`, or returns false when the
 * request is not one. `send(status, payload)` writes the answer.
 */
function servePromotion(req, body, send) {
  if (!promotion) return false;
  const { pathname } = new URL(req.url, 'http://fake');
  const failed = {
    code: 500,
    reason: 'Internal Server Error',
    message: 'fake tenant operation failed',
  };
  if (
    req.method === 'GET' &&
    pathname === '/environment/scopes/service-accounts'
  ) {
    send(200, [
      {
        scope: 'fr:idc:promotion:*',
        description: 'All promotion APIs',
        childScopes: [
          { scope: 'fr:idc:promotion:read', description: 'Read promotions' },
        ],
      },
    ]);
    return true;
  }
  const base = '/environment/promotion/';
  if (!pathname.startsWith(base)) return false;
  const route = pathname.slice(base.length);
  if (req.method === 'GET' && route === 'lock/state') {
    promotion.lockReads += 1;
    const hook = promotionScript.onLockRead?.[String(promotion.lockReads)];
    if (hook) promotion.lock = { ...hook };
    const stored = promotion.lock;
    if (promotion.lockPollsLeft > 0) {
      promotion.lockPollsLeft -= 1;
      promotion.lock = { result: 'locking', promotionId: stored.promotionId };
    } else if (promotion.unlockPollsLeft > 0) {
      promotion.unlockPollsLeft -= 1;
      promotion.lock = {
        result: 'unlocking',
        promotionId: promotion.unlockingId,
      };
    }
    const answer = promotionLockState();
    promotion.lock = stored;
    send(200, answer);
  } else if (req.method === 'POST' && route === 'lock') {
    const refuse = promotionScript.lockRequest;
    if (promotion.lock.result !== 'unlocked') {
      send(409, {
        code: 409,
        reason: 'Conflict',
        message: 'The environment is already locked.',
      });
    } else if (refuse === 'refuse') {
      send(500, failed);
    } else if (refuse === 'conflict') {
      promotion.lock = {
        result: 'locked',
        promotionId: promotionScript.foreignLockId ?? 'fake-foreign-lock',
      };
      send(409, {
        code: 409,
        reason: 'Conflict',
        message: 'The environment is already locked.',
      });
    } else {
      const promotionId = promotionScript.lockId ?? 'fake-promotion-lock';
      promotion.lock = { result: 'locked', promotionId };
      promotion.lockPollsLeft = promotionScript.lockPolls ?? 0;
      if (refuse === 'refuse-but-lock') send(500, failed);
      else
        send(202, {
          description: LOCK_DESCRIPTIONS.locking,
          promotionId,
          result: 'locking',
        });
    }
  } else if (req.method === 'DELETE' && route.startsWith('lock/')) {
    const promotionId = decodeURIComponent(route.slice('lock/'.length));
    if (promotionScript.unlockRequest === 'refuse') {
      send(500, failed);
    } else if (promotion.lock.promotionId !== promotionId) {
      send(409, {
        code: 409,
        reason: 'Conflict',
        message: 'The promotion id does not match the lock.',
      });
    } else {
      promotion.lock = { result: 'unlocked' };
      promotion.unlockPollsLeft = promotionScript.unlockPolls ?? 0;
      promotion.unlockingId = promotionId;
      send(202, {
        description: LOCK_DESCRIPTIONS.unlocking,
        promotionId,
        result: 'unlocking',
      });
    }
  } else if (req.method === 'GET' && route === 'promote') {
    const { current } = promotion;
    if (!current) {
      const before = promotionScript.status ?? {
        status: 'READY',
        message: 'Environment ready for promotion',
      };
      const answer = Array.isArray(before)
        ? before[Math.min(promotion.statusReads, before.length - 1)]
        : before;
      promotion.statusReads += 1;
      send(200, promotionStatus(answer, 'promotion'));
    } else {
      const answer =
        current.statuses[Math.min(current.reads, current.statuses.length - 1)];
      current.reads += 1;
      send(200, promotionStatus(answer, current.type));
    }
  } else if (
    req.method === 'POST' &&
    (route === 'promote' || route === 'rollback')
  ) {
    const run = promotion.runs[route].shift();
    if (!run) {
      send(409, {
        code: 409,
        reason: 'Conflict',
        message: 'The fake tenant has no scripted run left for this request.',
      });
    } else if (run.request === 'refuse') {
      send(500, failed);
    } else {
      promotion.current = {
        type: route === 'rollback' ? 'rollback' : 'promotion',
        statuses: run.statuses ?? [
          { status: 'READY', message: 'Promotion completed' },
        ],
        reads: 0,
      };
      send(202, {
        result:
          route === 'rollback'
            ? 'Rollback process initiated successfully'
            : 'Promotion process initiated successfully',
      });
    }
  } else {
    return false;
  }
  return true;
}

/**
 * The object reduced to what a `_fields` parameter asks for: its `_id`, the members named in `keep`
 * and the top-level fields named in the parameter (`*` and JSON pointers select nothing); a field
 * that the object does not have is not made up. Without `_fields` the object as it is.
 */
function selectFields(object, fieldsParameter, keep = []) {
  const fields = (fieldsParameter ?? '').split(',').filter(Boolean);
  if (fields.length === 0) return object;
  return Object.fromEntries(
    [...new Set(['_id', ...keep, ...fields])]
      .filter((name) => Object.hasOwn(object, name))
      .map((name) => [name, object[name]])
  );
}

/**
 * Answers the list of the IDM configuration objects (`GET /openidm/config?_queryFilter=...`) from
 * `idmEntities`, or returns false when the request is not one or there is no such store.
 * `send(status, payload)` writes the answer.
 */
function serveIdmConfigList(req, send) {
  const { pathname, searchParams } = new URL(req.url, 'http://fake');
  if (
    !idmEntities ||
    req.method !== 'GET' ||
    pathname !== '/openidm/config' ||
    !searchParams.has('_queryFilter')
  ) {
    return false;
  }
  const filter = searchParams.get('_queryFilter');
  // `true` selects every object, `_id sw '<prefix>'` the ones whose id starts with the prefix
  const prefix =
    filter === 'true' ? '' : filter.match(/^_id sw '([^']*)'$/)?.[1];
  if (prefix === undefined) {
    send(400, {
      code: 400,
      reason: 'Bad Request',
      message: `the fake tenant lists configuration objects by the filter true or _id sw '<prefix>' only, not: ${filter}`,
    });
    return true;
  }
  const result = Object.entries(idmEntities)
    .filter(([id]) => id.startsWith(prefix))
    .map(([id, entity]) =>
      selectFields({ _id: id, ...entity }, searchParams.get('_fields'))
    );
  send(200, {
    result,
    resultCount: result.length,
    pagedResultsCookie: null,
    totalPagedResultsPolicy: 'EXACT',
    totalPagedResults: result.length,
    remainingPagedResults: -1,
  });
  return true;
}

/**
 * Answers the relationship schema property of a managed type (`GET` and `PUT
 * /openidm/schema/managed/<type>/properties/<property>`) from `idmSchemaProperties`, or returns false
 * when the request is not one, the method is neither, or there is no such store. `send(status,
 * payload)` writes the answer.
 */
function serveIdmSchemaProperty(req, body, send) {
  const { pathname } = new URL(req.url, 'http://fake');
  const route = pathname.match(
    /\/openidm\/schema\/managed\/([^/]+)\/properties\/([^/]+)$/
  );
  if (!idmSchemaProperties || !route || !['GET', 'PUT'].includes(req.method)) {
    return false;
  }
  const type = decodeURIComponent(route[1]);
  const property = decodeURIComponent(route[2]);
  if (req.headers['accept-api-version'] !== 'resource=2.0') {
    send(400, {
      code: 400,
      reason: 'Bad Request',
      message: 'the fake tenant serves the schema API of version 2.0 only',
    });
    return true;
  }
  if (req.method === 'PUT') {
    (idmSchemaProperties[type] ??= {})[property] = body ? JSON.parse(body) : {};
  }
  const held = idmSchemaProperties[type]?.[property];
  if (held === undefined) {
    send(404, { code: 404, reason: 'Not Found', message: 'Not Found' });
  } else {
    send(200, held);
  }
  return true;
}

/**
 * Answers the list of the managed objects of a type (`GET /openidm/managed/<type>?_queryFilter=true`)
 * from `managedObjects`, or returns false when the request is not one, the type is not held, or
 * there is no such store. `send(status, payload)` writes the answer.
 */
function serveManagedObjects(req, send) {
  const { pathname, searchParams } = new URL(req.url, 'http://fake');
  const type = pathname.match(/\/openidm\/managed\/([^/]+)$/)?.[1];
  if (
    !managedObjects ||
    req.method !== 'GET' ||
    !type ||
    !Object.hasOwn(managedObjects, type) ||
    !searchParams.has('_queryFilter')
  ) {
    return false;
  }
  const refuse = (message) =>
    send(400, { code: 400, reason: 'Bad Request', message });
  if (searchParams.get('_queryFilter') !== 'true') {
    refuse('the fake tenant lists managed objects by the filter true only');
    return true;
  }
  const pageSize = searchParams.get('_pageSize');
  if (pageSize !== null && !/^[1-9]\d*$/.test(pageSize)) {
    refuse('the fake tenant takes a _pageSize that is a positive number only');
    return true;
  }
  const cookie = searchParams.get('_pagedResultsCookie');
  if (cookie !== null && !/^\d+$/.test(cookie)) {
    refuse(
      'the fake tenant takes the _pagedResultsCookie it answered with only'
    );
    return true;
  }
  const objects = managedObjects[type];
  const offset = cookie === null ? 0 : Number(cookie);
  const end = pageSize === null ? objects.length : offset + Number(pageSize);
  const result = objects.slice(offset, end).map((object) =>
    selectFields(
      {
        _id: object._id,
        _rev: createHash('sha1').update(JSON.stringify(object)).digest('hex'),
        ...object,
      },
      searchParams.get('_fields'),
      ['_rev']
    )
  );
  send(200, {
    result,
    resultCount: result.length,
    pagedResultsCookie: end < objects.length ? String(end) : null,
    totalPagedResultsPolicy: 'NONE',
    totalPagedResults: -1,
    remainingPagedResults: -1,
  });
  return true;
}
let step = 0;

const nameCallback = (prompt) => ({
  type: 'NameCallback',
  output: [{ name: 'prompt', value: prompt }],
  input: [{ name: 'IDToken1', value: '' }],
});
const passwordCallback = () => ({
  type: 'PasswordCallback',
  output: [{ name: 'prompt', value: 'Password' }],
  input: [{ name: 'IDToken2', value: '' }],
});

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    if (recordPath) {
      fs.appendFileSync(
        recordPath,
        JSON.stringify({ method: req.method, url: req.url, body }) + '\n'
      );
    }
    const send = (status, payload) => {
      const answer = () => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (loginDelayMs > 0 && req.url.includes('/authenticate')) {
        setTimeout(answer, loginDelayMs);
      } else {
        answer();
      }
    };
    const failing = failRequests.find((entry) => {
      if (req.method !== entry.method || !req.url.includes(entry.path)) {
        return false;
      }
      if (entry.nth === undefined) return true;
      // the entry counts the requests that match it, and fails the n-th only
      entry.seen = (entry.seen ?? 0) + 1;
      return entry.seen === entry.nth;
    });
    if (failing) {
      return send(500, {
        code: 500,
        reason: 'Internal Server Error',
        message: 'fake tenant operation failed',
        ...(failing.echo
          ? {
              detail: {
                echo: failing.echo.text.replace(
                  '@PADDING@',
                  'x'.repeat(failing.echo.padding ?? 0)
                ),
              },
            }
          : {}),
      });
    }
    if (logApiKeys && req.method === 'GET' && req.url === '/keys') {
      return send(200, { result: logApiKeys });
    }
    if (logApiKeys && req.method === 'GET' && req.url.startsWith('/keys/')) {
      const key = logApiKeys.find(
        ({ api_key_id }) => req.url === `/keys/${api_key_id}`
      );
      return send(key ? 200 : 404, key ?? {});
    }
    if (logApiKeys && req.url.includes('/oauth2/authorize')) {
      res.writeHead(302, { location: '/?code=fake-auth-code' });
      return res.end();
    }
    if (
      (serviceAccountLogin || logApiKeys) &&
      req.url.includes('/access_token')
    ) {
      if (
        process.env.FAKE_AM_GRANT_ERROR &&
        !body.includes('client_id=service-account')
      ) {
        return send(400, {
          error: 'invalid_grant',
          error_description: process.env.FAKE_AM_GRANT_ERROR,
        });
      }
      return send(200, {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
      });
    }
    if (serveAiAgents(req, body, send)) return;
    if (serveRealmServices(req, send)) return;
    if (servePromotion(req, body, send)) return;
    if (directConfiguration) {
      const route = new URL(req.url, 'http://fake').pathname;
      const session = '/environment/direct-configuration/session/';
      if (
        req.method === 'GET' &&
        route === '/environment/scopes/service-accounts'
      ) {
        return send(200, [
          {
            scope: 'fr:idc:direct-configuration:session:*',
            description:
              'All Direct Configuration Control Session management APIs',
            childScopes: [
              {
                scope: 'fr:idc:direct-configuration:session:read',
                description: 'Read Direct Configuration Control Session state',
              },
            ],
          },
        ]);
      }
      if (req.method === 'PUT' && route === `${session}init`) {
        return send(200, { editable: true });
      }
      if (req.method === 'PUT' && route === `${session}apply`) {
        return send(200, directConfiguration.apply ?? { editable: false });
      }
      if (req.method === 'PUT' && route === `${session}abort`) {
        return send(200, { editable: false });
      }
      if (req.method === 'GET' && route === `${session}state`) {
        const states = directConfiguration.states ?? [{ editable: false }];
        const answer =
          states[Math.min(directConfigurationStateReads, states.length - 1)];
        directConfigurationStateReads += 1;
        return send(200, answer);
      }
    }
    const issuerRoute = req.url
      .split('?')[0]
      .match(/\/realm-config\/agents\/TrustedJwtIssuer(?:\/([^/]+))?$/);
    if (trustedIssuers && issuerRoute) {
      const notFound = { code: 404, reason: 'Not Found', message: 'Not Found' };
      const id = issuerRoute[1] && decodeURIComponent(issuerRoute[1]);
      const index = trustedIssuers.findIndex(({ _id }) => _id === id);
      if (!id && req.method === 'GET') {
        return send(200, {
          result: trustedIssuers,
          resultCount: trustedIssuers.length,
          pagedResultsCookie: null,
          totalPagedResultsPolicy: 'EXACT',
          totalPagedResults: trustedIssuers.length,
          remainingPagedResults: -1,
        });
      }
      if (id && req.method === 'GET') {
        return index < 0
          ? send(404, notFound)
          : send(200, wrapIssuer(trustedIssuers[index]));
      }
      if (id && req.method === 'PUT') {
        const posted = body ? JSON.parse(body) : {};
        if ('_rev' in posted) {
          return send(400, {
            code: 400,
            reason: 'Bad Request',
            message: 'Invalid attribute specified.',
            detail: { validAttributes: Object.keys(posted) },
          });
        }
        const stored = { ...plainIssuer(id, posted), _rev: '1' };
        if (index < 0) trustedIssuers.push(stored);
        else trustedIssuers[index] = stored;
        return send(index < 0 ? 201 : 200, wrapIssuer(stored));
      }
      if (id && req.method === 'DELETE') {
        if (index < 0) return send(404, notFound);
        const [removed] = trustedIssuers.splice(index, 1);
        return send(200, wrapIssuer(removed));
      }
    }
    if (issuer && req.url.includes('/realm-config/agents/TrustedJwtIssuer/')) {
      return send(200, {
        _id: decodeURIComponent(req.url.split('/TrustedJwtIssuer/')[1]).split(
          '?'
        )[0],
        issuer: issuer.issuer
          ? { inherited: false, value: issuer.issuer }
          : { inherited: false },
        allowedSubjects: { inherited: false, value: issuer.allowedSubjects },
      });
    }
    const pathname = new URL(req.url, 'http://fake').pathname;
    // the root realm of a Cloud tenant offers neither the type list nor the profiles
    const rootRealmOnly = /\/json\/realms\/root\/realm-config\//.test(pathname);
    if (
      agentTypes &&
      req.method === 'POST' &&
      pathname.endsWith('/realm-config/agents') &&
      new URL(req.url, 'http://fake').searchParams.get('_action') ===
        'getAllTypes'
    ) {
      if (cimdRootDenied && rootRealmOnly) {
        return send(403, CLOUD_NOT_AVAILABLE);
      }
      return send(200, {
        result: agentTypes.map((_id) => ({
          _id,
          name: `${_id} Agents`,
          collection: true,
        })),
        resultCount: agentTypes.length,
        pagedResultsCookie: null,
        totalPagedResultsPolicy: 'NONE',
        totalPagedResults: -1,
        remainingPagedResults: -1,
      });
    }
    if (
      cimdProfileList &&
      pathname.includes('/realm-config/agents/CIMDProfile')
    ) {
      if (cimdRootDenied && rootRealmOnly) {
        return send(403, CLOUD_NOT_AVAILABLE);
      }
      const notFound = { code: 404, reason: 'Not Found', message: 'Not Found' };
      const collection = pathname.endsWith('/agents/CIMDProfile');
      const wanted = collection
        ? undefined
        : decodeURIComponent(pathname.split('/agents/CIMDProfile/')[1] ?? '');
      const position = collection
        ? -1
        : cimdProfileList.findIndex(
            (profile) => profile._id.toLowerCase() === wanted.toLowerCase()
          );
      if (collection && req.method === 'GET') {
        return send(200, {
          result: cimdProfileList,
          resultCount: cimdProfileList.length,
          pagedResultsCookie: null,
          totalPagedResultsPolicy: 'EXACT',
          totalPagedResults: cimdProfileList.length,
          remainingPagedResults: -1,
        });
      }
      if (!collection && req.method === 'GET') {
        return position < 0
          ? send(404, notFound)
          : send(200, wrapCimdProfile(cimdProfileList[position]));
      }
      if (!collection && req.method === 'DELETE') {
        if (position < 0) return send(404, notFound);
        const [deleted] = cimdProfileList.splice(position, 1);
        return send(200, wrapCimdProfile(deleted));
      }
      if (!collection && req.method === 'PUT') {
        const posted = body ? JSON.parse(body) : {};
        if ('_rev' in posted) {
          return send(400, {
            code: 400,
            reason: 'Bad Request',
            message: 'Invalid attribute specified.',
          });
        }
        if (position >= 0 && req.headers['if-none-match'] === '*') {
          return send(412, {
            code: 412,
            reason: 'Precondition Failed',
            message: 'Precondition Failed',
          });
        }
        const stored = {
          _id: position >= 0 ? cimdProfileList[position]._id : wanted,
          _rev: String(++cimdRevision),
          ...Object.fromEntries(
            Object.entries(posted).filter(
              ([key]) => !['_id', '_rev', '_type'].includes(key)
            )
          ),
          _type: { _id: 'CIMDProfile', name: 'CIMD Profile', collection: true },
        };
        if (position < 0 && cimdCompleteOnCreate) {
          // the server fills in what a create left out
          stored.coreOAuth2ClientConfig = {
            status: 'Active',
            scopes: ['openid'],
            ...stored.coreOAuth2ClientConfig,
          };
          stored.overrideOAuth2ClientConfig = {
            issueRefreshToken: true,
            ...stored.overrideOAuth2ClientConfig,
          };
        }
        if (position >= 0) cimdProfileList[position] = stored;
        else cimdProfileList.push(stored);
        return send(position >= 0 ? 200 : 201, wrapCimdProfile(stored));
      }
    }
    if (
      oauth2Clients.length > 0 &&
      pathname.endsWith('/realm-config/agents/OAuth2Client')
    ) {
      return send(200, {
        result: oauth2Clients.map((_id) => ({ _id })),
        resultCount: oauth2Clients.length,
        pagedResultsCookie: null,
        totalPagedResultsPolicy: 'EXACT',
        totalPagedResults: oauth2Clients.length,
        remainingPagedResults: -1,
      });
    }
    if (cimdProfileIds !== undefined) {
      const query = new URL(req.url, 'http://fake').searchParams;
      if (
        req.method === 'POST' &&
        pathname.endsWith('/realm-config/agents') &&
        query.get('_action') === 'getAllTypes'
      ) {
        return send(200, {
          result: [
            { _id: 'CIMDProfile', name: 'CIMD Profile', collection: true },
          ],
        });
      }
      if (req.method === 'GET' && pathname.endsWith('/agents/CIMDProfile')) {
        return send(200, {
          result: [...cimdProfiles.values()],
          resultCount: cimdProfiles.size,
          pagedResultsCookie: null,
          totalPagedResultsPolicy: 'EXACT',
          totalPagedResults: cimdProfiles.size,
          remainingPagedResults: -1,
        });
      }
      const profilePath = pathname.split('/agents/CIMDProfile/');
      if (profilePath.length === 2) {
        const id = decodeURIComponent(profilePath[1]);
        const key = id.toLowerCase();
        if (req.method === 'PUT') {
          const posted = body ? JSON.parse(body) : {};
          if ('_rev' in posted) {
            return send(400, {
              code: 400,
              reason: 'Bad Request',
              message: 'Invalid attribute specified.',
            });
          }
          const created = !cimdProfiles.has(key);
          const stored = {
            // a created profile is completed with the server's defaults, an updated one is stored as sent
            ...(created
              ? { coreOAuth2ClientConfig: { redirectionUris: [] } }
              : {}),
            ...posted,
            _id: cimdProfiles.get(key)?._id ?? id,
            _rev: '-2',
            _type: {
              _id: 'CIMDProfile',
              name: 'CIMD Profile',
              collection: true,
            },
          };
          cimdProfiles.set(key, stored);
          return send(created ? 201 : 200, stored);
        }
        if (req.method === 'GET') {
          const stored = cimdProfiles.get(key);
          return stored
            ? send(200, wrapCimdProfile(stored))
            : send(404, {
                code: 404,
                reason: 'Not Found',
                message: 'Not Found',
              });
        }
        if (req.method === 'DELETE') {
          const stored = cimdProfiles.get(key);
          cimdProfiles.delete(key);
          return stored
            ? send(200, stored)
            : send(404, {
                code: 404,
                reason: 'Not Found',
                message: 'Not Found',
              });
        }
      }
    }
    if (trustedJwtIssuerIds !== undefined) {
      if (
        req.method === 'GET' &&
        pathname.endsWith('/agents/TrustedJwtIssuer')
      ) {
        return send(200, {
          result: [...trustedJwtIssuers.values()],
          resultCount: trustedJwtIssuers.size,
          pagedResultsCookie: null,
          totalPagedResultsPolicy: 'EXACT',
          totalPagedResults: trustedJwtIssuers.size,
          remainingPagedResults: -1,
        });
      }
      const issuerPath = pathname.split('/agents/TrustedJwtIssuer/');
      if (issuerPath.length === 2) {
        const id = decodeURIComponent(issuerPath[1]);
        const notFound = () =>
          send(404, { code: 404, reason: 'Not Found', message: 'Not Found' });
        if (req.method === 'GET') {
          const stored = trustedJwtIssuers.get(id);
          return stored ? send(200, wrapJwtIssuer(stored)) : notFound();
        }
        if (req.method === 'PUT') {
          const posted = body ? JSON.parse(body) : {};
          if ('_rev' in posted) {
            return send(400, {
              code: 400,
              reason: 'Bad Request',
              message: 'Invalid attribute specified.',
            });
          }
          // AM refuses a top-level attribute it does not know and says which ones it accepts
          const unknown = Object.keys(posted).filter(
            (attribute) =>
              attribute !== '_id' &&
              attribute !== '_type' &&
              !TRUSTED_JWT_ISSUER_ATTRIBUTES.includes(attribute)
          );
          if (unknown.length > 0) {
            return send(400, {
              code: 400,
              reason: 'Bad Request',
              message: 'Invalid attribute specified.',
              detail: { validAttributes: TRUSTED_JWT_ISSUER_ATTRIBUTES },
            });
          }
          const created = !trustedJwtIssuers.has(id);
          const stored = {
            // a created issuer is completed with the server's defaults, an updated one is stored as sent
            ...(created ? { jwksCacheTimeout: 3600000 } : {}),
            ...posted,
            _id: id,
            _rev: '-2',
            _type: {
              _id: 'TrustedJwtIssuer',
              name: 'OAuth2 Trusted JWT Issuer',
              collection: true,
            },
          };
          trustedJwtIssuers.set(id, stored);
          return send(created ? 201 : 200, wrapJwtIssuer(stored));
        }
        if (req.method === 'DELETE') {
          const stored = trustedJwtIssuers.get(id);
          trustedJwtIssuers.delete(id);
          return stored ? send(200, wrapJwtIssuer(stored)) : notFound();
        }
      }
    }
    if (serviceAccounts && pathname.includes('/openidm/managed/svcacct/')) {
      const _id = decodeURIComponent(
        pathname.split('/openidm/managed/svcacct/')[1]
      );
      return serviceAccounts.includes(_id)
        ? send(200, {
            _id,
            name: `service account ${_id}`,
            description: 'a service account of the fake tenant',
            accountStatus: 'Active',
            scopes: [],
          })
        : send(404, { code: 404, reason: 'Not Found', message: 'Not Found' });
    }
    if (secrets && pathname.endsWith('/environment/secrets')) {
      return send(200, {
        result: secrets.map((_id) => ({
          _id,
          description: `the secret ${_id}`,
          activeVersion: '1',
          loadedVersion: '1',
        })),
        pagedResultsCookie: null,
        totalPagedResultsPolicy: 'EXACT',
        totalPagedResults: secrets.length,
        remainingPagedResults: -1,
      });
    }
    if (
      secrets &&
      req.method === 'GET' &&
      pathname.includes('/environment/secrets/')
    ) {
      const _id = decodeURIComponent(
        pathname.split('/environment/secrets/')[1]
      );
      return secrets.includes(_id.split('/')[0])
        ? send(200, { _id, encoding: 'generic', useInPlaceholders: true })
        : send(404, { code: 404, message: 'not found' });
    }
    if (
      secrets &&
      pathname.includes('/environment/secrets/') &&
      ['DELETE', 'POST'].includes(req.method)
    ) {
      return send(200, {});
    }
    if (
      services &&
      req.method === 'POST' &&
      pathname.endsWith('/services') &&
      new URL(req.url, 'http://fake').searchParams.get('_action') ===
        'nextdescendents'
    ) {
      return send(200, {
        result: services.map((_id) => ({
          _id,
          name: `the service ${_id}`,
          _type: { _id, name: _id, collection: false },
        })),
      });
    }
    if (
      services &&
      req.method === 'DELETE' &&
      pathname.includes('/services/')
    ) {
      return send(200, {});
    }
    if (secretStores && pathname.includes('/secrets/stores')) {
      const search = new URL(req.url, 'http://fake').searchParams;
      if (
        req.method === 'POST' &&
        pathname.endsWith('/secrets/stores') &&
        search.get('_action') === 'nextdescendents'
      ) {
        return send(200, {
          result: secretStores.stores.map(({ _id, type }) => ({
            _id,
            _type: { _id: type, name: type, collection: true },
          })),
        });
      }
      const mappings = pathname.match(
        /\/secrets\/stores\/[^/]+\/([^/]*)\/?mappings$/
      );
      if (mappings && req.method === 'GET') {
        const wanted =
          mappings[1] ||
          secretStores.stores.find(({ type }) =>
            pathname.includes(`/stores/${type}/`)
          )?._id;
        return send(200, {
          result: (secretStores.mappings?.[wanted] ?? []).map((mapping) => ({
            _id: mapping.secretId,
            ...mapping,
          })),
        });
      }
      if (mappings && req.method === 'POST') return send(200, {});
      const mapping = pathname.match(
        /\/secrets\/stores\/[^/]+\/([^/]*)\/?mappings\/([^/]+)$/
      );
      if (mapping && req.method === 'GET') {
        const found = (secretStores.mappings?.[mapping[1]] ?? []).find(
          ({ secretId }) => secretId === decodeURIComponent(mapping[2])
        );
        return found
          ? send(200, { _id: found.secretId, ...found })
          : send(404, { code: 404, message: 'not found' });
      }
      if (mapping && req.method === 'PUT') return send(200, {});
      if (mapping && req.method === 'DELETE') {
        const held = secretStores.mappings?.[mapping[1]] ?? [];
        const index = held.findIndex(
          ({ secretId }) => secretId === decodeURIComponent(mapping[2])
        );
        if (index === -1) return send(404, { code: 404, message: 'not found' });
        const [removed] = held.splice(index, 1);
        return send(200, { _id: removed.secretId, ...removed });
      }
    }
    if (journeys) {
      const treeRoute = pathname.match(/\/authenticationtrees\/trees\/([^/]+)$/);
      const nodeRoute = pathname.match(
        /\/authenticationtrees\/nodes\/[^/]+(?:\/[^/]+)?\/([^/]+)$/
      );
      const treeOf = (id, nodes) => ({
        _id: id,
        entryNodeId: Object.keys(nodes)[0],
        nodes: Object.fromEntries(
          Object.entries(nodes).map(([nodeId, nodeType]) => [
            nodeId,
            { nodeType, displayName: nodeId, x: 0, y: 0, connections: {} },
          ])
        ),
      });
      const collectionOf = (result) => ({
        result,
        resultCount: result.length,
        pagedResultsCookie: null,
        totalPagedResultsPolicy: 'EXACT',
        totalPagedResults: result.length,
        remainingPagedResults: -1,
      });
      // every node of the realm: the nodes of the journeys and the ones that no journey holds
      const allNodes = () => [
        ...[...journeys.values()].flatMap((nodes) => Object.entries(nodes)),
        ...(orphanNodes ? [...orphanNodes.entries()] : []),
      ];
      if (
        trees === undefined &&
        req.method === 'GET' &&
        pathname.endsWith('/authenticationtrees/trees')
      ) {
        return send(
          200,
          collectionOf([...journeys].map(([id, nodes]) => treeOf(id, nodes)))
        );
      }
      if (
        req.method === 'POST' &&
        pathname.endsWith('/authenticationtrees/nodes') &&
        new URL(req.url, 'http://fake').searchParams.get('_action') ===
          'getAllTypes'
      ) {
        return send(200, {
          result: [...new Set(allNodes().map(([, type]) => type))].map(
            (_id) => ({ _id, name: _id, collection: true })
          ),
        });
      }
      // the authentication settings of the realm, which name the default journeys
      if (req.method === 'GET' && pathname.endsWith('/realm-config/authentication')) {
        return send(200, {
          _id: '',
          core: { orgConfig: 'ldapService', adminAuthModule: 'ldapService' },
        });
      }
      const nodesOfType = pathname.match(/\/authenticationtrees\/nodes\/([^/]+)$/);
      if (nodesOfType && req.method === 'GET') {
        return send(
          200,
          collectionOf(
            allNodes()
              .filter(([, type]) => type === nodesOfType[1])
              .map(([_id, type]) => ({
                _id,
                _type: { _id: type, name: type, collection: true },
              }))
          )
        );
      }
      if (treeRoute) {
        const id = decodeURIComponent(treeRoute[1]);
        const nodes = journeys.get(id);
        if (!nodes || !['GET', 'DELETE'].includes(req.method)) {
          return send(404, { code: 404, reason: 'Not Found', message: 'Not Found' });
        }
        if (req.method === 'DELETE') journeys.delete(id);
        return send(200, treeOf(id, nodes));
      }
      if (nodeRoute && req.method === 'DELETE') {
        orphanNodes?.delete(decodeURIComponent(nodeRoute[1]));
        return send(200, {});
      }
    }
    if (samlProviders && pathname.includes('/realm-config/saml2')) {
      const query = new URL(req.url, 'http://fake').searchParams;
      const provider = ({ id64, entityId, config, revision }) => ({
        _id: id64,
        _rev: String(revision),
        entityId,
        ...config,
      });
      if (
        req.method === 'GET' &&
        pathname.endsWith('/realm-config/saml2') &&
        query.has('_queryFilter')
      ) {
        const byEntity = query.get('_queryFilter').match(/^entityId eq '(.*)'$/);
        const found = [...samlProviders.values()]
          .filter(({ entityId }) => !byEntity || entityId === byEntity[1])
          .map((held) => ({
            _id: held.id64,
            _rev: String(held.revision),
            entityId: held.entityId,
            location: held.location,
            roles: ['serviceProvider', 'identityProvider'].filter(
              (role) => held.config[role]
            ),
          }));
        return send(200, {
          result: found,
          resultCount: found.length,
          pagedResultsCookie: null,
          totalPagedResultsPolicy: 'EXACT',
          totalPagedResults: found.length,
          remainingPagedResults: -1,
        });
      }
      const route = pathname.match(/\/realm-config\/saml2\/([^/]+)\/([^/]+)$/);
      if (route) {
        const held = samlProviders.get(decodeURIComponent(route[2]));
        if (!held || held.location !== route[1]) {
          return send(404, { code: 404, reason: 'Not Found', message: 'Not Found' });
        }
        if (req.method === 'GET') return send(200, provider(held));
        if (req.method === 'PUT') {
          // eslint-disable-next-line no-unused-vars
          const { _id, _rev, entityId, ...config } = JSON.parse(body);
          held.config = config;
          held.revision += 1;
          return send(200, provider(held));
        }
      }
    }
    if (trees && pathname.endsWith('/authenticationtrees/trees')) {
      return send(200, {
        result: trees.map((_id) => ({ _id })),
        resultCount: trees.length,
        pagedResultsCookie: null,
        totalPagedResultsPolicy: 'EXACT',
        totalPagedResults: trees.length,
        remainingPagedResults: -1,
      });
    }
    if (scripts.length > 0 && pathname.endsWith('/scripts')) {
      return send(200, {
        result: scripts.map((name, index) => ({
          _id: `0000000${index + 1}-aaaa-bbbb-cccc-dddddddddddd`,
          name,
          description: '',
          default: false,
          language: 'JAVASCRIPT',
          context: 'SOCIAL_IDP_PROFILE_TRANSFORMATION',
          script: Buffer.from('// nothing').toString('base64'),
        })),
        resultCount: scripts.length,
        pagedResultsCookie: null,
        totalPagedResultsPolicy: 'EXACT',
        totalPagedResults: scripts.length,
        remainingPagedResults: -1,
      });
    }
    if (features && /\/openidm\/feature(\/|$)/.test(pathname)) {
      const query = new URL(req.url, 'http://fake').searchParams;
      const rest = pathname.split('/openidm/feature')[1].replace(/^\//, '');
      const listed = ({ validate, ...feature }) => feature;
      if (req.method === 'GET' && rest === '') {
        return send(200, {
          result: features.map(listed),
          resultCount: features.length,
          pagedResultsCookie: null,
          totalPagedResultsPolicy: 'NONE',
          totalPagedResults: -1,
          remainingPagedResults: -1,
        });
      }
      const feature = features.find(
        (candidate) => candidate._id === decodeURIComponent(rest)
      );
      if (!feature) {
        return send(404, {
          code: 404,
          reason: 'Not Found',
          message: 'Not Found',
        });
      }
      if (req.method === 'GET') return send(200, listed(feature));
      if (req.method === 'POST' && query.get('_action') === 'validate') {
        return send(
          200,
          feature.validate ?? {
            status: 200,
            success: true,
            message: 'Validate complete.',
            failures: [],
          }
        );
      }
    }
    if (idmConfig && /\/openidm\/config\/(managed|repo\.ds)$/.test(pathname)) {
      const name = pathname.split('/').pop();
      if (req.method === 'GET' && idmConfig[name] !== undefined) {
        return send(200, idmConfig[name]);
      }
      return send(500, {
        code: 500,
        reason: 'Internal Server Error',
        message: 'the fake tenant does not take writes to this configuration',
      });
    }
    if (serveIdmSchemaProperty(req, body, send)) return;
    if (serveIdmConfigList(req, send)) return;
    if (idmEntities && pathname.includes('/openidm/config/')) {
      const id = decodeURIComponent(pathname.split('/openidm/config/')[1]);
      if (req.method === 'GET' && idmEntities[id] !== undefined) {
        return send(200, idmEntities[id]);
      }
      if (req.method === 'PUT') {
        const posted = body ? JSON.parse(body) : {};
        idmEntities[id] = { _id: id, ...posted };
        return send(200, idmEntities[id]);
      }
      if (req.method === 'DELETE' && Object.hasOwn(idmEntities, id)) {
        const removed = idmEntities[id];
        delete idmEntities[id];
        return send(200, removed);
      }
      return send(404, {
        code: 404,
        reason: 'Not Found',
        message: 'Not Found',
      });
    }
    if (serveManagedObjects(req, send)) return;
    if (users && pathname.includes('/json/') && pathname.endsWith('/users')) {
      const query = new URL(req.url, 'http://fake').searchParams;
      const cap = Number(process.env.FAKE_AM_USERS_CAP ?? Infinity);
      const selected = selectUsers(query.get('_queryFilter') ?? 'true').slice(
        0,
        cap
      );
      const size = Number(query.get('_pageSize') ?? selected.length);
      const page = size === 0 ? [] : selected.slice(0, size);
      return send(200, {
        result: page.map((user) => ({
          _id: user._id,
          username: user.userName,
          uid: [user.userName],
          cn: [`${user.givenName} ${user.sn}`],
          givenName: [user.givenName],
          sn: [user.sn],
          mail: [user.mail],
        })),
        resultCount: page.length,
        pagedResultsCookie: null,
        totalPagedResultsPolicy: 'EXACT',
        totalPagedResults: selected.length,
        remainingPagedResults: -1,
      });
    }
    if (users && req.url.includes('/openidm/managed/')) {
      const query = new URL(req.url, 'http://fake').searchParams;
      const selected = selectUsers(query.get('_queryFilter') ?? 'true');
      const size = Number(query.get('_pageSize') ?? selected.length);
      const page = size === 0 ? [] : selected.slice(0, size);
      return send(200, {
        result: page,
        resultCount: page.length,
        pagedResultsCookie: null,
        totalPagedResultsPolicy: 'EXACT',
        totalPagedResults: selected.length,
        remainingPagedResults: -1,
      });
    }
    if (req.url.includes('/json/serverinfo')) {
      return send(200, {
        cookieName: 'iPlanetDirectoryPro',
        realm: '/',
        domains: [],
        secureCookie: false,
      });
    }
    if (realms.length > 0 && req.url.includes('/global-config/realms')) {
      return send(200, {
        result: realms.map((name) => ({
          _id: name,
          _type: { _id: 'realm', name: 'Realm', collection: true },
          name,
          active: true,
          parentPath: '/',
          aliases: [],
        })),
        resultCount: realms.length,
        pagedResultsCookie: null,
        totalPagedResultsPolicy: 'NONE',
        totalPagedResults: -1,
        remainingPagedResults: -1,
      });
    }
    if (req.url.includes('/authenticate')) {
      const posted = body ? JSON.parse(body) : {};
      if (posted.callbacks && loginRefused) {
        return send(401, {
          code: 401,
          reason: 'Unauthorized',
          message: 'Login failure',
        });
      }
      if (!posted.callbacks) {
        step = 1;
        return send(200, {
          authId: 'fake-auth-1',
          callbacks: [nameCallback('User Name'), passwordCallback()],
        });
      }
      if (step === 1 && !plainLogin) {
        step = 2;
        return send(200, {
          authId: 'fake-auth-2',
          callbacks: [nameCallback('Enter verification code')],
        });
      }
      return send(200, { tokenId: sessionToken, successUrl: '/', realm: '/' });
    }
    if (
      req.method === 'POST' &&
      pathname.endsWith('/sessions') &&
      new URL(req.url, 'http://fake').searchParams.get('_action') === 'logout'
    ) {
      if (process.env.FAKE_AM_LOGOUT === 'hang') return;
      if (process.env.FAKE_AM_LOGOUT === 'refuse') {
        return send(400, {
          code: 400,
          reason: 'Bad Request',
          message: 'fake AM: logout refused',
        });
      }
      return send(200, { result: 'Successfully logged out' });
    }
    if (users && req.url.includes('/openidm/config/managed')) {
      // The managed config entity, for readManagedObjectTypes: the type
      // names come from FAKE_AM_MANAGED_TYPES (comma-separated), so the
      // catalog enrichment sees a tenant with configured types.
      const names = (process.env.FAKE_AM_MANAGED_TYPES ?? '')
        .split(',')
        .filter(Boolean);
      return send(200, {
        _id: 'managed',
        objects: names.map((name) => ({ name })),
      });
    }
    if (req.url.includes('getSessionInfo')) {
      if (plainLogin) {
        return send(200, {
          username: 'someone@example.com',
          universalId: 'id=someone@example.com,ou=user,dc=openam',
          realm: '/',
          latestAccessTime: '2026-10-23T22:00:00Z',
          maxIdleExpirationTime: sessionExpiry(),
          maxSessionExpirationTime: sessionExpiry(),
          properties: { AMCtxId: 'fake' },
        });
      }
      return send(401, {
        code: 401,
        reason: 'Unauthorized',
        message: 'fake AM: no session lookup',
      });
    }
    if (emptyCollections) {
      const query = new URL(req.url, 'http://fake').searchParams;
      if (
        (req.method === 'GET' && query.has('_queryFilter')) ||
        (req.method === 'POST' && query.get('_action') === 'nextdescendents')
      ) {
        return send(200, {
          result: [],
          resultCount: 0,
          pagedResultsCookie: null,
          totalPagedResultsPolicy: 'EXACT',
          totalPagedResults: 0,
          remainingPagedResults: -1,
        });
      }
    }
    return send(404, {});
  });
});

server.listen(0, '127.0.0.1', () => {
  console.log(`PORT=${server.address().port}`);
});
process.on('SIGTERM', () => process.exit(0));
