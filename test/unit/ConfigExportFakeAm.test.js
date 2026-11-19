import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { readRequests } from '../utils/FakeAmLog.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * `frodo config export` through the REAL CLI of this checkout, once per deployment
 * type (Classic, ForgeOps, Cloud), against the fake tenant of test/utils/FakeAm.mjs
 * (cli#1282). The recorded `config export` e2e tests of Classic and ForgeOps are
 * skipped, so nothing else runs the whole command on those deployment types; this
 * suite is the end-to-end check of what the library asks the server for.
 *
 * What it pins is the agent types. Since frodo-lib 5.0.0-38 (lib#1040, core record
 * 0022) the library works out per call which agent types the generic agent code
 * asks for: every type the realm lists except the types that have a module of their
 * own (OAuth2 clients, trusted JWT issuers, CIMD profiles; each is read by its own
 * module, once), and except the Soap STS agent outside Classic deployments (a
 * Classic-only type). The fake lists all of them in every realm, as a server that
 * offers them would, so a filter that is missing shows as a request.
 *
 * Scope: the realm-level dynamic configuration of the active realm
 * (`--dynamic -r`), because that is where the agent types live (agents, agent groups,
 * OAuth2 clients, trusted JWT issuers, CIMD profiles) and it is a small part of the
 * whole export. The tenant is empty (`emptyCollections`): every collection query
 * the fake has no route for is answered with an empty collection, so the command
 * runs through with no error, and the request log shows what it asked for. No
 * tenant, no secrets, no terminal; a temporary HOME keeps the run away from real
 * profiles.
 *
 * The fake has no deployment type of its own: `-m` tells the CLI which one to log
 * in as. ForgeOps and Cloud log in to AM with a user name and password and then
 * ask for an OAuth2 token, which the fake answers when it serves log API keys (an
 * empty list here); Classic needs no token.
 *
 * Skipped on Windows: the CLI is started through its launcher script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const launch = path.join(ROOT, 'dist/launch.cjs');
const TIMEOUT = 120000;

/** The agent types every realm of the fake offers, the ones with a module of their own and the Soap STS agent among them. */
const OFFERED_AGENT_TYPES = [
  'WebAgent',
  'J2EEAgent',
  'SoapSTSAgent',
  'IdentityGatewayAgent',
  'OAuth2Client',
  'TrustedJwtIssuer',
  'CIMDProfile',
];

/** What an export asks the realm for, per agent type: the generic agent code, plus the modules of their own. */
const ASKED_ON_EVERY_DEPLOYMENT = [
  'CIMDProfile',
  'IdentityGatewayAgent',
  'J2EEAgent',
  'OAuth2Client',
  'TrustedJwtIssuer',
  'WebAgent',
];
const ASKED_ON_CLASSIC = [...ASKED_ON_EVERY_DEPLOYMENT, 'SoapSTSAgent'].sort();

suite('frodo config export, through the CLI against a fake tenant', () => {
  let fakeAm;
  let home;
  let work;
  let recordPath;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-config-export-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-config-export-work-'));
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  /** Exports the dynamic configuration of the realm `alpha` as `mode` ('classic', 'forgeops' or 'cloud'). */
  async function exportRealm(mode) {
    recordPath = path.join(home, 'requests.jsonl');
    fakeAm = await startFakeAm({
      recordPath,
      journey: 'password',
      realms: ['alpha'],
      agentTypes: OFFERED_AGENT_TYPES,
      emptyCollections: true,
      ...(mode === 'classic' ? {} : { logApiKeys: [] }),
    });
    const file = path.join(work, 'export.json');
    const result = cp.spawnSync(
      process.execPath,
      [
        launch,
        'config',
        'export',
        '--all',
        '--file',
        file,
        '--dynamic',
        '--realm-only',
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
      file,
    };
  }

  /** The agent types the export asked the realm for, one entry per request, sorted. */
  const askedAgentTypes = (requests) =>
    requests
      .filter((request) => request.method === 'GET')
      .map((request) =>
        request.url.match(
          /\/realms\/alpha\/realm-config\/agents\/([A-Za-z0-9]+)\?_queryFilter=true$/
        )
      )
      .filter(Boolean)
      .map((match) => match[1])
      .sort();

  const askedIdm = (requests) =>
    requests.filter((request) => request.url.startsWith('/openidm/'));

  test(
    'Classic: the export runs through and asks for the Soap STS agent as well',
    async () => {
      const { status, output, requests, file } = await exportRealm('classic');
      expect(output).not.toMatch(/error/i);
      expect(status).toBe(0);
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).realm).toHaveProperty(
        'root-alpha'
      );
      // each type is asked for once, SoapSTSAgent included; Classic has no IDM
      expect(askedAgentTypes(requests)).toEqual(ASKED_ON_CLASSIC);
      expect(askedIdm(requests)).toEqual([]);
    },
    TIMEOUT
  );

  test(
    'ForgeOps: the export runs through and does not ask for the Soap STS agent',
    async () => {
      const { status, output, requests, file } = await exportRealm('forgeops');
      expect(output).not.toMatch(/error/i);
      expect(status).toBe(0);
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).realm).toHaveProperty(
        'root-alpha'
      );
      expect(askedAgentTypes(requests)).toEqual(ASKED_ON_EVERY_DEPLOYMENT);
      // ForgeOps reads the applications of IDM, the realm's table has no prefix
      expect(askedIdm(requests).map((request) => request.url)).toEqual([
        expect.stringMatching(/^\/openidm\/managed\/application\?/),
      ]);
    },
    TIMEOUT
  );

  test(
    'Cloud: the export runs through and does not ask for the Soap STS agent',
    async () => {
      const { status, output, requests, file } = await exportRealm('cloud');
      expect(output).not.toMatch(/error/i);
      expect(status).toBe(0);
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).realm).toHaveProperty(
        'root-alpha'
      );
      expect(askedAgentTypes(requests)).toEqual(ASKED_ON_EVERY_DEPLOYMENT);
      // Cloud reads the applications of IDM, in the table of the realm
      expect(askedIdm(requests).map((request) => request.url)).toEqual([
        expect.stringMatching(/^\/openidm\/managed\/alpha_application\?/),
      ]);
    },
    TIMEOUT
  );
});
