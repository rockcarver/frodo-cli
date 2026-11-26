/**
 * The two families of agent files in a config-manager tree, and which command handles which agent
 * type.
 *
 * The agent files of a tree, `realms/<realm>/realm-config/agents/<type>/<id>.json`, are written
 * and read by two pairs of commands:
 * - `oauth-clients`: the OAuth2 clients (the agent type `OAuth2Client`);
 * - `agents`: every other agent type that has no command of its own (today `IdentityGatewayAgent`,
 *   `J2EEAgent`, `WebAgent`, `2.2_Agent`, `SharedAgent`, `RemoteConsentAgent`, `SoapSTSAgent` and
 *   `OAuth2Thing`), and any type that a later deployment adds.
 * The three types that have a command of their own (`CIMDProfile`, `TrustedJwtIssuer`,
 * `SoftwarePublisher`, see {@link DEDICATED_AGENT_KINDS}) belong to neither family.
 *
 * The old command `oauth2-agents`, which stays as a deprecated command, handles both families:
 * `both` in {@link AgentFamilySelection}. The two families never overlap and together are exactly
 * what that command handled, so the two new commands run one after the other leave the tree and
 * ask for the objects that the old command did.
 *
 * This module imports only the table of the types that have a command of their own, and nothing
 * from the library, so that the deprecated `src/configManagerOps/` layer can use it for a table.
 * The names are written here and `test/unit/ConfigManagerAgentsSplit.test.js` checks that each
 * family has a `pull` and a `push` command of that name.
 */
import {
  entriesPulledElsewhereMessage,
  skippedForDedicatedKind,
} from './DedicatedAgentKinds';

/** The name of a family, which is also the name of its `pull` and `push` commands. */
export type AgentFamily = 'oauth-clients' | 'agents';

/** What a command handles: one family, or both (the old `oauth2-agents` command, and `pull all`). */
export type AgentFamilySelection = AgentFamily | 'both';

/** The agent type of an OAuth2 client, the one type of the family `oauth-clients`. */
export const OAUTH2_CLIENT_AGENT_TYPE = 'OAuth2Client';

/** What a family needs to know about itself. */
export interface AgentFamilyInfo {
  /** The name of the family, which is the name of its `pull` and `push` commands. */
  command: AgentFamily;
  /** The objects of the family in the words of the messages, in the plural. */
  plural: string;
}

/** The two families. */
export const AGENT_FAMILIES: Readonly<Record<AgentFamily, AgentFamilyInfo>> = {
  'oauth-clients': { command: 'oauth-clients', plural: 'OAuth2 clients' },
  agents: { command: 'agents', plural: 'agents' },
};

/**
 * The family that handles an agent type.
 * @param {string} agentType the agent type, as the config file, a folder or the tenant names it
 * @returns {AgentFamily | undefined} `oauth-clients` for `OAuth2Client`, `undefined` for a type that
 * has a command of its own, `agents` for every other type name (also one this module does not
 * know, as the old command handled any type by name)
 */
export function familyOfAgentType(agentType: string): AgentFamily | undefined {
  if (agentType === OAUTH2_CLIENT_AGENT_TYPE) return 'oauth-clients';
  return skippedForDedicatedKind(agentType) === undefined
    ? 'agents'
    : undefined;
}

/**
 * Whether a command handles an agent type.
 * @param {AgentFamilySelection} selection the family of the command, or `both`
 * @param {string} agentType the agent type
 * @returns {boolean} true when the type belongs to the family (to either of them for `both`)
 */
export function handlesAgentType(
  selection: AgentFamilySelection,
  agentType: string
): boolean {
  const family = familyOfAgentType(agentType);
  return family !== undefined && (selection === 'both' || selection === family);
}

/**
 * The command that handles an agent type instead of a command of one family.
 * @param {AgentFamilySelection} selection the family of the command, or `both` (which skips nothing)
 * @param {string} agentType the agent type
 * @returns {AgentFamily | undefined} the other family, which is also the name of its commands, when
 * the type belongs to it; `undefined` when the command handles the type, and for a type that has a
 * command of its own (that is not a matter of the family)
 */
export function skippedForOtherFamily(
  selection: AgentFamilySelection,
  agentType: string
): AgentFamily | undefined {
  if (selection === 'both') return undefined;
  const family = familyOfAgentType(agentType);
  return family !== undefined && family !== selection ? family : undefined;
}

/**
 * The warning of a pull for the entries of a config file that belong to the other family, in one
 * realm.
 * @param {string} realm the realm, as the state names it
 * @param {string} agentType a type for which {@link skippedForOtherFamily} answers
 * @param {{ id?: unknown; overrides?: unknown }[]} entries the entries of the type in that realm
 * @returns {string} one sentence that names the entries and the command of the other family, and,
 * when an entry has `overrides`, that they are not applied and where they go
 */
export function skippedOtherFamilyEntriesMessage(
  realm: string,
  agentType: string,
  entries: { id?: unknown; overrides?: unknown }[]
): string {
  const { command, plural } =
    AGENT_FAMILIES[familyOfAgentType(agentType) as AgentFamily];
  return entriesPulledElsewhereMessage(
    realm,
    agentType,
    entries,
    plural,
    command
  );
}
