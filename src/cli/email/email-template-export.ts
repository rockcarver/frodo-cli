import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo, state } from '@rockcarver/frodo-lib';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import {
  exportEmailTemplateToFile,
  exportEmailTemplatesToFile,
  exportEmailTemplatesToFiles,
} from '../../ops/EmailTemplateOps';

const program = new FrodoCommand('frodo email template export');

program
  .description('Export email templates.')
  .addOption(
    new Option(
      '-i, --template-id <template-id>',
      'Email template id/name. If specified, -a and -A are ignored.'
    )
  )
  .addOption(
    new Option(
      '-f, --file [file]',
      'Name of the export file. Ignored with -A. Defaults to <template-id>.template.email.json.'
    )
  )
  .addOption(
    new Option(
      '-a, --all',
      'Export all email templates to a single file. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Export all email templates as separate files <template-id>.template.email.json. Ignored with -i, and -a.'
    )
  )
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
      // export by id/name
      if (options.templateId && (await frodo.login.getTokens())) {
        verboseMessage(
          `Exporting email template "${
            options.templateId
          }" from realm "${state.getRealm()}"...`
        );
        exportEmailTemplateToFile(options.templateId, options.file);
      }
      // --all -a
      else if (options.all && (await frodo.login.getTokens())) {
        verboseMessage('Exporting all email templates to a single file...');
        exportEmailTemplatesToFile(options.file);
      }
      // --all-separate -A
      else if (options.allSeparate && (await frodo.login.getTokens())) {
        verboseMessage('Exporting all email templates to separate files...');
        exportEmailTemplatesToFiles();
      }
      // unrecognized combination of options or no options
      else {
        printMessage(
          'Unrecognized combination of options or no options...',
          'error'
        );
        program.help();
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
