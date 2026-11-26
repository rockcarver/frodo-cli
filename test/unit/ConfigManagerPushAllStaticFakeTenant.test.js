import cp from 'child_process';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { readRequests } from '../utils/FakeAmLog.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');

/**
 * `frodo config-manager push all-static`, the REAL CLI of this checkout against a fake AM
 * (test/utils/FakeAm.mjs, in a separate process, which accepts every write it is sent), through the real
 * library. The log of the requests that the tenant received says what a push would have done: which steps
 * wrote and in which order, what the metadata write holds, and that a tree that cannot be pushed writes
 * nothing at all. The trees are made here, in a temporary folder, of the files that a pull writes.
 *
 * No tenant, no secrets, no master key, no terminal; a temporary HOME and working directory keep it away
 * from real profiles and files. Skipped on Windows: the CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

/** A tree of the files that `pull all-static` writes for a Cloud tenant: one small object for each step. */
const cloudTree = (realms = ['alpha']) => ({
  'access-config/access.json': {
    _id: 'access',
    configs: [{ pattern: 'info/*', roles: '*', methods: 'read', actions: '*' }],
  },
  'audit/audit.json': { _id: 'audit', auditServiceConfig: {} },
  'sync/connectors/c1.json': {
    _id: 'provisioner.openicf/c1',
    name: 'c1',
    connectorRef: { connectorName: 'x', bundleName: 'y', bundleVersion: '1' },
    configurationProperties: {},
  },
  'sync/mappings/m1/m1.json': {
    name: 'm1',
    source: 'managed/alpha_user',
    target: 'system/c1/account',
    properties: [],
  },
  'cookie-domains/cookie-domains.json': { domains: ['example.com'] },
  'cors/cors-config.json': {
    idmCorsConfig: {
      _id: 'servletfilter/cors',
      classPathURLs: [],
      filterClass: 'x',
      urlPatterns: ['/*'],
    },
    corsServiceGlobal: {
      _id: '',
      _type: { _id: 'CorsService', collection: false, name: 'CORS Service' },
      enabled: true,
    },
    corsServices: [
      {
        _id: 'c1',
        _type: {
          _id: 'configuration',
          collection: true,
          name: 'Cors Configuration',
        },
        acceptedOrigins: [],
        enabled: false,
      },
    ],
  },
  'csp/csp.json': {
    enforced: { active: false, directives: {} },
    'report-only': {
      active: true,
      directives: { 'frame-ancestors': ["'self'"] },
    },
  },
  'custom-nodes/nodes/n1/n1.json': {
    _id: 'n1',
    displayName: 'n1',
    script: { file: 'n1.js' },
  },
  'custom-nodes/nodes/n1/n1.js': 'outcome = "true";',
  'email-provider/external.email.json': {
    _id: 'external.email',
    host: 'smtp.example.com',
    port: 25,
  },
  'email-templates/t1/t1.json': {
    _id: 'emailTemplate/t1',
    enabled: true,
    defaultLocale: 'en',
    displayName: 't1',
    message: { en: { file: 't1.en.md' } },
  },
  'email-templates/t1/t1.en.md': 'hello',
  'endpoints/e1/e1.json': {
    _id: 'endpoint/e1',
    context: 'endpoint/e1',
    type: 'text/javascript',
    file: 'e1.js',
  },
  'endpoints/e1/e1.js': 'var x = 1;',
  'kba/selfservice.kba.json': {
    _id: 'selfservice.kba',
    minimumAnswersToDefine: 1,
    questions: { 1: { en: 'q' } },
  },
  'locales/fr.json': { _id: 'uilocale/fr', admin: {} },
  'managed-objects/alpha_user/alpha_user.json': {
    name: 'alpha_user',
    schema: { type: 'object', properties: {} },
  },
  'org-privileges/privilegeAssignments.json': {
    _id: 'privilegeAssignments',
    assignments: [],
  },
  'remote-proxies/p1.json': {
    _id: 'external.idm/p1',
    authType: 'bearer',
    enabled: false,
    instanceUrl: 'https://&{esv.example.proxy.host}/openidm/',
    clientId: 'proxy',
    clientSecret: '&{esv.example.proxy}',
    tokenEndpoint: 'https://&{esv.example.proxy.host}/am/oauth2/access_token',
  },
  'sync/rcs/provisioner.openicf.connectorinfoprovider.json': {
    _id: 'provisioner.openicf.connectorinfoprovider',
    connectorsLocation: 'connectors',
  },
  'schedules/sch1/sch1.json': {
    _id: 'schedule/sch1',
    enabled: false,
    persisted: true,
    type: 'cron',
    schedule: '0 0 * * * ?',
    invokeService: 'script',
    invokeContext: { script: { type: 'text/javascript', file: 'sch1.js' } },
  },
  'schedules/sch1/sch1.js': 'var y = 2;',
  'terms-conditions/terms-conditions.json': {
    _id: 'selfservice.terms',
    active: '0.1',
    versions: [
      {
        version: '0.1',
        termsTranslations: { en: { file: '0.1/en.html' } },
      },
    ],
  },
  'terms-conditions/0.1/en.html': '<p>terms</p>',
  'ui/ui-configuration.json': {
    _id: 'ui/configuration',
    configuration: { lang: 'en' },
  },
  ...Object.fromEntries(
    realms.flatMap((realm) => [
      [
        `realms/${realm}/password-policy/${realm}_user-password-policy.json`,
        {
          _id: `fieldPolicy/${realm}_user`,
          type: 'password-policy',
          validator: [],
        },
      ],
      [
        `realms/${realm}/themes/Default/Default.json`,
        { _id: 'default', name: 'Default', isDefault: true },
      ],
      [
        `realms/${realm}/secret-mappings/am.services.example.json`,
        {
          _id: 'am.services.example',
          secretId: 'am.services.example',
          aliases: ['esv-example'],
        },
      ],
      [
        `realms/${realm}/scripts/scripts-config/s1.json`,
        {
          _id: `s1-${realm}`,
          name: `s1-${realm}`,
          context: 'AUTHENTICATION_TREE_DECISION_NODE',
          language: 'JAVASCRIPT',
          script: {
            file: 'scripts-content/AUTHENTICATION_TREE_DECISION_NODE/s1.js',
          },
        },
      ],
      [
        `realms/${realm}/scripts/scripts-content/AUTHENTICATION_TREE_DECISION_NODE/s1.js`,
        'outcome = "true";',
      ],
      [
        `realms/${realm}/realm-config/authentication.json`,
        {
          _id: '',
          _type: { _id: 'EMPTY', collection: false, name: 'Core' },
          core: { adminAuthModule: 'Login' },
        },
      ],
      [
        `realms/${realm}/services/baseurl.json`,
        {
          _id: 'baseurl',
          _type: { _id: 'baseurl', name: 'Base URL Source', collection: false },
          source: 'REQUEST_VALUES',
        },
      ],
      [
        `realms/${realm}/journeys/j1/j1.json`,
        {
          _id: 'j1',
          entryNodeId: 'n1',
          nodes: {
            n1: {
              displayName: 'n1',
              nodeType: 'ScriptedDecisionNode',
              x: 0,
              y: 0,
              connections: {},
            },
          },
          staticNodes: {},
        },
      ],
      [
        `realms/${realm}/journeys/j1/nodes/n1.json`,
        {
          _id: 'n1',
          _type: { _id: 'ScriptedDecisionNode' },
          script: 'none',
          outcomes: ['true'],
          inputs: ['*'],
          outputs: ['*'],
        },
      ],
    ])
  ),
});

