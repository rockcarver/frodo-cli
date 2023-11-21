import path from 'path';
import { fileURLToPath } from 'url';

import { FrodoStubCommand } from '../FrodoCommand';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new FrodoStubCommand('admin')
    .description('Platform admin tasks.')
    .executableDir(__dirname);

  program.command('federation', 'Manage admin federation configuration.');

  program.command(
    'create-oauth2-client-with-admin-privileges',
    'Create an oauth2 client with admin privileges.'
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
    'export-full-cloud-config',
    'Export full cloud configuration for all ops that currently support export.'
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
