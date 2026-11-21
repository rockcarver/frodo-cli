/**
 * Scrubs known values from the text of an MCP tool result, as the last step
 * before the text leaves the process.
 *
 * The text of a result is a value that a function of the library returned or an
 * error that it threw, written as text. The library writes the errors it hands
 * out as a view; this is a second line behind that and does not depend on it:
 * whatever else the text holds, the values that the connection itself holds, the
 * lines of the sensitive headers and a few shapes of value are replaced by
 * `<redacted>`. Every step reads the text once, so that the time it takes does
 * not depend on what the text holds (a server writes part of it).
 *
 * 1. The known values. Each getter of the state feeds one rule:
 *    - `getBearerToken`, `getPfBearerToken`, `getCookieValue`, `getRefreshToken`,
 *      `getIdToken`, `getLogApiSecret`, `getAmsterPrivateKey`, the `tokenId` and
 *      `access_token` and `refresh_token` of `getUserSessionTokenMeta`,
 *      `getBearerTokenMeta` and `getPfBearerTokenMeta`, the private members of
 *      `getServiceAccountJwk` and the values of the request (the value that the
 *      caller presented, in the resource-server mode): looked for from
 *      {@link MIN_SECRET_LENGTH} characters on. `getPassword` is among them: a
 *      password shorter than that is not looked for in the text (it would match
 *      ordinary words and replace them in every result); it is protected by
 *      the header rule below, and by the view of the library, which redacts the
 *      header that carries it by name.
 *    - `getAuthenticationHeaderOverrides`: the values of ALL of them, whatever the
 *      header is called, because they are credentials by definition; looked for
 *      from {@link MIN_AUTHENTICATION_OVERRIDE_LENGTH} characters on, because
 *      an API key or a static value is often short.
 *    - `getConfigurationHeaderOverrides`: the values of those whose name says
 *      that they are secrets (see {@link SECRET_HEADER_NAME}), from
 *      {@link MIN_SECRET_LENGTH} on: the other ones are settings, not secrets.
 *    - `getHost` and `getIdmHost`: the password and the user name in the user info
 *      of the URL (the user info ends at the last at sign of the authority), as
 *      written and as decoded, from {@link MIN_AUTHENTICATION_OVERRIDE_LENGTH}
 *      characters on: the URL is written in the text of every request that failed.
 *    A value is looked for as it is, as it is written inside a JSON string
 *    (escaped once and twice) and percent-encoded.
 * 2. The lines of the sensitive headers: `<name>: <value>` as a line (at the
 *    start of the text, of a line or of a string, after the `\n` that a JSON
 *    string writes for a line break, or after a brace or a comma) and
 *    `"<name>": "<value>"` for a key that is quoted and a value that is a string,
 *    for the names of {@link SENSITIVE_HEADER_NAMES}, the name of the session
 *    cookie (`getCookieName`) and the names of the authentication overrides, in
 *    any case: the value is replaced whatever it is, and whatever its length. A
 *    key whose value is an object, a list, a number, a boolean or `null` is left
 *    as it is, so that a text that is JSON stays JSON, and so is a value that
 *    holds nothing. A name in the middle of a sentence or of a comment is not a
 *    line.
 *    The password in the user info of every URL (`scheme://user:password@host`)
 *    is replaced as well, whatever the URL is (see {@link replaceUrlPasswords}):
 *    the user info goes up to the last at sign before the authority ends.
 * 3. `Bearer ` followed by a JSON web token, or by at least
 *    {@link MIN_BEARER_VALUE_LENGTH} characters of the alphabet of such a value
 *    (letters, digits and `-._~+/*`, then `=` padding). The scheme stays
 *    (`Bearer <redacted>`). A word of prose that follows `Bearer` is shorter and
 *    is left alone.
 * 4. A JSON web token anywhere: two or three parts of base64url characters, the
 *    first starting with `eyJ`, also when a word or a hyphen is stuck to it
 *    (`kid-eyJ...`) and its header decodes as JSON.
 * 5. A value of {@link MIN_NAMED_VALUE_LENGTH} characters or more after
 *    `access_token=`, `assertion=` and the other names of an authorization
 *    exchange (also as `"name": "value"`).
 */

