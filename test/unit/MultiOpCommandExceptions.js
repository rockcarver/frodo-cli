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
export const STOPS_AT_THE_FIRST_ERROR = [];

/** A failure is caught or ignored (an empty catch, a logged error, an ignored result) and the command exits 0. */
export const SWALLOWS_THE_FAILURE = [];

/** The other operations run and the exit code is 1, but no summary names the items that failed. */
export const CONTINUES_BUT_NAMES_NO_FAILED_ITEM = [];

/** The other operations run and the failures are reported, but the exit code stays 0. */
export const CONTINUES_BUT_EXITS_ZERO = [];

/** The other operations run, each failure is named in one combined error and the exit code is 1. Closest to the rule; still lacks the "N of M" summary and --allow-failures. */
export const NAMES_THE_FAILURES_BUT_HAS_NO_SUMMARY = [];

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
