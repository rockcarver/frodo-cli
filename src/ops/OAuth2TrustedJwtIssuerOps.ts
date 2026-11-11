import {
  frodo,
  state,
  type OAuth2TrustedJwtIssuerExportInterface,
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
} = frodo.utils;

/** The file type of an export of trusted JWT issuers: `<id>.oauth2.issuer.json`. The key inside the file is the library's `trustedJwtIssuer`. */
export const ISSUER_FILE_TYPE = 'oauth2.issuer';

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