/** The text that takes the place of a value that must not be sent. */
export const REDACTED = '<redacted>';

/** What a text becomes when the scrub fails on it: the text is withheld, not passed on. */
export const WITHHELD = '<redacted: the text could not be scrubbed>';

/** The shortest known value that is looked for. */
export const MIN_SECRET_LENGTH = 16;

/** The shortest value of an authentication header override that is looked for. */
export const MIN_AUTHENTICATION_OVERRIDE_LENGTH = 8;

/** The fewest characters that a value after `Bearer` has when it is not a JSON web token. */
export const MIN_BEARER_VALUE_LENGTH = 16;

/** The fewest characters of a value after the name of an authorization exchange. */
export const MIN_NAMED_VALUE_LENGTH = 40;

/** A value to look for, with the shortest length at which it is looked for. */
export type KnownValue = string | { value: string; minLength: number };

/** The members of a JSON web key that are secret. */
const PRIVATE_KEY_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k'];

/**
 * The header names whose value is a secret, in lower case. This is a deliberate
 * copy of `SENSITIVE_HEADER_NAMES` of frodo-lib (`src/utils/SensitiveDataUtils.ts`),
 * like `EXCHANGE_NAMES` below and the rules for bearer values, JSON web tokens and
 * the user info of URLs: a change to one of them there is made here too.
 */
export const SENSITIVE_HEADER_NAMES: readonly string[] = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-openam-password',
  'x-openidm-password',
  'x-api-key',
  'x-api-secret',
  'api-key',
  'ocp-apim-subscription-key',
  'x-auth-token',
  'iplanetdirectorypro',
];

/** The names of the fields of an authorization exchange, whose long values are replaced. */
export const EXCHANGE_NAMES = [
  'access_token',
  'id_token',
  'refresh_token',
  'subject_token',
  'actor_token',
  'assertion',
  'client_secret',
  'code_verifier',
];

/**
 * `Bearer` and a value: a JSON web token (the first part starts with `eyJ`), or a
 * run of the characters of a bearer value, with its padding. The word boundary
 * keeps a word that ends in `bearer` out of it. A minimum is written as an exact
 * count followed by a star (`x{16}x*`, not `x{16,}`): the engine keeps no entry
 * per character for the star, and a value of many megabytes does not overflow
 * its stack.
 */
const BEARER_VALUE = new RegExp(
  `\\b(bearer)(\\s+)(eyJ[\\w-]{2}[\\w-]*\\.[\\w-]+(?:\\.[\\w-]*)?|[A-Za-z0-9\\-._~+/*]{${MIN_BEARER_VALUE_LENGTH}}[A-Za-z0-9\\-._~+/*]*=*)`,
  'gi'
);

/** A run of the characters that a JSON web token is made of, dots included. */
const TOKEN_RUN = /[A-Za-z0-9_.-]+/g;

/** A long value after the name of an authorization exchange. */
const EXCHANGE_VALUE = new RegExp(
  `(?<![\\w-])(${EXCHANGE_NAMES.join('|')})(["']?[ \\t]*[:=][ \\t]*["']?)([A-Za-z0-9._~+/*-]{${MIN_NAMED_VALUE_LENGTH}}[A-Za-z0-9._~+/*-]*=*)`,
  'gi'
);

/** The schemes of an `Authorization` value, kept when the value after them is replaced. */
const SCHEME = /^(bearer|basic|digest|negotiate|ntlm|dpop|token)\s+/i;

/** A value that has been replaced already: the scheme, if any, and the placeholder. */
const REPLACED =
  /^(?:(?:bearer|basic|digest|negotiate|ntlm|dpop|token)\s+)?<redacted>$/i;

/** The names of the getters of the state that hold a secret as text. */
export const STATE_TEXT_GETTERS = [
  'getBearerToken',
  'getPfBearerToken',
  'getCookieValue',
  'getPassword',
  'getRefreshToken',
  'getIdToken',
  'getLogApiSecret',
  'getAmsterPrivateKey',
] as const;

