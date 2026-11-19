import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';
import { state } from '@rockcarver/frodo-lib';

// The operations behind `frodo settings airgap` and the call at start that
// tells frodo-lib (cli#1307). The library is the real one: what matters is the
// flag on its state, which makes it refuse a request to a host nobody named.

let configPath;
jest.unstable_mockModule('../../src/utils/Config', () => ({
  getConfigPath: () => configPath,
}));
const printMessage = jest.fn();
const successMessage = jest.fn();
const errorMessage = jest.fn();
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  successMessage,
  errorMessage,
}));

const { applyAirGapSwitchToState, disableAirGap, enableAirGap, showAirGap } =
  await import('../../src/ops/AirGapOps');

const originalEnv = process.env.FRODO_AIRGAPPED;
let directory;
let file;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-air-gap-ops-'));
  configPath = path.join(directory, '.frodo');
  file = path.join(configPath, 'AirGap.json');
  delete process.env.FRODO_AIRGAPPED;
  state.setAirGapped(false);
  printMessage.mockReset();
  successMessage.mockReset();
  errorMessage.mockReset();
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
  state.setAirGapped(false);
  if (originalEnv === undefined) delete process.env.FRODO_AIRGAPPED;
  else process.env.FRODO_AIRGAPPED = originalEnv;
});

describe('telling the library at start', () => {
  test('1: switched off: the library state is left alone', () => {
    expect(applyAirGapSwitchToState()).toBe(false);
    expect(state.getAirGapped()).toBe(false);
  });

  test('2: the environment variable sets the flag on the library state', () => {
    process.env.FRODO_AIRGAPPED = '1';
    expect(applyAirGapSwitchToState()).toBe(true);
    expect(state.getAirGapped()).toBe(true);
  });

  test('3: the persisted setting sets the flag on the library state', () => {
    fs.mkdirSync(configPath);
    fs.writeFileSync(file, '{"enabled":true}');
    expect(applyAirGapSwitchToState()).toBe(true);
    expect(state.getAirGapped()).toBe(true);
  });

  test('4: an invalid setting file and a false variable leave the flag off', () => {
    fs.mkdirSync(configPath);
    fs.writeFileSync(file, '{');
    process.env.FRODO_AIRGAPPED = 'false';
    expect(applyAirGapSwitchToState()).toBe(false);
    expect(state.getAirGapped()).toBe(false);
  });

  test('5: it only switches the flag on, it never switches an earlier flag off', () => {
    state.setAirGapped(true);
    expect(applyAirGapSwitchToState()).toBe(false);
    expect(state.getAirGapped()).toBe(true);
  });
});

describe('show, enable, disable', () => {
  test('6: show says the state and its source, as data', () => {
    expect(showAirGap()).toBe(true);
    expect(printMessage).toHaveBeenCalledWith(
      'Air-gapped mode is disabled. Source: setting (default: disabled).',
      'data'
    );
    process.env.FRODO_AIRGAPPED = 'yes';
    showAirGap();
    expect(printMessage).toHaveBeenLastCalledWith(
      'Air-gapped mode is enabled. Source: environment variable (FRODO_AIRGAPPED).',
      'data'
    );
  });

  test('7: enable persists the setting and then shows the effective state', () => {
    expect(enableAirGap()).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({
      enabled: true,
    });
    expect(successMessage).toHaveBeenCalledWith('Air-gap setting enabled.');
    expect(printMessage).toHaveBeenLastCalledWith(
      'Air-gapped mode is enabled. Source: setting.',
      'data'
    );
  });

  test('8: disable clears the setting, but the variable can still switch it on', () => {
    enableAirGap();
    process.env.FRODO_AIRGAPPED = '1';
    expect(disableAirGap()).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({
      enabled: false,
    });
    expect(successMessage).toHaveBeenLastCalledWith(
      'Air-gap setting disabled.'
    );
    expect(printMessage).toHaveBeenLastCalledWith(
      'Air-gapped mode is enabled. Source: environment variable (FRODO_AIRGAPPED).',
      'data'
    );
  });

  test('9: a setting that cannot be written is an error and false (the exit code), not an exception', () => {
    // the configuration directory path is a file, so it cannot be created
    fs.writeFileSync(configPath, 'not a directory');
    expect(enableAirGap()).toBe(false);
    expect(errorMessage).toHaveBeenCalledTimes(1);
    expect(successMessage).not.toHaveBeenCalled();
  });
});
