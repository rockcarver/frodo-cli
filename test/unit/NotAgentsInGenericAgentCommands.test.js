import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { readRequests } from '../utils/FakeAmLog.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * frodo-cli#1243 and #1235: OAuth2 clients, trusted JWT issuers and CIMD profiles
 * are not agents of the generic agent commands. Each kind has a module of its own in
 * the library and a command family of its own in the CLI (`oauth client`, `oauth
 * issuer`, `oauth cimd`), and the generic code reads every other type the realm lists
 * (core record 0022). This test proves it from the CLI side, through the REAL CLI of
 * this checkout against the fake tenant of test/utils/FakeAm.mjs and its request log,
 * once per deployment type:
 *
 * - `agent list`, `agent export -a`, `agent export -A` and `agent delete -a --yes` never
 *   ask the realm for one of the three kinds, and never write or delete one;
 * - `agent describe -i <id>` of an issuer and of a profile answers that the agent is
 *   not found (exit code 1);
 * - the commands that do own the kinds read each of them exactly once (the control: the
 *   request log can see what it must not see);
 * - the help of the four commands says where the kinds went (the sentence is pinned
 *   here on purpose: changing the wording is a decision).
 *
 * The realm holds one trusted JWT issuer, one CIMD profile and one OAuth2 client, and
 * offers one agent type of its own (WebAgent, with no web agent in it), so the generic
 * commands have a type to read and the three kinds to leave alone.
 *
 * No tenant, no secrets, no terminal; a temporary HOME keeps the run away from real
 * profiles. Skipped on Windows: the CLI is started through its launcher script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const launch = path.join(ROOT, 'dist/launch.cjs');
const TIMEOUT = 120000;

const ISSUER = 'zion-issuer';
const PROFILE = 'zion-profile';
const CLIENT = 'zion-client';
/** The agent types of the kinds that are not agents. */
const OWN_MODULE_TYPES = ['OAuth2Client', 'TrustedJwtIssuer', 'CIMDProfile'];
/** A request for the collection or an object of one of those types, whatever the method. */
const ASKS_FOR_OWN_MODULE_TYPE = new RegExp(
  `/realm-config/agents/(${OWN_MODULE_TYPES.join('|')})\\b`
);

const SENTENCE =
  'OAuth2 clients, trusted JWT issuers and CIMD profiles are not agents of this command: see frodo oauth client, frodo oauth issuer and frodo oauth cimd.';

