import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { exportSaml2MetadataToFile } from '../../ops/Saml2Ops';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo saml metadata export');

  program
    .description('Export SAML metadata.')
    .addOption(
      new Option(
        '-i, --entity-id <entity-id>',
        'Entity id. If specified, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-f, --file [file]',
        'Name of the file to write the exported metadata to. Ignored with -A. If not specified, the export file is named <entity-id>.metadata.xml.'
      )
    )
    // .addOption(
    //   new Option(
    //     '-A, --all-separate',
    //     'Export all the providers in a realm as separate files <provider name>.saml.json. Ignored with -t, -i, and -a.'
    //   )
    // )
    .requireOneOf({
      options: ['allSeparate', 'entityId'],
      purpose: 'what to export',
    })
    .action(
      // implement command logic inside action handler
      async (host, realm, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );
        // export by id/name
        if (options.entityId && (await getTokens())) {
          printMessage(
            `Exporting metadata for provider "${
              options.entityId
            }" from realm "${state.getRealm()}"...`
          );
          const outcome = await exportSaml2MetadataToFile(
            options.entityId,
            options.file
          );
          if (!outcome) process.exitCode = 1;
        }
        // // --all-separate -A
        // else if (options.allSeparate && (await getTokens())) {
        //   printMessage('Exporting all providers to separate files...');
        //   exportProvidersToFiles();
        // }
        // No branch ran: with requireOneOf satisfied, the only way
        // here is getTokens() failing -- keep the old exit-1 semantics
        // (the removed else handled auth failure too).
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
