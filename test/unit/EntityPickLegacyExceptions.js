/**
 * Entity options that have no picker, and why. Used only by
 * EntityOptionsHavePickers.test.js (decision record 0038).
 *
 * An option is listed as `<command>::<option attribute>`; sorted, one per line.
 * Every other option that names an existing entity and that a command requires
 * gets its picker from its command family
 * (src/utils/interactive/EntityPickFamilies.ts).
 *
 * An option that names an existing entity but that a command does not require
 * is not listed either, because the test looks only at the options a command
 * requires (mandatory, or a member of a group of which one or all are needed).
 * `--set-id` of `authz policy delete` and `authz policy export` is one: it
 * narrows `-a` (and `-A`) to a policy set and selects nothing on its own
 * (frodo-cli#1163), so it is no member of the group the commands declare.
 */

/**
 * Options that name a NEW entity or one that is in a file, not one that exists
 * on the system (`create`, `import`): a picker would have nothing to offer.
 * A new command may be added here only when that is true of the option.
 */
export const ENTITY_OPTIONS_THAT_NAME_NO_EXISTING_ENTITY = [
  'frodo admin federation import::idpId',
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
  'frodo esv secret create::secretId',
  'frodo esv secret import::secretId',
  'frodo esv variable create::variableId',
  'frodo esv variable import::variableId',
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
  'frodo secretstore import::secretstoreId',
  'frodo secretstore mapping create::secretId',
  'frodo server import::serverId',
  'frodo service import::serviceId',
  'frodo theme import::themeId',
  'frodo theme import::themeName',
];
