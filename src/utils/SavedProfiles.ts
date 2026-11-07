import fs from 'fs';
import { frodo } from '@rockcarver/frodo-lib';

/** A saved connection profile: the host it is saved under and its alias. */
export type SavedProfile = { host: string; alias?: string };

/**
 * The connection profiles saved on this machine (none when there is no file yet).
 * @returns {SavedProfile[]} the profiles, by the host they are saved under
 */
export function savedConnectionProfiles(): SavedProfile[] {
  try {
    const profiles: Record<string, { alias?: string }> = JSON.parse(
      fs.readFileSync(frodo.conn.getConnectionProfilesPath(), 'utf8')
    );
    return Object.entries(profiles).map(([host, profile]) => ({
      host,
      alias: profile.alias,
    }));
  } catch {
    return [];
  }
}

/**
 * True if both are the same host, ignoring a trailing slash.
 * @param {string} a a host URL
 * @param {string} b another host URL
 * @returns {boolean} true if they are the same
 */
export function sameHost(a: string, b: string): boolean {
  return a.replace(/\/+$/, '') === b.replace(/\/+$/, '');
}

/**
 * The saved profile whose host name is the given one, if there is exactly one
 * (for example `openam-zion.id.forgerock.io` finds the profile saved under
 * `https://openam-zion.id.forgerock.io/am`).
 * @param {string} hostName host name without scheme or path
 * @returns {SavedProfile | undefined} the profile, or undefined if there is none or more than one
 */
export function findSavedProfileByHostName(
  hostName: string
): SavedProfile | undefined {
  const found = savedConnectionProfiles().filter((profile) => {
    try {
      return new URL(profile.host).host === hostName;
    } catch {
      return false;
    }
  });
  return found.length === 1 ? found[0] : undefined;
}
