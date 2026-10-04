import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { listFeatures } from '../../ops/FeatureOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  // IDM tenant-configuration features are tenant-wide, not realm-scoped
  // (confirmed via Ping's own docs), so realm is omitted here.
  const program = new FrodoCommand(
    'frodo feature list',
    ['realm'],
    deploymentTypes
  );

  program
    .description('List features.')
    .addOption(new Option('-l, --long', 'Long with all fields.').default(false))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  List features and their install status:\n` +
        c.command(`  $ frodo feature list ${s.amBaseUrl}\n`) +
        `  List features with their installed and available versions:\n` +
        c.command(`  $ frodo feature list --long ${s.connId}\n`)
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
          verboseMessage(`Listing features...`);
          const outcome = await listFeatures(options.long);
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
