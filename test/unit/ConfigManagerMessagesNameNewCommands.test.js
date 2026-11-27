import cp from 'child_process';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { startFakeAm } from '../utils/StartFakeAm.js';
import { ALL_RENAMES } from '../utils/ConfigManagerRenames.js';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');

/**
 * The messages that the commands of `frodo config` print while they run name the NEW names, the new group
 * word included. A command that is renamed keeps its old name as a transition alias, and the group keeps its old
 * name `config-manager` as one: each prints a notice when it is typed, so a message that tells the user to run
 * `pull applications` or `frodo config-manager pull cors` sends them to the alias. The help pages are checked in
 * ConfigManagerTransitionAliases.test.js; this file runs the real CLI of this checkout against a fake tenant in the
 * situations that print a hint (an object that an application owns, a tree of the old layout, a folder that is
 * not there, an object that is not found, a step that failed, `pull all`) and reads everything the commands print
 * (stdout and stderr) for the name of a renamed command, the old one. The table of the renames is
 * test/utils/ConfigManagerRenames.js.
 *
 * An old name, and the old group word before a verb, may appear only in the one notice line of an alias that the
 * case types itself. The folders on disk
 * (`custom-nodes/nodes`, `secret-mappings`, ...) are not command names and are not looked for: only an old name
 * after a verb (`pull applications`) or, for the promotion commands, the word of the old name.
 *
 * No tenant, no secrets, no master key, no terminal; a temporary HOME and working directory keep it away from real
 * profiles and files. Skipped on Windows: the CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

const NOTICE = /^'[^']+' is now called '[^']+'\. The old name still works/;

/**
 * The renamed commands, in the old name, that a text names: `pull applications` (with or without `frodo
 * config` before it) for the types, and the word of the old name for the promotion commands; and the old group
 * word before a verb, `config-manager pull` or `frodo config-manager export`. A line that is the notice of an
 * alias is not looked at.
 * @param {string} text what a command printed
 * @returns {string[]} the old names found, as `<verb> <old name>`, and `config-manager <verb>` for the group word
 */
export function oldNamesIn(text) {
  const lines = text.split('\n').filter((line) => !NOTICE.test(line.trim()));
  const found = new Set();
  for (const line of lines) {
    for (const [verb, oldName] of ALL_RENAMES) {
      const pattern =
        verb === 'promote'
          ? new RegExp(`(?<![\\w/.-])${oldName}(?![\\w/.-])`)
          : new RegExp(`(?<![\\w-])${verb} ${oldName}(?![\\w/.-])`);
      if (pattern.test(line)) found.add(`${verb} ${oldName}`);
    }
    for (const match of line.matchAll(
      /(?<![\w-])config-manager (pull|push|delete|migrate|promote|export|import)(?![\w-])/g
    )) {
      found.add(`config-manager ${match[1]}`);
    }
  }
  return [...found];
}

/** A connector as the fake tenant serves it. */
const connector = (name) => ({
  _id: `provisioner.openicf/${name}`,
  name,
  enabled: false,
  connectorRef: {
    connectorName: 'org.identityconnectors.ldap.LdapConnector',
    bundleName: 'b',
    bundleVersion: '1',
  },
  configurationProperties: {},
});

const FAKE = {
  journey: 'service-account',
  acceptWrites: true,
  emptyCollections: true,
  realms: ['alpha', 'bravo'],
  idmEntities: {
    'provisioner.openicf/Azure': connector('Azure'),
    'provisioner.openicf.connectorinfoprovider': {
      _id: 'provisioner.openicf.connectorinfoprovider',
      remoteConnectorClients: [
        { name: 'rcs', useSSL: true, host: 'rcs.example.com', port: 8443 },
      ],
      remoteConnectorServers: [
        { name: 'rcs', host: 'rcs.example.com', port: 8759 },
      ],
    },
    authentication: {
      _id: 'authentication',
      rsFilter: { subjectMapping: [{ queryOnResource: 'managed/alpha_user' }] },
    },
    sync: { _id: 'sync', mappings: [] },
  },
  secretStores: {
    stores: [{ _id: 'ESV', type: 'GoogleSecretManagerSecretStoreProvider' }],
    mappings: {
      ESV: [{ secretId: 'am.example.secret', aliases: ['a1'] }],
    },
  },
  managedObjects: {
    alpha_application: [
      {
        _id: 'app-1',
        _rev: '1',
        name: 'App One',
        description: 'one',
        connectorId: 'Azure',
        ssoEntities: {},
        authoritative: false,
      },
    ],
  },
};

