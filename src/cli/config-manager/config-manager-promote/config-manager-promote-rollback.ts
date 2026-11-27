import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { rollbackPromotion } from '../../../ops/cloud/EnvPromotionOps';
import { checkProceed } from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { parseTimeoutSeconds } from './WaitTimeout';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config promote rollback',
    [],
    deploymentTypes
  );
  program
    .description('Roll back the previous promotion.')
    .addOption(
      new Option(
        '-u, --unlock-after',
        'Unlock environments after the rollback.'
      )
    )
    .addOption(
      new Option(
        '-P, --promoter <name>',
        'Name of the person performing the rollback.'
      )
    )
    .addOption(
      new Option('--description <description>', 'Description of the rollback.')
    )
    .addOption(
      new Option(
        '-t, --ticket-reference <reference>',
        'Zendesk ticket reference.'
      )
    )
    .addOption(
      new Option(
        '-w, --wait',
        'Wait for the rollback to complete. Times out after 2700 seconds (45 minutes) by default, but can be overridden using --timeout.'
      )
    )
    .addOption(
      new Option(
        '-T, --timeout <seconds>',
        'Specify a timeout in seconds how long the tool should wait for the rollback to complete. Requires --wait or --full.'
      ).argParser(parseTimeoutSeconds)
    )
    .addOption(
      new Option(
        '--full',
        'Lock both environments, roll back the previous promotion, wait for the rollback and unlock the environments again, in one command. Implies --wait and --unlock-after. It starts only when both environments are unlocked. If the command is stopped while it runs (Ctrl-C), the lock stays; the command has printed how to find it and how to release it. --timeout bounds the rollback only: a rollback that is still running when the wait ends keeps the lock on purpose, and the command says how to release it. Missing ESVs are listed.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before the rollback starts. Required when there is no terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Roll back the previous promotion without waiting for completion:\n` +
        c.command(`  $ frodo config promote rollback --yes ${s.connId}\n`) +
        `  Roll back the previous promotion and wait up to 30 minutes for completion:\n` +
        c.command(
          `  $ frodo config promote rollback --wait --timeout 1800 --yes ${s.connId}\n`
        ) +
        `  Roll back the previous promotion, record who did it and why, and unlock the environments afterwards:\n` +
        c.command(
          `  $ frodo config promote rollback --promoter 'Jane Doe' --description 'Rollback Release 7' --ticket-reference TKT-1234 --unlock-after --yes ${s.connId}\n`
        ) +
        `  Lock both environments, roll back the previous promotion, wait for the rollback and unlock the environments again, in one command:\n` +
        c.command(
          `  $ frodo config promote rollback --full --yes ${s.connId}\n`
        )
    )
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      if (options.timeout && !options.wait && !options.full) {
        printMessage('--timeout requires --wait or --full.', 'error');
        process.exitCode = 1;
        program.help();
      }
      // refused before the login, which a refused run does not need
      if (
        !checkProceed({
          what: 'roll back the previous promotion',
          yes: options.yes,
          dryRunAvailable: false,
        })
      ) {
        process.exitCode = 1;
        return;
      }
      const getTokensIsSuccessful = await getTokens(
        false,
        true,
        deploymentTypes
      );
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Rolling back promotion.');
      const outcome = await rollbackPromotion({
        promoter: options.promoter,
        description: options.description,
        ticketReference: options.ticketReference,
        unlockAfter: options.unlockAfter,
        wait: options.wait,
        timeout: options.timeout,
        full: options.full,
        yes: options.yes,
      });
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
