/**
 * Commands that perform several operations and the commands that look like
 * they might. Used only by MultiOpCommands.test.js (decision record 0040).
 *
 * A command is listed as its full name (`frodo journey export`); every list is
 * sorted, one command per line.
 */

/*
 * Multi-op commands that do not accept `--allow-failures` yet, grouped by what
 * they do today when one operation fails (the grouping tells whoever migrates
 * a command what has to change; it is not checked).
 *
 * These lists only ever shrink:
 * - NEVER add a command here. A new command that performs several operations
 *   accepts `--allow-failures` from the start: call `.multiOp()` on the command,
 *   and run its operations through `OperationRun` (src/utils/OperationRun.ts).
 *   Tracked in frodo-cli#1099.
 * - When a command accepts `--allow-failures`, delete its line. The test fails
 *   until you do, so the lists cannot go stale.
 *
 * Generated on 2026-11-07 from a read-only classification of every command
 * (traced from the action through src/ops, src/configManagerOps and the pinned
 * frodo-lib). The counts are in the tracking issue.
 */

/** The first failed operation ends the run: later operations are never attempted. */
export const STOPS_AT_THE_FIRST_ERROR = [
  'frodo admin federation export',
  'frodo admin generate-rfc7523-authz-grant-artefacts',
  'frodo admin grant-oauth2-client-admin-privileges',
  'frodo admin revoke-oauth2-client-admin-privileges',
  'frodo config-manager pull authentication',
  'frodo config-manager pull authz-policies',
  'frodo config-manager pull journeys',
  'frodo config-manager pull managed-objects',
  'frodo config-manager pull oauth2-agents',
  'frodo config-manager pull org-privileges',
  'frodo config-manager pull password-policy',
  'frodo config-manager pull raw',
  'frodo config-manager pull saml',
  'frodo config-manager pull scripts',
  'frodo config-manager pull secret-mappings',
  'frodo config-manager pull secrets',
  'frodo config-manager pull service-objects',
  'frodo config-manager pull themes',
  'frodo config-manager push authentication',
  'frodo config-manager push authz-policies',
  'frodo config-manager push csp',
  'frodo config-manager push custom-nodes',
  'frodo config-manager push endpoints',
  'frodo config-manager push iga-workflows',
  'frodo config-manager push journeys',
  'frodo config-manager push locales',
  'frodo config-manager push oauth2-agents',
  'frodo config-manager push password-policy',
  'frodo config-manager push raw',
  'frodo config-manager push saml',
  'frodo config-manager push schedules',
  'frodo config-manager push scripts',
  'frodo config-manager push secret-mappings',
  'frodo config-manager push service-objects',
  'frodo config-manager push services',
  'frodo config-manager push telemetry',
  'frodo config-manager push themes',
  'frodo esv secret export',
  'frodo esv variable export',
  'frodo idm remote-proxy export',
  'frodo idm remote-proxy import',
  'frodo idm remote-proxy setup',
  'frodo idm remote-proxy teardown',
  'frodo idm schema object export',
  'frodo mapping delete',
  'frodo mapping rename',
  'frodo saml delete',
  'frodo server export',
];

/** A failure is caught or ignored (an empty catch, a logged error, an ignored result) and the command exits 0. */
export const SWALLOWS_THE_FAILURE = [
  'frodo admin create-oauth2-client-with-admin-privileges',
  'frodo admin repair-org-model',
  'frodo agent ai export',
  'frodo agent delete',
  'frodo agent export',
  'frodo agent gateway export',
  'frodo agent gateway import',
  'frodo agent import',
  'frodo agent java export',
  'frodo agent java import',
  'frodo agent web export',
  'frodo agent web import',
  'frodo config-manager pull connector-definitions',
  'frodo config-manager pull connector-mappings',
  'frodo config-manager pull custom-nodes',
  'frodo config-manager pull email-templates',
  'frodo config-manager pull endpoints',
  'frodo config-manager pull iga-workflows',
  'frodo config-manager pull internal-roles',
  'frodo config-manager pull locales',
  'frodo config-manager pull remote-proxies',
  'frodo config-manager pull schedules',
  'frodo config-manager pull services',
  'frodo config-manager pull telemetry',
  'frodo config-manager pull variables',
  'frodo config-manager push org-privileges',
  'frodo config-manager push secrets',
  'frodo email template export',
  'frodo iga workflow import',
  'frodo journey delete',
  'frodo journey export',
  'frodo mapping export',
  'frodo node export',
  'frodo node import',
  'frodo oauth client delete',
  'frodo promote',
  'frodo realm export',
  'frodo realm import',
  'frodo role export',
  'frodo script import',
  'frodo secretstore import',
  'frodo service export',
  'frodo service import',
  'frodo theme export',
  'frodo theme import',
];