/** A tree that keeps one folder per application: the layout marker decides, and the tenant says what an application owns. */
const APP_TREE = {
  'frodo-config-manager.json': { applications: 'folders', formatVersion: 1 },
};

/** A tree of the old layout: an object at the path of its own type, and no layout marker. */
const OLD_LAYOUT_TREE = {
  'sync/connectors/Azure.json': connector('Azure'),
};

/**
 * The cases: the command (after `frodo`), the tree it runs on (`apps`: one folder per application, `old`:
 * a tree of the old layout, `empty`: a folder without files, none: no `-D`) and the options of the fake.
 * Every case types the new names, but the last ones, which type an old name on purpose.
 */
const CASES = [
  ['pull apps (the fake tenant serves no single application, so it fails)', ['pull', 'apps'], { tree: 'empty' }],
  ['pull connectors on a tree with one folder per application', ['pull', 'connectors'], { tree: 'apps' }],
  ['pull connector-mappings on such a tree', ['pull', 'connector-mappings'], { tree: 'apps' }],
  ['pull saml on such a tree', ['pull', 'saml'], { tree: 'apps' }],
  ['pull oauth-clients on such a tree', ['pull', 'oauth-clients'], { tree: 'apps' }],
  ['pull agents on such a tree', ['pull', 'agents'], { tree: 'apps' }],
  ['pull all on such a tree', ['pull', 'all'], { tree: 'apps' }],
  ['pull all-static on such a tree', ['pull', 'all-static'], { tree: 'apps' }],
  ['push connectors from such a tree', ['push', 'connectors'], { tree: 'apps' }],
  ['push connector-mappings from such a tree', ['push', 'connector-mappings'], { tree: 'apps' }],
  ['push saml from such a tree', ['push', 'saml'], { tree: 'apps' }],
  ['push oauth-clients from such a tree', ['push', 'oauth-clients'], { tree: 'apps' }],
  ['push agents from such a tree', ['push', 'agents'], { tree: 'apps' }],
  ['push apps from such a tree', ['push', 'apps'], { tree: 'apps' }],
  ['push all-static from such a tree', ['push', 'all-static'], { tree: 'apps' }],
  [
    'push all-static against a tenant that refuses every write',
    ['push', 'all-static'],
    {
      tree: 'apps',
      fake: { failRequests: [{ method: 'PUT', path: '/' }] },
    },
  ],
  ['pull apps on a tree of the old layout', ['pull', 'apps'], { tree: 'old' }],
  ['push apps from a tree of the old layout', ['push', 'apps'], { tree: 'old' }],
  ['migrate apps -d on a tree of the old layout', ['migrate', 'apps', '-d'], { tree: 'old' }],
  ['pull apps -i of an application that is not there', ['pull', 'apps', '-i', 'nope'], { tree: 'empty' }],
  ['pull connectors -i of a connector that is not there', ['pull', 'connectors', '-i', 'nope'], { tree: 'empty' }],
  ['delete apps -d', ['delete', 'apps', '-d'], { tree: 'none' }],
  ['delete apps -i of an application that is not there', ['delete', 'apps', '-i', 'nope', '-d'], { tree: 'none' }],
  ['delete connectors -i of a connector that an application owns', ['delete', 'connectors', '-i', 'Azure'], { tree: 'none' }],
  ['delete connectors -d', ['delete', 'connectors', '-d'], { tree: 'none' }],
  ['delete secretstore-mappings -d', ['delete', 'secretstore-mappings', '-d'], { tree: 'none' }],
  ['delete connector-servers -d', ['delete', 'connector-servers', '-d'], { tree: 'none' }],
  ['pull nodes into an empty folder', ['pull', 'nodes'], { tree: 'empty' }],
  ['push nodes from a folder that is not there', ['push', 'nodes'], { tree: 'empty' }],
  ['push authn from a folder that is not there', ['push', 'authn'], { tree: 'empty' }],
  ['push connectors from a folder that is not there', ['push', 'connectors'], { tree: 'empty' }],
  ['push secretstore-mappings from a folder that is not there', ['push', 'secretstore-mappings'], { tree: 'empty' }],
  ['push connector-servers from a folder that is not there', ['push', 'connector-servers'], { tree: 'empty' }],
  ['pull secretstore-mappings', ['pull', 'secretstore-mappings'], { tree: 'empty' }],
  ['pull connector-servers', ['pull', 'connector-servers'], { tree: 'empty' }],
  ['pull authn', ['pull', 'authn'], { tree: 'empty' }],
  // the promotion: the hints name the commands that release a lock and show the state
  ['promote run --full after a lock request that was refused with the lock taken', ['promote', 'run', '--full', '-y'], { tree: 'none', realm: false, fake: { promotion: { lockId: 'lock-1', lockRequest: 'refuse-but-lock' } } }],
  ['promote run --full while somebody else holds the lock', ['promote', 'run', '--full', '-y'], { tree: 'none', realm: false, fake: { promotion: { lockId: 'lock-1', lockRequest: 'conflict', foreignLockId: 'other-1' } } }],
  ['promote run --full after a lock request that was refused', ['promote', 'run', '--full', '-y'], { tree: 'none', realm: false, fake: { promotion: { lockId: 'lock-1', lockRequest: 'refuse' } } }],
  ['promote dry-run --full after a lock request that was refused with the lock taken', ['promote', 'dry-run', '--full', '-y'], { tree: 'none', realm: false, fake: { promotion: { lockId: 'lock-1', lockRequest: 'refuse-but-lock' } } }],
  ['promote rollback --full after a lock request that was refused with the lock taken', ['promote', 'rollback', '--full', '-y'], { tree: 'none', realm: false, fake: { promotion: { lockId: 'lock-1', lockRequest: 'refuse-but-lock' } } }],
  ['promote run --full when the unlock is refused', ['promote', 'run', '--full', '-y'], { tree: 'none', realm: false, fake: { promotion: { lockId: 'lock-1', unlockRequest: 'refuse' } } }],
  ['promote unlock when the unlock is refused', ['promote', 'unlock', '--id', 'lock-1'], { tree: 'none', realm: false, fake: { promotion: { lockId: 'lock-1', unlockRequest: 'refuse' } } }],
  ['promote lock-status', ['promote', 'lock-status'], { tree: 'none', realm: false, fake: { promotion: { lockId: 'lock-1' } } }],
  ['promote status', ['promote', 'status'], { tree: 'none', realm: false, fake: { promotion: { lockId: 'lock-1' } } }],
  ['promote report', ['promote', 'report'], { tree: 'none', realm: false, fake: { promotion: { lockId: 'lock-1' } } }],
  ['promote lock', ['promote', 'lock'], { tree: 'none', realm: false, fake: { promotion: { lockId: 'lock-1' } } }],
  ['promote run when the environments are locked', ['promote', 'run', '-y'], { tree: 'none', realm: false, fake: { promotion: { lockId: 'lock-1', lock: { result: 'locked', promotionId: 'p9' } } } }],
  // the old names, typed on purpose: the notice is the one place that names them
  ['promote run-promotion --full after a lock request that was refused with the lock taken (the old name)', ['promote', 'run-promotion', '--full', '-y'], { tree: 'none', realm: false, old: true, fake: { promotion: { lockId: 'lock-1', lockRequest: 'refuse-but-lock' } } }],
  ['pull applications (the old name)', ['pull', 'applications'], { tree: 'empty', old: true }],
  // the old group word, typed on purpose: the notice of the group is the one place that names it
  ['pull cors (the old group word)', ['pull', 'cors'], { tree: 'empty', old: true, oldGroup: true }],
  ['push connectors from such a tree (the old group word)', ['push', 'connectors'], { tree: 'apps', old: true, oldGroup: true }],
  ['promote lock-status (the old group word)', ['promote', 'lock-status'], { tree: 'none', realm: false, old: true, oldGroup: true, fake: { promotion: { lockId: 'lock-1' } } }],
  ['pull applications on a tree of the old layout (the old group word and the old name)', ['pull', 'applications'], { tree: 'old', old: true, oldGroup: true }],
  ['pull connector-definitions on a tree with one folder per application (the old name)', ['pull', 'connector-definitions'], { tree: 'apps', old: true }],
  ['push connector-definitions from such a tree (the old name)', ['push', 'connector-definitions'], { tree: 'apps', old: true }],
];

