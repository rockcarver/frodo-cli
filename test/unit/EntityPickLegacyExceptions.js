/**
 * Entity options that have no picker. Used only by EntityOptionsHavePickers.test.js
 * (decision record 0038).
 *
 * An option is listed as `<command>::<option attribute>`; sorted, one per line.
 */

/**
 * Options of commands that predate the rule and have no picker yet.
 *
 * This list only ever shrinks:
 * - NEVER add an option here. A new command gets its picker from its family
 *   (src/utils/interactive/EntityPickFamilies.ts), and the command file
 *   declares nothing.
 * - When a command gets its picker, delete its line. The test fails until you
 *   do, so the list cannot go stale.
 *
 * Generated from the command tree on 2026-11-07.
 */
export const LEGACY_ENTITY_OPTIONS_WITHOUT_PICKER = [
  'frodo agent export::agentId',
  'frodo authz policy delete::setId',
  'frodo authz policy export::setId',
  'frodo conn service-account describe::name',
  'frodo conn service-account remove::name',
  'frodo esv secret create::secretId',
  'frodo esv secret export::secretId',
  'frodo esv secret import::secretId',
  'frodo esv variable create::variableId',
  'frodo esv variable describe::variableId',
  'frodo esv variable export::variableId',
  'frodo esv variable import::variableId',
  'frodo iga workflow describe::workflowId',
  'frodo log key delete::keyId',
  'frodo node delete::nodeName',
  'frodo node export::nodeName',
  'frodo script delete::scriptName',
  'frodo script describe::scriptName',
  'frodo script export::scriptName',
  'frodo secretstore delete::secretstoreId',
  'frodo secretstore describe::secretstoreId',
  'frodo secretstore export::secretstoreId',
  'frodo secretstore import::secretstoreId',
  'frodo secretstore mapping alias activate::secretId',
  'frodo secretstore mapping alias activate::secretstoreId',
  'frodo secretstore mapping alias create::secretId',
  'frodo secretstore mapping alias create::secretstoreId',
  'frodo secretstore mapping alias delete::secretId',
  'frodo secretstore mapping alias delete::secretstoreId',
  'frodo secretstore mapping alias list::secretId',
  'frodo secretstore mapping alias list::secretstoreId',
  'frodo secretstore mapping create::secretId',
  'frodo secretstore mapping create::secretstoreId',
  'frodo secretstore mapping delete::secretstoreId',
  'frodo secretstore mapping list::secretstoreId',
  'frodo service export::serviceId',
  'frodo theme delete::themeName',
  'frodo theme export::themeName',
];

/**
 * Options that name a NEW entity or one that is in a file, not one that exists
 * on the system (`create`, `import`): a picker would have nothing to offer.
 * A new command may be added here only when that is true of the option.
 */
export const ENTITY_OPTIONS_THAT_NAME_NO_EXISTING_ENTITY = [
  'frodo admin federation import::idpId',
  'frodo agent ai import::agentId',
  'frodo agent gateway import::agentId',
  'frodo agent import::agentId',
  'frodo agent java import::agentId',
  'frodo agent web import::agentId',
  'frodo app import::appId',
  'frodo app import::appName',
  'frodo authz policy import::policyId',
  'frodo authz set import::setId',
  'frodo authz type import::typeId',
  'frodo authz type import::typeName',
  'frodo conn service-account add::name',
  'frodo conn service-account add::saId',
  'frodo email template import::templateId',
  'frodo idm import::entityId',
  'frodo idm remote-proxy create::proxyId',
  'frodo idm remote-proxy update::basicUserName',
  'frodo idm remote-proxy update::clientId',
  'frodo idp import::idpId',
  'frodo iga workflow import::workflowId',
  'frodo journey import::journeyId',
  'frodo mapping import::mappingId',
  'frodo node import::nodeId',
  'frodo node import::nodeName',
  'frodo oauth client import::appId',
  'frodo realm import::realmId',
  'frodo realm import::realmName',
  'frodo role import::roleId',
  'frodo role import::roleName',
  'frodo saml cot import::cotId',
  'frodo saml import::entityId',
  'frodo server import::serverId',
  'frodo service import::serviceId',
  'frodo theme import::themeId',
  'frodo theme import::themeName',
];
