import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { describeFeature } from '../../ops/FeatureOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo feature describe',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Describe feature.')
    .addOption(
      new Option('-i, --feature-id <id>', 'Feature id.').makeOptionMandatory()
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Describe the "${s.featureId}" feature:\n` +
        c.command(
          `  $ frodo feature describe -i ${s.featureId} ${s.amBaseUrl}\n`
        )
    )
    .action(
      // implement command logic inside action handler
      async (host, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          user,
          password,
          options,
          command
        );
        if (await getTokens(false, true, deploymentTypes)) {
          verboseMessage(`Describing feature "${options.featureId}"...`);
          const outcome = await describeFeature(options.featureId);
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
