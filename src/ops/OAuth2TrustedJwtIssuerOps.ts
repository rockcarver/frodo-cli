import fs from 'fs';
import path from 'path';
import {
  frodo,
  state,
  type FrodoError,
  type OAuth2TrustedJwtIssuerExportInterface,
  type OAuth2TrustedJwtIssuerImportData,
  type OAuth2TrustedJwtIssuerSkeleton,
} from '@rockcarver/frodo-lib';
import c from '../utils/ColorTheme';
import {
  createProgressIndicator,
  createTable,
  failSpinner,
  printError,
  printMessage,
  showSpinner,
  stopProgressIndicator,
  succeedSpinner,
  updateProgressIndicator,
} from '../utils/Console';
import { unwrapInheritedSettings, valueOf } from '../utils/InheritedValue';
import { OperationRun } from '../utils/OperationRun';
import { safeTypedFilename } from './utils/SafeFilename';

const {
  getTypedFilename,
  titleCase,
  saveJsonToFile,
  getFilePath,
  getRealmName,
  getWorkingDirectory,
} = frodo.utils;

/** The file type of an export of trusted JWT issuers: `<id>.oauth2.issuer.json`. The key inside the file is the library's `trustedJwtIssuer`. */
export const ISSUER_FILE_TYPE = 'oauth2.issuer';

/**
 * The file name endings `import -A` reads: the files of `oauth issuer export` and the files of the
 * `trustedJwtIssuer/` folders of a full export (`config export -A`), so that such a tree imports without renaming.
 */
const ISSUER_IMPORT_SUFFIXES = [
  `.${ISSUER_FILE_TYPE}.json`,
  '.trustedjwtissuer.json',
];

/** What the table shows for the allowed subjects of an issuer that has none: AM then lets the issuer name any realm user. */
const ANY_USER = 'any user';

/**
 * The issuers by id, in order (the library does not sort them).
 * @param {OAuth2TrustedJwtIssuerSkeleton[]} issuers what the library read
 * @returns {OAuth2TrustedJwtIssuerSkeleton[]} a sorted copy
 */
function sortedById(
  issuers: OAuth2TrustedJwtIssuerSkeleton[]
): OAuth2TrustedJwtIssuerSkeleton[] {
  return [...issuers].sort((a, b) => (a._id ?? '').localeCompare(b._id ?? ''));
}

/**
 * The subjects an issuer may name in an assertion, one per line. An issuer
 * without allowed subjects may name any user of the realm, and the table says so.
 * @param {OAuth2TrustedJwtIssuerSkeleton} issuer the issuer, as a read by id or a query answered it
 * @returns {string} the subjects, or `any user`
 */
function allowedSubjectsOf(issuer: OAuth2TrustedJwtIssuerSkeleton): string {
  const subjects = valueOf<string[]>(issuer.allowedSubjects);
  return Array.isArray(subjects) && subjects.length > 0
    ? subjects.join('\n')
    : ANY_USER;
}

/**
 * The cell for a setting that is a string or a number.
 * @param {string | number | undefined} value the value of the setting
 * @returns {string} the value, or an empty cell when the setting is not set
 */
function cellOf(value: string | number | undefined): string {
  return value === undefined ? '' : String(value);
}

/**
 * "1 trusted JWT issuer", "3 trusted JWT issuers".
 * @param {number} count how many
 * @returns {string} the count with the noun
 */
function countIssuers(count: number): string {
  return `${count} trusted JWT issuer${count === 1 ? '' : 's'}`;
}

