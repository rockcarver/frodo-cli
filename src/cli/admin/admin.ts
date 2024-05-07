import { FrodoStubCommand } from '../FrodoCommand';
import AddAutoidStaticUserMappingCmd from './admin-add-autoid-static-user-mapping.js';
import CreateOAuth2ClientWithAdminPrivilegesCmd from './admin-create-oauth2-client-with-admin-privileges.js';
import ExecuteRfc7523AuthzGrantFlowCmd from './admin-execute-rfc7523-authz-grant-flow.js';
import FederationCmd from './admin-federation.js';
import GenerateRfc7523AuthzGrantArtefactsCmd from './admin-generate-rfc7523-authz-grant-artefacts.js';
import GetAccessTokenCmd from './admin-get-access-token.js';
import GrantOauth2ClientAdminPrivilegesCmd from './admin-grant-oauth2-client-admin-privileges.js';
import HideGenericExtensionAttributesCmd from './admin-hide-generic-extension-attributes.js';
import ListOauth2ClientsWithAdminPrivilegesCmd from './admin-list-oauth2-clients-with-admin-privileges.js';
import ListOauth2ClientsWithCustomPrivilegesCmd from './admin-list-oauth2-clients-with-custom-privileges.js';
import ListStaticUserMappingsCmd from './admin-list-static-user-mappings.js';
import RemoveStaticUserMappingCmd from './admin-remove-static-user-mapping.js';
import RepairOrgModelCmd from './admin-repair-org-model.js';
import RevokeOauth2ClientAdminPrivilegesCmd from './admin-revoke-oauth2-client-admin-privileges.js';
import ShowGenericExtensionAttributesCmd from './admin-show-generic-extension-attributes.js';
// import TrainAutoAccessModelCmd from './admin-train-auto-access-model.js';

export default function setup() {
  const program = new FrodoStubCommand('admin').description(
    'Platform admin tasks.'
  );

  program.addCommand(FederationCmd().name('federation'));

  program.addCommand(
    CreateOAuth2ClientWithAdminPrivilegesCmd().name(
      'create-oauth2-client-with-admin-privileges'
    )
  );

  program.addCommand(
    GenerateRfc7523AuthzGrantArtefactsCmd().name(
      'generate-rfc7523-authz-grant-artefacts'
    )
  );

  program.addCommand(
    ExecuteRfc7523AuthzGrantFlowCmd().name('execute-rfc7523-authz-grant-flow')
  );

  program.addCommand(GetAccessTokenCmd().name('get-access-token'));

  program.addCommand(
    ListOauth2ClientsWithAdminPrivilegesCmd().name(
      'list-oauth2-clients-with-admin-privileges'
    )
  );

  program.addCommand(
    GrantOauth2ClientAdminPrivilegesCmd().name(
      'grant-oauth2-client-admin-privileges'
    )
  );

  program.addCommand(
    RevokeOauth2ClientAdminPrivilegesCmd().name(
      'revoke-oauth2-client-admin-privileges'
    )
  );

  program.addCommand(
    ListOauth2ClientsWithCustomPrivilegesCmd().name(
      'list-oauth2-clients-with-custom-privileges'
    )
  );

  program.addCommand(
    ListStaticUserMappingsCmd().name('list-static-user-mappings')
  );

  program.addCommand(
    RemoveStaticUserMappingCmd().name('remove-static-user-mapping')
  );

  program.addCommand(
    AddAutoidStaticUserMappingCmd().name('add-autoid-static-user-mapping')
  );

  program.addCommand(
    HideGenericExtensionAttributesCmd().name(
      'hide-generic-extension-attributes'
    )
  );

  program.addCommand(
    ShowGenericExtensionAttributesCmd().name(
      'show-generic-extension-attributes'
    )
  );

  program.addCommand(RepairOrgModelCmd().name('repair-org-model'));

  // program.addCommand(TrainAutoAccessModelCmd().name('train-auto-access-model'));

  return program;
}
