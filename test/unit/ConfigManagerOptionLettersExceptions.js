/**
 * The data of test/unit/ConfigManagerOptionLetters.test.js. The options record
 * decides the letters of the configuration commands:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md
 * (options of the configuration commands). The checks that read this data are
 * in test/utils/OptionLetters.js; each list fails when an entry is no longer
 * needed, so the lists cannot go stale.
 *
 * - NEVER add a SAME_MEANING entry for two options that mean two things: give
 *   them a letter each. An entry says that two long names are one meaning, and
 *   `until` says which step of the program removes one of the names (the check
 *   fails from then on until the entry is deleted).
 * - EXPECTED_SHORT_FORMS: every option whose short form the record changed, as
 *   it is now (`short` null: a long form only) and as it was (`was` null: the
 *   option had no short form). MIGRATION.md has to list each `was` spelling.
 * - HERITAGE_OVERLAPS: the letters of the group that a heritage command (any
 *   command outside the group) uses for an option with another long name, one
 *   entry per letter, with the reason why a mix-up is harmless: the concepts
 *   differ, a value is set against a flag so that a mix-up fails loudly, or a
 *   mix-up is harmless. Add one only after you read that sentence of the record.
 * - DESCRIPTION_LETTERS: a text that names a letter which is not an option of
 *   the command, so the check must not read it as one.
 */

/**
 * Letters that have two long names inside the group and are still one
 * meaning. `longs` are the names, `why` says why they are one meaning, `until`
 * which step of the program removes one of them.
 */
export const SAME_MEANING = [
  {
    letter: '-f',
    longs: ['--file', '--config-file'],
    why: 'both name the file that a pull reads (a data file of pull raw, the config file of the other pulls); the config file is long-only from the step that renames it',
    until: 'C5 of cli#1264 (written 2026-11-18)',
  },
  {
    letter: '-i',
    longs: ['--id', '--report-id'],
    why: 'both name a promotion or its report by its id (promote unlock-tenants, promote check-promotion-reports)',
    until: 'not planned (written 2026-11-18)',
  },
  {
    letter: '-n',
    longs: ['--name', '--script-name'],
    why: 'both name the object to pull, the script by its file name (pull scripts); -n --name stays the permanent spelling of the selector',
    until: 'C4 of cli#1264 (written 2026-11-18)',
  },
];

export const EXPECTED_SHORT_FORMS = [
  { command: 'frodo config import', long: '--clean', short: null, was: '-C' },
  {
    command: 'frodo config-manager delete oauth-cimd-profiles',
    long: '--dry-run',
    short: '-d',
    was: null,
  },
  {
    command: 'frodo config-manager delete oauth-issuers',
    long: '--dry-run',
    short: '-d',
    was: null,
  },
  {
    command: 'frodo config-manager delete oauth-software-publishers',
    long: '--dry-run',
    short: '-d',
    was: null,
  },
  {
    command: 'frodo config-manager delete schedules',
    long: '--dry-run',
    short: '-d',
    was: null,
  },
  {
    command: 'frodo config-manager delete secret-mappings',
    long: '--dry-run',
    short: '-d',
    was: null,
  },
  {
    command: 'frodo config-manager promote check-locked-status',
    long: '--local-lock-only',
    short: '-L',
    was: '-l',
  },
  {
    command: 'frodo config-manager promote check-promotion-reports',
    long: '--provisional',
    short: null,
    was: '-p',
  },
  {
    command: 'frodo config-manager promote check-promotion-reports',
    long: '--provisional-rollback',
    short: null,
    was: '-r',
  },
  {
    command: 'frodo config-manager promote rollback',
    long: '--promoter',
    short: '-P',
    was: '-p',
  },
  {
    command: 'frodo config-manager promote rollback',
    long: '--description',
    short: null,
    was: '-d',
  },
  {
    command: 'frodo config-manager promote run-dryrun-promotion',
    long: '--ignore-encrypted-secrets',
    short: '-I',
    was: '-i',
  },
  {
    command: 'frodo config-manager promote run-dryrun-promotion',
    long: '--promoter',
    short: '-P',
    was: '-p',
  },
  {
    command: 'frodo config-manager promote run-dryrun-promotion',
    long: '--description',
    short: null,
    was: '-d',
  },
  {
    command: 'frodo config-manager promote run-promotion',
    long: '--ignore-encrypted-secrets',
    short: '-I',
    was: '-i',
  },
  {
    command: 'frodo config-manager promote run-promotion',
    long: '--promoter',
    short: '-P',
    was: '-p',
  },
  {
    command: 'frodo config-manager promote run-promotion',
    long: '--description',
    short: null,
    was: '-d',
  },
  {
    command: 'frodo config-manager pull iga-workflows',
    long: '--include-immutable',
    short: null,
    was: '-i',
  },
  {
    command: 'frodo config-manager pull journeys',
    long: '--pull-dependencies',
    short: null,
    was: '-d',
  },
  {
    command: 'frodo config-manager pull journeys',
    long: '--clean',
    short: null,
    was: '-c',
  },
  {
    command: 'frodo config-manager pull managed-objects',
    long: '--custom-relationships',
    short: null,
    was: '-u',
  },
  {
    command: 'frodo config-manager pull variables',
    long: '--dump',
    short: null,
    was: '-u',
  },
  {
    command: 'frodo config-manager push custom-nodes',
    long: '--filename-filter',
    short: null,
    was: '-f',
  },
  {
    command: 'frodo config-manager push endpoints',
    long: '--filename-filter',
    short: null,
    was: '-f',
  },
  {
    command: 'frodo config-manager push iga-workflows',
    long: '--draft',
    short: null,
    was: '-d',
  },
  {
    command: 'frodo config-manager push journeys',
    long: '--push-dependencies',
    short: null,
    was: '-d',
  },
  {
    command: 'frodo config-manager push raw',
    long: '--path',
    short: null,
    was: '-p',
  },
  {
    command: 'frodo config-manager push raw',
    long: '--stdin',
    short: null,
    was: '-i',
  },
  {
    command: 'frodo config-manager push restart',
    long: '--check',
    short: null,
    was: '-c',
  },
  {
    command: 'frodo config-manager push schedules',
    long: '--filename-filter',
    short: null,
    was: '-f',
  },
  {
    command: 'frodo config-manager push scripts',
    long: '--filenameFilter',
    short: null,
    was: '-f',
  },
  {
    command: 'frodo config-manager push secrets',
    long: '--dry-run',
    short: '-d',
    was: null,
  },
  {
    command: 'frodo iga workflow delete',
    long: '--draft-only',
    short: null,
    was: '-d',
  },
  { command: 'frodo service import', long: '--clean', short: null, was: '-C' },
];

