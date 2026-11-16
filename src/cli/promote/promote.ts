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

/**
 * The notice a run prints (`Deprecated feature in use: 'frodo promote'. ...`): what the
 * command is and is not, and the replacements. The names are checked against the
 * command tree by test/unit/PromoteDeprecation.test.js, so a rename of one of
 * them fails there.
 */
export const PROMOTE_DEPRECATION_MESSAGE =
  'This command does not run a platform promotion and will be removed in 5.0.0. ' +
  "For the platform's promotion use 'frodo config-manager promote run-promotion'; " +
  "to bring a tenant to a tree of files use 'frodo config import -A -D <master> <connection>' " +
  "(add --static for what a promotion carries) or the 'frodo config-manager push' commands; " +
  "to delete what was removed from a tree use 'frodo config-manager delete <kind> -n <name>'.";

/**
 * `frodo promote` is deprecated and frozen (cli#1263): it compares two local
 * directories of a frodo split export and runs the ordinary import and delete
 * functions for the files that differ. It never calls the platform promotion
 * API, which is `frodo config-manager promote`. It keeps working as it did in
 * 4.x until it is removed in 5.0.0 (decision record 0048: a major release may
 * remove a command); no new options, no new kinds.
 */
export default function setup() {
  const program = new FrodoCommand('promote', [], deploymentTypes);

  program
    .description(
      'Deprecated: this command does not run a platform promotion; use frodo config-manager promote run-promotion. Will be removed in 5.0.0.'
    )
    .withStability('deprecated', undefined, PROMOTE_DEPRECATION_MESSAGE)
    .addHelpText(
      'after',
      'Deprecated: this command compares two local directories of a frodo export (a master export and a current export), ' +
        'imports and deletes the configuration that differs, and can write a file that shows what has changed. ' +
        'It does not run a promotion of Advanced Identity Cloud (lock, dry run, promote, status, reports, rollback, unlock): ' +
        'that is frodo config-manager promote. It will be removed in 5.0.0.\n' +
        '\n' +
        'Replacements:\n' +
        '  the platform promotion:            frodo config-manager promote run-promotion\n' +
        '  bring a tenant to a tree of files: frodo config import -A -D <master> <connection> (add --static for what a promotion carries), or the frodo config-manager push commands\n' +
        '  delete what left the tree:         frodo config-manager delete <kind> -n <name>\n' +
        'No replacement yet: the automatic delete of the files that disappeared from the tree, and the report of the differences.\n' +
        '\n' +
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
        'Without --yes the prune asks on a terminal and is refused when there is no terminal; --no-prune skips the prune.\n' +
        '\n' +
        'Trusted JWT issuers (trustedJwtIssuer/) and CIMD profiles (cimdProfile/) are not carried by promote: ' +
        'use frodo oauth issuer and frodo oauth cimd, or the config-manager commands, for them.'
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
