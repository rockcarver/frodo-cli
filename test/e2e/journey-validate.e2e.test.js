import fs from 'fs';
import os from 'os';
import path from 'path';
import { connection as c } from './utils/TestConfig';
import { exec, getEnv } from './utils/TestUtils';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);
const brokenJourneyFile = 'test/e2e/exports/all/allAlphaJourneys.journey.json';
const warningJourneyFile =
  'test/e2e/exports/all-separate/cloud-full-import/realm/root-alpha/journey/FrodoTest.journey.json';
const journeyDirectory =
  'test/e2e/exports/all-separate/cloud/realm/root-alpha/journey';

function createWarningJourneyDirectory() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'frodo-journey-validate-')
  );
  fs.copyFileSync(
    warningJourneyFile,
    path.join(directory, 'FrodoTest.journey.json')
  );
  return directory;
}

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
      `frodo journey validate --file ${brokenJourneyFile} --all`
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

  test('accepts a file relative to the selected directory', async () => {
    const directory = createWarningJourneyDirectory();
    try {
      const result = await run(
        `frodo journey validate --file FrodoTest.journey.json --directory ${directory} --all`
      );

      expect(result.code).toBe(0);
      expect(result.output).toContain('[UNCONNECTED_OUTCOME]');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('validates all separate files without requiring --all', async () => {
    const directory = createWarningJourneyDirectory();
    try {
      const result = await run(
        `frodo journey validate --all-separate --directory ${directory}`
      );

      expect(result.code).toBe(0);
      expect(result.output).toContain('[UNCONNECTED_OUTCOME]');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test.each([
    ['--all-separate', '-A requires -D'],
    [`--directory ${journeyDirectory}`, '-D requires -f or -A'],
    [
      `--file ${brokenJourneyFile} --all-separate --directory ${journeyDirectory}`,
      '-f cannot be combined with -A',
    ],
  ])('reports invalid option combination %s', async (options, message) => {
    const result = await run(`frodo journey validate ${options}`);

    expect(result.code).not.toBe(0);
    expect(result.output).toContain(message);
  });
});
