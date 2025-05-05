import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportSaml2ProvidersToFile,
  exportSaml2ProvidersToFiles,
  exportSaml2ProviderToFile,
} from '../../ops/Saml2Ops';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo saml export', [], deploymentTypes);

  program
    .description('Export SAML entity providers.')
    .addOption(
      new Option(
        '-i, --entity-id <entity-id>',
        'Entity id. If specified, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-f, --file [file]',
        'Name of the file to write the exported provider(s) to. Ignored with -A. If not specified, the export file is named <id>.saml.json.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Export all the providers in a realm to a single file. Ignored with -t and -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all the providers in a realm as separate files <provider name>.saml.json. Ignored with -t, -i, and -a.'
      )
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
        if (
          options.entityId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
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
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
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
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all providers to separate files...');
          const outcome = await exportSaml2ProvidersToFiles(options.metadata, {
            deps: options.deps,
          });
          if (!outcome) process.exitCode = 1;
        }
        // unrecognized combination of options or no options
        else {
          printMessage(
            'Unrecognized combination of options or no options...',
            'error'
          );
          program.help();
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
