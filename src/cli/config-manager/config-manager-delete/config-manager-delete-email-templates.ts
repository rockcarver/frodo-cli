import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteEmailTemplates } from '../../../configManagerOps/FrConfigEmailTemplatesOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager delete email-templates',
    [],
    deploymentTypes
  );

  program
    .description('Delete email template objects.')
    .addOption(
      selectorOption(
        '-i, --template-id <id>',
        'Email template id; deletes only the email template with the specified id.',
        ['-n', '--name']
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which email templates would be deleted.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting more than one email template (no -i). Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all email templates without asking, which is required without a terminal (without -y a terminal is asked first):\n` +
        c.command(
          `  $ frodo config-manager delete email-templates -y ${s.connId}\n`
        ) +
        `  Preview the deletion of all email templates:\n` +
        c.command(
          `  $ frodo config-manager delete email-templates -d ${s.connId}\n`
        ) +
        `  Delete an email template by id:\n` +
        c.command(
          `  $ frodo config-manager delete email-templates -i welcome ${s.connId}\n`
        ) +
        `  Preview deletion of an email template by id:\n` +
        c.command(
          `  $ frodo config-manager delete email-templates -i welcome -d ${s.connId}\n`
        )
    )
    .multiOp()
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      const named = options.templateId !== undefined;
      // a run that nobody can be asked about is refused before the login
      const what = 'all email templates';
      if (
        !named &&
        !checkBulkDelete({ what, yes: options.yes, dryRun: options.dryRun })
      ) {
        process.exitCode = 1;
        return;
      }
      if (!(await getTokens(false, true, deploymentTypes))) {
        process.exitCode = 1;
        return;
      }
      if (
        !named &&
        !(await confirmBulkDelete({
          what,
          yes: options.yes,
          dryRun: options.dryRun,
          showPlan: () => configManagerDeleteEmailTemplates(undefined, true),
        }))
      ) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Deleting email templates');
      const outcome = await configManagerDeleteEmailTemplates(
        options.templateId,
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
