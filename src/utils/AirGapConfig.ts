import fs from 'fs';
import path from 'path';
import { getConfigPath } from './Config';
import { isTruthyOptInValue } from './EnvFlags';

/**
 * The air-gap switch: while it is on, frodo makes no request to a host the
 * user did not name. The user names the deployment host (and the hosts and
 * URLs given as arguments); the update check on GitHub and npm and the
 * application template catalog on Ping's CDN are not named by anyone.
 *
 * The switch is on when the environment variable FRODO_AIRGAPPED is truthy or
 * when the persisted setting says so (`frodo settings airgap enable`); either
 * one is enough. A missing or invalid settings file never fails a command: it
 * means off.
 *
 * This module has no dependency on frodo-lib on purpose, so that code which
 * only needs the answer (the update check) stays testable without the library.
 * Telling the library is `applyAirGapSwitchToState` in `ops/AirGapOps.ts`.
 */

/** The environment variable that switches air-gapped mode on. */
export const AIR_GAP_ENVIRONMENT_VARIABLE = 'FRODO_AIRGAPPED';

const AIR_GAP_FILENAME = 'AirGap.json';

function settingsFile(): string {
  return path.join(getConfigPath(), AIR_GAP_FILENAME);
}

/**
 * Reads the persisted setting.
 * @returns true only if the file exists and says `{ "enabled": true }`
 */
export function readAirGapSetting(): boolean {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    return settings?.enabled === true;
  } catch {
    return false;
  }
}

/**
 * Persists the setting in its own small file in the frodo configuration directory.
 * @param enabled true to switch air-gapped mode on, false to switch the setting off
 */
export function setAirGapSetting(enabled: boolean): void {
  const file = settingsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ enabled }, null, 2));
}

/**
 * Whether the environment variable switches air-gapped mode on.
 * @returns true if FRODO_AIRGAPPED is 1, true, yes or on (case-insensitive)
 */
export function readAirGapEnvironment(): boolean {
  return isTruthyOptInValue(process.env[AIR_GAP_ENVIRONMENT_VARIABLE]);
}

/**
 * The effective state of the switch and where it comes from.
 * @returns `enabled`, the human-readable `source`, and the two inputs
 */
export function getAirGapStatus(): {
  enabled: boolean;
  source: string;
  setting: boolean;
  environment: boolean;
} {
  const setting = readAirGapSetting();
  const environment = readAirGapEnvironment();
  const sources = [
    ...(setting ? ['setting'] : []),
    ...(environment
      ? [`environment variable (${AIR_GAP_ENVIRONMENT_VARIABLE})`]
      : []),
  ];
  return {
    enabled: setting || environment,
    source: sources.length
      ? sources.join(' and ')
      : 'setting (default: disabled)',
    setting,
    environment,
  };
}

/**
 * Whether air-gapped mode is on.
 * @returns true if the environment variable or the persisted setting says so
 */
export function isAirGapped(): boolean {
  return readAirGapEnvironment() || readAirGapSetting();
}
