import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { runPromotion } from '../../../ops/cloud/EnvPromotionOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager promote run-promotion',
    [],
    deploymentTypes
  );

  program
    .description('Run a configuration promotion.')
    .addOption(
      new Option(
        '-i, --ignore-encrypted-secrets',
        'Ignore encrypted secrets during promotion.'
      )
    )
    .addOption(
      new Option('-u, --unlock-after', 'Unlock environments after promotion.')
    )
    .addOption(
      new Option(
        '-p, --promoter <name>',
        'Name of the person performing the promotion.'
      )
    )
    .addOption(
      new Option(
        '-d, --description <description>',
        'Description of the promotion.'
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
        `  Promote the configuration of the lower environment to this one. The request returns as soon as it is accepted; check-promotion-status shows when it is done:\n` +
        c.command(
          `  $ frodo config-manager promote run-promotion ${s.connId}\n`
        ) +
        `  Promote, record who did it and why, and unlock the environments afterwards:\n` +
        c.command(
          `  $ frodo config-manager promote run-promotion --promoter 'Jane Doe' --description 'Release 7' --ticket-reference TKT-1234 --unlock-after ${s.connId}\n`
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
      verboseMessage('Running real promotion...');
      const outcome = await runPromotion({
        dryRun: false,
        ignoreEncryptedSecrets: options.ignoreEncryptedSecrets,
        unlockAfter: options.unlockAfter,
        promoter: options.promoter,
        description: options.description,
        ticketReference: options.ticketReference,
      });
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
