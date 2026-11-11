import { frodo, state, type CIMDProfileSkeleton } from '@rockcarver/frodo-lib';
import c from '../utils/ColorTheme';
import { createTable, printError, printMessage } from '../utils/Console';
import { valueOf } from './utils/InheritedValue';

// CIMD profiles are not `frodo.agent`: they have a library module of their own.
// Every library symbol this file uses is named here, so a rename is one line.
const { isCIMDProfileAvailable, readCIMDProfile, readCIMDProfiles } =
  frodo.oauth2oidc.cimd;

const { getRealmName } = frodo.utils;

/**
 * The name of the realm of the command, for messages and file names. The root
 * realm is `root`: `getRealmName` answers `/` for it.
 * @returns {string} the realm name
 */
function realmName(): string {
  const name = getRealmName(state.getRealm());
  return name === '/' ? 'root' : name;
}

/** Shown for an attribute the server stored without a value, or did not store at all. */
const NOT_SET = '(not set)';

/**
 * A member of a profile as the server answered it (plain or wrapped as
 * `{ inherited, value }`), as a list. A single value is a list of one.
 * @param {unknown} property the member
 * @returns {unknown[] | undefined} the values, or undefined when the member is absent
 */
function listOf(property: unknown): unknown[] | undefined {
  const value = valueOf(property);
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

/**
 * A member of a profile, as the text of a table cell: one value per line, the
 * word `(not set)` for an attribute that is absent (never a default the server
 * did not store), `(none)` for an empty list.
 * @param {unknown} property the member
 * @returns {string} the text
 */
function textOf(property: unknown): string {
  const values = listOf(property);
  if (values === undefined) return NOT_SET;
  if (values.length === 0) return '(none)';
  return values.map(String).join('\n');
}

/**
 * The status of a profile: `coreOAuth2ClientConfig.status`.
 * @param {CIMDProfileSkeleton} profile the profile
 * @returns {string | undefined} `Active`, `Inactive`, or undefined when the profile has no status
 */
function statusOf(profile: CIMDProfileSkeleton): string | undefined {
  const status = valueOf(profile.coreOAuth2ClientConfig?.['status']);
  return status === undefined ? undefined : String(status);
}

/**
 * The status of a profile for a table cell, green when active.
 * @param {CIMDProfileSkeleton} profile the profile
 * @returns {string} the cell
 */
function statusCell(profile: CIMDProfileSkeleton): string {
  const status = statusOf(profile);
  if (status === undefined) return NOT_SET;
  return status === 'Active' ? c.positive(status) : c.negative(status);
}

/**
 * The client id URL patterns of a profile.
 * @param {CIMDProfileSkeleton} profile the profile
 * @returns {string[]} the patterns, empty when the profile has none
 */
function patternsOf(profile: CIMDProfileSkeleton): string[] {
  return (listOf(profile.cimdConfig?.cimdClientIdUrlPatterns) ?? []).map(
    String
  );
}

/**
 * Whether the SSRF protection of a profile is switched on, for a table cell.
 * @param {CIMDProfileSkeleton} profile the profile
 * @returns {string} `enabled`, `disabled` or `(not set)`
 */
function ssrfProtectionOf(profile: CIMDProfileSkeleton): string {
  const enabled = valueOf(profile.cimdConfig?.cimdSsrfProtectionEnabled);
  if (enabled === undefined) return NOT_SET;
  return enabled === false ? c.negative('disabled') : 'enabled';
}

/**
 * Tell the user that the realm does not offer CIMD profiles, once, on stderr
 * (so the output of a list stays clean). The question is answered by the
 * library from the agent type list of the deployment; the CLI never reads that
 * list itself.
 * @returns {Promise<boolean>} true if the type is not offered and the note was printed, false if it is offered
 * @throws if the library cannot find out
 */
export async function reportCIMDProfilesUnavailable(): Promise<boolean> {
  if (await isCIMDProfileAvailable()) return false;
  printMessage(
    `CIMD profiles are not available in the ${realmName()} realm of ${state.getHost()}: the server does not offer the agent type 'CIMDProfile'.`,
    'warn'
  );
  return true;
}

/**
 * List CIMD profiles
 * @param {boolean} long true for a table with the status, the URL patterns and the SSRF protection
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listCIMDProfiles(
  long: boolean = false
): Promise<boolean> {
  try {
    // the library returns the profiles sorted by id
    const profiles = await readCIMDProfiles();
    if (profiles.length === 0) {
      // an empty list cannot tell "none" from "not offered" by itself
      await reportCIMDProfilesUnavailable();
      return true;
    }
    if (!long) {
      for (const profile of profiles) {
        printMessage(profile._id ?? '', 'data');
      }
      return true;
    }
    const table = createTable([
      c.heading('Id'),
      c.heading('Status'),
      c.heading('Client ID URL patterns'),
      c.heading('SSRF protection'),
    ]);
    for (const profile of profiles) {
      table.push([
        profile._id ?? '',
        statusCell(profile),
        patternsOf(profile).join('\n') || NOT_SET,
        ssrfProtectionOf(profile),
      ]);
    }
    printMessage(table.toString(), 'data');
    return true;
  } catch (error) {
    printError(error, 'Error listing CIMD profiles');
  }
  return false;
}

/**
 * Describe a CIMD profile. With `json` the whole profile, as the library reads
 * it; otherwise a table of the settings that decide who may act as a client.
 * A profile holds no secret.
 * @param {string | undefined} agentId id of the profile; undefined when the picker had nothing to offer
 * @param {boolean} json true to print the whole profile as JSON
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeCIMDProfile(
  agentId: string | undefined,
  json: boolean = false
): Promise<boolean> {
  try {
    if (!agentId) {
      // the picker had nothing to offer: say why
      if (!(await reportCIMDProfilesUnavailable())) {
        printMessage('There is no CIMD profile to choose from.', 'warn');
      }
      return false;
    }
    const profile = await readCIMDProfile(agentId);
    if (json) {
      printMessage(JSON.stringify(profile, null, 2), 'data');
      return true;
    }
    const table = createTable([c.heading('Property'), c.heading('Value')]);
    table.push(['Agent Id', profile._id ?? agentId]);
    table.push(['Status', statusCell(profile)]);
    table.push([
      'Client ID URL patterns',
      textOf(profile.cimdConfig?.cimdClientIdUrlPatterns),
    ]);
    table.push([
      'Metadata override deny list',
      textOf(profile.cimdConfig?.cimdMetadataDenyList),
    ]);
    table.push(['SSRF protection', ssrfProtectionOf(profile)]);
    table.push([
      'Grant types',
      textOf(profile.advancedOAuth2ClientConfig?.['grantTypes']),
    ]);
    table.push([
      'Token endpoint auth method',
      textOf(profile.advancedOAuth2ClientConfig?.['tokenEndpointAuthMethod']),
    ]);
    table.push(['Scopes', textOf(profile.coreOAuth2ClientConfig?.['scopes'])]);
    table.push([
      'Default scopes',
      textOf(profile.coreOAuth2ClientConfig?.['defaultScopes']),
    ]);
    table.push([
      'Redirect URIs',
      textOf(profile.coreOAuth2ClientConfig?.['redirectionUris']),
    ]);
    table.push([
      'Require PAR',
      textOf(
        profile.advancedOAuth2ClientConfig?.[
          'require_pushed_authorization_requests'
        ]
      ),
    ]);
    table.push([
      'Provider overrides',
      textOf(profile.overrideOAuth2ClientConfig?.['providerOverridesEnabled']),
    ]);
    printMessage(table.toString(), 'data');
    return true;
  } catch (error) {
    printError(error, `Error describing CIMD profile ${agentId}`);
  }
  return false;
}
