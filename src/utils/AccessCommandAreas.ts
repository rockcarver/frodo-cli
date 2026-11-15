/**
 * Which commands need an area of the API that no interactive login reaches.
 *
 * A browser or device login (the built-in client of a Cloud tenant) reaches
 * less than a service account (frodo-lib: `getAccessProfile()`, record 0018 of
 * the library). The library lists the areas of the API
 * (`frodo.login.listAccessAreas()`); this module says which area each command
 * needs, so that the help of a command that an interactive login cannot run
 * says so before the user tries it.
 *
 * Two tables, each checked by a test (`AccessCommandAreas.test.js`):
 *
 * - `INTERACTIVE_REACH` says for every area of the library whether an
 *   interactive login reaches it. The test builds a browser and a device
 *   session and compares the table with the library's own profile, so the table
 *   cannot drift from what the library knows.
 * - `COMMAND_AREAS` says what each command needs. Every command of the
 *   command tree resolves to an entry (the longest path prefix wins), so a new
 *   command or group without an entry fails the build.
 *
 * Only a command that ALWAYS needs an area no interactive login reaches gets the
 * note in its help. A command that touches many sections (`config export`,
 * `config-manager pull all`) is `general`: no single area is the answer, and a
 * section that the credential cannot reach is reported by name when it runs.
 */

import { frodo } from '@rockcarver/frodo-lib';
import type { AccessProfileArea } from '@rockcarver/frodo-lib';
import { ACCESS_MATRIX_DOC } from './AccessProfileText';

/** The identity of an area of the API (the library's `AccessProfileArea['id']`). */
export type AccessAreaId = AccessProfileArea['id'];

/** Whether the interactive logins of the built-in client reach an area. */
export type InteractiveReach =
  /** A browser login and a device login reach it. */
  | 'browser-and-device'
  /** Only a browser login reaches it (it needs an Access Management session, which a device login does not carry). */
  | 'browser'
  /** No interactive login reaches it: a service account is needed. */
  | 'none';

/**
 * For each area of the library, whether an interactive login reaches it (a Cloud
 * tenant, the built-in client, measured by the library). The type has one key per
 * area, so an area that the library adds is a compile error here until it is
 * decided; the test compares each value with the profile of a real browser and
 * device session.
 */
export const INTERACTIVE_REACH: Record<AccessAreaId, InteractiveReach> = {
  am: 'browser',
  idm: 'browser-and-device',
  esv: 'browser-and-device',
  governance: 'none',
  promotion: 'none',
  release: 'none',
  certificates: 'none',
  'custom-domains': 'none',
  'content-security-policy': 'none',
  'cookie-domains': 'none',
  'sso-cookie': 'none',
  'direct-configuration': 'none',
  'admin-federation': 'none',
  telemetry: 'none',
  pingfederate: 'none',
};

/**
 * What a command needs:
 * - the areas it always needs (a `none` area in it makes the command a service-account command),
 * - `general`: the areas that every browser login reaches, or sections that depend on the tenant and report themselves,
 * - `local`: no request to a tenant.
 */
export type CommandNeeds = AccessAreaId[] | 'general' | 'local';

/**
 * What each command needs, by the path of the command or of its group without
 * `frodo` (`iga workflow`, `config-manager push direct-control-state`). The longest
 * prefix that matches a command wins, so an entry for a group covers its commands
 * unless a longer entry names one of them.
 */
export const COMMAND_AREAS: Record<string, CommandNeeds> = {
  // areas that no interactive login reaches
  iga: ['governance'],
  promote: ['promotion'],
  dcc: ['direct-configuration'],
  'admin federation': ['admin-federation'],
  'config-manager promote': ['promotion'],
  'config-manager pull iga-workflows': ['governance'],
  'config-manager push iga-workflows': ['governance'],
  'config-manager pull cookie-domains': ['cookie-domains'],
  'config-manager push cookie-domains': ['cookie-domains'],
  'config-manager pull csp': ['content-security-policy'],
  'config-manager push csp': ['content-security-policy'],
  'config-manager push direct-control-abort': ['direct-configuration'],
  'config-manager push direct-control-apply': ['direct-configuration'],
  'config-manager push direct-control-init': ['direct-configuration'],
  'config-manager push direct-control-state': ['direct-configuration'],
  'config-manager pull telemetry': ['telemetry'],
  'config-manager push telemetry': ['telemetry'],
  'config-manager delete telemetry': ['telemetry'],
  // the rest of the groups: Access Management, Identity Management and the
  // environment secrets and variables, or sections that name themselves when
  // the credential lacks a scope
  admin: 'general',
  agent: 'general',
  aiagent: 'general',
  app: 'general',
  authn: 'general',
  authz: 'general',
  config: 'general',
  'config-manager': 'general',
  conn: 'local',
  'conn service-account': 'general',
  'conn test': 'general',
  connector: 'general',
  debug: 'general',
  email: 'general',
  esv: 'general',
  feature: 'general',
  idm: 'general',
  idp: 'general',
  info: 'general',
  journey: 'general',
  log: 'general',
  login: 'general',
  mapping: 'general',
  mcp: 'general',
  node: 'general',
  oauth: 'general',
  realm: 'general',
  role: 'general',
  saml: 'general',
  script: 'general',
  secretstore: 'general',
  server: 'general',
  service: 'general',
  session: 'general',
  settings: 'local',
  shell: 'local',
  theme: 'general',
};

/**
 * What a command needs.
 * @param commandPath the path of the command without `frodo`, for example `iga workflow list`
 * @returns what the command needs, or undefined when no entry covers it
 */
export function commandNeeds(commandPath: string): CommandNeeds | undefined {
  const words = commandPath.trim().split(/\s+/).filter(Boolean);
  for (let length = words.length; length > 0; length--) {
    const needs = COMMAND_AREAS[words.slice(0, length).join(' ')];
    if (needs !== undefined) return needs;
  }
  return undefined;
}

/**
 * The areas a command always needs that no interactive login reaches.
 * @param commandPath the path of the command without `frodo`
 * @returns the areas, empty when an interactive login can run the command as far as areas go
 */
export function serviceAccountAreasOf(commandPath: string): AccessAreaId[] {
  const needs = commandNeeds(commandPath);
  if (!Array.isArray(needs)) return [];
  return needs.filter((area) => INTERACTIVE_REACH[area] === 'none');
}

/**
 * The note at the end of the help of a command that an interactive login cannot run.
 * @param commandPath the path of the command without `frodo`
 * @returns the note, or undefined when the command is not a service-account command
 */
export function accessFootnote(commandPath: string): string | undefined {
  const areas = serviceAccountAreasOf(commandPath);
  if (areas.length === 0) return undefined;
  const titles = frodo.login
    .listAccessAreas()
    .filter((area) => areas.includes(area.id))
    .map((area) => area.title);
  return `Not available with --browser or --device: needs a service account (${titles.join(', ')}). See ${ACCESS_MATRIX_DOC}`;
}