/** The names of the getters of the state that hold the header overrides. */
export const STATE_HEADER_GETTERS = [
  'getAuthenticationHeaderOverrides',
  'getConfigurationHeaderOverrides',
] as const;

/** The names of the getters of the state that hold a key. */
export const STATE_KEY_GETTERS = ['getServiceAccountJwk'] as const;

/** The names of the getters of the state that hold the metadata of a session or an access value. */
export const STATE_META_GETTERS = [
  'getUserSessionTokenMeta',
  'getBearerTokenMeta',
  'getPfBearerTokenMeta',
] as const;

/** The names of the getters of the state that hold a name, not a value. */
export const STATE_NAME_GETTERS = ['getCookieName'] as const;

/** The names of the getters of the state that hold a URL, which may carry a user info. */
export const STATE_URL_GETTERS = ['getHost', 'getIdmHost'] as const;

/** The members of that metadata that hold a secret. */
export const META_MEMBERS = ['tokenId', 'access_token', 'refresh_token'];

/** Every getter of the state that this module reads. */
export const STATE_GETTERS: readonly string[] = [
  ...STATE_TEXT_GETTERS,
  ...STATE_HEADER_GETTERS,
  ...STATE_KEY_GETTERS,
  ...STATE_META_GETTERS,
  ...STATE_NAME_GETTERS,
  ...STATE_URL_GETTERS,
];

/** A header name that says its value is a secret. */
export const SECRET_HEADER_NAME =
  /auth|token|secret|key|password|credential|session|cookie|signature|bearer/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/** Calls a getter of the state and never throws: a state may not have it. */
function call(state: unknown, name: string): unknown {
  try {
    const getter = isObject(state) ? state[name] : undefined;
    return typeof getter === 'function'
      ? (getter as () => unknown).call(state)
      : undefined;
  } catch {
    return undefined;
  }
}

/** The secret strings of a value: a text, the text and the private members of a key. */
function flatten(value: unknown, into: KnownValue[]): void {
  if (typeof value === 'string') {
    into.push(value);
  } else if (isObject(value)) {
    try {
      into.push(JSON.stringify(value));
    } catch {
      // a value that cannot be written is not in a result either
    }
    for (const [key, member] of Object.entries(value)) {
      if (typeof member === 'string' && PRIVATE_KEY_MEMBERS.includes(key)) {
        into.push(member);
      }
    }
  }
}

/**
 * The known values that the connection holds right now (see the rules in the
 * description of this module).
 * @param {unknown} state the state of the library (a getter that it lacks is skipped)
 * @param {...unknown} more values of the request that are not in the state: what the caller presented, its session value, a key
 * @returns {KnownValue[]} the values to look for in a result
 */
export function liveSecrets(state: unknown, ...more: unknown[]): KnownValue[] {
  const found: KnownValue[] = [];
  for (const getter of STATE_TEXT_GETTERS) flatten(call(state, getter), found);
  // the values of the authentication overrides are credentials, whatever the header is called
  const authentication = call(state, 'getAuthenticationHeaderOverrides');
  if (isObject(authentication)) {
    for (const value of Object.values(authentication)) {
      if (typeof value === 'string') {
        found.push({ value, minLength: MIN_AUTHENTICATION_OVERRIDE_LENGTH });
      }
    }
  }
  // the values of the configuration overrides are settings, unless their name says otherwise
  const configuration = call(state, 'getConfigurationHeaderOverrides');
  if (isObject(configuration)) {
    for (const [name, value] of Object.entries(configuration)) {
      if (SECRET_HEADER_NAME.test(name)) flatten(value, found);
    }
  }
  for (const getter of STATE_KEY_GETTERS) flatten(call(state, getter), found);
  for (const getter of STATE_META_GETTERS) {
    const meta = call(state, getter);
    if (isObject(meta)) {
      for (const member of META_MEMBERS) flatten(meta[member], found);
    }
  }
  // the host of the connection may carry a user info: it is written in the URL of every request
  for (const getter of STATE_URL_GETTERS) {
    found.push(...userInfoOfUrl(call(state, getter)));
  }
  for (const value of more) flatten(value, found);
  return found;
}

