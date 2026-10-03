import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { installFeatureCli } from '../../ops/FeatureOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo feature install',
    ['realm'],
    deploymentTypes
  );

  program
    .description(
      'Install a feature. IRREVERSIBLE: uninstalling or disabling a feature once installed requires contacting Ping support and rolling back the tenant.'
    )
    .addOption(
      new Option('-i, --feature-id <id>', 'Feature id.').makeOptionMandatory()
    )
    .addOption(new Option('-y, --yes', 'Answer y/yes to all prompts.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Install the "${s.featureId}" feature:\n` +
        c.command(
          `  $ frodo feature install -i ${s.featureId} -y ${s.amBaseUrl}\n`
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
          verboseMessage(`Installing feature "${options.featureId}"...`);
          const outcome = await installFeatureCli(
            options.featureId,
            options.yes
          );
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
