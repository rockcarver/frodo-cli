import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { compareExportToDirectory } from '../../ops/PromoteOps';
import { printMessage, verboseMessage } from '../../utils/Console.js';
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
        'This will output the changes that would be made if the promote was run but will not do those changes' +
        '\n' +
        '\n' +
        'frodo promote --yes -M ./master -e ./export [testTenant]\n' +
        '\n' +
        'This will run the promote and, after a journey was deleted, prune every orphaned node of the realm without asking. ' +
        'Without --yes the prune asks on a terminal and is refused when there is no terminal; --no-prune skips the prune.'
    )
    .addOption(
      new Option(
        '-e, --frodo-export-dir <directory>',
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
        '--prompt-prune',
        'Ask before the orphaned nodes are pruned (permanently deleted) after a journey was deleted. This is what happens on a terminal without this option; without a terminal nothing can be asked and the prune is refused unless -y/--yes is given. The prune covers every orphaned node of the realm, not only those of the deleted journey.'
      )
        .default(false, 'false')
        .conflicts(['yes'])
    )
    // the spelling this option had before it worked; kept so that nothing that passes it breaks
    .addOption(new Option('--propmt-prune').hideHelp().conflicts(['yes']))
    .addOption(
      new Option(
        '--no-prune',
        'Do not prune orphaned nodes after a journey was deleted, and do not ask. Without this option, and without -y/--yes, the prune asks on a terminal and is refused when there is no terminal.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask before the orphaned nodes are pruned (permanently deleted) after a journey was deleted. Required for the prune when there is no terminal. The prune covers every orphaned node of the realm, not only those of the deleted journey.'
      ).conflicts(['prune'])
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
      new Option('--no-validate', 'Do not validate journeys during promotion.')
    )
    .addOption(
      new Option(
        '--target <host url>',
        'Host URL of the environment to perform secret value encryption. The URL must resolve to an existing connection profile. Use this option to generate an export that can be imported into the target environment without requiring admin access to the source environment.'
      )
    )
    .multiOp()
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
        // naming the two directories is the part the command line has to do
        if (!options.masterDir || !options.frodoExportDir) {
          printMessage(
            'Need to designate a master dir (-M) and an export dir (-e).',
            'error'
          );
          process.exitCode = 1;
          return;
        }
        if (await getTokens(false, true, deploymentTypes)) {
          verboseMessage('Comparing export...');
          verboseMessage('comparing');
          const outcome = await compareExportToDirectory(
            options.masterDir,
            options.frodoExportDir,
            options.whatIf,
            options.effectSecrets,
            options.waitSecrets,
            // --prompt-prune (and its old spelling) is what happens on a terminal anyway
            Boolean(options.yes),
            // commander stores the negated --no-prune as `prune`, true unless the option was given
            options.prune === false,
            options.printDiff,
            options.validate,
            options.allowFailures
          );
          verboseMessage('done');
          if (!outcome) process.exitCode = 1;
        }
        // a failed login has been reported by getTokens
        else {
          process.exitCode = 1;
        }
      }
      //end command logic inside action handler
      //"/home/trivir/Frodo/golden1-git/identity-cloud-config"
    );

  return program;
}
