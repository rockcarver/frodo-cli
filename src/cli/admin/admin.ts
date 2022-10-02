import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const program = new Command('admin')
    .helpOption('-h, --help', 'Help')
    .description('Platform admin tasks.')
    .executableDir(__dirname);

  program
    .command(
      'create-oauth2-client-with-admin-privileges',
      'Create an oauth2 client with admin privileges.'
    )
    .showHelpAfterError();

  program
    .command(
      'get-access-token',
      'Get an access token using client credentials grant type.'
    )
    .showHelpAfterError();

  program
    .command(
      'list-oauth2-clients-with-admin-privileges',
      'List oauth2 clients with admin privileges.'
    )
    .showHelpAfterError();

  program
    .command(
      'grant-oauth2-client-admin-privileges',
      'Grant an oauth2 client admin privileges.'
    )
    .showHelpAfterError();

  program
    .command(
      'revoke-oauth2-client-admin-privileges',
      'Revoke admin privileges from an oauth2 client.'
    )
    .showHelpAfterError();

  program
    .command(
      'list-oauth2-clients-with-custom-privileges',
      'List oauth2 clients with custom privileges.'
    )
    .showHelpAfterError();

  program
    .command(
      'list-static-user-mappings',
      'List all subjects of static user mappings that are not oauth2 clients.'
    )
    .showHelpAfterError();

  program
    .command(
      'remove-static-user-mapping',
      "Remove a subject's static user mapping."
    )
    .showHelpAfterError();

  program
    .command(
      'add-autoid-static-user-mapping',
      'Add AutoId static user mapping to enable dashboards and other AutoId-based functionality.'
    )
    .showHelpAfterError();

  program
    .command(
      'hide-generic-extension-attributes',
      'Hide generic extension attributes.'
    )
    .showHelpAfterError();

  program
    .command(
      'show-generic-extension-attributes',
      'Show generic extension attributes.'
    )
    .showHelpAfterError();

  program.command('repair-org-model', 'Repair org model.').showHelpAfterError();

  program.showHelpAfterError();
  return program;
}
