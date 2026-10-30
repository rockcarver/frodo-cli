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
    'frodo config-manager promote run-dryrun-promotion',
    [],
    deploymentTypes
  );

  program
    .description(
      'Run a dry-run configuration promotion without applying changes.'
    )
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
        `  Run a dry-run promotion: it checks what a promotion would do and applies nothing. The request returns as soon as it is accepted; check-promotion-status shows when it is done:\n` +
        c.command(
          `  $ frodo config-manager promote run-dryrun-promotion ${s.connId}\n`
        ) +
        `  Run a dry-run promotion that ignores encrypted secrets:\n` +
        c.command(
          `  $ frodo config-manager promote run-dryrun-promotion --ignore-encrypted-secrets ${s.connId}\n`
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
      verboseMessage('Running dry-run promotion...');
      const outcome = await runPromotion({
        dryRun: true,
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
