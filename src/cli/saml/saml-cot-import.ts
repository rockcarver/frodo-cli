import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  importCircleOfTrustFromFile,
  importCirclesOfTrustFromFile,
  importCirclesOfTrustFromFiles,
  importFirstCircleOfTrustFromFile,
} from '../../ops/CirclesOfTrustOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo saml cot import');

  program
    .description('Import SAML circles of trust.')
    .addOption(
      new Option(
        '-i, --cot-id <cot-id>',
        'Circle of trust id. If specified, only one circle of trust is imported and the options -a or -A cannot be used.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the file to import the circle(s) of trust from.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all circles of trust from single file. Cannot be used with -i or -A.'
      ).conflicts(['cotId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all circles of trust from separate files (*.cot.saml.json) in the current directory. Cannot be used with -i or -a.'
      ).conflicts(['cotId', 'all'])
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'cotId', 'file'],
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
        if (options.file && options.cotId) {
          task = {
            message: () =>
              `Importing circle of trust "${
                options.cotId
              }" into realm "${state.getRealm()}"...`,
            run: () => importCircleOfTrustFromFile(options.cotId, options.file),
          };
        }
        // --all -a
        else if (options.all && options.file) {
          task = {
            message: () =>
              `Importing all circles of trust from a single file (${options.file})...`,
            run: () =>
              importCirclesOfTrustFromFile(options.file, options.allowFailures),
          };
        }
        // --all-separate -A
        else if (options.allSeparate && !options.file) {
          task = {
            message: () =>
              'Importing all circles of trust from separate files (*.saml.json) in current directory...',
            run: () => importCirclesOfTrustFromFiles(options.allowFailures),
          };
        }
        // import first from file
        else if (options.file) {
          task = {
            message: () =>
              `Importing first circle of trust from file "${
                options.file
              }" into realm "${state.getRealm()}"...`,
            run: () => importFirstCircleOfTrustFromFile(options.file),
          };
        }
        // unrecognized combination of options or no options
        else {
          printMessage(
            'Unrecognized combination of options or no options...',
            'error'
          );
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
