import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { state } from '@rockcarver/frodo-lib';
import { findAliasConflict } from '../../src/ops/ConnectionProfileOps.ts';

// `frodo conn save` creates a service account and a log API key in the tenant
// before it saves the profile, so a taken alias has to be refused first.

const hostA = 'https://openam-a.example.com/am';
const hostB = 'https://openam-b.example.com/am';

let dir;
let profilesPath;

function writeProfiles(profiles) {
  fs.writeFileSync(profilesPath, JSON.stringify(profiles, null, 2));
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conn-save-alias-'));
  profilesPath = path.join(dir, 'Connections.json');
  state.setConnectionProfilesPath(profilesPath);
});

afterEach(() => {
  state.setConnectionProfilesPath(undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('findAliasConflict()', () => {
  beforeEach(() => {
    writeProfiles({
      [hostA]: { tenant: hostA, alias: 'taken' },
      [hostB]: { tenant: hostB },
    });
  });

  test('1: names the other profile that uses the alias', () => {
    expect(findAliasConflict(hostB, 'taken')).toBe(hostA);
  });

  test('2: names it for a new host as well', () => {
    expect(
      findAliasConflict('https://openam-c.example.com/am', 'taken')
    ).toBe(hostA);
  });

  test('3: the profile being saved may keep its own alias', () => {
    expect(findAliasConflict(hostA, 'taken')).toBeUndefined();
  });

  test('4: the profile may be addressed by its alias or a substring of its host', () => {
    expect(findAliasConflict('taken', 'taken')).toBeUndefined();
    expect(findAliasConflict('openam-a', 'taken')).toBeUndefined();
  });

  test('5: an unused alias is no conflict', () => {
    expect(findAliasConflict(hostB, 'free')).toBeUndefined();
  });

  test('6: no alias, no host, no file or an unreadable file is no conflict', () => {
    expect(findAliasConflict(hostB, undefined)).toBeUndefined();
    expect(findAliasConflict(undefined, 'taken')).toBeUndefined();
    fs.writeFileSync(profilesPath, '{ not json');
    expect(findAliasConflict(hostB, 'taken')).toBeUndefined();
    fs.rmSync(profilesPath);
    expect(findAliasConflict(hostB, 'taken')).toBeUndefined();
  });
});

describe('frodo conn save with a taken alias', () => {
  const launchPath = path.resolve('dist/launch.cjs');
  const hasDist = fs.existsSync(launchPath);
  const cond = hasDist ? test : test.skip;

  function run(args) {
    return spawnSync(process.execPath, [launchPath, 'conn', 'save', ...args], {
      encoding: 'utf8',
      timeout: 30000,
      env: {
        ...process.env,
        HOME: dir,
        NODE_OPTIONS: '',
        FRODO_NO_CACHE: 'true',
        FRODO_CONNECTION_PROFILES_PATH: profilesPath,
      },
      input: '',
    });
  }

  cond(
    '7: refuses before any connection is made and leaves the profiles untouched',
    () => {
      writeProfiles({ [hostA]: { tenant: hostA, alias: 'taken' } });
      const before = fs.readFileSync(profilesPath, 'utf8');

      // nothing listens on this host: a refusal that came after the login
      // attempt would show a connection error instead
      const result = run(['http://127.0.0.1:9/am', '--alias', 'taken']);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        `Alias 'taken' is already in use by connection profile '${hostA}'. Please use a unique alias.`
      );
      expect(fs.readFileSync(profilesPath, 'utf8')).toBe(before);
    }
  );

  cond('8: the profile that owns the alias is not refused', () => {
    writeProfiles({ [hostA]: { tenant: hostA, alias: 'taken' } });

    const result = run([hostA, '--alias', 'taken']);

    expect(result.stderr).not.toContain('is already in use');
  });
});
