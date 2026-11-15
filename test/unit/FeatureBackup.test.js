import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { repairPlan } from '../utils/FeatureDiagnosisFixtures.js';

/**
 * The backup of `frodo feature validate --repair` (src/ops/FeatureBackup.ts):
 * the raw configuration the repair would overwrite or delete, written before
 * the first change, one JSON file per part, readable by the owner only. It uses
 * the real file system in a temporary directory; nothing is written elsewhere.
 */
const { backupStamp, writeFeatureBackup } =
  await import('../../src/ops/FeatureBackup');

const TIME = new Date('2026-11-14T23:15:09.123Z');
const STAMP = '20261114T231509Z';
const mode = (file) => fs.statSync(file).mode & 0o777;
const onWindows = process.platform === 'win32';

let work;
beforeEach(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-feature-backup-'));
});
afterEach(() => {
  fs.rmSync(work, { recursive: true, force: true });
});

describe('backupStamp', () => {
  test('is the time as a part of a file name, to the second, in UTC', () => {
    expect(backupStamp(TIME)).toBe(STAMP);
  });
});

describe('writeFeatureBackup', () => {
  test('writes one file per part of what the repair would overwrite or delete, named for the feature and the time', () => {
    const directory = path.join(work, 'backup');

    const files = writeFeatureBackup(repairPlan, directory, TIME);

    expect(files.map((file) => path.basename(file)).sort()).toEqual(
      [
        `aiagent-${STAMP}-config-managed.json`,
        `aiagent-${STAMP}-config-repo.ds.json`,
        `aiagent-${STAMP}-feature.json`,
        `aiagent-${STAMP}-idm-alpha_aiagent.json`,
        `aiagent-${STAMP}-idm-alpha_aiagentprivilege.json`,
        `aiagent-${STAMP}-oauth2-provider-alpha.json`,
        `aiagent-${STAMP}-plan.json`,
        `aiagent-${STAMP}-secret-store-mappings.json`,
      ].sort()
    );
    expect(fs.readdirSync(directory).sort()).toEqual(
      files.map((file) => path.basename(file)).sort()
    );
  });

  test('writes the raw content as the tenant returned it', () => {
    const files = writeFeatureBackup(repairPlan, path.join(work, 'b'), TIME);
    const read = (part) =>
      JSON.parse(
        fs.readFileSync(files.find((file) => file.endsWith(`-${part}.json`)))
      );

    expect(read('config-managed')).toEqual(repairPlan.backup.managed);
    expect(read('config-repo.ds')).toEqual(repairPlan.backup.repoDs);
    expect(read('feature')).toEqual(repairPlan.backup.feature);
    expect(read('oauth2-provider-alpha')).toEqual(
      repairPlan.backup.providers.alpha
    );
    expect(read('idm-alpha_aiagent')).toEqual(
      repairPlan.backup.idmObjects.alpha_aiagent
    );
    expect(read('secret-store-mappings')).toEqual(
      repairPlan.backup.secretStoreMappings
    );
  });

  test('the plan file holds the diagnosis and the steps, not the raw backup a second time', () => {
    const files = writeFeatureBackup(repairPlan, path.join(work, 'b'), TIME);
    const plan = JSON.parse(
      fs.readFileSync(files.find((file) => file.endsWith('-plan.json')))
    );

    expect(plan.featureId).toBe('aiagent');
    expect(plan.diagnosis.findings.length).toBeGreaterThan(0);
    expect(plan.steps.map((step) => step.id)).toContain('enable');
    expect(plan.backup).toBeUndefined();
  });

  test('leaves out a realm without a provider and a mapping list that is empty', () => {
    const files = writeFeatureBackup(
      {
        ...repairPlan,
        backup: { ...repairPlan.backup, secretStoreMappings: [] },
      },
      path.join(work, 'b'),
      TIME
    );
    const names = files.map((file) => path.basename(file)).join('\n');

    expect(names).not.toContain('oauth2-provider-bravo');
    expect(names).not.toContain('secret-store-mappings');
  });

  (onWindows ? test.skip : test)(
    'creates the directory for the owner only and gives every file the same',
    () => {
      const directory = path.join(work, 'a', 'b', 'backup');

      const files = writeFeatureBackup(repairPlan, directory, TIME);

      expect(mode(directory)).toBe(0o700);
      for (const file of files) expect(mode(file)).toBe(0o600);
    }
  );

  test('creates the directory when it does not exist, nested', () => {
    const directory = path.join(work, 'does', 'not', 'exist');

    writeFeatureBackup(repairPlan, directory, TIME);

    expect(fs.statSync(directory).isDirectory()).toBe(true);
  });

  test('a relative directory is relative to the current directory', () => {
    const before = process.cwd();
    process.chdir(work);
    try {
      const files = writeFeatureBackup(repairPlan, 'relative-backup', TIME);

      expect(fs.realpathSync(path.dirname(files[0]))).toBe(
        fs.realpathSync(path.join(work, 'relative-backup'))
      );
    } finally {
      process.chdir(before);
    }
  });

  test('never overwrites a file: a second backup of the same second fails and keeps the first', () => {
    const directory = path.join(work, 'backup');
    const [first] = writeFeatureBackup(repairPlan, directory, TIME);
    const content = fs.readFileSync(first, 'utf8');

    expect(() => writeFeatureBackup(repairPlan, directory, TIME)).toThrow(
      /EEXIST/
    );

    expect(fs.readFileSync(first, 'utf8')).toBe(content);
  });

  test('a backup of another time sits next to the first one', () => {
    const directory = path.join(work, 'backup');
    const first = writeFeatureBackup(repairPlan, directory, TIME);

    const second = writeFeatureBackup(
      repairPlan,
      directory,
      new Date('2026-11-14T23:16:00Z')
    );

    expect(fs.readdirSync(directory)).toHaveLength(
      first.length + second.length
    );
  });

  test('a path that is a file is refused, and nothing is written', () => {
    const file = path.join(work, 'a-file');
    fs.writeFileSync(file, 'x');

    expect(() => writeFeatureBackup(repairPlan, file, TIME)).toThrow();

    expect(fs.readFileSync(file, 'utf8')).toBe('x');
  });

  test('a name of a realm or an object with a path separator cannot leave the directory', () => {
    const directory = path.join(work, 'backup');
    const files = writeFeatureBackup(
      {
        ...repairPlan,
        backup: {
          ...repairPlan.backup,
          providers: { '../../escape': { _id: 'x' } },
          idmObjects: { 'a/b': [] },
        },
      },
      directory,
      TIME
    );

    for (const file of files) {
      expect(fs.realpathSync(path.dirname(file))).toBe(
        fs.realpathSync(directory)
      );
    }
  });
});