export const HERITAGE_OVERLAPS = [
  {
    letter: '-M',
    longs: ['--master-dir', '--modified-properties'],
    why: 'a value is set against a flag, so a mix-up fails loudly; --master-dir belongs to the root promote command that the program retires',
  },
  {
    letter: '-P',
    longs: ['--print-diff'],
    why: 'a flag against the value --promoter, so a mix-up fails loudly; it belongs to the root promote command that the program retires',
  },
  {
    letter: '-a',
    longs: ['--all', '--alias', '--aliases'],
    why: 'the group uses -a for a flag of a read-only pull (--active-only); --alias and --aliases take a value, and --all asks first when it would delete (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md)',
  },
  {
    letter: '-c',
    longs: ['--connector-id', '--context', '--only-custom', '--sources'],
    why: 'the concepts differ (a connector, a script context, a log source) and none of them deletes more than the object it names; the group uses -c for a category',
  },
  {
    letter: '-d',
    longs: ['--default', '--defaults', '--domain'],
    why: 'no heritage command has a destructive -d any more (iga workflow delete gave up --draft-only); what is left selects what is exported, imported or read (--default, --defaults) or takes a value against the dry run flag (--domain)',
  },
  {
    letter: '-f',
    longs: ['--force', '--query-filter'],
    why: 'a flag and a value against the value of the file option, so a mix-up fails loudly (idm schema object delete --force, log fetch --query-filter)',
  },
  {
    letter: '-i',
    longs: [/^--[a-z]+(?:-[a-z]+)*-id$/],
    why: 'the same concept: -i, --<type>-id selects an object by its identifier, as the group does with --id and --report-id',
  },
  {
    letter: '-l',
    longs: ['--legacy', '--level', '--long'],
    why: 'the concepts differ and none of them deletes: --long and --level change what a list or a log prints, --legacy the naming of mapping rename; the group uses -l to list reports',
  },
  {
    letter: '-n',
    longs: [/^--[a-z]+(?:-[a-z]+)*-name$/],
    why: 'the same concept: -n, --<type>-name selects an object by its name, as the group does with --name',
  },
  {
    letter: '-p',
    longs: ['--property', '--published-only'],
    why: 'the concepts differ (a property of an object, the published workflow); the group uses -p for a prefix of the objects to pull or delete',
  },
  {
    letter: '-r',
    longs: ['--current-realm', '--raw', '--realm-only', '--recursive'],
    why: 'none of them deletes, they only change what is imported, exported or described; the group uses -r for a report that only prints',
  },
  {
    letter: '-s',
    longs: [
      '--client-secret',
      '--script',
      '--scriptFriendly',
      '--search-string',
      '--secret-id',
    ],
    why: 'values and a print option against the flag --status, which only reads the restart status, so a mix-up fails loudly or changes nothing',
  },
  {
    letter: '-t',
    longs: [
      '--managed-object-type',
      '--node-type',
      '--secretstore-type',
      '--target',
      '--transaction-id',
    ],
    why: 'the concepts differ (the type or the target of an object); the group uses -t for a ticket reference that only labels a promotion',
  },
  {
    letter: '-u',
    longs: ['--server-url', '--usage', '--user-id'],
    why: 'values against the flag --unlock-after, so a mix-up fails loudly, and --usage, which only lists',
  },
  {
    letter: '-w',
    longs: ['--watch'],
    why: 'the concepts differ: --watch of script import runs again when a file changes, --wait of the group waits for an operation; a mix-up changes how long a command runs, not what it changes',
  },
];

export const DESCRIPTION_LETTERS = [
  {
    command: 'frodo config-manager push config-metadata',
    letter: '-u',
    why: 'the -u of the date command in the example of --metadata, not an option of this command',
  },
];