/** The other operations run and the exit code is 1, but no summary names the items that failed. */
export const CONTINUES_BUT_NAMES_NO_FAILED_ITEM = [
  'frodo admin federation import',
  'frodo agent ai import',
  'frodo authz set import',
  'frodo config export',
  'frodo config import',
  'frodo email template import',
  'frodo esv secret version prune',
  'frodo idm export',
  'frodo idm import',
  'frodo idm schema object import',
  'frodo iga workflow delete',
  'frodo iga workflow export',
  'frodo journey describe',
  'frodo journey import',
  'frodo node delete',
  'frodo script export',
  'frodo secretstore delete',
  'frodo secretstore export',
  'frodo secretstore mapping delete',
  'frodo service delete',
];

/** The other operations run and the failures are reported, but the exit code stays 0. */
export const CONTINUES_BUT_EXITS_ZERO = [
  'frodo journey prune',
  'frodo log key delete',
  'frodo saml cot import',
];

/** The other operations run, each failure is named in one combined error and the exit code is 1. Closest to the rule; still lacks the "N of M" summary and --allow-failures. */
export const NAMES_THE_FAILURES_BUT_HAS_NO_SUMMARY = [
  'frodo agent ai delete',
  'frodo agent gateway delete',
  'frodo agent java delete',
  'frodo agent web delete',
  'frodo app delete',
  'frodo app export',
  'frodo app import',
  'frodo authz policy export',
  'frodo authz policy import',
  'frodo authz set export',
  'frodo authz type export',
  'frodo authz type import',
  'frodo config-manager push connector-definitions',
  'frodo config-manager push email-templates',
  'frodo config-manager push internal-roles',
  'frodo config-manager push remote-proxies',
  'frodo config-manager push variables',
  'frodo esv secret import',
  'frodo esv variable import',
  'frodo idm remote-proxy delete',
  'frodo idp export',
  'frodo idp import',
  'frodo journey validate',
  'frodo mapping import',
  'frodo oauth client export',
  'frodo oauth client import',
  'frodo role import',
  'frodo saml cot export',
  'frodo saml export',
  'frodo saml import',
  'frodo server import',
];

export const LEGACY_MULTI_OP_COMMANDS_WITHOUT_ALLOW_FAILURES = [
  ...STOPS_AT_THE_FIRST_ERROR,
  ...SWALLOWS_THE_FAILURE,
  ...CONTINUES_BUT_NAMES_NO_FAILED_ITEM,
  ...CONTINUES_BUT_EXITS_ZERO,
  ...NAMES_THE_FAILURES_BUT_HAS_NO_SUMMARY,
];

/**
 * Commands that have a bulk option (-a, -A, --all, --all-separate) or sit
 * under config-manager pull, push or delete, and still perform ONE operation:
 * for example an export of everything that is one read and one write, or a
 * short option that stands for something else. A command may only be added
 * here when that is true; a command that handles several items does not
 * belong here, it accepts `--allow-failures`.
 */
export const NOT_MULTI_OP_BULK_CANDIDATES = [
  'frodo config-manager delete test',
  'frodo config-manager pull access-config',
  'frodo config-manager pull audit',
  'frodo config-manager pull config-metadata',
  'frodo config-manager pull cookie-domains',
  'frodo config-manager pull cors',
  'frodo config-manager pull csp',
  'frodo config-manager pull email-provider',
  'frodo config-manager pull idm-authentication',
  'frodo config-manager pull kba',
  'frodo config-manager pull remote-servers',
  'frodo config-manager pull terms-and-conditions',
  'frodo config-manager pull test',
  'frodo config-manager pull ui-config',
  'frodo config-manager push access-config',
  'frodo config-manager push audit',
  'frodo config-manager push config-metadata',
  'frodo config-manager push connector-mappings',
  'frodo config-manager push cookie-domains',
  'frodo config-manager push cors',
  'frodo config-manager push direct-control-abort',
  'frodo config-manager push direct-control-apply',
  'frodo config-manager push direct-control-init',
  'frodo config-manager push direct-control-state',
  'frodo config-manager push email-provider',
  'frodo config-manager push idm-authentication',
  'frodo config-manager push kba',
  'frodo config-manager push managed-objects',
  'frodo config-manager push remote-servers',
  'frodo config-manager push restart',
  'frodo config-manager push terms-and-conditions',
  'frodo config-manager push test',
  'frodo config-manager push ui-config',
  'frodo secretstore mapping alias activate',
  'frodo secretstore mapping alias create',
  'frodo secretstore mapping alias delete',
  'frodo secretstore mapping create',
  'frodo theme delete',
];
