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
const { setAirGapSetting } = await import('../../src/utils/AirGapConfig');

const originalEnv = process.env.FRODO_NO_UPDATE_CHECK;
const originalAirGapEnv = process.env.FRODO_AIRGAPPED;
let directory;
let file;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-update-check-'));
  configPath = path.join(directory, '.frodo');
  file = path.join(configPath, 'UpdateCheck.json');
  delete process.env.FRODO_NO_UPDATE_CHECK;
  delete process.env.FRODO_AIRGAPPED;
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
  if (originalEnv === undefined) delete process.env.FRODO_NO_UPDATE_CHECK;
  else process.env.FRODO_NO_UPDATE_CHECK = originalEnv;
  if (originalAirGapEnv === undefined) delete process.env.FRODO_AIRGAPPED;
  else process.env.FRODO_AIRGAPPED = originalAirGapEnv;
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

// Air-gapped mode implies that no update check is made (cli#1307): the status
// that the version check reads is off whichever of the two air-gap inputs is
// set, and the source names the air-gap switch, not the update-check switch.
test('the air-gap environment variable alone turns the update check off', () => {
  process.env.FRODO_AIRGAPPED = '1';
  expect(readUpdateCheckEnabled()).toBe(true);
  expect(getUpdateCheckStatus()).toEqual({
    enabled: false,
    source: 'air-gapped mode (environment variable (FRODO_AIRGAPPED))',
  });
});

test('the air-gap setting alone turns the update check off', () => {
  setAirGapSetting(true);
  expect(readUpdateCheckEnabled()).toBe(true);
  expect(getUpdateCheckStatus()).toEqual({
    enabled: false,
    source: 'air-gapped mode (setting)',
  });
});

test('a falsey air-gap value or a disabled air-gap setting leaves the update check on', () => {
  process.env.FRODO_AIRGAPPED = '0';
  setAirGapSetting(false);
  expect(getUpdateCheckStatus()).toEqual({
    enabled: true,
    source: 'setting (default: enabled)',
  });
});

test('every switch that is on is named in the source', () => {
  setUpdateCheckEnabled(false);
  process.env.FRODO_NO_UPDATE_CHECK = 'yes';
  process.env.FRODO_AIRGAPPED = 'yes';
  setAirGapSetting(true);
  expect(getUpdateCheckStatus()).toEqual({
    enabled: false,
    source:
      'setting and environment variable (FRODO_NO_UPDATE_CHECK) and air-gapped mode (setting and environment variable (FRODO_AIRGAPPED))',
  });
});
