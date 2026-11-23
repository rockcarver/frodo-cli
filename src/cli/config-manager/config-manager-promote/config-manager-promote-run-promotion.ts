import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { runPromotion } from '../../../ops/cloud/EnvPromotionOps';
import { checkProceed } from '../../../utils/BulkDeleteGuard';
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
        '-I, --ignore-encrypted-secrets',
        'Ignore encrypted secrets during promotion.'
      )
    )
    .addOption(
      new Option('-u, --unlock-after', 'Unlock environments after promotion.')
    )
    .addOption(
      new Option(
        '-P, --promoter <name>',
        'Name of the person performing the promotion.'
      )
    )
    .addOption(
      new Option('--description <description>', 'Description of the promotion.')
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
        'Specify a timeout in seconds how long the tool should wait for the promotion to complete. Requires --wait or --full.'
      ).argParser(parseTimeoutSeconds)
    )
    .addOption(
      new Option(
        '--full',
        'Lock both environments, run the promotion, wait for it and unlock the environments again, in one command. Implies --wait and --unlock-after. It starts only when both environments are unlocked. If the command is stopped while it runs (Ctrl-C), the lock stays; the command has printed its id and how to release it. --timeout bounds the promotion only: a promotion that is still running when the wait ends keeps the lock on purpose, and the command says how to release it. Missing ESVs are listed. Encrypted secrets are asked about at a terminal; --ignore-encrypted-secrets answers that in advance, and --yes does not.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before the promotion starts. Required when there is no terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Promote the configuration of the lower environment to this one without waiting for completion:\n` +
        c.command(
          `  $ frodo config-manager promote run-promotion --yes ${s.connId}\n`
        ) +
        `  Promote and wait up to 30 minutes for completion:\n` +
        c.command(
          `  $ frodo config-manager promote run-promotion --wait --timeout 1800 --yes ${s.connId}\n`
        ) +
        `  Promote, record who did it and why, and unlock the environments afterwards:\n` +
        c.command(
          `  $ frodo config-manager promote run-promotion --promoter 'Jane Doe' --description 'Release 7' --ticket-reference TKT-1234 --unlock-after --yes ${s.connId}\n`
        ) +
        `  Lock both environments, promote, wait for the promotion and unlock the environments again, in one command:\n` +
        c.command(
          `  $ frodo config-manager promote run-promotion --full --yes ${s.connId}\n`
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
          what: 'run a promotion',
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
        full: options.full,
        yes: options.yes,
      });
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
