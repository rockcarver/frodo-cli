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
    .addOption(new Option('-i, --entity-id <entity-id>', 'Entity id.'))
    .addOption(
      new Option(
        '-f, --file [file]',
        'Name of the file to write the exported metadata to. If not specified, the export file is named <entity-id>.metadata.xml.'
      )
    )
    // .addOption(
    //   new Option(
    //     '-A, --all-separate',
    //     'Export all the providers in a realm as separate files <provider name>.saml.json. Cannot be used with -i or -a.'
    //   ).conflicts(['entityId', 'all])
    // )
    .requireOneOf({
      options: ['entityId'],
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
        // the framework offers a picker for a missing -i/-n after the login
        // (decision record 0038), so the login comes before the branches
        if (await getTokens()) {
          // export by id/name
          if (options.entityId) {
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
          // No branch ran: with requireOneOf satisfied, the only way here is a
          // picker that had nothing to offer (an empty list).
          else {
            process.exitCode = 1;
          }
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
