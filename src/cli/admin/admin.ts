import { Command } from 'commander';

import { FrodoStubCommand } from '../FrodoCommand';
import { addFederation } from './admin-federation';

export default function setup(command: Command) {
  // this stays for the moment in order to set up some process wide stuff - though that
  // could be set in the cli start up instead
  const program = new FrodoStubCommand('admin');

  const adminCommand = command
    .command('admin')
    .description('Platform admin tasks.');

  addFederation(adminCommand);

  program.command(
    'create-oauth2-client-with-admin-privileges',
    'Create an oauth2 client with admin privileges.'
  );

  program.command(
    'generate-rfc7523-authz-grant-artefacts',
    'Generate RFC7523 authorization grant artefacts.'
  );

  program.command(
    'execute-rfc7523-authz-grant-flow',
    'Execute RFC7523 authorization grant flow.'
  );

  program.command(
    'get-access-token',
    'Get an access token using client credentials grant type.'
  );

  program.command(
    'list-oauth2-clients-with-admin-privileges',
    'List oauth2 clients with admin privileges.'
  );

  program.command(
    'grant-oauth2-client-admin-privileges',
    'Grant an oauth2 client admin privileges.'
  );

  program.command(
    'revoke-oauth2-client-admin-privileges',
    'Revoke admin privileges from an oauth2 client.'
  );

  program.command(
    'list-oauth2-clients-with-custom-privileges',
    'List oauth2 clients with custom privileges.'
  );

  program.command(
    'list-static-user-mappings',
    'List all subjects of static user mappings that are not oauth2 clients.'
  );

  program.command(
    'remove-static-user-mapping',
    "Remove a subject's static user mapping."
  );

  program.command(
    'add-autoid-static-user-mapping',
    'Add AutoId static user mapping to enable dashboards and other AutoId-based functionality.'
  );

  program.command(
    'hide-generic-extension-attributes',
    'Hide generic extension attributes.'
  );

  program.command(
    'show-generic-extension-attributes',
    'Show generic extension attributes.'
  );

  program.command('repair-org-model', 'Repair org model.');

  // program.command('train-auto-access-model', 'Train Auto Access model.');

  return program;
}
