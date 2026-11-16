/**
 * The agent types that have a config-manager kind of their own, and what the generic kind
 * `oauth2-agents` says when it leaves them to it.
 *
 * `config-manager pull|push oauth2-agents` works with any agent type by name and used to write
 * every type it was given. A type that has a kind of its own (`oauth-cimd-profiles`,
 * `oauth-issuers`) gets one writer in a tree, as record 0042 gives an application-owned object one:
 * the generic kind skips the type, says so once per realm and type, and changes nothing else. The
 * skip is not a failure and not an operation of an `OperationRun` (decision record 0040: a thing
 * that does not apply is not a thing that failed), so exit codes and `--allow-failures` are not
 * affected.
 *
 * This module imports nothing on purpose: the generic kind is in the deprecated
 * `src/configManagerOps/` layer and must not pull the kinds (and the library modules they read at
 * import time) in just for a table. The names are written here and a test checks that they are the
 * names the kinds export (`test/unit/DedicatedAgentKinds.test.js`), and that every kind has a
 * `pull` and a `push` command of that name.
 *
 * A later agent type that gets a kind of its own is one more entry in {@link DEDICATED_AGENT_KINDS}
 * and needs its own migration note.
 */

/** What the generic kind needs to know about a type that has a kind of its own. */
export interface DedicatedAgentKind {
  /** The name of the kind, which is the name of its `pull` and `push` commands. */
  kind: string;
  /** The objects of the type in the words of the messages, in the plural. */
  plural: string;
}

/** The agent types that the generic `oauth2-agents` kind leaves to a kind of their own. */
export const DEDICATED_AGENT_KINDS: Readonly<
  Record<string, DedicatedAgentKind>
> = {
  CIMDProfile: { kind: 'oauth-cimd-profiles', plural: 'CIMD profiles' },
  TrustedJwtIssuer: { kind: 'oauth-issuers', plural: 'trusted JWT issuers' },
};

/**
 * The kind that handles an agent type instead of the generic `oauth2-agents` kind.
 * @param {string} agentType the agent type, as the config file or the folder names it
 * @returns {string | undefined} the name of the kind (the name of its `pull` and `push` commands),
 * or `undefined` when the generic kind handles the type
 */
export function skippedForDedicatedKind(agentType: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(DEDICATED_AGENT_KINDS, agentType)
    ? DEDICATED_AGENT_KINDS[agentType].kind
    : undefined;
}

/**
 * The warning of `pull oauth2-agents` for the entries of a skipped type in one realm.
 * @param {string} realm the realm, as the state names it
 * @param {string} agentType a type for which {@link skippedForDedicatedKind} answers
 * @param {{ id?: unknown; overrides?: unknown }[]} entries the entries of the type in that realm
 * @returns {string} one sentence that names the entries and the command, and, when an entry has
 * `overrides`, that they are not applied and where they go
 */
export function skippedEntriesMessage(
  realm: string,
  agentType: string,
  entries: { id?: unknown; overrides?: unknown }[]
): string {
  const { kind, plural } = DEDICATED_AGENT_KINDS[agentType];
  const ids = entries.map((entry) => String(entry?.id)).join(', ');
  const message =
    `Skipping ${entries.length} ${agentType} ${entries.length === 1 ? 'entry' : 'entries'} ` +
    `of realm '${realm}' (${ids}): ${plural} are pulled by ` +
    `"frodo config-manager pull ${kind}".`;
  return entries.some((entry) => entry?.overrides)
    ? `${message} ${entries.length === 1 ? 'Its' : 'Their'} overrides are not applied here: ` +
        `move them to the overrides file of that command (-f).`
    : message;
}

/**
 * The warning of `push oauth2-agents` for the files of a skipped type in one realm.
 * @param {string} realm the realm, as the state names it
 * @param {string} agentType a type for which {@link skippedForDedicatedKind} answers
 * @param {number} count the number of `.json` files in the folder of the type
 * @returns {string} one sentence that counts the files and names the command
 */
export function skippedFilesMessage(
  realm: string,
  agentType: string,
  count: number
): string {
  const { kind } = DEDICATED_AGENT_KINDS[agentType];
  return (
    `Skipping the ${count} ${agentType} file(s) of realm '${realm}': ` +
    `they are pushed by "frodo config-manager push ${kind}".`
  );
}
