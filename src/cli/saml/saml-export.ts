import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, state } from '@rockcarver/frodo-lib';
import { printMessage, verboseMessage } from '../../utils/Console';
import {
  exportRawSaml2ProvidersToFile,
  exportRawSaml2ProvidersToFiles,
  exportRawSaml2ProviderToFile,
  exportSaml2ProviderToFile,
  exportSaml2ProvidersToFile,
  exportSaml2ProvidersToFiles,
} from '../../ops/Saml2Ops';

const { getTokens } = Authenticate;

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
  .addOption(new Option('--raw', 'Include raw XML in export.'))
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
      if (options.entityId && (await getTokens())) {
        if (!options.raw) {
          verboseMessage(
            `Exporting provider "${
              options.entityId
            }" from realm "${state.getRealm()}"...`
          );
          await exportSaml2ProviderToFile(options.entityId, options.file);
        } else {
          verboseMessage(
            `Exporting raw provider "${
              options.entityId
            }" from realm "${state.getRealm()}"...`
          );
          await exportRawSaml2ProviderToFile(options.entityId, options.file);
        }
      }
      // --all -a
      else if (options.all && (await getTokens())) {
        if (!options.raw) {
          verboseMessage('Exporting all providers to a single file...');
          await exportSaml2ProvidersToFile(options.file);
        } else {
          verboseMessage('Exporting all providers raw to a single file...');
          await exportRawSaml2ProvidersToFile(options.file);
        }
      }
      // --all-separate -A
      else if (options.allSeparate && (await getTokens())) {
        if (!options.raw) {
          verboseMessage('Exporting all providers to separate files...');
          await exportSaml2ProvidersToFiles();
        } else {
          verboseMessage('Exporting all providers raw to separate files...');
          await exportRawSaml2ProvidersToFiles();
        }
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