/**
 * List trusted JWT issuers
 * The Cloud root realm has none: the library answers with an empty list there, which is nothing to list, not a
 * failure (cli record 0041).
 * @param {boolean} long true for a table with the issuer, the allowed subjects and the JWKS URI
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listOAuth2TrustedJwtIssuers(
  long: boolean = false
): Promise<boolean> {
  let issuers: OAuth2TrustedJwtIssuerSkeleton[];
  try {
    issuers = sortedById(
      await frodo.oauth2oidc.issuer.readOAuth2TrustedJwtIssuers()
    );
  } catch (error) {
    printError(error, 'Error listing trusted JWT issuers');
    return false;
  }
  if (!long) {
    for (const issuer of issuers) {
      printMessage(issuer._id, 'data');
    }
    return true;
  }
  const table = createTable(['Id', 'Issuer', 'Allowed subjects', 'JWKS URI']);
  for (const issuer of issuers) {
    table.push([
      issuer._id ?? '',
      cellOf(valueOf<string>(issuer.issuer)),
      allowedSubjectsOf(issuer),
      cellOf(valueOf<string>(issuer.jwksUri)),
    ]);
  }
  printMessage(table.toString(), 'data');
  return true;
}

/**
 * Describe a trusted JWT issuer. The table shows the key set as present or absent, because it is a long JSON text;
 * `json` prints the whole object as the server answered the read.
 * @param {string} issuerId id of the issuer: the name of the object in the realm, not the issuer value its assertions carry. Undefined when the picker had nothing to offer
 * @param {boolean} json true to print the whole object as JSON
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeOAuth2TrustedJwtIssuer(
  issuerId: string | undefined,
  json: boolean = false
): Promise<boolean> {
  if (!issuerId) {
    printMessage('There is no trusted JWT issuer to choose from.', 'warn');
    return false;
  }
  try {
    const issuer =
      await frodo.oauth2oidc.issuer.readOAuth2TrustedJwtIssuer(issuerId);
    if (json) {
      printMessage(JSON.stringify(issuer, null, 2), 'data');
      return true;
    }
    const table = createTable(['Property', 'Value']);
    table.push(['Issuer Id', issuer._id ?? issuerId]);
    table.push(['Issuer', cellOf(valueOf<string>(issuer.issuer))]);
    table.push(['Allowed subjects', allowedSubjectsOf(issuer)]);
    table.push(['JWKS URI', cellOf(valueOf<string>(issuer.jwksUri))]);
    table.push([
      'JWK set',
      valueOf<string>(issuer.jwkSet) ? c.positive('set') : 'not set',
    ]);
    table.push([
      'JWKS cache timeout',
      cellOf(valueOf<number>(issuer.jwksCacheTimeout)),
    ]);
    table.push([
      'JWK store cache miss time',
      cellOf(valueOf<number>(issuer.jwkStoreCacheMissCacheTime)),
    ]);
    table.push([
      'Consented scopes claim',
      cellOf(valueOf<string>(issuer.consentedScopesClaim)),
    ]);
    table.push([
      'Resource owner identity claim',
      cellOf(valueOf<string>(issuer.resourceOwnerIdentityClaim)),
    ]);
    printMessage(table.toString(), 'data');
    return true;
  } catch (error) {
    printError(error, `Error describing trusted JWT issuer ${issuerId}`);
  }
  return false;
}

/**
 * An export in one shape, whichever way the issuers were read. A read by id wraps every setting in
 * `{ inherited, value }` and a query answers plain values (`null` for a setting that is not set), and the library
 * does not make the two agree, so the file of `-i` would differ from the file of `-a` and `-A`. The files hold the
 * plain shape, which is what the generic agent export has always written for an issuer; both shapes import.
 * @param {OAuth2TrustedJwtIssuerExportInterface} exportData what the library exported
 * @returns {OAuth2TrustedJwtIssuerExportInterface} the same export with plain settings
 */
function plainExport(
  exportData: OAuth2TrustedJwtIssuerExportInterface
): OAuth2TrustedJwtIssuerExportInterface {
  return {
    ...exportData,
    trustedJwtIssuer: Object.fromEntries(
      Object.entries(exportData.trustedJwtIssuer ?? {}).map(([id, issuer]) => [
        id,
        unwrapInheritedSettings(issuer),
      ])
    ),
  };
}

