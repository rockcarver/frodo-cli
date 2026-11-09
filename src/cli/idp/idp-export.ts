import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportSocialIdentityProvidersToFile,
  exportSocialIdentityProvidersToFiles,
  exportSocialIdentityProviderToFile,
} from '../../ops/IdpOps';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo idp export');

  program
    .description('Export (social) identity providers.')
    .addOption(
      new Option(
        '-i, --idp-id <idp-id>',
        'Id/name of a provider. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file [file]',
        'Name of the file to write the exported provider(s) to. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Export all the providers in a realm to a single file. Cannot be used with -i or -A.'
      ).conflicts(['idpId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all the providers in a realm as separate files <provider name>.idp.json. Cannot be used with -i, -f or -a.'
      ).conflicts(['idpId', 'file', 'all'])
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'idpId'],
      purpose: 'what to export',
    })
    .multiOp()
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
          if (options.idpId) {
            verboseMessage(
              `Exporting provider "${
                options.idpId
              }" from realm "${state.getRealm()}"...`
            );
            const outcome = await exportSocialIdentityProviderToFile(
              options.idpId,
              options.file,
              options.metadata
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all -a
          else if (options.all) {
            verboseMessage('Exporting all providers to a single file...');
            const outcome = await exportSocialIdentityProvidersToFile(
              options.file,
              options.metadata
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all-separate -A
          else if (options.allSeparate) {
            verboseMessage('Exporting all providers to separate files...');
            const outcome = await exportSocialIdentityProvidersToFiles(
              options.metadata,
              options.allowFailures
            );
            if (!outcome) process.exitCode = 1;
          }
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
