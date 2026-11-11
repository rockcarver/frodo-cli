import { frodo, state, type CIMDProfileSkeleton } from '@rockcarver/frodo-lib';
import c from '../utils/ColorTheme';
import {
  createProgressIndicator,
  createTable,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { OperationRun } from '../utils/OperationRun';
import { valueOf } from './utils/InheritedValue';
import { safeTypedFilename } from './utils/SafeFilename';

// CIMD profiles are not `frodo.agent`: they have a library module of their own.
// Every library symbol this file uses is named here, so a rename is one line.
const {
  createCIMDProfileExportTemplate,
  exportCIMDProfile,
  exportCIMDProfiles,
  isCIMDProfileAvailable,
  readCIMDProfile,
  readCIMDProfiles,
} = frodo.oauth2oidc.cimd;

const {
  getFilePath,
  getRealmName,
  getTypedFilename,
  saveJsonToFile,
  titleCase,
} = frodo.utils;

/** The file type of an export file of CIMD profiles: `<id>.cimd.agent.json`, in the family of the typed agent files. */
export const CIMD_FILE_TYPE = 'cimd.agent';

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

/**
 * What to say when a command that needs a profile got none, because the picker
 * had nothing to offer: the realm does not offer the type, or holds no profile.
 * @returns {Promise<void>} resolves once the reason is printed
 */
async function reportNoProfileToChoose(): Promise<void> {
  if (!(await reportCIMDProfilesUnavailable())) {
    printMessage('There is no CIMD profile to choose from.', 'warn');
  }
}

/**
 * Export a CIMD profile to a file. The file holds the profile as the library
 * reads it from the list (plain, as stored, a sparse profile stays sparse, no
 * `_rev` is added by the CLI), under the key `cimdProfile`.
 * @param {string | undefined} agentId id of the profile; undefined when the picker had nothing to offer
 * @param {string} file optional file name; default `<id>.cimd.agent.json`
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportCIMDProfileToFile(
  agentId: string | undefined,
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  if (!agentId) {
    try {
      await reportNoProfileToChoose();
    } catch (error) {
      printError(error);
    }
    return false;
  }
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Exporting ${agentId}...`
  );
  try {
    const exportData = await exportCIMDProfile(agentId);
    // the stored id names the file, whatever the case the user typed
    const [storedId = agentId] = Object.keys(exportData.cimdProfile);
    const filePath = getFilePath(
      file || safeTypedFilename(storedId, CIMD_FILE_TYPE),
      true
    );
    saveJsonToFile(exportData, filePath, includeMeta);
    stopProgressIndicator(
      indicatorId,
      `Exported ${storedId} to ${filePath}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error exporting ${agentId}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Export all CIMD profiles of the realm to one file. One operation: if the
 * library throws, no file is written. A realm that does not offer the type has
 * nothing to export: the note is printed, no file is written (an empty file
 * would claim an export that did not happen) and the command succeeds; a realm
 * that offers the type and holds no profile gets a file with an empty section,
 * like the sibling commands write.
 * @param {string} file optional file name; default `all<Realm>Agents.cimd.agent.json`
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportCIMDProfilesToFile(
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    // the library shows its own progress while it reads the profiles
    const exportData = await exportCIMDProfiles();
    const count = Object.keys(exportData.cimdProfile).length;
    if (count === 0 && (await reportCIMDProfilesUnavailable())) {
      // no file: an empty one would claim an export that did not happen
      return true;
    }
    const filePath = getFilePath(
      file ||
        getTypedFilename(`all${titleCase(realmName())}Agents`, CIMD_FILE_TYPE),
      true
    );
    saveJsonToFile(exportData, filePath, includeMeta);
    printMessage(`Exported ${countProfiles(count)} to ${filePath}.`, 'info');
    return true;
  } catch (error) {
    printError(error, 'Error exporting all CIMD profiles');
  }
  return false;
}

/**
 * Export all CIMD profiles of the realm to separate files. The profiles are
 * read once, and every profile is one operation of an {@link OperationRun}: a
 * profile whose file cannot be written is printed and named in one summary,
 * and the others are still written. A failure to read the profiles ends the
 * command whatever `--allow-failures` says. Nothing to export (the type is not
 * offered, or there is no profile) is not a failure (cli records 0040, 0041).
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} allowFailures true to report profiles that could not be exported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportCIMDProfilesToFiles(
  includeMeta: boolean = true,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'profile', allowFailures });
  let indicatorId: string | undefined;
  try {
    const exportData = await exportCIMDProfiles();
    const entries = Object.entries(exportData.cimdProfile);
    if (entries.length === 0) {
      // nothing to export is not a failure
      if (!(await reportCIMDProfilesUnavailable())) {
        printMessage('Nothing to export.', 'info');
      }
      return true;
    }
    indicatorId = createProgressIndicator(
      'determinate',
      entries.length,
      'Writing CIMD profiles'
    );
    // two ids can make one file name: the files of one run are told apart
    const taken = new Set<string>();
    for (const [id, profile] of entries) {
      await run.run(id, () => {
        const fileData = createCIMDProfileExportTemplate();
        fileData.cimdProfile[id] = profile;
        const fileName = safeTypedFilename(id, CIMD_FILE_TYPE, taken);
        const filePath = getFilePath(fileName, true);
        saveJsonToFile(fileData, filePath, includeMeta);
        updateProgressIndicator(indicatorId, `Exporting ${id}`);
        if (fileName !== getTypedFilename(id, CIMD_FILE_TYPE)) {
          printMessage(
            `Exported ${id} to ${filePath}: the id alone does not make a usable file name.`,
            'info'
          );
        }
      });
    }
    stopProgressIndicator(
      indicatorId,
      run.hasFailures
        ? 'Some CIMD profiles could not be written.'
        : `${countProfiles(entries.length)} written.`,
      run.hasFailures ? 'fail' : 'success'
    );
    return run.finish();
  } catch (error) {
    // not an item failure: the profiles could not be read
    stopProgressIndicator(
      indicatorId,
      'Error exporting CIMD profiles to files',
      'fail'
    );
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}

function countProfiles(count: number): string {
  return `${count} CIMD profile${count === 1 ? '' : 's'}`;
}
