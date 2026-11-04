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
    .addOption(
      new Option(
        '-w, --wait',
        'Wait for the dry-run promotion to complete. Times out after 2700 seconds (45 minutes) by default, but can be overridden using --timeout.'
      )
    )
    .addOption(
      new Option(
        '-T, --timeout <seconds>',
        'Specify a timeout in seconds how long the tool should wait for the dry-run promotion to complete. Requires --wait.'
      ).argParser(parseTimeoutSeconds)
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Run a dry-run promotion without waiting for completion:\n` +
        c.command(
          `  $ frodo config-manager promote run-dryrun-promotion ${s.connId}\n`
        ) +
        `  Run a dry-run promotion and wait up to 30 minutes for completion:\n` +
        c.command(
          `  $ frodo config-manager promote run-dryrun-promotion --wait --timeout 1800 ${s.connId}\n`
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
      verboseMessage('Running dry-run promotion...');
      const outcome = await runPromotion({
        dryRun: true,
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
