import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { validateFeature } from '../../ops/FeatureOps';
import {
  checkRepairBeforeLogin,
  repairFeature,
  repairOptionsProblem,
} from '../../ops/FeatureRepairOps';
import c from '../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../utils/Console';
import { parseSeconds } from '../../utils/SecondsOption';
import { FrodoCommand } from '../FrodoCommand';
import { backupDirectoryQuestion } from './BackupDirectoryQuestion';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo feature validate',
    ['realm'],
    deploymentTypes
  );

  program
    .description(
      'Validate whether a feature is installable, diagnose it, and repair what is wrong with --repair.'
    )
    .addOption(
      new Option('-i, --feature-id <id>', 'Feature id.').makeOptionMandatory()
    )
    .addOption(
      new Option(
        '--json',
        'Print the diagnosis as JSON and nothing else. Cannot be used with --repair.'
      ).conflicts(['repair'])
    )
    .addOption(
      new Option(
        '--repair',
        'Repair what the diagnosis found repairable. A backup of what the repair overwrites or deletes is written first. Cannot be used with --json.'
      ).conflicts(['json'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before the repair. Requires --repair.'
      )
    )
    .addOption(
      new Option(
        '--backup-dir <dir>',
        'Directory for the raw backup of what the repair overwrites or deletes, written before the first change and created if it does not exist; relative to the current directory, readable by the owner only. Required with --repair: asked for on a terminal, an error without one.'
      )
    )
    .addOption(
      new Option(
        '--restore-customizations',
        'Put the customizations of the feature (a changed title of a definition, an added mapping property) back after the repair. Without it the repair leaves every definition aligned with the original, so that the registry reads the feature installed: the plan lists the customizations it replaces, and their previous values are in the backup. White space is never put back. Requires --repair.'
      )
    )
    .addOption(
      new Option(
        '--auth-service <name>',
        'Authentication service of an OAuth 2.0 provider that the repair creates or completes. Default: Login. Requires --repair.'
      )
    )
    .addOption(
      new Option(
        '--wait',
        'After the enable action, wait until AM opens the gate and return as soon as it is open. Without it the repair ends when the writes are done and says to validate again after a few minutes. Requires --repair.'
      )
    )
    .addOption(
      new Option(
        '--timeout <seconds>',
        'How long --wait polls, in seconds. Default: 1200 (20 minutes). Requires --wait.'
      ).argParser(parseSeconds)
    )
    .addHelpText(
      'after',
      `Without --repair the exit code is 0 when the check ran and found no functional problem (warnings do not count) and 1 when it found one; with --repair it is 0 when every step of the repair succeeded and 1 when a step failed or, with --wait, when the gate is not open at the timeout. For a feature that cannot be diagnosed nothing is printed beyond the validation and the exit code is 0.\n\n` +
        `Usage Examples:\n` +
        `  Validate whether the "${s.featureId}" feature is installable:\n` +
        c.command(
          `  $ frodo feature validate -i ${s.featureId} ${s.amBaseUrl}\n`
        ) +
        `  Print the diagnosis of the "${s.repairableFeatureId}" feature as JSON:\n` +
        c.command(
          `  $ frodo feature validate -i ${s.repairableFeatureId} --json ${s.amBaseUrl}\n`
        ) +
        `  Repair the "${s.repairableFeatureId}" feature, backing up first and not asking:\n` +
        c.command(
          `  $ frodo feature validate -i ${s.repairableFeatureId} --repair --backup-dir ${s.featureBackupDirectory} -y ${s.amBaseUrl}\n`
        ) +
        `  Repair it and wait up to 10 minutes for AM to open the gate:\n` +
        c.command(
          `  $ frodo feature validate -i ${s.repairableFeatureId} --repair --backup-dir ${s.featureBackupDirectory} --wait --timeout 600 -y ${s.amBaseUrl}\n`
        ) +
        `  Repair it and put the customizations (a changed title, an added mapping property) back afterwards:\n` +
        c.command(
          `  $ frodo feature validate -i ${s.repairableFeatureId} --repair --backup-dir ${s.featureBackupDirectory} --restore-customizations -y ${s.amBaseUrl}\n`
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
        const repairOptions = {
          yes: options.yes,
          backupDir: options.backupDir,
          restoreCustomizations: options.restoreCustomizations,
          authService: options.authService,
          wait: options.wait,
          timeoutSeconds: options.timeout,
        };
        // what needs no tenant is checked before the login (record 0037)
        const problem = repairOptionsProblem({
          ...repairOptions,
          repair: options.repair,
        });
        if (problem) {
          printMessage(problem, 'error');
          process.exitCode = 1;
          return;
        }
        if (
          options.repair &&
          !checkRepairBeforeLogin(options.featureId, repairOptions)
        ) {
          process.exitCode = 1;
          return;
        }
        if (await getTokens(false, true, deploymentTypes)) {
          let outcome: boolean;
          if (options.repair) {
            verboseMessage(`Repairing feature "${options.featureId}"...`);
            outcome = await repairFeature(options.featureId, {
              ...repairOptions,
              askBackupDir: backupDirectoryQuestion(command),
            });
          } else {
            verboseMessage(`Validating feature "${options.featureId}"...`);
            outcome = await validateFeature(options.featureId, {
              json: options.json,
            });
          }
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
