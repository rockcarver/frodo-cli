import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportSaml2ProvidersToFile,
  exportSaml2ProvidersToFiles,
  exportSaml2ProviderToFile,
} from '../../ops/Saml2Ops';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo saml export');

  program
    .description('Export SAML entity providers.')
    .addOption(
      new Option(
        '-i, --entity-id <entity-id>',
        'Entity id. If specified, -a or -A cannot be used.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file [file]',
        'Name of the file to write the exported provider(s) to. Cannot be used with -A. If not specified, the export file is named <id>.saml.json.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Export all the providers in a realm to a single file. Cannot be used with -i or -A.'
      ).conflicts(['entityId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all the providers in a realm as separate files <provider name>.saml.json. Cannot be used with -i or -a.'
      ).conflicts(['entityId', 'all'])
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .addOption(
      new Option('--no-deps', 'Do not include any dependencies (scripts).')
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'entityId'],
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
          if (options.entityId) {
            verboseMessage(
              `Exporting provider "${
                options.entityId
              }" from realm "${state.getRealm()}"...`
            );
            const outcome = await exportSaml2ProviderToFile(
              options.entityId,
              options.file,
              options.metadata,
              {
                deps: options.deps,
              }
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all -a
          else if (options.all) {
            verboseMessage('Exporting all providers to a single file...');
            const outcome = await exportSaml2ProvidersToFile(
              options.file,
              options.metadata,
              {
                deps: options.deps,
              }
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all-separate -A
          else if (options.allSeparate) {
            verboseMessage('Exporting all providers to separate files...');
            const outcome = await exportSaml2ProvidersToFiles(
              options.metadata,
              { deps: options.deps },
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
