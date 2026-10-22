import { getEnv, exec } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);
const brokenJourneyFile =
  'test/e2e/exports/all/allAlphaJourneys.journey.json';
const warningJourneyFile =
  'test/e2e/exports/all-separate/cloud-full-import/realm/root-alpha/journey/FrodoTest.journey.json';
const journeyDirectory =
  'test/e2e/exports/all-separate/cloud/realm/root-alpha/journey';

async function run(command) {
  try {
    const result = await exec(command, env);
    return { code: 0, output: `${result.stdout}\n${result.stderr}` };
  } catch (error) {
    return {
      code: error.code,
      output: `${error.stdout || ''}\n${error.stderr || ''}`,
    };
  }
}

describe('frodo journey validate offline', () => {
  test('prints structural errors and exits non-zero', async () => {
    const result = await run(
      `frodo journey validate --file ${brokenJourneyFile} --all --verbose`
    );

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('[MISSING_ENTRY_NODE]');
    expect(result.output).not.toContain('__default__realm__');
  });

  test('warnings pass normally and fail in strict mode', async () => {
    const command = `frodo journey validate --file ${warningJourneyFile} --all --verbose`;
    const normal = await run(command);
    const strict = await run(`${command} --strict`);

    expect(normal.code).toBe(0);
    expect(normal.output).toContain('[UNCONNECTED_OUTCOME]');
    expect(strict.code).not.toBe(0);
    expect(strict.output).toContain('strict mode treats warnings as errors');
  });

  test('validates a selected journey from an all-separate directory', async () => {
    const result = await run(
      `frodo journey validate --all-separate --directory ${journeyDirectory} --journey-id Login`
    );

    expect(result.code).toBe(0);
  });
});
