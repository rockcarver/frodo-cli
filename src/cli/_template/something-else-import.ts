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
    'frodo something else import',
    [],
    deploymentTypes
  );

  program
    .description('Import something else.')
    .addOption(
      new Option(
        '-i, --else-id <else-id>',
        '[Else] id. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the file to import. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all [else] from single file. Cannot be used with -i or -A.'
      ).conflicts(['elseId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all [else] from separate files (*.[else].json) in the current directory. Cannot be used with -i, -f or -a.'
      ).conflicts(['elseId', 'file', 'all'])
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
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
