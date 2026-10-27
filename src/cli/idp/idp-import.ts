import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  importFirstSocialIdentityProviderFromFile,
  importSocialIdentityProviderFromFile,
  importSocialIdentityProvidersFromFile,
  importSocialIdentityProvidersFromFiles,
} from '../../ops/IdpOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo idp import');

  program
    .description('Import (social) identity providers.')
    .addOption(
      new Option(
        '-i, --idp-id <id>',
        'Provider id. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the file to import the provider(s) from. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all the providers from single file. Cannot be used with -i or -A.'
      ).conflicts(['idpId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all the providers from separate files (*.json) in the current directory. Cannot be used with -i, -f or -a.'
      ).conflicts(['idpId', 'file', 'all'])
    )
    .addOption(
      new Option('--no-deps', 'Do not include any dependencies (scripts).')
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'file', 'idpId'],
      purpose: 'what to import',
    })
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
        // import by id
        if (options.file && options.idpId && (await getTokens())) {
          verboseMessage(
            `Importing provider "${
              options.idpId
            }" into realm "${state.getRealm()}"...`
          );
          const outcome = await importSocialIdentityProviderFromFile(
            options.idpId,
            options.file,
            {
              deps: options.deps,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (options.all && options.file && (await getTokens())) {
          verboseMessage(
            `Importing all providers from a single file (${options.file})...`
          );
          const outcome = await importSocialIdentityProvidersFromFile(
            options.file,
            {
              deps: options.deps,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (options.allSeparate && !options.file && (await getTokens())) {
          verboseMessage(
            'Importing all providers from separate files in current directory...'
          );
          const outcome = await importSocialIdentityProvidersFromFiles({
            deps: options.deps,
          });
          if (!outcome) process.exitCode = 1;
        }
        // import first provider from file
        else if (options.file && (await getTokens())) {
          verboseMessage(
            `Importing first provider from file "${
              options.file
            }" into realm "${state.getRealm()}"...`
          );
          const outcome = await importFirstSocialIdentityProviderFromFile(
            options.file,
            {
              deps: options.deps,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // unrecognized combination of options or no options
        else {
          printMessage('Unrecognized combination of options or no options...');
          process.exitCode = 1;
          program.help();
        }
      }
      // end command logic inside action handler
    );

  return program;
}
