import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

let configPath;
jest.unstable_mockModule('../../src/utils/Config', () => ({
  getConfigPath: () => configPath,
}));

const { readUpdateCheckEnabled, setUpdateCheckEnabled, getUpdateCheckStatus } =
  await import('../../src/utils/UpdateCheckConfig');

const originalEnv = process.env.FRODO_NO_UPDATE_CHECK;
let directory;
let file;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-update-check-'));
  configPath = path.join(directory, '.frodo');
  file = path.join(configPath, 'UpdateCheck.json');
  delete process.env.FRODO_NO_UPDATE_CHECK;
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
  if (originalEnv === undefined) delete process.env.FRODO_NO_UPDATE_CHECK;
  else process.env.FRODO_NO_UPDATE_CHECK = originalEnv;
});

test('a missing file defaults to enabled without creating anything', () => {
  expect(readUpdateCheckEnabled()).toBe(true);
  expect(fs.existsSync(configPath)).toBe(false);
  expect(getUpdateCheckStatus()).toEqual({
    enabled: true,
    source: 'setting (default: enabled)',
  });
});

test('disable and enable persist in their own file on a fresh install', () => {
  setUpdateCheckEnabled(false);
  expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ enabled: false });
  expect(readUpdateCheckEnabled()).toBe(false);
  expect(getUpdateCheckStatus()).toEqual({ enabled: false, source: 'setting' });
  setUpdateCheckEnabled(true);
  expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ enabled: true });
  expect(readUpdateCheckEnabled()).toBe(true);
  expect(fs.readdirSync(configPath)).toEqual(['UpdateCheck.json']);
});

test.each([
  '{',
  'null',
  'false',
  '0',
  '[]',
  '"disabled"',
  '{}',
  '{"enabled": "false"}',
  '{"enabled": 0}',
  '{"enabled": null}',
])(
  'invalid setting %s defaults to enabled and is not rewritten',
  (contents) => {
    fs.mkdirSync(configPath);
    fs.writeFileSync(file, contents);
    expect(readUpdateCheckEnabled()).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toBe(contents);
  }
);

test('unreadable settings default to enabled', () => {
  jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
    throw new Error('EACCES');
  });
  expect(readUpdateCheckEnabled()).toBe(true);
});

test.each([true, false])(
  'environment opt-out disables checks even when persisted enabled=%s',
  (enabled) => {
    setUpdateCheckEnabled(enabled);
    process.env.FRODO_NO_UPDATE_CHECK = 'yes';
    expect(getUpdateCheckStatus()).toEqual({
      enabled: false,
      source: enabled
        ? 'environment variable (FRODO_NO_UPDATE_CHECK)'
        : 'setting and environment variable (FRODO_NO_UPDATE_CHECK)',
    });
  }
);

test.each(['', '0', 'false', 'off', 'enabled'])(
  'falsey environment value %s cannot override persisted opt-out',
  (value) => {
    setUpdateCheckEnabled(false);
    process.env.FRODO_NO_UPDATE_CHECK = value;
    expect(getUpdateCheckStatus()).toEqual({
      enabled: false,
      source: 'setting',
    });
  }
);