suite('what the commands of the config group print while they run', () => {
  let home;
  let work;
  let record;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-messages-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-messages-work-'));
    record = path.join(home, 'requests.jsonl');
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  /** The files of a tree as `{ path: content }`. */
  const readTree = (dir) => {
    const out = {};
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name);
        if (entry.isDirectory()) walk(p);
        else out[path.relative(dir, p)] = fs.readFileSync(p, 'utf8');
      }
    };
    if (fs.existsSync(dir)) walk(dir);
    return out;
  };

  /** Writes the files of a tree below `dir`. */
  const writeTree = (dir, files) => {
    for (const [rel, content] of Object.entries(files)) {
      const target = path.join(dir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(
        target,
        typeof content === 'string' ? content : JSON.stringify(content)
      );
    }
  };

  /** Runs `frodo config <args>` (or `frodo config-manager <args>` when asked) once against the fake tenant, and gives everything that it printed. */
  async function run(
    args,
    { tree = 'none', fake = {}, realm = true, oldGroup = false } = {}
  ) {
    fakeAm = await startFakeAm({
      ...FAKE,
      ...fake,
      recordPath: record,
    });
    const treeDir = path.join(work, 'tree');
    fs.mkdirSync(treeDir, { recursive: true });
    if (tree === 'apps') writeTree(treeDir, APP_TREE);
    if (tree === 'old') writeTree(treeDir, OLD_LAYOUT_TREE);
    const argv = [
      oldGroup ? 'config-manager' : 'config',
      ...args,
      ...(tree === 'none' ? [] : ['-D', treeDir]),
      `http://127.0.0.1:${fakeAm.port}/am`,
      ...(realm ? ['alpha'] : []),
      '--type',
      'cloud',
    ];
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
      child.once('close', (code) =>
        resolve({ code, output, files: readTree(treeDir) })
      );
    });
  }

  it(
    'finds an old name in a text that has one, and none in the notice of an alias',
    () => {
      expect(
        oldNamesIn('a connector is pulled by "pull applications".')
      ).toEqual(['pull applications']);
      expect(
        oldNamesIn('see frodo config push connector-definitions -h')
      ).toEqual(['push connector-definitions']);
      // the old group word before a verb, with or without frodo, is found too
      expect(oldNamesIn('see frodo config-manager pull cors -h')).toEqual([
        'config-manager pull',
      ]);
      expect(oldNamesIn('use config-manager export')).toEqual([
        'config-manager export',
      ]);
      // the layout setting, the tool and the layout file keep the word
      expect(
        oldNamesIn(
          'frodo settings config-manager-layout; fr-config-manager pull; frodo-config-manager.json; a config-manager tree'
        )
      ).toEqual([]);
      expect(oldNamesIn('release it with promote unlock-tenants --id x')).toEqual(
        ['promote unlock-tenants']
      );
      expect(
        oldNamesIn(
          "'applications' is now called 'apps'. The old name still works and will be removed in a future major release."
        )
      ).toEqual([]);
      expect(
        oldNamesIn(
          "'config-manager' is now called 'config'. The old name still works and will be removed in a future major release."
        )
      ).toEqual([]);
      // the folders of the tree are not command names
      expect(
        oldNamesIn("'custom-nodes/nodes' not found; realms/alpha/secret-mappings")
      ).toEqual([]);
    }
  );

  it.each(CASES)(
    '%s: no message names an old command',
    async (_label, args, { tree, fake, old, realm, oldGroup }) => {
      const { output, code } = await run(args, { tree, fake, realm, oldGroup });

      expect(oldNamesIn(output)).toEqual([]);
      // a case that types an old name prints its one notice, so that the check above is not a check of nothing
      if (old) expect(output).toMatch(/is now called '/);
      else expect(output).not.toMatch(/is now called '/);
      // the old group word prints its notice once, and only where the case types it
      expect(
        output.split("'config-manager' is now called 'config'.").length - 1
      ).toBe(oldGroup ? 1 : 0);
      // a run that did not start would print nothing that could name a command
      expect(code === null || typeof code === 'number').toBe(true);
      expect(output.length).toBeGreaterThan(0);
    },
    TIMEOUT
  );
});
