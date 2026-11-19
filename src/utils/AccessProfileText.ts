/**
 * What a login can do, in words: the text of the access profile that frodo-lib
 * reports for a session (`frodo.login.getAccessProfile()`).
 *
 * The library states the facts (which areas of the API the session reaches and
 * why not); this module turns them into the lines the command line shows after
 * a new interactive login, in `frodo info` and in `frodo conn describe`, and
 * into the advice that goes with a scope error. The same wording is used
 * everywhere, and is the wording of the capability matrix in
 * docs/BROWSER_LOGIN.md ("What a browser or device login can do").
 *
 * Pure functions, no imports of the console code: callers print.
 */

import type { AccessProfile, AccessProfileArea } from '@rockcarver/frodo-lib';

/** The heading of the capability matrix in docs/BROWSER_LOGIN.md, as an anchor of the document. */
export const ACCESS_MATRIX_DOC =
  'https://github.com/rockcarver/frodo-cli/blob/main/docs/BROWSER_LOGIN.md#what-a-browser-or-device-login-can-do';

/** Whether the profile is that of a login that a person did (a browser or device login), as opposed to a service account or a token issued elsewhere. */
export function isInteractiveFlow(flow: AccessProfile['flow']): boolean {
  return flow === 'browser' || flow === 'device' || flow === 'interactive';
}

/**
 * The kind of credential, in plain words.
 * @param flow how the credential was obtained
 * @returns for example "browser login"
 */
export function loginKindName(flow: AccessProfile['flow']): string {
  switch (flow) {
    case 'browser':
      return 'browser login';
    case 'device':
      return 'device login';
    case 'service-account':
      return 'service account';
    case 'external-token':
      return 'access token issued elsewhere';
    default:
      return 'interactive login';
  }
}

/** The way out for an area a login cannot reach: who can. */
type Remedy =
  | 'browser-or-service-account'
  | 'service-account'
  | 'not-requested'
  | 'not-granted'
  | 'unknown';

/** What the text says next to the areas of a remedy, in the order the groups are listed. */
const REMEDY_TEXT: Record<Remedy, string> = {
  'browser-or-service-account': 'need a browser login or a service account',
  'service-account': 'need a service account',
  'not-requested': 'not requested by this login',
  'not-granted': 'not granted to this credential',
  unknown: 'not known',
};

const REMEDY_ORDER: Remedy[] = [
  'browser-or-service-account',
  'service-account',
  'not-requested',
  'not-granted',
];

/**
 * Why a person can or cannot reach an area with this login: the group the area
 * belongs to in the text.
 * @param area an area of the profile that is not reachable
 * @param interactive whether the session is a login that a person did
 * @returns the group
 */
function remedyOf(area: AccessProfileArea, interactive: boolean): Remedy {
  if (area.reachable === 'unknown') return 'unknown';
  if (!interactive) return 'not-granted';
  switch (area.reason) {
    case 'no-am-session':
      return 'browser-or-service-account';
    case 'scope-not-requested':
      return 'not-requested';
    default:
      return 'service-account';
  }
}

/** The areas of a profile, grouped the way the text lists them. */
export type AccessGroups = {
  /** Areas the session reaches, a partly reachable one marked as such. */
  canReach: string[];
  /** The areas it does not reach, by what to do about it, in the order of `REMEDY_ORDER`. */
  cannotReach: { remedy: string; areas: string[] }[];
  /** Areas the library cannot tell about. */
  notKnown: string[];
};

/**
 * Groups the areas of a profile for the text.
 * @param profile the access profile of the session
 * @returns the groups
 */
export function groupAreas(profile: AccessProfile): AccessGroups {
  const interactive = isInteractiveFlow(profile.flow);
  const canReach = profile.areas
    .filter((a) => a.reachable === 'yes' || a.reachable === 'partial')
    .map((a) => (a.reachable === 'partial' ? `${a.title} (partly)` : a.title));
  const notKnown = profile.areas
    .filter((a) => a.reachable === 'unknown')
    .map((a) => a.title);
  const blocked = profile.areas.filter((a) => a.reachable === 'no');
  const cannotReach = REMEDY_ORDER.map((remedy) => ({
    remedy: REMEDY_TEXT[remedy],
    areas: blocked
      .filter((a) => remedyOf(a, interactive) === remedy)
      .map((a) => a.title),
  })).filter((group) => group.areas.length > 0);
  return { canReach, cannotReach, notKnown };
}

