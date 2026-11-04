import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { rollbackPromotion } from '../../../ops/cloud/EnvPromotionOps';
import c from '../../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { parseTimeoutMinutes } from './WaitTimeout';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager promote rollback',
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
        '-p, --promoter <name>',
        'Name of the person performing the rollback.'
      )
    )
    .addOption(
      new Option(
        '-d, --description <description>',
        'Description of the rollback.'
      )
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
        'Wait for the rollback to complete. Times out after 45 minutes by default, but can be overridden using --timeout.'
      )
    )
    .addOption(
      new Option(
        '-T, --timeout <minutes>',
        'How many minutes to wait for the rollback to complete. Requires --wait.'
      ).argParser(parseTimeoutMinutes)
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Roll back the previous promotion without waiting for completion:\n` +
        c.command(`  $ frodo config-manager promote rollback ${s.connId}\n`) +
        `  Roll back the previous promotion and wait up to 60 minutes for completion:\n` +
        c.command(
          `  $ frodo config-manager promote rollback --wait --timeout 60 ${s.connId}\n`
        ) +
        `  Roll back the previous promotion, record who did it and why, and unlock the environments afterwards:\n` +
        c.command(
          `  $ frodo config-manager promote rollback --promoter 'Jane Doe' --description 'Rollback Release 7' --ticket-reference TKT-1234 --unlock-after ${s.connId}\n`
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
      if (options.timeout && !options.wait) {
        printMessage('--timeout requires --wait.', 'error');
        process.exitCode = 1;
        program.help();
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
      });
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
