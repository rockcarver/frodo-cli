import { state } from '@rockcarver/frodo-lib';
import {
  getAirGapStatus,
  isAirGapped,
  setAirGapSetting,
} from '../utils/AirGapConfig';
import { errorMessage, printMessage, successMessage } from '../utils/Console';

/**
 * Tells the library that air-gapped mode is on, if the switch says so: the
 * environment variable FRODO_AIRGAPPED or the persisted setting of
 * `frodo settings airgap`. The library then refuses every request to a host
 * that neither the tenant nor the caller named (`AIR_GAPPED`). Called once at
 * start, before any command runs, so it covers the commands and
 * `frodo mcp server start` alike: the MCP server's request-scoped instances
 * inherit the flag from this root state.
 * @returns true if air-gapped mode is on
 */
export function applyAirGapSwitchToState(): boolean {
  const airGapped = isAirGapped();
  if (airGapped) state.setAirGapped(true);
  return airGapped;
}

/**
 * Prints whether air-gapped mode is on and where that comes from.
 * @returns true
 */
export function showAirGap(): boolean {
  const { enabled, source } = getAirGapStatus();
  printMessage(
    `Air-gapped mode is ${enabled ? 'enabled' : 'disabled'}. Source: ${source}.`,
    'data'
  );
  return true;
}

function setAirGap(enabled: boolean): boolean {
  try {
    setAirGapSetting(enabled);
    successMessage(`Air-gap setting ${enabled ? 'enabled' : 'disabled'}.`);
    return showAirGap();
  } catch (error) {
    errorMessage(`${error}`);
    return false;
  }
}

/**
 * Persists the setting that switches air-gapped mode on.
 * @returns true if the setting was written
 */
export function enableAirGap(): boolean {
  return setAirGap(true);
}

/**
 * Persists the setting that switches air-gapped mode off. The environment
 * variable FRODO_AIRGAPPED can still switch it on.
 * @returns true if the setting was written
 */
export function disableAirGap(): boolean {
  return setAirGap(false);
}
