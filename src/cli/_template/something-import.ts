import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

const { DEPLOYMENT_TYPES } = frodo.utils.constants;

const deploymentTypes = DEPLOYMENT_TYPES;

export default function setup() {
  const program = new FrodoCommand(
    'frodo something import',
    [],
    deploymentTypes
  );

  program
    .description('Import something.')
    .addOption(
      new Option(
        '-i, --something-id <something-id>',
        '[Something] id. If specified, only one [something] is imported and the options -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
    .addOption(
      new Option(
        '-a, --all',
        'Import all [somethings] from single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all [something] from separate files (*.[something].json) in the current directory. Ignored with -i or -a.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Example command one with params and explanation what it does:\n` +
        c.command(
          `  $ frodo something ${s.amBaseUrl} ${s.username} '${s.password}'\n`
        ) +
        `  Example command two with params and explanation what it does:\n` +
        c.command(
          `  $ frodo something --sa-id ${s.saId} --sa-jwk-file ${s.saJwkFile} ${s.amBaseUrl}\n`
        ) +
        `  Example command three with params and explanation what it does:\n` +
        c.command(
          `  $ frodo something --sa-id ${s.saId} --sa-jwk-file ${s.saJwkFile} ${s.connId}\n`
        )
    )
    // Declare which option combinations select what to import. Commands
    // with an "Unrecognized combination of options..." else-branch MUST
    // carry one of these (enforced by src/cli/app.commandWiring.test.ts).
    .requireOneOf({
      options: ['somethingId', 'all', 'allSeparate', 'file'],
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
        if (await getTokens(false, true, deploymentTypes)) {
          // code goes here
        }
        // No branch ran: with requireOneOf satisfied, the only way here is
        // getTokens() failing -- keep the old exit-1 semantics.
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