/**
 * The secrets in the user info of a URL: the password, as it is written and as
 * it decodes, and the user name (which is the credential itself when there is no
 * password), each looked for from {@link MIN_AUTHENTICATION_OVERRIDE_LENGTH}
 * characters on. The user info ends at the last at sign of the authority.
 * @param {unknown} url the URL (anything that is no text has none)
 * @returns {KnownValue[]} the values to look for
 */
export function userInfoOfUrl(url: unknown): KnownValue[] {
  if (typeof url !== 'string') return [];
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(url)?.[1];
  const at = authority?.lastIndexOf('@') ?? -1;
  if (!authority || at === -1) return [];
  const userInfo = authority.slice(0, at);
  const colon = userInfo.indexOf(':');
  const values: string[] =
    colon === -1
      ? [userInfo]
      : [userInfo.slice(colon + 1), userInfo.slice(0, colon)];
  const found: KnownValue[] = [];
  for (const value of values) {
    let decoded = value;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      // not a percent-encoded text: it is looked for as it is written
    }
    for (const spelling of new Set([decoded, value])) {
      if (spelling) {
        found.push({
          value: spelling,
          minLength: MIN_AUTHENTICATION_OVERRIDE_LENGTH,
        });
      }
    }
  }
  return found;
}

/**
 * The names of the headers whose lines are replaced, besides the shared list:
 * the name of the session cookie, the names of all authentication overrides and
 * those of the configuration overrides that say they are secrets.
 * @param {unknown} state the state of the library (a getter that it lacks is skipped)
 * @returns {string[]} the names, in lower case
 */
export function sensitiveNames(state: unknown): string[] {
  const names: string[] = [];
  const cookieName = call(state, 'getCookieName');
  if (typeof cookieName === 'string' && cookieName) names.push(cookieName);
  const authentication = call(state, 'getAuthenticationHeaderOverrides');
  if (isObject(authentication)) names.push(...Object.keys(authentication));
  const configuration = call(state, 'getConfigurationHeaderOverrides');
  if (isObject(configuration)) {
    names.push(
      ...Object.keys(configuration).filter((name) =>
        SECRET_HEADER_NAME.test(name)
      )
    );
  }
  return [...new Set(names.map((name) => name.toLowerCase()))];
}

/** A value as it is written in JSON text, in text that is written in a JSON string, and in a URL. */
function variantsOf(secret: string): string[] {
  const once = JSON.stringify(secret).slice(1, -1);
  const twice = JSON.stringify(once).slice(1, -1);
  return [secret, once, twice, encodeURIComponent(secret)];
}

/** The value of a header line that is a run: characters that no JSON structure and no quote uses. */
const LINE_RUN = '[^\\r\\n"\',}\\]\\\\]+';

/**
 * The expressions of the header lines, by the names they hold. None of them reads
 * a quoted value: each one stops in front of the quote, and the string is read by
 * {@link endOfQuotedString}, a loop over its characters, so that a string of many
 * megabytes costs its length and no stack of an engine.
 */
const headerLines = new Map<
  string,
  { keyed: RegExp; atLineStart: RegExp; afterBrace: RegExp; afterQuote: RegExp }
>();

/**
 * The expressions of the headers of the shared list and of these names.
 * - `keyed` reads a key that is quoted (`"name": ` as JSON and a printed object
 *   write it) and a value that starts with the same quote: the value of such a
 *   key may as well be an object, a list, a number, a boolean or `null`, and
 *   those are left alone, so that a JSON text stays JSON.
 * - `atLineStart` reads `name: value` at the start of the text or after a real
 *   line break (a JSON string has none), as YAML or an HTTP header writes it: the
 *   value is a run, or a string in single or double quotes.
 * - `afterBrace` reads it after a brace, a comma or the line break that a JSON
 *   string writes: the value is a run or a string in single quotes (as a printed
 *   object writes it), never a string in double quotes: there the double quote may
 *   be the end of the string that the name stands in (`{"Cookie:": "x"}`).
 * - `afterQuote` reads it at the start of a string or of a key: the next quote
 *   ends that string, not a value, so the value is a run.
 * A name in the middle of a sentence or of a comment is not a line of a header.
 */
