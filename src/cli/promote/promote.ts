import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { verboseMessage } from '../../utils/Console.js';
import { compareExportToDirectory } from '../../ops/PromoteOps';

const deploymentTypes = ['cloud'];

export default function setup() {
  const program = new FrodoCommand('promote')

  program
    .description(
      'Run a frodo config export -NdxD [host] [realm] command, compare that to a '
      + 'master directory and output the changes'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  No good help at the moment.\n`
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .addOption(
      new Option(
        '-x, --extract',
        'Extract scripts from the exported file, and save it to a separate file. Ignored with -a.'
      )
    )
    .addOption(
      new Option(
        '-d, --default',
        'Export all scripts including the default scripts.'
      )
    )
    .addOption(
      new Option(
        '--target <host url>',
        'Host URL of the environment to perform secret value encryption. The URL must resolve to an existing connection profile. Use this option to generate an export that can be imported into the target environment without requiring admin access to the source environment.'
      )
    )
    .action(
      async(host, realm, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );
        if (await getTokens(false, true, deploymentTypes)) {
          verboseMessage('Comparing export...');
          console.log("comparing")
          console.log()
          const outcome = await compareExportToDirectory(
            {
              useStringArrays: false,
              noDecode: false,
              coords: options.coords,
              includeDefault: options.default,
              includeActiveValues: true,
              target: options.target,
            },
            "/home/trivir/Frodo/golden1-git/identity-cloud-config",
          );
          console.log("done")
          if (!outcome) process.exitCode = 1;
        }
      }
      //end command logic inside action handler
    );

  return program;
}