/**
 * How long the session lasts and whether it can be renewed.
 * @param profile the access profile of the session
 * @param now the time to measure from, in milliseconds since the epoch
 * @returns for example "ends in about 29 minutes, cannot be refreshed"
 */
export function sessionText(
  profile: AccessProfile,
  now: number = Date.now()
): string {
  let ends = 'end of the session unknown';
  if (typeof profile.expiresAt === 'number') {
    const minutes = Math.round((profile.expiresAt - now) / 60000);
    if (minutes <= 0) ends = 'has ended';
    else if (minutes === 1) ends = 'ends in about a minute';
    else ends = `ends in about ${minutes} minutes`;
  }
  return `${ends}, ${
    profile.refreshable
      ? 'is refreshed automatically'
      : 'cannot be refreshed: log in again when it ends'
  }`;
}

/** The list of areas, comma separated. */
const list = (areas: string[]): string => areas.join(', ');

/** The width the lines of the access text are wrapped at. */
const TEXT_WIDTH = 100;

/**
 * Wraps text at word boundaries.
 * @param text the text
 * @param width the longest a line may be
 * @returns the lines (one line for text that fits, and for a single word that is longer than the width)
 */
function wordWrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The lines that say what a session can do. The same lines follow a new
 * interactive login and make up the access section of `frodo info` and
 * `frodo conn describe`.
 *
 * @param profile the access profile of the session
 * @param options.now the time to measure the session from (default: now)
 * @param options.indent what each line starts with (default: two spaces)
 * @returns the lines: the kind of login, the session, what it can and cannot reach, what is not known, what the library adapted
 */
export function accessProfileLines(
  profile: AccessProfile,
  options: { now?: number; indent?: string } = {}
): string[] {
  const indent = options.indent ?? '  ';
  const { canReach, cannotReach, notKnown } = groupAreas(profile);
  const rows: [string, string][] = [];
  const who = [
    loginKindName(profile.flow),
    profile.clientId ? `client ${profile.clientId}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  rows.push(['Login', who]);
  rows.push(['Session', sessionText(profile, options.now)]);
  rows.push(['Can reach', canReach.length ? list(canReach) : 'nothing']);
  for (const group of cannotReach) {
    rows.push(['Cannot reach', `${list(group.areas)} (${group.remedy})`]);
  }
  if (notKnown.length) {
    rows.push(['Not known', list(notKnown)]);
  }
  for (const adaptation of profile.adaptations) {
    rows.push(['Adapted', adaptation.message]);
  }
  const labelWidth = Math.max(...rows.map(([label]) => label.length)) + 2;
  const lines: string[] = [];
  let previous = '';
  for (const [label, value] of rows) {
    // a label that repeats (several groups of areas that cannot be reached) is said once
    const shown = label === previous ? '' : `${label}:`;
    previous = label;
    const wrapped = wordWrap(
      value,
      Math.max(TEXT_WIDTH - indent.length - labelWidth, 40)
    );
    wrapped.forEach((text, i) => {
      lines.push(
        `${indent}${(i === 0 ? shown : '').padEnd(labelWidth)}${text}`
      );
    });
  }
  return lines;
}

/**
 * The lines that follow "Logged in as ..." after a new interactive login.
 * @param profile the access profile of the new session
 * @param now the time to measure the session from (default: now)
 * @returns the lines, the first one introducing the rest
 */
export function accessNoticeLines(
  profile: AccessProfile,
  now: number = Date.now()
): string[] {
  return [
    `What this ${loginKindName(profile.flow)} can do:`,
    ...accessProfileLines(profile, { now }),
    `More: ${ACCESS_MATRIX_DOC}`,
  ];
}

/**
 * The sentence that names the session behind a failed command, says what it
 * holds and what to use instead: the line that follows a scope error.
 * @param profile the access profile of the session that failed
 * @returns one line, or undefined when a service account or token that was issued elsewhere failed (its scopes are the answer, and the error names them)
 */
export function sessionAdviceLine(profile: AccessProfile): string | undefined {
  if (!isInteractiveFlow(profile.flow)) return undefined;
  const { canReach } = groupAreas(profile);
  const kind = loginKindName(profile.flow);
  const holds = canReach.length
    ? `it reaches ${list(canReach)}`
    : 'it reaches no area';
  const use =
    profile.flow === 'device' && profile.amSession === 'absent'
      ? `use a browser login ('frodo login --browser') for Access Management, or a service account for anything else`
      : `use a service account`;
  return `This session is a ${kind} (${holds}). For what this command needs, ${use}. What a login can do: ${ACCESS_MATRIX_DOC}`;
}
