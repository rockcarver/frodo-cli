import fs from 'fs';
import path from 'path';
import {
  frodo,
  state,
  type CIMDProfileExportInterface,
  type CIMDProfileImportResult,
  type CIMDProfileSkeleton,
  type FrodoError,
} from '@rockcarver/frodo-lib';
import c from '../utils/ColorTheme';
import {
  createProgressIndicator,
  createTable,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { OperationRun } from '../utils/OperationRun';
import { valueOf } from './utils/InheritedValue';
import { safeTypedFilename } from './utils/SafeFilename';

// CIMD profiles are not `frodo.agent`: they have a library module of their own.
// Every library symbol this file uses is named here, so a rename is one line.
const {
  createCIMDProfileExportTemplate,
  deleteCIMDProfile: deleteCIMDProfileInLibrary,
  deleteCIMDProfiles: deleteCIMDProfilesInLibrary,
  exportCIMDProfile,
  exportCIMDProfiles,
  importCIMDProfile,
  importCIMDProfiles,
  isCIMDProfileAvailable,
  readCIMDProfile,
  readCIMDProfiles,
} = frodo.oauth2oidc.cimd;

const {
  getFilePath,
  getRealmName,
  getTypedFilename,
  getWorkingDirectory,
  saveJsonToFile,
  titleCase,
} = frodo.utils;

/** The file type of an export file of CIMD profiles: `<id>.oauth2.cimd.json`, beside `.oauth2.app.json` of the OAuth2 clients and `.oauth2.issuer.json` of the trusted issuers. */
export const CIMD_FILE_TYPE = 'oauth2.cimd';

/** The end of the name of an import file of CIMD profiles. */
const CIMD_FILE_SUFFIX = `.${CIMD_FILE_TYPE}.json`;

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
 * @param {string} [consequence] what follows from it for the command, added to the note: "Nothing was imported."
 * @returns {Promise<boolean>} true if the type is not offered and the note was printed, false if it is offered
 * @throws if the library cannot find out
 */
export async function reportCIMDProfilesUnavailable(
  consequence?: string
): Promise<boolean> {
  if (await isCIMDProfileAvailable()) return false;
  printMessage(
    `CIMD profiles are not available in the ${realmName()} realm of ${state.getHost()}: the server does not offer the agent type 'CIMDProfile'.` +
      (consequence ? ` ${consequence}` : ''),
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
 * @param {string | undefined} profileId id of the profile; undefined when the picker had nothing to offer
 * @param {boolean} json true to print the whole profile as JSON
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeCIMDProfile(
  profileId: string | undefined,
  json: boolean = false
): Promise<boolean> {
  try {
    if (!profileId) {
      // the picker had nothing to offer: say why
      if (!(await reportCIMDProfilesUnavailable())) {
        printMessage('There is no CIMD profile to choose from.', 'warn');
      }
      return false;
    }
    const profile = await readCIMDProfile(profileId);
    if (json) {
      printMessage(JSON.stringify(profile, null, 2), 'data');
      return true;
    }
    const table = createTable([c.heading('Property'), c.heading('Value')]);
    table.push(['Profile Id', profile._id ?? profileId]);
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
    printError(
      error,
      profileId ? `Error describing CIMD profile ${profileId}` : undefined
    );
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
 * @param {string | undefined} profileId id of the profile; undefined when the picker had nothing to offer
 * @param {string} file optional file name; default `<id>.oauth2.cimd.json`
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportCIMDProfileToFile(
  profileId: string | undefined,
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  if (!profileId) {
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
    `Exporting ${profileId}...`
  );
  try {
    const exportData = await exportCIMDProfile(profileId);
    // the stored id names the file, whatever the case the user typed
    const [storedId = profileId] = Object.keys(exportData.cimdProfile);
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
    stopProgressIndicator(indicatorId, `Error exporting ${profileId}`, 'fail');
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
 * @param {string} file optional file name; default `all<Realm>CimdProfiles.oauth2.cimd.json`
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
        getTypedFilename(
          `all${titleCase(realmName())}CimdProfiles`,
          CIMD_FILE_TYPE
        ),
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

/** What an import of several profiles says when the realm does not offer the type, after the note. */
const NOTHING_IMPORTED = 'Nothing was imported.';

/** What an import did to the profiles of a run, for the closing line. */
type ImportTally = { created: number; updated: number };

/**
 * What the library reports for one imported profile, in a sentence.
 * @param {string} id the id of the profile
 * @param {CIMDProfileImportResult} result the outcome of the import of the profile
 * @returns {string} `Created x.`, `Updated x.`, or the sentence for a created profile that was written again
 */
function describeImportResult(
  id: string,
  result: CIMDProfileImportResult
): string {
  if (!result.created) return `Updated ${id}.`;
  return result.repaired
    ? `Created ${id} (the server added defaults; written again as in the file).`
    : `Created ${id}.`;
}

/**
 * Read an import file of CIMD profiles. A file that cannot be read or parsed,
 * or that has no `cimdProfile` section, is an error; a file of 4.x that holds
 * profiles under the key `agent` says how to import it.
 * @param {string} filePath the path of the file
 * @returns {CIMDProfileExportInterface} the import data
 */
function readImportFile(filePath: string): CIMDProfileExportInterface {
  const importData = JSON.parse(
    fs.readFileSync(filePath, 'utf8')
  ) as CIMDProfileExportInterface & { agent?: Record<string, unknown> };
  if (
    typeof importData?.cimdProfile !== 'object' ||
    importData.cimdProfile === null
  ) {
    const holdsProfilesAsAgents = Object.values(importData?.agent ?? {}).some(
      (agent) =>
        (agent as { _type?: { _id?: string } } | undefined)?._type?._id ===
        'CIMDProfile'
    );
    throw new Error(
      `No CIMD profiles found in ${filePath}` +
        (holdsProfilesAsAgents
          ? `. The file holds them under the key 'agent' (frodo 4.x): import it with frodo agent import -f ${filePath}`
          : '')
    );
  }
  return importData;
}

/**
 * Warn about ids that are one profile: ids are not case-sensitive, so the later
 * one of two ids that differ only in case overwrites the earlier.
 * @param {CIMDProfileExportInterface} importData the import data
 * @param {string} source where the data came from, for the message
 */
function warnAboutIdsThatDifferOnlyInCase(
  importData: CIMDProfileExportInterface,
  source: string
): void {
  const byLowerCase = new Map<string, string[]>();
  for (const id of Object.keys(importData.cimdProfile)) {
    byLowerCase.set(id.toLowerCase(), [
      ...(byLowerCase.get(id.toLowerCase()) ?? []),
      id,
    ]);
  }
  for (const ids of byLowerCase.values()) {
    if (ids.length > 1) {
      printMessage(
        `The ids ${ids.map((id) => `'${id}'`).join(' and ')} in ${source} are one CIMD profile (ids are not case-sensitive): the later one overwrites the earlier.`,
        'warn'
      );
    }
  }
}

/**
 * The closing line of an import of several profiles.
 * @param {ImportTally} tally what was created and updated
 */
function printImportTally(tally: ImportTally): void {
  const total = tally.created + tally.updated;
  if (total === 0) return;
  printMessage(
    `Imported ${countProfiles(total)}: ${tally.created} created, ${tally.updated} updated.`,
    'info'
  );
}

/**
 * Import the profiles of parsed import data and record every profile in the
 * run: the library tries every profile and reports each one to the callback,
 * and a failed profile does not stop the others. The caller has found out that
 * the realm offers the type.
 * @param {object} params structured and named parameters
 * @param {OperationRun} params.run the run of the command
 * @param {CIMDProfileExportInterface} params.importData the data to import
 * @param {string} params.source where the data came from, for the messages
 * @param {ImportTally} params.tally counts what is created and updated
 */
async function importProfilesInto({
  run,
  importData,
  source,
  tally,
}: {
  run: OperationRun;
  importData: CIMDProfileExportInterface;
  source: string;
  tally: ImportTally;
}): Promise<void> {
  const ids = Object.keys(importData.cimdProfile);
  if (ids.length === 0) return;
  warnAboutIdsThatDifferOnlyInCase(importData, source);
  const report = run.resultCallback<CIMDProfileImportResult>();
  try {
    await importCIMDProfiles(
      importData,
      (error?: FrodoError, result?: CIMDProfileImportResult) => {
        report(error, result);
        if (result) {
          if (result.created) tally.created++;
          else tally.updated++;
          printMessage(
            describeImportResult(result.profile?._id ?? source, result),
            'info'
          );
        }
      }
    );
  } catch (error) {
    // the library reports every profile to the callback, so this is a failure
    // of the import as a whole
    printError(error, `Error importing CIMD profiles from ${source}`);
    run.recordCombinedError(error, { total: ids.length, fallbackName: source });
  }
}

/**
 * Import one CIMD profile from a file. Both the id and the file are the ones
 * the user named, so a profile that is not in the file is an error, and a
 * realm that does not offer the type fails with the error of the library.
 * @param {string} profileId id of the profile, as the file keys it
 * @param {string} file name of the import file
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importCIMDProfileFromFile(
  profileId: string,
  file: string
): Promise<boolean> {
  let indicatorId: string | undefined;
  try {
    const filePath = getFilePath(file);
    const importData = readImportFile(filePath);
    if (!importData.cimdProfile[profileId]) {
      printMessage(
        `CIMD profile ${profileId} not found in ${filePath}!`,
        'error'
      );
      return false;
    }
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing CIMD profile ${profileId}...`
    );
    const result = await importCIMDProfile(profileId, importData);
    stopProgressIndicator(
      indicatorId,
      `${describeImportResult(profileId, result)}`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing CIMD profile ${profileId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import the first CIMD profile of a file, and only that one.
 * @param {string} file name of the import file
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstCIMDProfileFromFile(
  file: string
): Promise<boolean> {
  try {
    const filePath = getFilePath(file);
    const [first] = Object.keys(readImportFile(filePath).cimdProfile);
    if (!first) {
      printMessage(`No CIMD profile found in ${filePath}!`, 'error');
      return false;
    }
    return await importCIMDProfileFromFile(first, file);
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Import all CIMD profiles from one file. Every profile is one operation of an
 * {@link OperationRun}: the ones that can be imported are imported and one
 * summary names the ones that could not be. A file that cannot be read or
 * parsed ends the command whatever `--allow-failures` says. A file without a
 * profile has nothing to import, and a realm that does not offer the type
 * cannot receive any: neither is a failure (cli records 0040, 0041), the note
 * says so and nothing is imported.
 * @param {string} file name of the import file
 * @param {boolean} allowFailures true to report profiles that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importCIMDProfilesFromFile(
  file: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'profile', allowFailures });
  const tally: ImportTally = { created: 0, updated: 0 };
  try {
    // the file the command line names must exist and parse
    const filePath = getFilePath(file);
    const importData = readImportFile(filePath);
    if (Object.keys(importData.cimdProfile).length === 0) {
      printMessage(`No CIMD profiles found in ${filePath}.`, 'warn');
      return true;
    }
    // A realm that does not offer the type is not applicable, which is not a
    // failure (cli record 0040): one note, nothing is imported, and the
    // library skips the same way
    if (await reportCIMDProfilesUnavailable(NOTHING_IMPORTED)) return true;
    await importProfilesInto({ run, importData, source: file, tally });
    printImportTally(tally);
    return run.finish();
  } catch (error) {
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Import all CIMD profiles from the separate files of the working directory
 * (`*.oauth2.cimd.json`). A file that cannot be read or parsed is a failed
 * item, named by its file name in the summary; the profiles of the other files
 * are still imported. No file, and a realm that does not offer the type, are
 * not failures (cli records 0040, 0041).
 * @param {boolean} allowFailures true to report files and profiles that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importCIMDProfilesFromFiles(
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'profile', allowFailures });
  const tally: ImportTally = { created: 0, updated: 0 };
  try {
    const directory = getWorkingDirectory();
    const files = fs
      .readdirSync(directory)
      .filter((name) => name.endsWith(CIMD_FILE_SUFFIX))
      .sort();
    if (files.length === 0) {
      printMessage(
        `No CIMD profile files (*${CIMD_FILE_SUFFIX}) found in ${directory}!`,
        'warn'
      );
      return true;
    }
    // asked once for the run, and the note is printed once; the files are not
    // read, because nothing can be imported (cli record 0040)
    if (await reportCIMDProfilesUnavailable(NOTHING_IMPORTED)) return true;
    for (const file of files) {
      let importData: CIMDProfileExportInterface;
      try {
        importData = readImportFile(path.join(directory, file));
      } catch (error) {
        printError(error);
        run.recordFailure(file, causeOf(error));
        continue;
      }
      await importProfilesInto({ run, importData, source: file, tally });
    }
    printImportTally(tally);
    return run.finish();
  } catch (error) {
    // not an item failure: the directory could not be read
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Print what `delete -a` would delete: the id and the client id URL patterns of
 * every profile, which are what stops working for a client that matched only
 * that profile. Deletes nothing; it is the preview of `--dry-run` and the plan
 * the confirmation shows.
 * @returns {Promise<boolean>} true if successful, false if the profiles could not be read
 */
export async function printCIMDProfilePlan(): Promise<boolean> {
  try {
    const profiles = await readCIMDProfiles();
    if (profiles.length === 0) {
      if (!(await reportCIMDProfilesUnavailable())) {
        printMessage('No CIMD profiles found.', 'info');
      }
      return true;
    }
    printMessage('The following CIMD profiles would be deleted:', 'info');
    for (const profile of profiles) {
      printMessage(
        `  ${profile._id}  ${patternsOf(profile).join(', ') || NOT_SET}`,
        'data'
      );
    }
    return true;
  } catch (error) {
    printError(error, 'Error reading the CIMD profiles');
  }
  return false;
}

/**
 * Delete a CIMD profile. The user named it, so a profile that does not exist,
 * or a realm that does not offer the type, is an error.
 * @param {string | undefined} profileId id of the profile; undefined when the picker had nothing to offer, which is nothing to delete and not a failure
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteCIMDProfile(
  profileId: string | undefined
): Promise<boolean> {
  if (!profileId) {
    try {
      if (!(await reportCIMDProfilesUnavailable())) {
        printMessage('No CIMD profiles found to delete.', 'info');
      }
      return true;
    } catch (error) {
      printError(error);
    }
    return false;
  }
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Deleting ${profileId}...`
  );
  try {
    await deleteCIMDProfileInLibrary(profileId);
    stopProgressIndicator(indicatorId, `Deleted ${profileId}.`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error deleting ${profileId}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Delete all CIMD profiles of the realm. The library tries every profile and
 * reports each one to the callback, so the profiles that can be deleted are
 * deleted whatever happens to the others, one summary names the ones that could
 * not be, and a failure to read the profiles (which the library always throws)
 * ends the command whatever `--allow-failures` says. Nothing to delete is not a
 * failure (cli record 0041). With `dryRun` nothing is deleted: the plan is
 * printed.
 * @param {boolean} allowFailures true to report profiles that could not be deleted but still succeed. Default: false
 * @param {boolean} dryRun true to only show which profiles would be deleted. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteCIMDProfiles(
  allowFailures: boolean = false,
  dryRun: boolean = false
): Promise<boolean> {
  if (dryRun) return printCIMDProfilePlan();
  const run = new OperationRun({ unit: 'profile', allowFailures });
  const report = run.resultCallback<CIMDProfileSkeleton>();
  let seen = 0;
  let deleted = 0;
  try {
    await deleteCIMDProfilesInLibrary(
      (error?: FrodoError, result?: CIMDProfileSkeleton) => {
        seen++;
        if (!error) deleted++;
        report(error, result);
      }
    );
    if (seen === 0) {
      // nothing to delete is not a failure
      if (!(await reportCIMDProfilesUnavailable())) {
        printMessage('No CIMD profiles found to delete.', 'info');
      }
      return true;
    }
    if (deleted > 0) printMessage(`Deleted ${countProfiles(deleted)}.`, 'info');
    return run.finish();
  } catch (error) {
    // not an item failure: the library could not even read the profiles
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}
