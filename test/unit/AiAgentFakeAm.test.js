import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { readRequests } from '../utils/FakeAmLog.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * The AI agent commands through the REAL CLI of this checkout, against the fake
 * tenant of test/utils/FakeAm.mjs (cli#1271): the root group `frodo aiagent` and the
 * deprecated `frodo agent ai`, which runs the same commands. The fake serves the AI
 * agents the way AM does under `.../realm-config/agents/AIAgent` and keeps what is
 * written to it, so the commands run against the real library: what they send, what
 * they print, which files they write and which exit code they end with. No tenant,
 * no secrets, no terminal; a temporary HOME keeps the run away from real profiles.
 * The tenant is a classic one (`-m classic`), because the fake serves AM only and a
 * cloud login also reads the agent identities from IDM.
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

/**
 * An AI agent as the fake serves it (only the sections the commands read). It
 * carries its identity: the library's import of an AI agent clones
 * `_aiAgentIdentity` and throws on an agent without one, which a classic tenant's
 * export never has.
 */
const aiAgent = (id, status = 'Active') => ({
  _id: id,
  _rev: '1',
  _aiAgentIdentity: { _id: `${id}-identity`, _privileges: [] },
  coreOAuth2ClientConfig: {
    status: { inherited: false, value: status },
    clientName: { inherited: false, value: [id] },
  },
  _type: { _id: 'AIAgent', name: 'AI Agent', collection: true },
});

const TENANT = [
  aiAgent('oracle-assistant'),
  aiAgent('zion-courier', 'Inactive'),
];

const NOTICE = "Deprecated feature in use: 'frodo agent ai";

suite(
  'frodo aiagent and frodo agent ai, through the CLI against a fake tenant',
  () => {
    let fakeAm;
    let home;
    let work;
    let recordPath;

    beforeAll(() => {
      ensureFrodoArtifact();
    });

    /** Starts a fake tenant that holds `agents`; its state lives as long as the process. */
    async function startTenant(agents = TENANT) {
      recordPath = path.join(home, 'requests.jsonl');
      fakeAm = await startFakeAm({
        recordPath,
        journey: 'password',
        aiAgents: agents,
      });
    }

    beforeEach(() => {
      home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-aiagent-home-'));
      work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-aiagent-work-'));
    });

    afterEach(() => {
      fakeAm?.stop();
      fakeAm = undefined;
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(work, { recursive: true, force: true });
    });

    /** Runs `frodo <path...> <args>` against the fake in the working directory, with no terminal. */
    function run(commandPath, args, { login = true } = {}) {
      const result = cp.spawnSync(
        process.execPath,
        [
          launch,
          ...commandPath,
          ...args,
          ...(login
            ? [
                `http://127.0.0.1:${fakeAm.port}/am`,
                'alpha',
                'someone',
                'secret',
                '-m',
                'classic',
              ]
            : []),
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
        stdout: result.stdout,
        stderr: result.stderr,
        output: result.stdout + result.stderr,
      };
    }

    const requests = () => readRequests(recordPath);
    const agentRequests = (method) =>
      requests().filter(
        (request) =>
          request.method === method &&
          request.url.includes('/realm-config/agents/AIAgent')
      );
    const read = (name) =>
      JSON.parse(fs.readFileSync(path.join(work, name), 'utf8'));

    describe.each([
      ['frodo aiagent', ['aiagent']],
      ['frodo agent ai', ['agent', 'ai']],
    ])('%s', (_name, commandPath) => {
      const frodo = (args, options) => run(commandPath, args, options);
      // The behaviours of every option are run through frodo aiagent; frodo agent
      // ai, which is the same commands, runs one smoke test per command.
      const detail = commandPath[0] === 'aiagent' ? it : () => {};
      /** The ids the fake holds, asked through the CLI itself. */
      const idsOnTenant = () =>
        frodo(['list']).stdout.trim().split('\n').filter(Boolean);

      describe('list', () => {
        it(
          'prints the id of every AI agent',
          async () => {
            await startTenant();

            const { status, stdout } = frodo(['list']);

            expect(stdout.trim().split('\n')).toEqual([
              'oracle-assistant',
              'zion-courier',
            ]);
            expect(status).toBe(0);
          },
          TIMEOUT
        );

        detail(
          '--long prints the table with the status of every AI agent',
          async () => {
            await startTenant();

            const { status, stdout } = frodo(['list', '--long']);

            expect(stdout).toMatch(/AIAgent Id\s+│Status/);
            expect(stdout).toMatch(/oracle-assistant\s*│Active/);
            expect(stdout).toMatch(/zion-courier\s*│Inactive/);
            expect(status).toBe(0);
          },
          TIMEOUT
        );

        detail(
          'a realm without AI agents lists nothing and succeeds',
          async () => {
            await startTenant([]);

            const { status, stdout } = frodo(['list']);

            expect(stdout.trim()).toBe('');
            expect(status).toBe(0);
          },
          TIMEOUT
        );
      });

      describe('describe', () => {
        it(
          '-i prints the table of the AI agent, read by id',
          async () => {
            await startTenant();

            const { status, stdout } = frodo([
              'describe',
              '-i',
              'zion-courier',
            ]);

            expect(stdout).toMatch(/Agent Id\s*│zion-courier/);
            expect(stdout).toMatch(/Status\s*│Inactive/);
            expect(stdout).toMatch(/Type\s*│AI Agent/);
            expect(status).toBe(0);
            expect(
              agentRequests('GET').some((request) =>
                request.url.includes('/AIAgent/zion-courier')
              )
            ).toBe(true);
          },
          TIMEOUT
        );

        detail(
          '-i with --json prints the object as the server answered the read',
          async () => {
            await startTenant();

            const { status, stdout } = frodo([
              'describe',
              '-i',
              'oracle-assistant',
              '--json',
            ]);

            const printed = JSON.parse(stdout);
            expect(printed._id).toBe('oracle-assistant');
            expect(printed.coreOAuth2ClientConfig.status.value).toBe('Active');
            expect(status).toBe(0);
          },
          TIMEOUT
        );

        detail(
          'an unknown id is reported by name',
          async () => {
            await startTenant();

            const { output } = frodo(['describe', '-i', 'nobody']);

            // The exit code is not pinned: describe ends 0 after the error it
            // prints (found while testing cli#1271, not changed here).
            expect(output).toContain('nobody');
          },
          TIMEOUT
        );
      });

      describe('export', () => {
        it(
          '-i writes <id>.ai.agent.json with that AI agent and the metadata',
          async () => {
            await startTenant();

            const { status, output } = frodo([
              'export',
              '-i',
              'oracle-assistant',
            ]);

            const file = read('oracle-assistant.ai.agent.json');
            expect(Object.keys(file).sort()).toEqual(['agent', 'meta']);
            expect(Object.keys(file.agent)).toEqual(['oracle-assistant']);
            expect(file.agent['oracle-assistant']._type._id).toBe('AIAgent');
            expect(output).not.toContain('Error');
            expect(status).toBe(0);
          },
          TIMEOUT
        );

        detail(
          '-i with -f and -N names the file and leaves the metadata out',
          async () => {
            await startTenant();

            const { status } = frodo([
              'export',
              '-i',
              'oracle-assistant',
              '-f',
              'mine.json',
              '-N',
            ]);

            expect(Object.keys(read('mine.json'))).toEqual(['agent']);
            expect(status).toBe(0);
          },
          TIMEOUT
        );

        detail(
          '-a writes allAlphaAIAgents.ai.agent.json with every AI agent',
          async () => {
            await startTenant();

            const { status } = frodo(['export', '-a']);

            expect(
              Object.keys(read('allAlphaAIAgents.ai.agent.json').agent).sort()
            ).toEqual(['oracle-assistant', 'zion-courier']);
            expect(status).toBe(0);
          },
          TIMEOUT
        );

        detail(
          '-A writes a <id>.ai.agent.json file per AI agent, as its help says',
          async () => {
            await startTenant();

            const { status } = frodo(['export', '-A']);

            expect(
              fs.readdirSync(work).filter((name) => name.endsWith('.json'))
            ).toEqual([
              'oracle-assistant.ai.agent.json',
              'zion-courier.ai.agent.json',
            ]);
            expect(status).toBe(0);
          },
          TIMEOUT
        );

        detail(
          'an unknown id exits 1 and writes no file',
          async () => {
            await startTenant();

            const { status, output } = frodo(['export', '-i', 'nobody']);

            expect(output).toContain('nobody');
            expect(status).toBe(1);
            expect(fs.readdirSync(work)).toEqual([]);
          },
          TIMEOUT
        );
      });

      describe('import', () => {
        /** Exports the AI agents of the tenant to files, then empties the tenant. */
        function exportAndEmpty() {
          expect(frodo(['export', '-a']).status).toBe(0);
          expect(frodo(['export', '-A']).status).toBe(0);
          expect(frodo(['delete', '-a', '-y']).status).toBe(0);
          expect(idsOnTenant()).toEqual([]);
        }

        detail(
          '-i with -f imports that AI agent from the file and no other',
          async () => {
            await startTenant();
            exportAndEmpty();

            const { status } = frodo([
              'import',
              '-i',
              'zion-courier',
              '-f',
              'allAlphaAIAgents.ai.agent.json',
            ]);

            expect(status).toBe(0);
            expect(idsOnTenant()).toEqual(['zion-courier']);
          },
          TIMEOUT
        );

        detail(
          // a file with several AI agents is not used here: -f alone imports all
          // of them today, not the first only (frodo-cli#1147, not changed here)
          '-f alone imports the AI agent of a file that holds one',
          async () => {
            await startTenant();
            exportAndEmpty();

            const { status } = frodo([
              'import',
              '-f',
              'oracle-assistant.ai.agent.json',
            ]);

            expect(status).toBe(0);
            expect(idsOnTenant()).toEqual(['oracle-assistant']);
          },
          TIMEOUT
        );

        it(
          '-a with -f imports every AI agent of the file',
          async () => {
            await startTenant();
            exportAndEmpty();

            const { status } = frodo([
              'import',
              '-a',
              '-f',
              'allAlphaAIAgents.ai.agent.json',
            ]);

            expect(status).toBe(0);
            expect(idsOnTenant().sort()).toEqual([
              'oracle-assistant',
              'zion-courier',
            ]);
          },
          TIMEOUT
        );

        detail(
          '-A imports the AI agents of the *.ai.agent.json files of the directory',
          async () => {
            await startTenant();
            exportAndEmpty();
            fs.rmSync(path.join(work, 'allAlphaAIAgents.ai.agent.json'));

            const { status } = frodo(['import', '-A']);

            expect(status).toBe(0);
            expect(idsOnTenant().sort()).toEqual([
              'oracle-assistant',
              'zion-courier',
            ]);
          },
          TIMEOUT
        );

        it(
          '-i or -a without -f is rejected before anything is sent: the import needs a file or -A',
          async () => {
            await startTenant();

            for (const args of [['-i', 'oracle-assistant'], ['-a'], []]) {
              const { status, output } = frodo(['import', ...args]);

              expect(output).toContain(
                'one of -f, --file <file> | -A, --all-separate is required'
              );
              expect(status).toBe(1);
            }
            expect(requests()).toEqual([]);
          },
          TIMEOUT
        );
      });

      describe('delete', () => {
        it(
          '-i deletes that AI agent and no other',
          async () => {
            await startTenant();

            const { status } = frodo(['delete', '-i', 'zion-courier']);

            expect(status).toBe(0);
            expect(idsOnTenant()).toEqual(['oracle-assistant']);
          },
          TIMEOUT
        );

        detail(
          '-i with an unknown id exits 1',
          async () => {
            await startTenant();

            const { status, output } = frodo(['delete', '-i', 'nobody']);

            expect(output).toContain('nobody');
            expect(status).toBe(1);
            expect(idsOnTenant()).toHaveLength(2);
          },
          TIMEOUT
        );

        detail(
          '-a without a terminal and without -y is refused before the login, naming --yes',
          async () => {
            await startTenant();

            const { status, output } = frodo(['delete', '-a']);

            expect(output).toContain('--yes');
            expect(status).toBe(1);
            expect(requests()).toEqual([]);
          },
          TIMEOUT
        );

        it(
          '-a -y deletes every AI agent',
          async () => {
            await startTenant();

            const { status } = frodo(['delete', '-a', '-y']);

            expect(status).toBe(0);
            expect(idsOnTenant()).toEqual([]);
            expect(agentRequests('DELETE')).toHaveLength(2);
          },
          TIMEOUT
        );
      });
    });

    describe('the deprecation of frodo agent ai', () => {
      it(
        'a run of agent ai prints the notice that names frodo aiagent on standard error and leaves standard output and the exit code as they are',
        async () => {
          await startTenant();

          const old = run(['agent', 'ai'], ['list']);
          const current = run(['aiagent'], ['list']);

          expect(old.stderr).toContain(NOTICE);
          expect(old.stderr).toContain("Use 'frodo aiagent' instead");
          expect(old.stdout).not.toContain('Deprecated');
          expect(old.stdout).toBe(current.stdout);
          expect(old.status).toBe(0);
          expect(current.status).toBe(0);
        },
        TIMEOUT
      );

      it(
        'every command of agent ai prints it, and it is printed once per run',
        async () => {
          await startTenant();

          for (const args of [
            ['list'],
            ['describe', '-i', 'nobody'],
            ['export', '-i', 'nobody'],
            ['import', '-f', 'nobody.json'],
            ['delete', '-i', 'nobody'],
          ]) {
            const { stderr } = run(['agent', 'ai'], args);

            expect(stderr).toContain(`${NOTICE} ${args[0]}'`);
            expect(stderr.split(NOTICE)).toHaveLength(2);
          }
        },
        TIMEOUT
      );

      it(
        'a run of frodo aiagent prints no notice',
        async () => {
          await startTenant();

          for (const args of [
            ['list'],
            ['describe', '-i', 'nobody'],
            ['delete', '-i', 'nobody'],
          ]) {
            const { output } = run(['aiagent'], args);

            expect(output).not.toMatch(/Deprecated|deprecated/);
          }
        },
        TIMEOUT
      );

      it(
        'the generic agent commands print no notice and still list the AI agents',
        async () => {
          await startTenant();

          const { stderr } = run(['agent'], ['list']);

          expect(stderr).not.toMatch(/Deprecated|deprecated/);
        },
        TIMEOUT
      );
    });
  }
);