/**
 * Export a trusted JWT issuer to a file
 * @param {string} issuerId id of the issuer: the name of the object in the realm. Undefined when the picker had nothing to offer
 * @param {string} file optional file name. Default: `<id>.oauth2.issuer.json`
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportOAuth2TrustedJwtIssuerToFile(
  issuerId: string | undefined,
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  if (!issuerId) {
    printMessage('There is no trusted JWT issuer to choose from.', 'warn');
    return false;
  }
  showSpinner(`Exporting ${issuerId}...`);
  try {
    const fileName = file || safeTypedFilename(issuerId, ISSUER_FILE_TYPE);
    const filePath = getFilePath(fileName, true);
    const exportData = plainExport(
      await frodo.oauth2oidc.issuer.exportOAuth2TrustedJwtIssuer(issuerId)
    );
    saveJsonToFile(exportData, filePath, includeMeta);
    succeedSpinner(`Exported ${issuerId} to ${filePath}.`);
    return true;
  } catch (error) {
    failSpinner(`Error exporting ${issuerId}`);
    printError(error);
  }
  return false;
}

/**
 * Export all trusted JWT issuers to one file
 * One operation: the library throws one error if it cannot read the issuers, and no file is written then. A realm
 * without issuers, which includes the Cloud root realm where the library answers with an empty list, is written as a
 * file with an empty section, as the sibling commands do.
 * @param {string} file optional file name. Default: `all<Realm>Issuers.oauth2.issuer.json`
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportOAuth2TrustedJwtIssuersToFile(
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  showSpinner('Exporting all trusted JWT issuers...');
  try {
    const realmName = getRealmName(state.getRealm());
    const fileName =
      file ||
      getTypedFilename(
        `all${realmName === '/' ? 'Root' : titleCase(realmName)}Issuers`,
        ISSUER_FILE_TYPE
      );
    const filePath = getFilePath(fileName, true);
    const exportData = plainExport(
      await frodo.oauth2oidc.issuer.exportOAuth2TrustedJwtIssuers()
    );
    saveJsonToFile(exportData, filePath, includeMeta);
    succeedSpinner(
      `Exported ${countIssuers(Object.keys(exportData.trustedJwtIssuer).length)} to ${filePath}.`
    );
    return true;
  } catch (error) {
    failSpinner('Error exporting all trusted JWT issuers');
    printError(error);
  }
  return false;
}

/**
 * Export all trusted JWT issuers to separate files
 * Every issuer is one operation of an {@link OperationRun}: an issuer whose file cannot be written is printed and
 * named in one summary, and the others are still written. A failure to read the issuers ends the command whatever
 * `--allow-failures` says. Nothing to export is not a failure (cli record 0041).
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} allowFailures true to report issuers that could not be exported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportOAuth2TrustedJwtIssuersToFiles(
  includeMeta: boolean = true,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'issuer', allowFailures });
  let indicatorId: string;
  try {
    const exportData = plainExport(
      await frodo.oauth2oidc.issuer.exportOAuth2TrustedJwtIssuers()
    );
    const entries = Object.entries(exportData.trustedJwtIssuer);
    if (entries.length === 0) {
      printMessage('Nothing to export.', 'info');
      return true;
    }
    indicatorId = createProgressIndicator(
      'determinate',
      entries.length,
      'Writing trusted JWT issuers'
    );
    const taken = new Set<string>();
    for (const [id, issuer] of entries) {
      await run.run(id, () => {
        const fileData =
          frodo.oauth2oidc.issuer.createOAuth2TrustedJwtIssuerExportTemplate();
        fileData.trustedJwtIssuer[id] = issuer;
        updateProgressIndicator(indicatorId, `Exporting ${id}`);
        saveJsonToFile(
          fileData,
          getFilePath(safeTypedFilename(id, ISSUER_FILE_TYPE, taken), true),
          includeMeta
        );
      });
    }
    stopProgressIndicator(
      indicatorId,
      run.hasFailures
        ? 'Some trusted JWT issuers could not be written.'
        : `${countIssuers(entries.length)} written.`,
      run.hasFailures ? 'fail' : 'success'
    );
    return run.finish();
  } catch (error) {
    // not an item failure: the issuers could not be read
    stopProgressIndicator(indicatorId, `${error}`, 'fail');
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * The name of the issuer a failed library import or delete is about. The library's error names it in its message
 * ("Error importing alpha realm trusted issuer b") and carries no field for it.
 * @param {FrodoError} error the error the library reported for one issuer
 * @returns {string | undefined} the issuer id, or undefined if the message has another shape
 */
