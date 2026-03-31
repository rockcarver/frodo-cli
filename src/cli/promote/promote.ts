import { frodo, FrodoError } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { compareExportToDirectory } from '../../ops/PromoteOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('promote', [], deploymentTypes);

  program
    .description('Prepares a tenant to be promoted')
    .addHelpText(
      'after',
      'This is used to compare two directories and automatically import and delete' +
        'configurations so the tenant can be promoted. It will compare a master export to a current export' +
        'and make the changes based off that diff. A file will be generated to show what has changed. \n' +
        `Usage Examples:\n` +
        '\n' +
        'frodo promote -M ./master -E ./export [testTenant]\n' +
        '\n' +
        'This will run the promote command making the changes from master to the export, with the master being the one we are going to.' +
        '\n' +
        '\n' +
        'frodo promote --what-if -M ./master -E ./export [testTenant]\n' +
        '\n' +
        'This will output the changes that would be made if the promote was run but will not do those changes'
    )
    .addOption(
      new Option(
        '-E, --frodo-export-dir <directory>',
        'The directory where the frodo export is located.'
      )
    )
    .addOption(
      new Option(
        '--what-if',
        'Runs a what if of the comparison, so it wont do any changes'
      ).default(false, 'false')
    )
    .addOption(
      new Option(
        '-M, --master-dir <directory>',
        'The directory where the master configurations is located.'
      )
    )
    .addOption(
      new Option(
        '--propmt-prune',
        'Will prompt for Frodo Journey Prune on all realms'
      ).default(false, 'false')
    )
    .addOption(
      new Option('--no-prune', 'Will stop prune from running').default(
        false,
        'false'
      )
    )
    .addOption(
      new Option(
        '-S --effect-secrets',
        'Will effect the secrets, otherwise we will not change the secrets but will compare them'
      ).default(false, 'false')
    )
    .addOption(
      new Option(
        '-W --wait-secrets',
        'When secrets are effected we need to run a refresh on the enviornment. This will cause the command to wait until the refresh is finished.'
      ).default(false, 'false')
    )
    .addOption(
      new Option(
        '-P --print-diff',
        'Outputs the diff to a file in the directory where the command was run.'
      ).default(false, 'false')
    )
    .addOption(
      new Option(
        '--target <host url>',
        'Host URL of the environment to perform secret value encryption. The URL must resolve to an existing connection profile. Use this option to generate an export that can be imported into the target environment without requiring admin access to the source environment.'
      )
    )
    .action(
      async (host, realm, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );
        if (
          (await getTokens(false, true, deploymentTypes)) &&
          options.masterDir &&
          options.frodoExportDir
        ) {
          verboseMessage('Comparing export...');
          verboseMessage('comparing');
          const outcome = await compareExportToDirectory(
            options.masterDir,
            options.frodoExportDir,
            options.whatIf,
            options.effectSecrets,
            options.waitSecrets,
            options.promptPrune,
            options.noPrune,
            options.printDiff
          );
          verboseMessage('done');
          if (!outcome) process.exitCode = 1;
        } else {
          new FrodoError('need to designate a master dir and export directory');
        }
      }
      //end command logic inside action handler
      //"/home/trivir/Frodo/golden1-git/identity-cloud-config"
    );

  return program;
}
