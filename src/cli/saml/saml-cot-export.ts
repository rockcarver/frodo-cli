import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportCircleOfTrustToFile,
  exportCirclesOfTrustToFile,
  exportCirclesOfTrustToFiles,
} from '../../ops/CirclesOfTrustOps';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo saml cot export');

  program
    .description('Export SAML circles of trust.')
    .addOption(
      new Option(
        '-i, --cot-id <cot-id>',
        'Circle of trust id/name. If specified, -a or -A cannot be used.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file [file]',
        'Name of the export file. Cannot be used with -A. Defaults to <cot-id>.cot.saml.json.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Export all the circles of trust in a realm to a single file. Cannot be used with -i or -A.'
      ).conflicts(['cotId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all the circles of trust in a realm as separate files <cot-id>.cot.saml.json. Cannot be used with -i or -a.'
      ).conflicts(['cotId', 'all'])
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'cotId'],
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
          if (options.cotId) {
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
          else if (options.all) {
            verboseMessage(
              'Exporting all circles of trust to a single file...'
            );
            const outcome = await exportCirclesOfTrustToFile(
              options.file,
              options.metadata
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all-separate -A
          else if (options.allSeparate) {
            verboseMessage(
              'Exporting all circles of trust to separate files...'
            );
            const outcome = await exportCirclesOfTrustToFiles(
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
