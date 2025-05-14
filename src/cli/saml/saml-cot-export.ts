import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportCircleOfTrustToFile,
  exportCirclesOfTrustToFile,
  exportCirclesOfTrustToFiles,
} from '../../ops/CirclesOfTrustOps';
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
  const program = new FrodoCommand(
    'frodo saml cot export',
    [],
    deploymentTypes
  );

  program
    .description('Export SAML circles of trust.')
    .addOption(
      new Option(
        '-i, --cot-id <cot-id>',
        'Circle of trust id/name. If specified, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-f, --file [file]',
        'Name of the export file. Ignored with -A. Defaults to <cot-id>.cot.saml.json.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Export all the circles of trust in a realm to a single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all the circles of trust in a realm as separate files <cot-id>.cot.saml.json. Ignored with -i, and -a.'
      )
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
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
        if (options.cotId && (await getTokens(false, true, deploymentTypes))) {
          verboseMessage(
            `Exporting circle of trust "${
              options.cotId
            }" from realm "${state.getRealm()}"...`
          );
          const outcome = await exportCircleOfTrustToFile(
            options.cotId,
            options.file,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all circles of trust to a single file...');
          const outcome = await exportCirclesOfTrustToFile(
            options.file,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all circles of trust to separate files...');
          const outcome = await exportCirclesOfTrustToFiles(options.metadata);
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
