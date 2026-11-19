/**
 * Private and secret key material in the agent files that `config-manager` writes (decision record
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0055-a-pull-never-writes-private-or-secret-key-material-into-an-agent-file.md,
 * which applies core record 0013, secrets are never exported in the clear, to key sets).
 *
 * A trusted JWT issuer, a software publisher, a remote consent agent and an OAuth2 client have a
 * `jwkSet`: the JSON Web Key Set of the other party, which AM uses to verify what that party signs.
 * It is meant to hold public keys. When it holds a private or a symmetric key (a member `d`, `p`,
 * `q`, `dp`, `dq`, `qi`, `oth` or `k`) a pull must not write it into a file that goes into version
 * control: it writes the placeholder `${<ID>_JWKSET}` instead and says so, and a push fills the
 * placeholder from the variable of that name.
 *
 * This module imports nothing from the library on purpose, like `AgentFileShape.ts`: the generic
 * kind lives in the deprecated `src/configManagerOps/` layer and many tests mock the library. What
 * needs the library's state (the values of the placeholders) is passed in.
 */
import fs from 'fs';

/** The members of a JWK (RFC 7517 and 7518) that only a private or a symmetric key has. */
const SECRET_JWK_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'];

/**
 * Where an agent file keeps a key set, as the path of the property: the top level (trusted JWT
 * issuers, software publishers, remote consent agents) and the signing and encryption group of an
 * OAuth2 client.
 */
const KEY_SET_FIELDS: string[][] = [
  ['jwkSet'],
  ['signEncOAuth2ClientConfig', 'jwkSet'],
];

/**
 * Whether the `jwkSet` of an object holds private or secret key material: a JWK with a private or a
 * symmetric member. The value may be wrapped (`{ inherited, value }`), and is a string of JSON, the
 * way AM stores it, or already an object. A key set that cannot be read as JSON holds nothing that
 * can be told apart. Nothing of the key is returned or printed.
 * @param {unknown} jwkSet the `jwkSet` property of the object
 * @returns {boolean} true if a key in it is private or symmetric
 */
export function holdsSecretKeyMaterial(jwkSet: unknown): boolean {
  let value: unknown = jwkSet;
  if (value && typeof value === 'object' && 'value' in value) {
    value = (value as { value: unknown }).value;
  }
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return false;
    }
  }
  if (!value || typeof value !== 'object') return false;
  const keys = Array.isArray((value as { keys?: unknown }).keys)
    ? ((value as { keys: unknown[] }).keys as unknown[])
    : [value];
  return keys.some(
    (key) =>
      key &&
      typeof key === 'object' &&
      SECRET_JWK_MEMBERS.some((member) => member in (key as object))
  );
}

/**
 * The name of the variable that holds the key set of an object: the id in upper case with `-`
 * as `_` (the way `esvToEnv` in `src/utils/FrConfig.ts` names the variable of a secret, record
 * 0054 rule 7), every other character that a variable name cannot have as `_`, and `_JWKSET`.
 * @param {string} id the id of the object
 * @returns {string} the name of the variable, e.g. `ZION_ISSUER_JWKSET`
 */
export function keySetVariable(id: string): string {
  return `${id
    .toUpperCase()
    .replace(/-/g, '_')
    .replace(/[^A-Z0-9_]/g, '_')}_JWKSET`;
}

