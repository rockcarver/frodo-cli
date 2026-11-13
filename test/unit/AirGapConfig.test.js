import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

// The air-gap switch (cli#1307): the environment variable FRODO_AIRGAPPED or
// the persisted setting, either one is enough; a missing or invalid file never
// fails and means off. Every test uses its own temporary configuration
// directory: nothing here touches the real home.

let configPath;
jest.unstable_mockModule('../../src/utils/Config', () => ({
  getConfigPath: () => configPath,
}));

const {
  AIR_GAP_ENVIRONMENT_VARIABLE,
  getAirGapStatus,
  isAirGapped,
  readAirGapEnvironment,
  readAirGapSetting,
  setAirGapSetting,
} = await import('../../src/utils/AirGapConfig');

const originalEnv = process.env.FRODO_AIRGAPPED;
let directory;
let file;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-air-gap-'));
  configPath = path.join(directory, '.frodo');
  file = path.join(configPath, 'AirGap.json');
  delete process.env.FRODO_AIRGAPPED;
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
  if (originalEnv === undefined) delete process.env.FRODO_AIRGAPPED;
  else process.env.FRODO_AIRGAPPED = originalEnv;
});

test('the variable is FRODO_AIRGAPPED', () => {
  expect(AIR_GAP_ENVIRONMENT_VARIABLE).toBe('FRODO_AIRGAPPED');
});

test('neither the file nor the variable: off, and nothing is created', () => {
  expect(readAirGapSetting()).toBe(false);
  expect(readAirGapEnvironment()).toBe(false);
  expect(isAirGapped()).toBe(false);
  expect(fs.existsSync(configPath)).toBe(false);
  expect(getAirGapStatus()).toEqual({
    enabled: false,
    source: 'setting (default: disabled)',
    setting: false,
    environment: false,
  });
});

test('enable and disable persist in their own file on a fresh install', () => {
  setAirGapSetting(true);
  expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ enabled: true });
  expect(readAirGapSetting()).toBe(true);
  expect(isAirGapped()).toBe(true);
  expect(getAirGapStatus()).toMatchObject({
    enabled: true,
    source: 'setting',
    setting: true,
    environment: false,
  });
  setAirGapSetting(false);
  expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({
    enabled: false,
  });
  expect(isAirGapped()).toBe(false);
  expect(fs.readdirSync(configPath)).toEqual(['AirGap.json']);
});

test.each(['1', 'true', 'TRUE', 'True', 'yes', 'YES', 'on', 'On'])(
  'FRODO_AIRGAPPED=%s switches it on, like the other opt-in variables',
  (value) => {
    process.env.FRODO_AIRGAPPED = value;
    expect(readAirGapEnvironment()).toBe(true);
    expect(isAirGapped()).toBe(true);
    expect(getAirGapStatus()).toMatchObject({
      enabled: true,
      source: 'environment variable (FRODO_AIRGAPPED)',
      setting: false,
      environment: true,
    });
  }
);

test.each(['0', 'false', 'no', 'off', '', ' ', 'enabled', '2'])(
  'FRODO_AIRGAPPED=%j does not switch it on',
  (value) => {
    process.env.FRODO_AIRGAPPED = value;
    expect(readAirGapEnvironment()).toBe(false);
    expect(isAirGapped()).toBe(false);
  }
);

test('setting and variable together: on, and the status names both', () => {
  setAirGapSetting(true);
  process.env.FRODO_AIRGAPPED = '1';
  expect(getAirGapStatus()).toEqual({
    enabled: true,
    source: 'setting and environment variable (FRODO_AIRGAPPED)',
    setting: true,
    environment: true,
  });
});

test('the variable switches it on although the setting is off, and the setting alone also does', () => {
  setAirGapSetting(false);
  process.env.FRODO_AIRGAPPED = 'on';
  expect(isAirGapped()).toBe(true);
  delete process.env.FRODO_AIRGAPPED;
  expect(isAirGapped()).toBe(false);
  setAirGapSetting(true);
  expect(isAirGapped()).toBe(true);
});

test.each([
  '{',
  'null',
  'true',
  '1',
  '[]',
  '"enabled"',
  '{}',
  '{"enabled": "true"}',
  '{"enabled": 1}',
  '{"enabled": null}',
  '{"enabled": false}',
])(
  'invalid or disabled setting %s means off and is not rewritten',
  (contents) => {
    fs.mkdirSync(configPath);
    fs.writeFileSync(file, contents);
    expect(readAirGapSetting()).toBe(false);
    expect(isAirGapped()).toBe(false);
    expect(getAirGapStatus().enabled).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe(contents);
  }
);

test('a directory in place of the file, or an unreadable path, never throws', () => {
  fs.mkdirSync(file, { recursive: true });
  expect(readAirGapSetting()).toBe(false);
  expect(isAirGapped()).toBe(false);
});

test('only the exact true enables the setting', () => {
  fs.mkdirSync(configPath);
  fs.writeFileSync(file, '{"enabled":true,"other":1}');
  expect(readAirGapSetting()).toBe(true);
});