suite('the generic agent commands do not handle other kinds', () => {
  let fakeAm;
  let home;
  let work;
  let recordPath;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-not-agents-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-not-agents-work-'));
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  async function startRealm(mode) {
    recordPath = path.join(home, 'requests.jsonl');
    fakeAm = await startFakeAm({
      recordPath,
      journey: 'password',
      realms: ['alpha'],
      agentTypes: ['WebAgent', ...OWN_MODULE_TYPES],
      oauthIssuers: [ISSUER],
      oauthCimdProfiles: [PROFILE],
      oauth2Clients: [CLIENT],
      emptyCollections: true,
      ...(mode === 'classic' ? {} : { logApiKeys: [] }),
    });
  }

  /** Runs `frodo <args>` against the fake as `mode`; returns what it printed, its exit code and the requests of this run only. */
  function run(mode, args) {
    fs.rmSync(recordPath, { force: true });
    const result = cp.spawnSync(
      process.execPath,
      [
        launch,
        ...args,
        `http://127.0.0.1:${fakeAm.port}/am`,
        'alpha',
        'someone',
        'secret',
        '-m',
        mode,
      ],
      {
        cwd: work,
        input: '',
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
          FRODO_NO_CACHE: 'true',
          FRODO_NO_PROMPT: '1',
          NO_COLOR: '1',
          FRODO_HOST: '',
          FRODO_REALM: '',
          FRODO_USERNAME: '',
          FRODO_PASSWORD: '',
          FRODO_SA_ID: '',
          FRODO_SA_JWK: '',
          FRODO_CREDENTIAL: '',
        },
      }
    );
    return {
      status: result.status,
      output: result.stdout + result.stderr,
      requests: readRequests(recordPath),
    };
  }

  const urls = (requests) =>
    requests.map((request) => `${request.method} ${request.url}`);

  /** The requests that name one of the three kinds, as `METHOD url`. */
  const askedForOwnModuleTypes = (requests) =>
    urls(requests).filter((line) => ASKS_FOR_OWN_MODULE_TYPE.test(line));

  /** How often the realm was asked for the collection of `type`. */
  const collectionReads = (requests, type) =>
    requests.filter(
      (request) =>
        request.method === 'GET' &&
        new RegExp(`/realm-config/agents/${type}\\?_queryFilter=true$`).test(
          request.url
        )
    ).length;

  describe.each(['classic', 'forgeops', 'cloud'])('%s', (mode) => {
    test(
      'agent list, export and delete never ask for, write or delete the other kinds',
      async () => {
        await startRealm(mode);
        const commands = [
          ['agent', 'list'],
          ['agent', 'export', '-a', '-f', path.join(work, 'all.agent.json')],
          ['agent', 'export', '-A', '-D', path.join(work, 'separate')],
          ['agent', 'delete', '-a', '--yes'],
        ];
        for (const command of commands) {
          const { status, output, requests } = run(mode, command);
          const label = command.join(' ');
          // the run is real: it logged in and read the type list and the agent type of its own
          expect([label, status]).toEqual([label, 0]);
          expect(output).not.toMatch(/error/i);
          expect([label, collectionReads(requests, 'WebAgent')]).toEqual([
            label,
            1,
          ]);
          // and left the three kinds alone
          expect([label, askedForOwnModuleTypes(requests)]).toEqual([
            label,
            [],
          ]);
        }
      },
      TIMEOUT
    );

    test.each([
      ['a trusted JWT issuer', ISSUER],
      ['a CIMD profile', PROFILE],
    ])(
      'agent describe -i of %s answers that the agent is not found',
      async (_name, id) => {
        await startRealm(mode);
        const { status, output, requests } = run(mode, [
          'agent',
          'describe',
          '-i',
          id,
        ]);
        expect(status).toBe(1);
        expect(output).toContain(`Agent not found: ${id}`);
        expect(askedForOwnModuleTypes(requests)).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'control: oauth issuer list and oauth cimd list read their kind once',
      async () => {
        await startRealm(mode);
        const issuers = run(mode, ['oauth', 'issuer', 'list']);
        expect(issuers.status).toBe(0);
        expect(issuers.output).toContain(ISSUER);
        expect(collectionReads(issuers.requests, 'TrustedJwtIssuer')).toBe(1);
        expect(askedForOwnModuleTypes(issuers.requests)).toEqual([
          expect.stringMatching(/TrustedJwtIssuer\?_queryFilter=true$/),
        ]);

        const profiles = run(mode, ['oauth', 'cimd', 'list']);
        expect(profiles.status).toBe(0);
        expect(profiles.output).toContain(PROFILE);
        expect(collectionReads(profiles.requests, 'CIMDProfile')).toBe(1);
        expect(askedForOwnModuleTypes(profiles.requests)).toEqual([
          expect.stringMatching(/CIMDProfile\?_queryFilter=true$/),
        ]);
      },
      TIMEOUT
    );
  });

  describe.each(['list', 'describe', 'export', 'delete'])(
    'the help of agent %s',
    (verb) => {
      test('says where the other kinds went', () => {
        const result = cp.spawnSync(
          process.execPath,
          [launch, 'agent', verb, '-h'],
          {
            cwd: work,
            encoding: 'utf8',
            env: { ...process.env, HOME: work, NO_COLOR: '1' },
          }
        );
        expect(result.status).toBe(0);
        // the help wraps lines
        expect(result.stdout.replace(/\s+/g, ' ')).toContain(SENTENCE);
      });
    }
  );
});