/** A key set that was not written, and the variable that stands for it. */
export interface RedactedKeySet {
  /** The property that held the key set, e.g. `jwkSet`. */
  field: string;
  /** The name of the variable the file refers to, e.g. `ZION_ISSUER_JWKSET`. */
  variable: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Replace every key set of an object that holds private or secret key material with the
 * placeholder of its variable, in place. A key set with public keys only, one that is unset, and
 * one that already is a placeholder (an overrides file may have put one there) are not touched. A
 * key set with one private key among public ones is replaced as a whole: half of a secret is not
 * written either.
 * @param {Record<string, unknown>} config the object in the plain shape, after the overrides were merged; it is changed
 * @param {string} id the id of the object, which names the variable
 * @param {string} [variable] the variable of the first key set, for a kind that has its own convention for the names of its variables (the application folder, `APP_<NAME>_JWKSET`); default: the one that the id names
 * @returns {RedactedKeySet[]} what was replaced, none if the object holds no private key material
 */
export function redactKeySets(
  config: Record<string, unknown>,
  id: string,
  variable: string = keySetVariable(id)
): RedactedKeySet[] {
  const redacted: RedactedKeySet[] = [];
  for (const path of KEY_SET_FIELDS) {
    let holder: unknown = config;
    for (const step of path.slice(0, -1)) {
      holder = isRecord(holder) ? holder[step] : undefined;
    }
    const field = path[path.length - 1];
    if (!isRecord(holder) || !holdsSecretKeyMaterial(holder[field])) continue;
    // an object has its key set in one place; a second one gets a variable of its own, never the same
    const name =
      redacted.length === 0 ? variable : `${variable}_${redacted.length + 1}`;
    holder[field] = `\${${name}}`;
    redacted.push({ field: path.join('.'), variable: name });
  }
  return redacted;
}

/**
 * The warning for an object whose key set was not written. It names the object, the property and
 * the variable, and never a part of the key.
 * @param {string} label what one object is called, e.g. `trusted JWT issuer`
 * @param {string} id the id of the object
 * @param {string} realm the realm, as the state names it
 * @param {RedactedKeySet} redacted what was replaced
 * @returns {string} the message
 */
export function redactedKeySetMessage(
  label: string,
  id: string,
  realm: string,
  redacted: RedactedKeySet
): string {
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} '${id}' of realm '${realm}' holds private or secret key material in ${redacted.field}: it is not written. The file has \${${redacted.variable}} in its place; set that variable to the key set when you push.`;
}

/** What {@link readAgentFile} needs of the library's state: the values that fill a placeholder. */
export interface PlaceholderEnvironment {
  getEnv(key: string): string | undefined;
  getEnvs(): Record<string, string>;
  setEnv(key: string, value: string): void;
  setEnvs(env: Record<string, string>, clear?: boolean): void;
  getUseProcessEnvironmentForPlaceholders?(): boolean;
}

/** A key set in a file that is only a placeholder: `"jwkSet": "${NAME}"`. */
const KEY_SET_PLACEHOLDER = /"jwkSet"\s*:\s*"\$\{([A-Za-z0-9_]+)\}"/g;

/** Whether a variable holds a key set as JSON text: an object, not text that merely parses. */
function isJsonObject(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

/**
 * Read an agent file for a push. The library fills a placeholder into the text of the file before
 * it is parsed, so a key set (JSON text, with quotes) in a variable would break the string it is
 * put into. For the variables that stand for a whole `jwkSet`, and only for them, the value that
 * is put in is the JSON-escaped form of the key set, so that the variable holds the key set as it
 * is, as the pull asks. A value that is not a JSON object (one that was already escaped by hand,
 * or an unset variable) is left to the library: it is filled as it is, or it fails and names the
 * variable. The values of the state are put back whatever happens.
 * @param {string} file the path of the file
 * @param {(file: string) => T} read the library's read of a file with the placeholders filled
 * @param {PlaceholderEnvironment} env the state of the library
 * @returns {T} what `read` answers
 */
export function readAgentFile<T>(
  file: string,
  read: (file: string) => T,
  env: PlaceholderEnvironment
): T {
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    // `read` says what is wrong with a file that cannot be read
  }
  const escaped = new Map<string, string>();
  for (const [, name] of text.matchAll(KEY_SET_PLACEHOLDER)) {
    const value =
      env.getEnv(name) ??
      (env.getUseProcessEnvironmentForPlaceholders?.() === true
        ? process.env[name]
        : undefined);
    if (value !== undefined && isJsonObject(value)) {
      escaped.set(name, JSON.stringify(value).slice(1, -1));
    }
  }
  if (escaped.size === 0) return read(file);
  const before = { ...env.getEnvs() };
  try {
    for (const [name, value] of escaped) env.setEnv(name, value);
    return read(file);
  } finally {
    env.setEnvs(before, true);
  }
}
