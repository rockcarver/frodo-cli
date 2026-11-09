import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  deleteAllEmailTemplates,
  deleteEmailTemplateById,
} from '../../ops/EmailTemplateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo email template delete');

  program
    .description('Delete email templates.')
    .addOption(
      new Option(
        '-i, --template-id <template-id>',
        'Email template id/name. Cannot be used with -a'
      ).conflicts(['all'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all policies in a realm. Cannot be used with -i.'
      ).conflicts(['templateId'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all email templates. Required with -a when there is no terminal.'
      )
    )
    .requireOneOf({ options: ['all', 'templateId'], purpose: 'what to delete' })
    .multiOp()
    .action(
      // implement command logic inside action handler
      async (host, realm, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );
        // a run that nobody can be asked about is refused before the login
        // (cli record 0037)
        if (
          options.all &&
          !checkBulkDelete({
            what: 'all email templates',
            yes: options.yes,
            dryRunAvailable: false,
          })
        ) {
          process.exitCode = 1;
          return;
        }
        // On a terminal the framework offers an email template to pick, after
        // the login, when -i was left out (cli record 0038). A failed login, a
        // declined pick and a failed read all stop here.
        if (!(await getTokens())) {
          process.exitCode = 1;
          return;
        }
        // delete by id
        if (options.templateId) {
          verboseMessage('Deleting email template...');
          const outcome = await deleteEmailTemplateById(options.templateId);
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (options.all) {
          if (
            !(await confirmBulkDelete({
              what: 'all email templates',
              yes: options.yes,
              dryRunAvailable: false,
            }))
          ) {
            process.exitCode = 1;
            return;
          }
          verboseMessage('Deleting all email templates...');
          const outcome = await deleteAllEmailTemplates(options.allowFailures);
          if (!outcome) process.exitCode = 1;
        } else {
          // an empty list leaves nothing to pick from
          printMessage('No email templates found to delete.');
        }
      }
      // end command logic inside action handler
    );

  return program;
}
