import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { runPromotion } from '../../../ops/cloud/EnvPromotionOps';
import c from '../../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { parseTimeoutSeconds } from './WaitTimeout';

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
    .addOption(
      new Option(
        '-w, --wait',
        'Wait for the promotion to complete. Times out after 2700 seconds (45 minutes) by default, but can be overridden using --timeout.'
      )
    )
    .addOption(
      new Option(
        '-T, --timeout <seconds>',
        'Specify a timeout in seconds how long the tool should wait for the promotion to complete. Requires --wait.'
      ).argParser(parseTimeoutSeconds)
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Promote the configuration of the lower environment to this one without waiting for completion:\n` +
        c.command(
          `  $ frodo config-manager promote run-promotion ${s.connId}\n`
        ) +
        `  Promote and wait up to 30 minutes for completion:\n` +
        c.command(
          `  $ frodo config-manager promote run-promotion --wait --timeout 1800 ${s.connId}\n`
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
      verboseMessage('Running real promotion...');
      const outcome = await runPromotion({
        dryRun: false,
        ignoreEncryptedSecrets: options.ignoreEncryptedSecrets,
        unlockAfter: options.unlockAfter,
        promoter: options.promoter,
        description: options.description,
        ticketReference: options.ticketReference,
        wait: options.wait,
        timeout: options.timeout,
      });
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
