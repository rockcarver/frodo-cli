import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  importFirstSaml2ProviderFromFile,
  importSaml2ProviderFromFile,
  importSaml2ProvidersFromFile,
  importSaml2ProvidersFromFiles,
} from '../../ops/Saml2Ops';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo saml import');

  program
    .description('Import SAML entity providers.')
    .addOption(
      new Option(
        '-i, --entity-id <entity-id>',
        'Entity id. If specified, only one provider is imported and the options -a or -A cannot be used.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the file to import the entity provider(s) from.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all entity providers from single file. Cannot be used with -i or -A.'
      ).conflicts(['entityId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all entity providers from separate files (*.saml.json) in the current directory. Cannot be used with -i or -a.'
      ).conflicts(['entityId', 'all'])
    )
    .addOption(
      new Option('--no-deps', 'Do not include any dependencies (scripts).')
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'entityId', 'file'],
      purpose: 'what to import',
    })
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
        // decide what to do from the options alone, so that a failed login is
        // reported as such and not as an unrecognized combination of options
        let task:
          { message: () => string; run: () => Promise<boolean> } | undefined;
        // import by id
        if (options.file && options.entityId) {
          task = {
            message: () =>
              `Importing provider "${
                options.entityId
              }" into realm "${state.getRealm()}"...`,
            run: () =>
              importSaml2ProviderFromFile(options.entityId, options.file, {
                deps: options.deps,
              }),
          };
        }
        // --all -a
        else if (options.all && options.file) {
          task = {
            message: () =>
              `Importing all providers from a single file (${options.file})...`,
            run: () =>
              importSaml2ProvidersFromFile(
                options.file,
                { deps: options.deps },
                options.allowFailures
              ),
          };
        }
        // --all-separate -A
        else if (options.allSeparate && !options.file) {
          task = {
            message: () =>
              'Importing all providers from separate files (*.saml.json) in current directory...',
            run: () =>
              importSaml2ProvidersFromFiles(
                { deps: options.deps },
                options.allowFailures
              ),
          };
        }
        // import first provider from file
        else if (options.file) {
          task = {
            message: () =>
              `Importing first provider from file "${
                options.file
              }" into realm "${state.getRealm()}"...`,
            run: () =>
              importFirstSaml2ProviderFromFile(options.file, {
                deps: options.deps,
              }),
          };
        }
        // unrecognized combination of options or no options
        else {
          printMessage('Unrecognized combination of options or no options...');
          process.exitCode = 1;
          program.help();
          return;
        }
        if (!(await getTokens())) {
          // getTokens has said why
          process.exitCode = 1;
          return;
        }
        verboseMessage(task.message());
        const outcome = await task.run();
        if (!outcome) process.exitCode = 1;
      }
      // end command logic inside action handler
    );

  return program;
}
