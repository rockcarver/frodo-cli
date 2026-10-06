import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteEmailTemplates } from '../../../configManagerOps/FrConfigEmailTemplatesOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

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
      new Option(
        '-n, --name <name>',
        'Email template name; deletes only the email template with the specified name.'
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which email templates would be deleted.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all eligible email templates:\n` +
        c.command(
          `  $ frodo config-manager delete email-templates ${s.connId}\n`
        ) +
        `  Delete an email template by name:\n` +
        c.command(
          `  $ frodo config-manager delete email-templates -n 'Example Template' ${s.connId}\n`
        ) +
        `  Preview deletion of an email template by name:\n` +
        c.command(
          `  $ frodo config-manager delete email-templates -n 'Example Template' -d ${s.connId}\n`
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
      if (!(await getTokens(false, true, deploymentTypes))) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Deleting email templates');
      const outcome = await configManagerDeleteEmailTemplates(
        options.name,
        options.dryRun
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
