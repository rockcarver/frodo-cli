import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo, state } from '@rockcarver/frodo-lib';
import { printMessage, verboseMessage } from '../../utils/Console';
import {
  exportSaml2ProviderToFile,
  exportSaml2ProvidersToFile,
  exportSaml2ProvidersToFiles,
} from '../../ops/Saml2Ops';

const program = new FrodoCommand('frodo saml export');

program
  .description('Export SAML entity providers.')
  .addOption(
    new Option(
      '-i, --entity-id <entity-id>',
      'Entity id. If specified, -a and -A are ignored.'
    )
  )
  .addOption(
    new Option(
      '-f, --file [file]',
      'Name of the file to write the exported provider(s) to. Ignored with -A. If not specified, the export file is named <id>.saml.json.'
    )
  )
  .addOption(
    new Option(
      '-a, --all',
      'Export all the providers in a realm to a single file. Ignored with -t and -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Export all the providers in a realm as separate files <provider name>.saml.json. Ignored with -t, -i, and -a.'
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
      if (options.entityId && (await frodo.login.getTokens())) {
        verboseMessage(
          `Exporting provider "${
            options.entityId
          }" from realm "${state.getRealm()}"...`
        );
        await exportSaml2ProviderToFile(options.entityId, options.file);
      }
      // --all -a
      else if (options.all && (await frodo.login.getTokens())) {
        verboseMessage('Exporting all providers to a single file...');
        await exportSaml2ProvidersToFile(options.file);
      }
      // --all-separate -A
      else if (options.allSeparate && (await frodo.login.getTokens())) {
        verboseMessage('Exporting all providers to separate files...');
        await exportSaml2ProvidersToFiles();
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