function headerLinesOf(names: readonly string[]): {
  keyed: RegExp;
  atLineStart: RegExp;
  afterBrace: RegExp;
  afterQuote: RegExp;
} {
  const all = [...new Set([...SENSITIVE_HEADER_NAMES, ...names])]
    .sort((left, right) => right.length - left.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const key = all.join('|');
  let expressions = headerLines.get(key);
  if (!expressions) {
    const head = `([ \\t]*)(${key})([ \\t]*:[ \\t]*)`;
    expressions = {
      keyed: new RegExp(`(["'])(${key})\\1([ \\t]*:[ \\t]*)(?=["'])`, 'gi'),
      atLineStart: new RegExp(
        `(?<=^|[\\r\\n])${head}(?:(?=["'])|(${LINE_RUN}))`,
        'gi'
      ),
      afterBrace: new RegExp(
        `(?<=[{,]|\\\\[nrt])${head}(?:(?=')|(${LINE_RUN}))`,
        'gi'
      ),
      afterQuote: new RegExp(`(?<=["'])${head}(${LINE_RUN})`, 'gi'),
    };
    // a handful of name sets in a process: keep them, but never a thousand
    if (headerLines.size < 64) headerLines.set(key, expressions);
  }
  return expressions;
}

/**
 * Where a string in quotes ends: the index after its closing quote, or -1 when
 * it has none before a line break (JSON writes none inside a string) or the end
 * of the text. A backslash makes the next character part of the string.
 * @param {string} text the text
 * @param {number} start the index of the opening quote
 * @param {string} forbidden a character that may not stand in the string
 * @returns {number} the index after the closing quote, or -1
 */
function endOfQuotedString(
  text: string,
  start: number,
  forbidden = ''
): number {
  const quote = text[start];
  for (let index = start + 1; index < text.length; index++) {
    const character = text[index];
    if (character === '\\') {
      index++;
    } else if (character === quote) {
      return index + 1;
    } else if (
      character === '\n' ||
      character === '\r' ||
      character === forbidden
    ) {
      return -1;
    }
  }
  return -1;
}

/**
 * Replaces the values of the header lines that one expression finds, reading a
 * value that starts with a quote by {@link endOfQuotedString}.
 * @param {string} text the text
 * @param {RegExp} expression one of the expressions of {@link headerLinesOf}
 * @param {boolean} keyed whether the expression is the one of the quoted key
 * @returns {string} the text with the values replaced
 */
function replaceHeaderLines(
  text: string,
  expression: RegExp,
  keyed: boolean
): string {
  let result = '';
  let copied = 0;
  expression.lastIndex = 0;
  for (
    let match = expression.exec(text);
    match;
    match = expression.exec(text)
  ) {
    const valueStart = match.index + match[0].length;
    const [, first, second, third, run] = match;
    let value: string;
    let end: number;
    if (run !== undefined) {
      value = run;
      end = valueStart;
    } else {
      // a value that starts with a quote: a string, or nothing that is a value
      const quote = text[valueStart];
      // a name in single quotes takes a value in single quotes, a name in double quotes one in
      // double quotes: the next quote of another sort belongs to the string that holds the name
      if (keyed && quote !== first) continue;
      end = endOfQuotedString(text, valueStart, quote === "'" ? '"' : '');
      if (end === -1) continue;
      value = text.slice(valueStart, end);
    }
    result += keyed
      ? `${text.slice(copied, match.index)}${first}${second}${first}${third}${replaceHeaderValue(value)}`
      : `${text.slice(copied, match.index)}${first}${second}${third}${replaceHeaderValue(value)}`;
    copied = end;
    expression.lastIndex = end;
  }
  return result + text.slice(copied);
}

/**
 * The value of a header line replaced: quotes and the scheme stay, a value that
 * is replaced already is left, and so is a value that holds nothing.
 */
function replaceHeaderValue(value: string): string {
  const quote = value[0] === '"' || value[0] === "'" ? value[0] : '';
  const inner = quote ? value.slice(1, -1) : value;
  if (inner.trim() === '' || REPLACED.test(inner.trim())) return value;
  const scheme = SCHEME.exec(inner)?.[0] ?? '';
  return `${quote}${scheme}${REDACTED}${quote}`;
}

/** The shortest part, from `eyJ` on, that is the header of a JSON web token. */
const MIN_TOKEN_HEADER_LENGTH = 'eyJ'.length + 4;

/** The shortest part that can be the payload of a JSON web token. */
const MIN_TOKEN_PART_LENGTH = 4;

/**
 * Whether the text decodes (base64url) as a JSON object, as the header of a
 * token does. It decides about a token that something sticks to (`kid-eyJ...`):
 * a word that merely holds `eyJ` (`surveyJobsList`) does not decode as JSON.
 * @param {string} text the part that starts with `eyJ`
 * @returns {boolean} whether it is the header of a token
 */
function decodesAsHeader(text: string): boolean {
  try {
    const decoded = Buffer.from(
      text.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf8');
    // an object ends with a brace: most words that hold eyJ fail here, without the cost of a failed parse
    if (!decoded.trimEnd().endsWith('}')) return false;
    const value: unknown = JSON.parse(decoded);
    return value !== null && typeof value === 'object';
  } catch {
    return false;
  }
}

/**
 * The tokens in one run of token characters (see {@link replaceJsonWebTokens}).
 * A run holds letters, digits, `_`, `-` and `.`, so its parts hold no other
 * character, and what is asked of a part is its length: no regular expression
 * reads a part, which can be many megabytes long.
 * @param {string} run a maximal run of token characters
 * @returns {string} the run with the tokens replaced
 */
function tokensInRun(run: string): string {
  if (run.length < 12 || !run.includes('eyJ')) return run;
  const parts = run.split('.');
  const written: string[] = [];
  let changed = false;
  for (let index = 0; index < parts.length;) {
    const part = parts[index];
    const at = part.indexOf('eyJ');
    if (
      at !== -1 &&
      index + 1 < parts.length &&
      part.length - at >= MIN_TOKEN_HEADER_LENGTH &&
      parts[index + 1].length >= MIN_TOKEN_PART_LENGTH &&
      (at === 0 || decodesAsHeader(part.slice(at)))
    ) {
      // a third part follows, empty or not, as in `header.payload.` of an unsecured token
      written.push(`${part.slice(0, at)}${REDACTED}`);
      index += index + 2 < parts.length ? 3 : 2;
      changed = true;
    } else {
      written.push(part);
      index++;
    }
  }
  return changed ? written.join('.') : run;
}

/**
 * Replaces the JSON web tokens of a text: it reads maximal runs of token
 * characters, once each, and looks at the dot separated parts of a run that has
 * `eyJ` in it. A run of `eyJ` or of dots costs no more than any other text. The
 * first part of a token may have something stuck to it (`kid-eyJ...`, `kid_eyJ...`,
 * `abceyJ...`): what stands in front of `eyJ` stays, and the token is replaced
 * when its header decodes as JSON. A run that cannot be read (whatever the
 * reason) is replaced as a whole: the text is not passed on with a candidate in it.
 * @param {string} text the text
 * @param {(run: string) => string} readRun reads one run (a parameter for the test of the failure)
 * @returns {string} the text with the tokens replaced
 */
export function replaceJsonWebTokens(
  text: string,
  readRun: (run: string) => string = tokensInRun
): string {
  return text.replace(TOKEN_RUN, (run) => {
    try {
      return readRun(run);
    } catch {
      return REDACTED;
    }
  });
}

/** The characters of a user info that has no scheme in front of it. */
const BARE_USER_INFO_CHARACTER = /[^\s/@'"<>()[\]{},;=?#&`\\]/;

/** The characters that end the authority of such a user info. */
const BARE_AUTHORITY_END = /[\s/?#'"<>`\\]/;

/** The longest user info that {@link replaceBareUserInfo} reads in front of an at sign. */
const MAX_BARE_USER_INFO_LENGTH = 256;

/** The start of what follows the at sign of the digest of an image (`image:tag@sha256:...`), which is no host. */
const DIGEST = /^(?:sha(?:1|224|256|384|512)|md5):/i;

/**
 * Replaces the password of a user info that has no scheme in front of it:
 * `user:password@host` and `//user:password@host`, as the library does in the
 * text of an error. It looks at each at sign once and reads at most
 * {@link MAX_BARE_USER_INFO_LENGTH} characters back from it. What stands in front
 * of the at sign has to hold a colon with something after it, a host has to
 * follow, and the user info ends at the last at sign of the authority, so a
 * password may hold one. The address of a mail (no colon), `mailto:` and the
 * digest of an image are left. The scrub applies it to the text of an ERROR only:
 * the text of a result is data, and `Contact:john@example.com` is a value there.
 * @param {string} text the text of an error
 * @returns {string} the text with the passwords of such user info replaced
 */
export function replaceBareUserInfo(text: string): string {
  let result = '';
  let from = 0;
  let at = text.indexOf('@');
  // the authority that the last scan read: where it ended and where its last at sign is
  let regionEnd = -1;
  let regionLastAt = -1;
  while (at !== -1) {
    let start = at;
    while (
      start > from &&
      at - start < MAX_BARE_USER_INFO_LENGTH &&
      BARE_USER_INFO_CHARACTER.test(text[start - 1])
    ) {
      start--;
    }
    const userInfo = text.slice(start, at);
    const colon = userInfo.indexOf(':');
    if (
      colon !== -1 &&
      colon < userInfo.length - 1 &&
      userInfo.slice(0, colon).toLowerCase() !== 'mailto' &&
      !DIGEST.test(text.slice(at + 1, at + 12))
    ) {
      if (at >= regionEnd) {
        regionLastAt = at;
        regionEnd = at + 1;
        while (
          regionEnd < text.length &&
          !BARE_AUTHORITY_END.test(text[regionEnd])
        ) {
          if (text[regionEnd] === '@') regionLastAt = regionEnd;
          regionEnd++;
        }
      }
      if (/[a-z0-9[]/i.test(text[regionLastAt + 1] ?? '')) {
        result += `${text.slice(from, start + colon + 1)}${REDACTED}`;
        from = regionLastAt;
        at = regionLastAt;
      }
    }
    at = text.indexOf('@', at + 1);
  }
  return result + text.slice(from);
}

/** The longest scheme that is read in front of `://`. */
const MAX_SCHEME_LENGTH = 32;

/**
 * The characters that end the authority of a URL in a text: white space, a quote,
 * an angle bracket, a backtick, `/`, `?`, `#` and a backslash, as a URL parser
 * reads them. The characters that join or close URLs in a text (`,` `;` `|` `)`
 * `]` `}` `&`) do not: a password may hold them, and the user info goes up to the
 * last at sign before the end. A second URL that is joined to the first one ends
 * it in front of its own `://`.
 */
const AUTHORITY_END = new Set(
  [...'/?#\\"\'`<>'].map((character) => character.charCodeAt(0))
);

/**
 * Replaces the password in the user info of every URL of a text
 * (`scheme://user:password@host`; the user info ends at the last at sign of the
 * authority, so a password may hold one). A single scan that looks for `://`,
 * reads the authority up to the character that ends it and never goes back, so
 * the time grows with the length of the text and not with its shape. A user
 * info that has no colon (or nothing after it) is left as it is.
 * @param {string} text the text
 * @returns {string} the text with the passwords of the user info replaced
 */
export function replaceUrlPasswords(text: string): string {
  let result = '';
  let copied = 0;
  let search = 0;
  for (;;) {
    const separator = text.indexOf('://', search);
    if (separator === -1) break;
    const begin = separator + 3;
    // a scheme comes first: letters, digits, `+`, `-` and `.`, the first of them a letter
    let schemeStart = separator;
    while (
      schemeStart > 0 &&
      separator - schemeStart < MAX_SCHEME_LENGTH &&
      /[A-Za-z0-9+.-]/.test(text[schemeStart - 1])
    ) {
      schemeStart--;
    }
    while (schemeStart < separator && !/[A-Za-z]/.test(text[schemeStart])) {
      schemeStart++;
    }
    if (schemeStart === separator) {
      search = begin;
      continue;
    }
    let end = begin;
    let lastAt = -1;
    while (end < text.length) {
      const code = text.charCodeAt(end);
      if (AUTHORITY_END.has(code) || code <= 32) break;
      // a second URL begins here (`a@h1http://b:c@h2`): this authority ends in front of its `://`
      if (code === 58 && text.startsWith('//', end + 1) && end > begin) break;
      if (code === 64) lastAt = end;
      end++;
    }
    search = Math.max(end, begin);
    if (lastAt === -1) continue;
    const colon = text.slice(begin, lastAt).indexOf(':');
    if (colon === -1 || begin + colon + 1 >= lastAt) continue;
    result += `${text.slice(copied, begin + colon + 1)}${REDACTED}`;
    copied = lastAt;
  }
  return result + text.slice(copied);
}

/**
 * Scrubs the known values from the text of a tool result (see the rules in the
 * description of this module).
 * @param {string} text the text that is about to be sent
 * @param {readonly unknown[]} secrets the values to look for (see {@link liveSecrets}); a value that is not text, or is shorter than its minimum, is ignored
 * @param {readonly string[]} names the names of the headers whose lines are replaced besides the shared list (see {@link sensitiveNames})
 * @param {{errorText?: boolean}} options `errorText`: the text is the text of an error, so a user info without a scheme is replaced too (see {@link replaceBareUserInfo})
 * @returns {string} the text with the values replaced by `<redacted>`
 */
export function scrubKnownValues(
  text: string,
  secrets: readonly unknown[] = [],
  names: readonly string[] = [],
  options: { errorText?: boolean } = {}
): string {
  if (typeof text !== 'string' || text === '') return text;
  // a step that fails (an expression that runs out of its stack on a text of many
  // megabytes, a value that cannot be read) never passes the text on as it is
  try {
    return scrubSteps(text, secrets, names, options.errorText === true);
  } catch {
    return WITHHELD;
  }
}

function scrubSteps(
  text: string,
  secrets: readonly unknown[],
  names: readonly string[],
  errorText: boolean
): string {
  // the passwords of URLs first, whatever they are: a user name that is a known value is replaced
  // next, and a rule that ran after it would stop at what that wrote (`http://<redacted>:pw@host`)
  let result = replaceUrlPasswords(text);
  if (errorText) result = replaceBareUserInfo(result);
  const wanted = new Set<string>();
  for (const secret of secrets) {
    const value = isObject(secret) ? secret.value : secret;
    const minLength =
      isObject(secret) && typeof secret.minLength === 'number'
        ? secret.minLength
        : MIN_SECRET_LENGTH;
    if (typeof value !== 'string' || value.length < minLength) continue;
    for (const variant of variantsOf(value)) wanted.add(variant);
  }
  // the longest first: a value that contains another is replaced as a whole
  for (const secret of [...wanted].sort((a, b) => b.length - a.length)) {
    result = result.split(secret).join(REDACTED);
  }
  const headers = headerLinesOf(names);
  result = replaceHeaderLines(result, headers.keyed, true);
  result = replaceHeaderLines(result, headers.atLineStart, false);
  result = replaceHeaderLines(result, headers.afterBrace, false);
  result = replaceHeaderLines(result, headers.afterQuote, false);
  result = result.replace(
    BEARER_VALUE,
    (_match, scheme: string, space: string) => `${scheme}${space}${REDACTED}`
  );
  result = replaceJsonWebTokens(result);
  return result.replace(
    EXCHANGE_VALUE,
    (_match, name: string, separator: string) =>
      `${name}${separator}${REDACTED}`
  );
}
