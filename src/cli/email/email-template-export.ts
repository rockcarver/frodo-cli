import { Command, Option } from 'commander';
import { Authenticate, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import {
  exportEmailTemplateToFile,
  exportEmailTemplatesToFile,
  exportEmailTemplatesToFiles,
} from '../../ops/EmailTemplateOps';

const { getTokens } = Authenticate;

const program = new Command('frodo email template export');

program
  .description('Export email templates.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(common.verboseOption)
  .addOption(common.debugOption)
  .addOption(common.curlirizeOption)
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
    async (host, realm, user, password, options) => {
      state.default.session.setTenant(host);
      state.default.session.setRealm(realm);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      state.default.session.setCurlirize(options.curlirize);
      // export by id/name
      if (options.templateId && (await getTokens())) {
        verboseMessage(
          `Exporting email template "${
            options.templateId
          }" from realm "${state.default.session.getRealm()}"...`
        );
        exportEmailTemplateToFile(options.templateId, options.file);
      }
      // --all -a
      else if (options.all && (await getTokens())) {
        verboseMessage('Exporting all email templates to a single file...');
        exportEmailTemplatesToFile(options.file);
      }
      // --all-separate -A
      else if (options.allSeparate && (await getTokens())) {
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
      }
    }
    // end command logic inside action handler
  );

program.parse();