const ALPHA = '/am/json/realms/root/realms/alpha';
/**
 * The first write of each step of a Cloud tree, in the order of the push (the metadata step has none: it is
 * not in a run without `-M`): the step, the method and the path of the request.
 */
const FIRST_WRITES = [
  ['access-config', 'PUT', '/openidm/config/access'],
  ['audit', 'PUT', '/openidm/config/audit'],
  ['connectors', 'PUT', '/openidm/config/provisioner.openicf/c1'],
  ['connector-mappings', 'PUT', '/openidm/config/sync'],
  ['cookie-domains', 'PUT', '/environment/cookie-domains'],
  ['cors', 'PUT', '/openidm/config/servletfilter/cors'],
  ['csp', 'PUT', '/environment/content-security-policy/enforced'],
  ['nodes', 'POST', '/am/json/node-designer/node-type'],
  ['email-provider', 'PUT', '/openidm/config/external.email'],
  ['email-templates', 'PUT', '/openidm/config/emailTemplate/t1'],
  ['endpoints', 'PUT', '/openidm/config/endpoint/e1'],
  ['kba', 'PUT', '/openidm/config/selfservice.kba'],
  ['locales', 'PUT', '/openidm/config/uilocale/fr'],
  ['managed-objects', 'PUT', '/openidm/config/managed'],
  ['org-privileges', 'PUT', '/openidm/config/privilegeAssignments'],
  ['password-policy', 'PUT', '/openidm/config/fieldPolicy/alpha_user'],
  ['remote-proxies', 'PUT', '/openidm/config/external.idm/p1'],
  [
    'connector-servers',
    'PUT',
    '/openidm/config/provisioner.openicf.connectorinfoprovider',
  ],
  ['schedules', 'PUT', '/openidm/config/schedule/sch1'],
  ['terms-and-conditions', 'PUT', '/openidm/config/selfservice.terms'],
  ['themes', 'PUT', '/openidm/config/ui/themerealm'],
  ['ui-config', 'PUT', '/openidm/config/ui/configuration'],
  [
    'secretstore-mappings',
    'PUT',
    `${ALPHA}/realm-config/secrets/stores/GoogleSecretManagerSecretStoreProvider/ESV/mappings/am.services.example`,
  ],
  ['scripts', 'PUT', `${ALPHA}/scripts/s1-alpha`],
  ['authn', 'PUT', `${ALPHA}/realm-config/authentication`],
  ['services', 'PUT', `${ALPHA}/realm-config/services/baseurl`],
  [
    'journeys',
    'PUT',
    `${ALPHA}/realm-config/authentication/authenticationtrees/trees/j1`,
  ],
];
const STEP_COUNT = FIRST_WRITES.length;

