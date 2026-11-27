/**
 * The data of test/unit/ConfigManagerSelectors.test.js: the selectors of the
 * commands that name an object, as
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md
 * (options of the configuration commands) decides them. The checks that read
 * this data are in test/utils/OptionLetters.js; each list fails when an entry
 * is no longer needed, so the lists cannot go stale.
 *
 * - EXPECTED_SELECTORS: one row for each command, `{ command, id, name,
 *   aliases }`: the long form of `-i`, the long form of `-n` (null when `-n` is
 *   only an alias of `-i`: the object has an identifier and no name that can
 *   change) and the spellings the option with the alias answers to (`['-n',
 *   '--name']` on `-i`, `['--name']` on `-n`; none for a command that took no
 *   `--name` before). The steps C4a (pull), C4b (push) and C4c (delete) of
 *   cli#1264 add their rows (pull, push and delete are in). A row of a command
 *   that was renamed carries `formerly`, the old name that stays as its alias:
 *   the table of MIGRATION.md and the e2e tests, which keep typing the old name,
 *   are matched by either name.
 * - STRAY_SELECTOR_OPTIONS: an option with the letter `-i` or `-n` on a command
 *   of the group that no row names, because it selects something else.
 * - PENDING_VERBS: verbs whose commands have not been given their rows yet;
 *   the check does not look for a stray `-n` on them. The step named in `until`
 *   deletes the entry.
 * - NO_SELECTOR_COMMANDS: commands that take no selector on purpose; the check
 *   fails when one gets an option that selects an object. An entry may carry
 *   `ownOption` `{ short, long, why }`: an option with the letter of a selector
 *   that the command declared before the selectors (`push csp -n, --name`),
 *   which stays as it is; the command must declare exactly that option, and
 *   the selector rows check reads it as a documented stray.
 * - KEPT_OLD_SPELLING: the lines of the e2e tests that type `-n` or `--name`
 *   on purpose, so that the alias stays covered end to end by a replay.
 */

export const EXPECTED_SELECTORS = [
  {
    command: 'frodo config pull apps',
    formerly: 'frodo config pull applications',
    id: '--app-id',
    name: '--app-name',
    aliases: ['--name'],
  },
  {
    command: 'frodo config pull oauth-cimd-profiles',
    id: '--profile-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config pull connectors',
    formerly: 'frodo config pull connector-definitions',
    id: '--connector-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config pull connector-mappings',
    id: '--connector-mapping-id',
    name: null,
    aliases: [],
  },
  {
    command: 'frodo config pull nodes',
    formerly: 'frodo config pull custom-nodes',
    id: '--node-id',
    name: '--node-name',
    aliases: ['--name'],
  },
  {
    command: 'frodo config pull email-templates',
    id: '--template-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config pull endpoints',
    id: '--endpoint-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config pull internal-roles',
    id: '--role-id',
    name: '--role-name',
    aliases: ['--name'],
  },
  {
    command: 'frodo config pull journeys',
    id: '--journey-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config pull locales',
    id: '--locale-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config pull managed-objects',
    id: '--managed-object-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config pull org-privileges',
    id: '--org-privileges-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config pull remote-proxies',
    id: '--proxy-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config pull schedules',
    id: '--schedule-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config pull scripts',
    id: '--script-id',
    name: '--script-name',
    aliases: [],
  },
  {
    command: 'frodo config pull secrets',
    id: '--secret-id',
    name: null,
    aliases: [],
  },
  {
    command: 'frodo config pull secretstore-mappings',
    formerly: 'frodo config pull secret-mappings',
    id: '--secret-mapping-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config pull services',
    id: '--service-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config pull themes',
    id: '--theme-id',
    name: '--theme-name',
    aliases: [],
  },
  {
    command: 'frodo config pull telemetry',
    id: '--exporter-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config pull oauth-issuers',
    id: '--issuer-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config pull oauth-software-publishers',
    id: '--software-publisher-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config pull variables',
    id: '--variable-id',
    name: null,
    aliases: [],
  },
  {
    command: 'frodo config pull iga-workflows',
    id: '--workflow-id',
    name: '--workflow-name',
    aliases: ['--name'],
  },
  {
    command: 'frodo config pull saml',
    id: '--entity-id',
    name: null,
    aliases: [],
  },
  {
    command: 'frodo config pull authz-policies',
    id: '--policy-id',
    name: null,
    aliases: [],
  },
  {
    command: 'frodo config pull oauth2-agents',
    id: '--agent-id',
    name: null,
    aliases: [],
  },
  {
    command: 'frodo config pull oauth-clients',
    id: '--client-id',
    name: null,
    aliases: [],
  },
  {
    command: 'frodo config pull agents',
    id: '--agent-id',
    name: null,
    aliases: [],
  },
  {
    command: 'frodo config push apps',
    formerly: 'frodo config push applications',
    id: '--app-id',
    name: '--app-name',
    aliases: ['--name'],
  },
  {
    command: 'frodo config push connectors',
    formerly: 'frodo config push connector-definitions',
    id: '--connector-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config push connector-mappings',
    id: '--connector-mapping-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config push nodes',
    formerly: 'frodo config push custom-nodes',
    id: '--node-id',
    name: '--node-name',
    aliases: ['--name'],
  },
  {
    command: 'frodo config push email-templates',
    id: '--template-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config push endpoints',
    id: '--endpoint-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config push iga-workflows',
    id: '--workflow-id',
    name: '--workflow-name',
    aliases: ['--name'],
  },
  {
    command: 'frodo config push internal-roles',
    id: '--role-id',
    name: '--role-name',
    aliases: ['--name'],
  },
  {
    command: 'frodo config push journeys',
    id: '--journey-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config push locales',
    id: '--locale-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config push managed-objects',
    id: '--managed-object-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config push oauth-cimd-profiles',
    id: '--profile-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config push oauth-issuers',
    id: '--issuer-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config push oauth-software-publishers',
    id: '--software-publisher-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config push org-privileges',
    id: '--org-privileges-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config push remote-proxies',
    id: '--proxy-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config push saml',
    id: '--entity-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config push schedules',
    id: '--schedule-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config push scripts',
    id: '--script-id',
    name: '--script-name',
    aliases: ['--name'],
  },
  {
    command: 'frodo config push secretstore-mappings',
    formerly: 'frodo config push secret-mappings',
    id: '--secret-mapping-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config push secrets',
    id: '--secret-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config push services',
    id: '--service-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config push telemetry',
    id: '--exporter-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config push themes',
    id: '--theme-id',
    name: '--theme-name',
    aliases: [],
  },
  {
    command: 'frodo config push variables',
    id: '--variable-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config delete apps',
    formerly: 'frodo config delete applications',
    id: '--app-id',
    name: '--app-name',
    aliases: ['--name'],
  },
  {
    command: 'frodo config delete connectors',
    formerly: 'frodo config delete connector-definitions',
    id: '--connector-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config delete connector-mappings',
    id: '--connector-mapping-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config delete cors',
    id: '--cors-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config delete nodes',
    formerly: 'frodo config delete custom-nodes',
    id: '--node-id',
    name: '--node-name',
    aliases: ['--name'],
  },
  {
    command: 'frodo config delete endpoints',
    id: '--endpoint-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config delete journeys',
    id: '--journey-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config delete scripts',
    id: '--script-id',
    name: '--script-name',
    aliases: ['--name'],
  },
  {
    command: 'frodo config delete themes',
    id: '--theme-id',
    name: '--theme-name',
    aliases: ['--name'],
  },
  {
    command: 'frodo config delete email-templates',
    id: '--template-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config delete secrets',
    id: '--secret-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config delete terms-and-conditions',
    id: '--version-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config delete variables',
    id: '--variable-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config delete locales',
    id: '--locale-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config delete oauth-cimd-profiles',
    id: '--profile-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config delete oauth-issuers',
    id: '--issuer-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config delete oauth-software-publishers',
    id: '--software-publisher-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config delete connector-servers',
    formerly: 'frodo config delete remote-servers',
    id: '--server-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config delete schedules',
    id: '--schedule-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config delete secretstore-mappings',
    formerly: 'frodo config delete secret-mappings',
    id: '--secret-mapping-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config delete services',
    id: '--service-id',
    name: null,
    aliases: ['-n', '--name'],
  },
  {
    command: 'frodo config delete telemetry',
    id: '--exporter-id',
    name: null,
    aliases: ['-n', '--name'],
  },
];

