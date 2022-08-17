import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';
import {
  AuthenticateOps,
  EmailTemplateOps,
  state,
} from '@rockcarver/frodo-lib';

const { getTokens } = AuthenticateOps;
const {
  importEmailTemplateFromFile,
  importEmailTemplatesFromFile,
  importEmailTemplatesFromFiles,
  importFirstEmailTemplateFromFile,
} = EmailTemplateOps;

const program = new Command('frodo email template import');

program
  .description('Import email templates.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
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
  .action(
    // implement program logic inside action handler
    async (host, realm, user, password, options) => {
      state.default.session.setTenant(host);
      state.default.session.setRealm(realm);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      if (await getTokens()) {
        // import by id
        if (options.file && options.templateId) {
          console.log(`Importing email template "${options.templateId}"...`);
          importEmailTemplateFromFile(options.templateId, options.file);
        }
        // --all -a
        else if (options.all && options.file) {
          console.log(
            `Importing all email templates from a single file (${options.file})...`
          );
          importEmailTemplatesFromFile(options.file);
        }
        // --all-separate -A
        else if (options.allSeparate && !options.file) {
          console.log(
            'Importing all email templates from separate files (*.template.email.json) in current directory...'
          );
          importEmailTemplatesFromFiles();
        }
        // import first template from file
        else if (options.file) {
          console.log(
            `Importing first email template from file "${options.file}"...`
          );
          importFirstEmailTemplateFromFile(options.file);
        }
        // unrecognized combination of options or no options
        else {
          console.log('Unrecognized combination of options or no options...');
          program.help();
        }
      }
    }
    // end program logic inside action handler
  );

program.parse();
