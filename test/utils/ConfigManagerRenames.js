/**
 * The config-manager commands that were renamed (cli#1264, P12): the group the
 * command is in, the old name and the new one. The old name of each stays as a
 * transition alias until a major release removes it, and typing it prints one
 * notice on stderr (the alias record:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0049-an-alias-is-named-in-the-description-and-the-old-name-of-a-renamed-command-stays-as-a-transition-alias.md).
 *
 * Tests that must know every rename read this table, so a rename that is added
 * or dropped changes one place.
 */

/** [verb, old name, new name] of the object commands and of the promotion commands. */
export const RENAMES = [
  ['pull', 'applications', 'apps'],
  ['push', 'applications', 'apps'],
  ['delete', 'applications', 'apps'],
  ['migrate', 'applications', 'apps'],
  ['pull', 'authentication', 'authn'],
  ['push', 'authentication', 'authn'],
  ['pull', 'custom-nodes', 'nodes'],
  ['push', 'custom-nodes', 'nodes'],
  ['delete', 'custom-nodes', 'nodes'],
  ['pull', 'connector-definitions', 'connectors'],
  ['push', 'connector-definitions', 'connectors'],
  ['delete', 'connector-definitions', 'connectors'],
  ['pull', 'secret-mappings', 'secretstore-mappings'],
  ['push', 'secret-mappings', 'secretstore-mappings'],
  ['delete', 'secret-mappings', 'secretstore-mappings'],
  ['promote', 'check-locked-status', 'lock-status'],
  ['promote', 'lock-tenants', 'lock'],
  ['promote', 'unlock-tenants', 'unlock'],
  ['promote', 'check-promotion-status', 'status'],
  ['promote', 'check-promotion-reports', 'report'],
  ['promote', 'run-promotion', 'run'],
  ['promote', 'run-dryrun-promotion', 'dry-run'],
];

/** Every rename of the pull request. */
export const ALL_RENAMES = [...RENAMES];

/** The notice that typing the old name prints on stderr. */
export const noticeFor = (oldName, newName) =>
  `'${oldName}' is now called '${newName}'. The old name still works and will be removed in a future major release.`;