export const STRAY_SELECTOR_OPTIONS = [
  {
    command: 'frodo config promote unlock',
    long: '--id',
    why: 'the id of the promotion to unlock the tenants of, not an object of a type',
  },
  {
    command: 'frodo config promote report',
    long: '--report-id',
    why: 'the id of a promotion report, not an object of a type',
  },
];

export const PENDING_VERBS = [];

export const KEPT_OLD_SPELLING = [
  {
    file: 'config-manager-pull-locales.e2e.test.js',
    cmd: 'frodo config-manager pull locales -n fr -D ${dirName}',
    why: 'the -n spelling replays the recording of the command through the alias, which covers the alias end to end; the other lines type the new spelling',
  },
  {
    file: 'config-manager-push-locales.e2e.test.js',
    cmd: 'frodo config-manager push locales -n fr -D ${allDirectory} -m forgeops',
    why: 'the -n spelling of a push replays its recording through the alias; the other lines type the new spelling',
  },
  {
    file: 'config-manager-push-services.e2e.test.js',
    cmd: 'frodo config-manager push services --name id-repositories -D ${allDirectory} -m forgeops',
    why: 'the --name spelling replays its recording through the alias; the other lines type the new spelling',
  },
  {
    file: 'config-manager-delete-locales.e2e.test.js',
    cmd: 'frodo config-manager delete locales -n fr -m forgeops',
    why: 'the -n spelling of a delete replays its recording through the alias; a named delete never asks, so the replay also shows that the alias counts as a name; the other lines type the new spelling',
  },
  {
    file: 'config-manager-push-journeys.e2e.test.js',
    cmd: 'frodo config-manager push journeys -Fn ConfigManagerPushTest -D ${allDirectory}',
    why: 'the -n inside a cluster of short options (-Fn) replays its recording through the alias; the other lines type the new spelling',
  },
];

export const NO_SELECTOR_COMMANDS = [
  {
    command: 'frodo config pull csp',
    why: 'the file is the whole entity: a file that held a part of it would replace the whole entity when it is pushed',
  },
  {
    command: 'frodo config pull terms-and-conditions',
    why: 'the file is the whole entity: a file that held a part of it would replace the whole entity when it is pushed',
  },
  {
    command: 'frodo config push csp',
    why: 'the file is the whole entity (both policies): a selector has no row here',
    ownOption: {
      short: '-n',
      long: '--name',
      why: 'declared before the selectors and kept as it is, with no -i and no row: it names one of the two policies of the file, enforced or report-only, and then only that policy is written to the tenant (each policy is replaced whole, the other one is not touched), so it never writes a part of the entity',
    },
  },
  {
    command: 'frodo config push terms-and-conditions',
    why: 'the file is the whole entity: all versions are one configuration entity, and a push that wrote one version would replace the entity and drop the others',
  },
];
