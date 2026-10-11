import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  deleteAllEmailTemplates,
  deleteEmailTemplateById,
} from '../../ops/EmailTemplateOps';
import { verboseMessage } from '../../utils/Console.js';
import {
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
import { FrodoCommand } from '../FrodoCommand';

/**
 * The template skeleton type isn't exported from frodo-lib's root; derive
 * it from the read function instead of importing an unexported name.
 */
type EmailTemplateSkeleton = Awaited<
  ReturnType<typeof frodo.email.template.readEmailTemplates>
>[number];

export default function setup() {
  const program = new FrodoCommand('frodo email template delete');

  program
    .description('Delete email templates.')
    .addOption(
      new Option(
        '-i, --template-id <template-id>',
        'Email template id/name. If specified, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all policies in a realm. Ignored with -i.'
      )
    )
    .requireOneOf({ options: ['all', 'templateId'], purpose: 'what to delete' })
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
        // delete by id
        if (options.templateId && (await getTokens())) {
          verboseMessage('Deleting email template...');
          const outcome = await deleteEmailTemplateById(options.templateId);
          if (!outcome) process.exitCode = 1;
        }
        // --all -a, or an interactive pick (resolveEntityPicks is a no-op
        // outside the prompt gate, so a non-interactive run with neither
        // option never reaches deleteAllEmailTemplates here -- same as
        // before Phase 3, where the error branch below handled that case).
        else if (
          (options.all ||
            (await resolveEntityPicks(command, [
              entityPick<EmailTemplateSkeleton>({
                name: 'templateId',
                kind: 'email template',
                load: () => frodo.email.template.readEmailTemplates(false),
                label: (template) =>
                  template._id?.replace('emailTemplate/', '') ?? '',
              }),
            ]))) &&
          (await getTokens())
        ) {
          if (options.templateId) {
            verboseMessage('Deleting email template...');
            const outcome = await deleteEmailTemplateById(options.templateId);
            if (!outcome) process.exitCode = 1;
          } else {
            verboseMessage('Deleting all email templates...');
            const outcome = await deleteAllEmailTemplates();
            if (!outcome) process.exitCode = 1;
          }
        }
        // No branch ran: with requireOneOf satisfied, the only ways here
        // are getTokens() failing (keep the old exit-1 semantics) or the
        // user escaping the entity picker (declined to run).
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
