import {
  frodo,
  type OAuth2TrustedJwtIssuerSkeleton,
} from '@rockcarver/frodo-lib';
import c from '../utils/ColorTheme';
import { createTable, printError, printMessage } from '../utils/Console';
import { valueOf } from '../utils/InheritedValue';

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
