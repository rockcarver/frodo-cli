import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  importEmailTemplateFromFile,
  importEmailTemplatesFromFile,
  importEmailTemplatesFromFiles,
  importFirstEmailTemplateFromFile,
} from '../../ops/EmailTemplateOps';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  IDM_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  IDM_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo email template import',
    [],
    deploymentTypes
  );

  program
    .description('Import email templates.')
    .addOption(
      new Option(
        '-i, --template-id <template-id>',
        'Email template id/name. If specified, -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the import file.'))
    .addOption(
      new Option(
        '-a, --all',
        'Import all email templates from single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all email templates from separate files (*.template.email.json) in the current directory. Ignored with -i or -a.'
      )
    )
    .addOption(
      new Option(
        '--raw',
        "Import raw email template files. Raw templates do not contain the id/name, therefore when using -A or -f without -i, the email template id/name is parsed from the file name; Make sure your template files are named 'emailTemplate-<id/name>.json' or use -f with -i. Ignored with -a."
      )
    )
    .action(
      // implement program logic inside action handler
      async (host, realm, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );
        // import by id
        if (
          options.file &&
          options.templateId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(`Importing email template "${options.templateId}"...`);
          const outcome = await importEmailTemplateFromFile(
            options.templateId,
            options.file,
            options.raw
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Importing all email templates from a single file (${options.file})...`
          );
          const outcome = await importEmailTemplatesFromFile(options.file);
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (
          options.allSeparate &&
          !options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            'Importing all email templates from separate files (*.template.email.json) in current directory...'
          );
          const outcome = await importEmailTemplatesFromFiles(options.raw);
          if (!outcome) process.exitCode = 1;
        }
        // import first template from file
        else if (
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Importing first email template from file "${options.file}"...`
          );
          const outcome = await importFirstEmailTemplateFromFile(
            options.file,
            options.raw
          );
          if (!outcome) process.exitCode = 1;
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
      // end program logic inside action handler
    );

  return program;
}