suite('push all-static against a fake tenant', () => {
  let home;
  let work;
  let record;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-push-all-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-push-all-work-'));
    record = path.join(home, 'requests.jsonl');
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  /**
   * Starts the fake, which takes every write, and runs the CLI once against it, without a terminal. The host
   * of the fake is the word `{host}` of `args`; without one the host, the realm (`realm`, none when it is
   * null) and the deployment type are added after `args`. With `unreachable` no fake is started and the host is
   * one that nothing listens on (the port of the tcpmux service, which no development machine serves), so the login
   * fails.
   */
  async function runAgainst(
    args,
    { realm = 'alpha', failRequests, unreachable = false } = {}
  ) {
    if (!unreachable)
      fakeAm = await startFakeAm({
        journey: 'service-account',
        recordPath: record,
        acceptWrites: true,
        // the lists that a push reads are empty, the realms of the tenant are alpha and bravo, and the
        // theme document of the tenant is there to be updated
        emptyCollections: true,
        realms: ['alpha', 'bravo'],
        idmEntities: { 'ui/themerealm': { _id: 'ui/themerealm', realm: {} } },
        ...(failRequests ? { failRequests } : {}),
      });
    const host = unreachable
      ? 'http://127.0.0.1:1/am'
      : `http://127.0.0.1:${fakeAm.port}/am`;
    const argv = args.includes('{host}')
      ? args.map((arg) => (arg === '{host}' ? host : arg))
      : [...args, host, ...(realm === null ? [] : [realm]), '--type', 'cloud'];
    return new Promise((resolve, reject) => {
      const child = cp.spawn(binaryPath, argv, {
        cwd: work,
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          FRODO_REALM: '',
          FRODO_TEST: '',
          FRODO_NO_CACHE: 'true',
          FRODO_NO_PROMPT: '1',
          FRODO_NO_UPDATE_CHECK: '1',
          FRODO_SA_ID: 'test-account',
          FRODO_SA_JWK: serviceAccountJwk,
          NODE_OPTIONS: '',
          NO_COLOR: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (output += chunk));
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, output }));
    });
  }

  const push = (args = [], options) =>
    runAgainst(['config-manager', 'push', 'all-static', ...args], options);

  /** Writes the files of a tree below the working directory (or below a folder of it). */
  const write = (files, folder = '') => {
    for (const [relative, content] of Object.entries(files)) {
      const target = path.join(work, folder, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(
        target,
        typeof content === 'string' ? content : JSON.stringify(content)
      );
    }
  };

  const isLogin = ({ url }) =>
    /authenticate|oauth2\/access_token|serverinfo|sessions|environment\/scopes|\/json\/realms\?|_action=logout/.test(
      url
    );
  /** The requests that change a tenant. */
  const writes = () =>
    readRequests(record).filter(
      ({ method, url }) =>
        ['PUT', 'PATCH', 'DELETE', 'POST'].includes(method) &&
        !isLogin({ url }) &&
        !url.includes('_action=nextdescendents')
    );
  const pathOf = ({ url }) => url.split('?')[0];
  const wrote = (method, urlPath) =>
    writes().some((w) => w.method === method && pathOf(w) === urlPath);
  /** The position of the first write of a method and path, -1 when there is none. */
  const firstWrite = (method, urlPath) =>
    writes().findIndex((w) => w.method === method && pathOf(w) === urlPath);

  it(
    'a tree with every folder writes every step in the order of the push, writes the three types that a pull writes beside them, and no metadata',
    async () => {
      write(cloudTree());

      const { code, output } = await push(['-D', work]);

      expect(output).not.toContain('steps failed');
      expect(code).toBe(0);
      const positions = FIRST_WRITES.map(([step, method, urlPath]) => [
        step,
        firstWrite(method, urlPath),
      ]);
      // every step wrote, and the first writes come in the order of the table
      expect(positions.filter(([, at]) => at < 0)).toEqual([]);
      expect(positions.map(([step]) => step)).toEqual(
        FIRST_WRITES.map(([step]) => step)
      );
      const at = positions.map(([, position]) => position);
      expect(at).toEqual([...at].sort((a, b) => a - b));
      // the three types that the first version left out, and the second policy of the csp
      expect(wrote('PUT', '/environment/cookie-domains')).toBe(true);
      expect(
        wrote('PUT', '/environment/content-security-policy/enforced')
      ).toBe(true);
      expect(
        wrote('PUT', '/environment/content-security-policy/report-only')
      ).toBe(true);
      expect(wrote('PUT', '/openidm/config/ui/configuration')).toBe(true);
      // the metadata of the tenant is left as it is
      expect(wrote('PUT', '/openidm/config/custom-config.metadata')).toBe(
        false
      );
      expect(JSON.stringify(readRequests(record))).not.toContain(
        'custom-config.metadata'
      );
    },
    TIMEOUT
  );

  it(
    '-M writes the metadata of the tenant, as one object, after the first two steps',
    async () => {
      write(cloudTree());

      const { code } = await push([
        '-D',
        work,
        '-M.pushedAt',
        '2026-11-26T00:00:00Z',
        '-M.versionInfo.version',
        '1.0',
      ]);

      expect(code).toBe(0);
      const metadata = writes().filter(
        (w) => pathOf(w) === '/openidm/config/custom-config.metadata'
      );
      expect(metadata).toHaveLength(1);
      expect(JSON.parse(metadata[0].body)).toEqual({
        _id: 'custom-config.metadata',
        pushedAt: '2026-11-26T00:00:00Z',
        versionInfo: { version: '1.0' },
      });
      // where the table puts it: after the audit configuration, before the connectors
      expect(firstWrite('PUT', '/openidm/config/audit')).toBeLessThan(
        firstWrite('PUT', '/openidm/config/custom-config.metadata')
      );
      expect(
        firstWrite('PUT', '/openidm/config/custom-config.metadata')
      ).toBeLessThan(
        firstWrite('PUT', '/openidm/config/provisioner.openicf/c1')
      );
    },
    TIMEOUT
  );

  describe.each([
    [
      'an empty folder',
      (dir) => dir,
      'Nothing to push: none of the static configuration folders was found in',
    ],
    [
      'a folder that holds other files only',
      (dir) => {
        // a file where the tree has its realms folder is no folder of a realm
        write({ 'notes/readme.md': 'x', realms: 'not a folder' });
        return dir;
      },
      'Nothing to push: none of the static configuration folders was found in',
    ],
    [
      'a folder that does not exist',
      (dir) => path.join(dir, 'no-such-folder'),
      'does not exist, so there is nothing to push.',
    ],
  ])('-D names %s', (_name, directory, message) => {
    it(
      'exits 1 before the first write: the tenant receives no write, and not even the metadata',
      async () => {
        const dir = directory(work);

        const { code, output } = await push([
          '-D',
          dir,
          '-M.pushedAt',
          '2026-11-26T00:00:00Z',
        ]);

        expect(code).toBe(1);
        expect(output).toContain(message);
        expect(output).not.toContain('Importing from');
        expect(writes()).toEqual([]);
        // the login, and nothing that is not a read
        expect(
          readRequests(record).filter(
            (request) => request.method !== 'GET' && !isLogin(request)
          )
        ).toEqual([]);
      },
      TIMEOUT
    );
  });

  it(
    '-D names a file: exits 1 before the first write',
    async () => {
      write({ 'a-file.json': {} });

      const { code, output } = await push([
        '-D',
        path.join(work, 'a-file.json'),
      ]);

      expect(code).toBe(1);
      expect(output).toContain('is not a folder, so there is nothing to push.');
      expect(writes()).toEqual([]);
    },
    TIMEOUT
  );

  it(
    'a tree with two folders pushes two steps, and warns for each of the others that its folder is not there',
    async () => {
      write({
        'cors/cors-config.json': cloudTree()['cors/cors-config.json'],
        'kba/selfservice.kba.json': cloudTree()['kba/selfservice.kba.json'],
      });

      const { code, output } = await push(['-D', work]);

      // a skipped step is neither a success nor a failure
      expect(code).toBe(0);
      expect(output).not.toContain('steps failed');
      expect(writes().map(pathOf)).toEqual([
        '/openidm/config/servletfilter/cors',
        '/am/json/global-config/services/CorsService',
        '/am/json/global-config/services/CorsService/configuration/c1',
        '/openidm/config/selfservice.kba',
      ]);
      const skipped = FIRST_WRITES.map(([step]) => step).filter(
        (step) => !['cors', 'kba'].includes(step)
      );
      expect(skipped).toHaveLength(STEP_COUNT - 2);
      for (const step of skipped) {
        expect(output).toContain(`Skipping ${step}: `);
      }
      expect(output).toContain(
        `Skipping audit: 'audit/audit.json' not found in '${work}'.`
      );
      expect(output).toContain(
        `Skipping themes: 'realms/alpha/themes' not found in '${work}'.`
      );
      // the folders that exist are not skipped
      expect(output).not.toContain('Skipping cors');
      expect(output).not.toContain('Skipping kba');
    },
    TIMEOUT
  );

  it(
    'a folder that is mistyped inside a tree is a warning that names the path it looked for',
    async () => {
      const tree = cloudTree();
      write({
        'cors/cors-config.json': tree['cors/cors-config.json'],
        // the folder of the realm has `script` and not `scripts`
        'realms/alpha/script/scripts-config/s1.json':
          tree['realms/alpha/scripts/scripts-config/s1.json'],
      });

      const { code, output } = await push(['-D', work]);

      expect(code).toBe(0);
      expect(output).toContain(
        `Skipping scripts: 'realms/alpha/scripts/scripts-config' not found in '${work}'.`
      );
      expect(writes().some((w) => pathOf(w).includes('/scripts/'))).toBe(false);
    },
    TIMEOUT
  );

  describe('a tenant that refuses every write', () => {
    const refuseAll = [
      { method: 'PUT', path: '/' },
      { method: 'POST', path: '/node-designer' },
    ];

    it(
      'still runs every step, prints one summary of all of them and exits 1',
      async () => {
        write(cloudTree());

        const { code, output } = await push(['-D', work], {
          failRequests: refuseAll,
        });

        expect(code).toBe(1);
        expect(output).toContain(
          `${STEP_COUNT} of ${STEP_COUNT} steps failed:`
        );
        for (const [step] of FIRST_WRITES) {
          expect(output).toContain(`  - ${step}\n`);
        }
        // the run did not stop at the first refusal: the last step, the journeys, reached the tenant
        expect(
          wrote(
            'PUT',
            `${ALPHA}/realm-config/authentication/authenticationtrees/nodes/ScriptedDecisionNode/n1`
          )
        ).toBe(true);
        expect(output).toContain('Imported from');
      },
      TIMEOUT
    );

    it(
      'with --allow-failures exits 0 and says why',
      async () => {
        write(cloudTree());

        const { code, output } = await push(['-D', work, '--allow-failures'], {
          failRequests: refuseAll,
        });

        expect(code).toBe(0);
        expect(output).toContain(
          `${STEP_COUNT} of ${STEP_COUNT} steps failed:`
        );
        expect(output).toContain(
          'The exit code stays 0 because --allow-failures was given.'
        );
      },
      TIMEOUT
    );
  });

  it(
    'one refused write fails one step: the steps after it still write, and there is one summary',
    async () => {
      write(cloudTree());

      const { code, output } = await push(['-D', work], {
        failRequests: [{ method: 'PUT', path: '/openidm/config/audit' }],
      });

      expect(code).toBe(1);
      expect(output).toContain(`1 of ${STEP_COUNT} steps failed:\n  - audit`);
      expect(output.match(/steps failed/g)).toHaveLength(1);
      // the steps after the audit configuration wrote
      expect(wrote('PUT', '/openidm/config/access')).toBe(true);
      expect(wrote('PUT', '/openidm/config/selfservice.kba')).toBe(true);
      expect(
        wrote(
          'PUT',
          `${ALPHA}/realm-config/authentication/authenticationtrees/trees/j1`
        )
      ).toBe(true);
    },
    TIMEOUT
  );

  describe('a tree with two realms', () => {
    const bravo = '/am/json/realms/root/realms/bravo';

    it(
      'with a realm pushes that realm only',
      async () => {
        write(cloudTree(['alpha', 'bravo']));

        const { code } = await push(['-D', work]);

        expect(code).toBe(0);
        expect(wrote('PUT', `${ALPHA}/realm-config/authentication`)).toBe(true);
        expect(
          readRequests(record).some(({ url }) => url.includes('/realms/bravo'))
        ).toBe(false);
        expect(
          readRequests(record).some(({ url }) => url.includes('bravo_user'))
        ).toBe(false);
      },
      TIMEOUT
    );

    it(
      'without a realm pushes the realms of the tree',
      async () => {
        write(cloudTree(['alpha', 'bravo']));

        const { code } = await push(['-D', work], { realm: null });

        expect(code).toBe(0);
        expect(wrote('PUT', `${ALPHA}/realm-config/authentication`)).toBe(true);
        expect(wrote('PUT', `${bravo}/realm-config/authentication`)).toBe(true);
        expect(wrote('PUT', '/openidm/config/fieldPolicy/bravo_user')).toBe(
          true
        );
      },
      TIMEOUT
    );

    it(
      'a realm that is not in the tree is skipped for the steps of a realm, with a warning each, and the other steps push',
      async () => {
        write(cloudTree(['alpha']));

        const { code, output } = await push(['-D', work], {
          realm: 'bravo',
        });

        expect(code).toBe(0);
        expect(output).toContain(
          `Skipping scripts: 'realms/bravo/scripts/scripts-config' not found in '${work}'.`
        );
        expect(wrote('PUT', '/openidm/config/audit')).toBe(true);
        expect(writes().filter((w) => pathOf(w).includes('/realms/'))).toEqual(
          []
        );
      },
      TIMEOUT
    );
  });

  it(
    'a login that fails exits 1 before the first step: nothing is pushed and the run does not start',
    async () => {
      write(cloudTree());

      const { code, output } = await push(['-D', work], { unreachable: true });

      expect(code).toBe(1);
      expect(output).toContain('Error getting tokens');
      expect(output).not.toContain('Importing from');
      expect(output).not.toContain('steps failed');
      // no fake tenant was there to receive anything
      expect(writes()).toEqual([]);
    },
    TIMEOUT
  );

  it.each(['-d', '-y'])(
    '%s is an unknown option: the command has no dry run and asks no question',
    async (option) => {
      write(cloudTree());

      const { code, output } = await push(['-D', work, option]);

      expect(code).not.toBe(0);
      expect(output).toContain(`unknown option '${option}'`);
      expect(writes()).toEqual([]);
    },
    TIMEOUT
  );

  /**
   * The examples of `-hhh`, run as they are written, with the connection profile of the sample data replaced
   * by the fake tenant (or its AM base URL, for the example that logs in with a user name and a password: the
   * service account of the environment is what logs in here) and the working folder ./config holding a tree.
   */
  describe('the usage examples run as written', () => {
    let examples;
    beforeAll(async () => {
      const exampleHome = fs.mkdtempSync(
        path.join(os.tmpdir(), 'frodo-push-all-help-')
      );
      try {
        const stdout = await new Promise((resolve, reject) =>
          cp.execFile(
            binaryPath,
            ['config-manager', 'push', 'all-static', '-hhh'],
            {
              env: {
                ...process.env,
                HOME: exampleHome,
                USERPROFILE: exampleHome,
                FRODO_NO_UPDATE_CHECK: '1',
                NO_COLOR: '1',
              },
            },
            (error, out) => (error ? reject(error) : resolve(out))
          )
        );
        examples = stdout
          .split('\n')
          .filter((line) =>
            line.trim().startsWith('$ frodo config-manager push all-static')
          )
          .map((line) => line.trim().slice('$ frodo '.length));
      } finally {
        fs.rmSync(exampleHome, { recursive: true, force: true });
      }
    });

    it('there are four', () => {
      expect(examples).toHaveLength(4);
    });

    it.each([0, 1, 2, 3])(
      'example %i pushes the tree of ./config, exits 0 and asks nothing',
      async (index) => {
        write(cloudTree(), 'config');
        const words = [
          ...examples[index].split(' ').map((word) =>
            word === 'matrix' || word.startsWith('https://')
              ? '{host}'
              : // a quoted word, as the shell hands it over
                word.replace(/^'(.*)'$/, '$1')
          ),
          '--type',
          'cloud',
        ];

        const { code, output } = await runAgainst(words);

        expect(code).toBe(0);
        expect(output).not.toContain('steps failed');
        expect(wrote('PUT', '/openidm/config/audit')).toBe(true);
        // the last step, the journeys of the realm, ran too
        expect(
          wrote(
            'PUT',
            `${ALPHA}/realm-config/authentication/authenticationtrees/trees/j1`
          )
        ).toBe(true);
        // the metadata is written by the example that gives it, and by no other
        const metadata = writes().filter(
          (w) => pathOf(w) === '/openidm/config/custom-config.metadata'
        );
        expect(metadata.map((w) => JSON.parse(w.body))).toEqual(
          index === 2
            ? [
                {
                  _id: 'custom-config.metadata',
                  pushedAt: '2026-11-26T00:00:00Z',
                  versionInfo: { version: '1.0' },
                },
              ]
            : []
        );
      },
      TIMEOUT
    );
  });
});
