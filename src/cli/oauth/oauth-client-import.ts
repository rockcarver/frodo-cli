import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  importFirstOAuth2ClientFromFile,
  importOAuth2ClientFromFile,
  importOAuth2ClientsFromFile,
  importOAuth2ClientsFromFiles,
} from '../../ops/OAuth2ClientOps';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo oauth client import');

  program
    .description('Import OAuth2 clients.')
    .addOption(
      new Option(
        '-i, --app-id <id>',
        'Client id. If specified, only one client is imported and the options -a or -A cannot be used.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
    .addOption(
      new Option(
        '-a, --all',
        'Import all clients from single file. Cannot be used with -i.'
      ).conflicts(['appId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all clients from separate files (*.app.json) in the current directory. Cannot be used with -i or -a.'
      ).conflicts(['appId', 'all'])
    )
    .addOption(
      new Option('--no-deps', 'Do not include any dependencies (scripts).')
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'appId', 'file'],
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
        if (options.file && options.appId) {
          task = {
            message: () => `Importing OAuth2 client "${options.appId}"...`,
            run: () =>
              importOAuth2ClientFromFile(options.appId, options.file, {
                deps: options.deps,
              }),
          };
        }
        // --all -a
        else if (options.all && options.file) {
          task = {
            message: () =>
              `Importing all OAuth2 clients from a single file (${options.file})...`,
            run: () =>
              importOAuth2ClientsFromFile(
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
              'Importing all OAuth2 clients from separate files in current directory...',
            run: () =>
              importOAuth2ClientsFromFiles(
                { deps: options.deps },
                options.allowFailures
              ),
          };
        }
        // import first client from file
        else if (options.file) {
          task = {
            message: () =>
              `Importing first OAuth2 client from file "${options.file}"...`,
            run: () =>
              importFirstOAuth2ClientFromFile(options.file, {
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
