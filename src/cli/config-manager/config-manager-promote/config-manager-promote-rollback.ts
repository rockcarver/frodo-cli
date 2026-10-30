import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { rollbackPromotion } from '../../../ops/cloud/EnvPromotionOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

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
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Roll back the previous promotion. The request returns as soon as it is accepted; check-promotion-status shows when it is done:\n` +
        c.command(`  $ frodo config-manager promote rollback ${s.connId}\n`) +
        `  Roll back, record who did it and why, and unlock the environments afterwards:\n` +
        c.command(
          `  $ frodo config-manager promote rollback --promoter 'Jane Doe' --description 'Revert release 7' --ticket-reference TKT-1234 --unlock-after ${s.connId}\n`
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
      });
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