function issuerNameOf(error: FrodoError): string | undefined {
  return error.message.match(/ trusted issuer (.+)$/)?.[1];
}

/**
 * Read an import file. The data is handed to the library as it is: the library takes its own format, the key
 * `trustedJwtIssuer`, and the files the generic commands wrote for an issuer (the `agent` section of `agent export`
 * and of `config export`, since frodo-lib 4.0.0), and picks the issuers out itself.
 * @param {string} filePath the path of the file
 * @returns {OAuth2TrustedJwtIssuerImportData} the import data
 */
function readImportFile(filePath: string): OAuth2TrustedJwtIssuerImportData {
  const text = fs.readFileSync(filePath, 'utf8');
  let importData: unknown;
  try {
    importData = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${filePath} is not valid JSON: ${(error as Error).message}`,
      { cause: error }
    );
  }
  if (
    typeof importData !== 'object' ||
    importData === null ||
    Array.isArray(importData)
  ) {
    throw new Error(`${filePath} is not an export file`);
  }
  return importData as OAuth2TrustedJwtIssuerImportData;
}

/**
 * Whether a file has the section of an export of trusted JWT issuers, empty or not. A file without it, and without
 * issuers among its `agent` entries, is not an export of issuers.
 * @param {OAuth2TrustedJwtIssuerImportData} importData the parsed file
 * @returns {boolean} true if the section exists
 */
function hasIssuerSection(
  importData: OAuth2TrustedJwtIssuerImportData
): boolean {
  const section = (importData as { trustedJwtIssuer?: unknown })
    .trustedJwtIssuer;
  return typeof section === 'object' && section !== null;
}

/**
 * Import the trusted JWT issuers of one parsed file and record every one in the run. The library tries every issuer
 * and reports each to the result callback (a failed one as an error that names it), so one failing issuer does not
 * stop the others and the summary of the run names it.
 * @param {OperationRun} run the run of the command
 * @param {OAuth2TrustedJwtIssuerImportData} importData the parsed file
 * @param {string} source what to call the file in a failure that is not about one issuer
 * @returns {Promise<number>} how many issuers the library reported, 0 for a file without issuers
 */
async function importIssuersInto(
  run: OperationRun,
  importData: OAuth2TrustedJwtIssuerImportData,
  source: string
): Promise<number> {
  const report =
    run.resultCallback<OAuth2TrustedJwtIssuerSkeleton>(issuerNameOf);
  let reported = 0;
  try {
    await frodo.oauth2oidc.issuer.importOAuth2TrustedJwtIssuers(
      importData,
      undefined,
      (error, result) => {
        reported++;
        report(error, result);
      }
    );
  } catch (error) {
    // not about one issuer: the data could not be read at all
    printError(error);
    run.recordFailure(source, error);
    return reported + 1;
  }
  return reported;
}

/**
 * Import one trusted JWT issuer from a file. The file can be an export of issuers or a file the generic agent export
 * wrote.
 * @param {string} issuerId id of the issuer: the name of the object in the file
 * @param {string} file name of the import file
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importOAuth2TrustedJwtIssuerFromFile(
  issuerId: string,
  file: string
): Promise<boolean> {
  showSpinner(`Importing ${issuerId}...`);
  try {
    const filePath = getFilePath(file);
    await frodo.oauth2oidc.issuer.importOAuth2TrustedJwtIssuer(
      issuerId,
      readImportFile(filePath)
    );
    succeedSpinner(`Imported ${issuerId} from ${filePath}.`);
    return true;
  } catch (error) {
    failSpinner(`Error importing ${issuerId}`);
    printError(error);
  }
  return false;
}

/**
 * Import the first trusted JWT issuer of a file, and only that one (not all of them, which the AI agent importer did,
 * frodo-cli#1147).
 * @param {string} file name of the import file
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstOAuth2TrustedJwtIssuerFromFile(
  file: string
): Promise<boolean> {
  showSpinner(`Importing the first trusted JWT issuer of ${file}...`);
  try {
    const filePath = getFilePath(file);
    const imported =
      await frodo.oauth2oidc.issuer.importFirstOAuth2TrustedJwtIssuer(
        readImportFile(filePath)
      );
    succeedSpinner(
      `Imported ${imported?._id ?? 'the first issuer'} from ${filePath}.`
    );
    return true;
  } catch (error) {
    failSpinner(`Error importing the first trusted JWT issuer of ${file}`);
    printError(error);
  }
  return false;
}

/**
 * Import all trusted JWT issuers of one file
 * Every issuer is one item of the run: the ones that can be imported are imported and one summary names the ones that
 * could not be. A file that cannot be read or parsed, or that holds no issuers at all, ends the command whatever
 * `--allow-failures` says. A file with an empty `trustedJwtIssuer` section is an empty import: it is said and succeeds
 * (cli record 0041).
 * @param {string} file name of the import file
 * @param {boolean} allowFailures true to report issuers that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importOAuth2TrustedJwtIssuersFromFile(
  file: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'issuer', allowFailures });
  const filePath = getFilePath(file);
  showSpinner(`Importing ${filePath}...`);
  let importData: OAuth2TrustedJwtIssuerImportData;
  try {
    importData = readImportFile(filePath);
  } catch (error) {
    // not an item failure: the file that was named cannot be read
    failSpinner(`Error importing ${filePath}`);
    printError(error);
    return false;
  }
  const count = await importIssuersInto(run, importData, file);
  if (count === 0) {
    if (!hasIssuerSection(importData)) {
      failSpinner(`Error importing ${filePath}`);
      printError(new Error(`No trusted issuers found in ${filePath}`));
      return false;
    }
    succeedSpinner(`No trusted issuers to import in ${filePath}.`);
    return true;
  }
  const outcome = run.finish();
  if (outcome) succeedSpinner(`Imported ${filePath}.`);
  else failSpinner(`Error importing ${filePath}`);
  return outcome;
}

/**
 * Import all trusted JWT issuers from the separate files of the working directory (`*.oauth2.issuer.json` and the
 * `*.trustedJwtIssuer.json` files of a full export). A file that cannot be read, or that holds no issuers, is a failed
 * item named by its file, and the issuers of the other files are still imported. A directory that cannot be read ends
 * the command whatever `--allow-failures` says; no file at all is not a failure (cli record 0041).
 * @param {boolean} allowFailures true to report files and issuers that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importOAuth2TrustedJwtIssuersFromFiles(
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'issuer', allowFailures });
  let files: string[];
  const directory = getWorkingDirectory();
  try {
    files = fs
      .readdirSync(directory)
      .filter((name) =>
        ISSUER_IMPORT_SUFFIXES.some((suffix) =>
          name.toLowerCase().endsWith(suffix)
        )
      )
      .sort();
  } catch (error) {
    printError(error);
    return false;
  }
  if (files.length === 0) {
    printMessage(
      `No trusted issuer files (*.${ISSUER_FILE_TYPE}.json) found in ${directory}!`,
      'warn'
    );
    return true;
  }
  const indicatorId = createProgressIndicator(
    'determinate',
    files.length,
    'Importing trusted JWT issuers...'
  );
  for (const file of files) {
    let importData: OAuth2TrustedJwtIssuerImportData;
    try {
      importData = readImportFile(path.join(directory, file));
    } catch (error) {
      printError(error);
      run.recordFailure(file, error);
      updateProgressIndicator(indicatorId, `Error importing ${file}`);
      continue;
    }
    const count = await importIssuersInto(run, importData, file);
    if (count === 0 && !hasIssuerSection(importData)) {
      const error = new Error(`No trusted issuers found in ${file}`);
      printError(error);
      run.recordFailure(file, error);
    }
    updateProgressIndicator(indicatorId, `Imported ${file}`);
  }
  const outcome = run.finish();
  stopProgressIndicator(
    indicatorId,
    outcome
      ? `Finished importing trusted JWT issuers from ${files.length} file(s).`
      : 'Error importing trusted JWT issuers.',
    outcome ? 'success' : 'fail'
  );
  return outcome;
}
