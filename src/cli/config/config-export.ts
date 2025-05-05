import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportEverythingToFile,
  exportEverythingToFiles,
} from '../../ops/ConfigOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
  IDM_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
  IDM_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo config export', [], deploymentTypes);

  program
    .description(
      `Export full cloud configuration.\n` +
        `By default, it only exports importable config (i.e. config that is not read-only) for the current deployment (e.g. if exporting from cloud, realm config would NOT be exported since it can't be imported back into cloud even though it can be imported into classic deployments). There is a flag to export all config including read only config.\n` +
        `Additionally, there is a flag to export config for only the specified realm, a flag to export only global config, and many other flags to customize the export. Use the -h or --help to see them all and to also see usage examples.`
    )
    .addOption(new Option('-f, --file <file>', 'Name of the export file.'))
    .addOption(new Option('-a, --all', 'Export everything to a single file.'))
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export everything to separate files in the -D directory. Ignored with -a.'
      )
    )
    .addOption(
      new Option(
        '--use-string-arrays',
        'Where applicable, use string arrays to store multi-line text (e.g. scripts).'
      ).default(false, 'off')
    )
    .addOption(
      new Option(
        '--no-decode',
        'Do not include decoded variable value in variable export'
      ).default(false, 'false')
    )
    .addOption(
      new Option(
        '-x, --extract',
        'Extract scripts and server properties from the exported file, and save it to a separate file. Ignored with -a.'
      )
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .addOption(
      new Option(
        '--no-coords',
        'Do not include the x and y coordinate positions of the journey/tree nodes.'
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
        '-R, --read-only',
        'Export read-only config (with the exception of default scripts) in addition to the importable config.'
      )
    )
    .addOption(
      new Option(
        '-r, --realm-only',
        'Export only the config for the active realm. If -g, --global-only is also active, then the global config will also be exported.'
      )
    )
    .addOption(
      new Option(
        '-g, --global-only',
        'Export only the global config. If -r, --realm-only is also active, then the corresponding active realm config will also be exported.'
      )
    )
    .addOption(
      new Option(
        '-s, --separate-mappings',
        'Export sync.idm.json mappings separately in their own directory. Ignored with -a.'
      )
    )
    .addOption(
      new Option(
        '-o, --separate-objects',
        'Export managed.idm.json objects separately in their own directory. Ignored with -a.'
      )
    )
    .addOption(
      new Option(
        '--include-active-values',
        'Include the currently active (and loaded) secret value in the export. By default, secret values are encrypted server-side in the environment they are exported from. Use --target <host url> to have another environment perform the encryption.'
      )
    )
    .addOption(
      new Option(
        '--target <host url>',
        'Host URL of the environment to perform secret value encryption. The URL must resolve to an existing connection profile. Use this option to generate an export that can be imported into the target environment without requiring admin access to the source environment.'
      )
    )
    .addHelpText(
      'after',
      `How Frodo handles secrets:\n`['brightGreen'] +
        `  Frodo supports exporting and importing of ESV secret values. To leave stuartship of secret values with the cloud environment where they belong, frodo always encrypts values using either encryption keys from the source environment (default) or the target environment (--target parameter). Frodo never exports secrets in the clear.\n\n`[
          'brightGreen'
        ] +
        `Usage Examples:\n` +
        `  Export global and realm configuration for version control (e.g. Git) into the current directory.\n` +
        `  Note that -x and -s separates script and mapping config to better track changes made to them, and -N removes metadata since it changes every export (you may consider using --no-coords as well if you don't care to track node positions in journeys):\n` +
        `  $ frodo config export -sxAND . ${s.connId}\n`['brightCyan'] +
        `  Export global and realm configuration from cloud to be later imported into a classic, on-prem deployment.\n` +
        `  Note -dR is used for exporting all read-only config from cloud since certain cloud read-only config (like the realm config) can be imported into a classic on-prem deployment:\n` +
        `  $ frodo config export -adR ${s.connId}\n`['brightCyan'] +
        `  Export only the bravo realm configuration:\n` +
        `  $ frodo config export -ar ${s.connId} bravo\n`['brightCyan'] +
        `  Backup global and realm configuration including active secret values to a single file (Note: only values of active and loaded secrets can be exported):\n` +
        `  $ frodo config export -a --include-active-values ${s.connId}\n`[
          'brightCyan'
        ] +
        `  Backup global and realm configuration including active secret values to individual files in a directory structure (Note: only values of active and loaded secrets can be exported):\n` +
        `  $ frodo config export -A -D ${s.connId}-backup --include-active-values ${s.connId}\n`[
          'brightCyan'
        ] +
        `  Export global and realm configuration including active secret values for import into another environment.\n` +
        `  The --target parameter instructs frodo to encrypt the exported secret values using the target environment so they can be imported into that target environment without requiring the source environment they were exported from.\n` +
        `  Using the --target parameter, the target environment must be available at the time of export and the person performing the export must have a connection profile for the target environment.\n` +
        `  Without the --target parameter, the source environment must be available at the time of import and the person performing the import must have a connection profile for the source environment.\n` +
        `  $ frodo config export -a --include-active-values --target ${s.connId2} ${s.connId}\n`[
          'brightCyan'
        ]
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
        // --all -a
        if (options.all && (await getTokens(false, true, deploymentTypes))) {
          verboseMessage('Exporting everything to a single file...');
          const outcome = await exportEverythingToFile(
            options.file,
            options.metadata,
            {
              useStringArrays: options.useStringArrays,
              noDecode: options.decode,
              coords: options.coords,
              includeDefault: options.default,
              includeActiveValues: options.includeActiveValues,
              target: options.target,
              includeReadOnly: options.readOnly,
              onlyRealm: options.realmOnly,
              onlyGlobal: options.globalOnly,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // require --directory -D for all-separate function
        else if (options.allSeparate && !state.getDirectory()) {
          printMessage(
            '-D or --directory required when using -A or --all-separate',
            'error'
          );
          program.help();
          process.exitCode = 1;
        }
        // --all-separate -A
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting everything to separate files...');
          const outcome = await exportEverythingToFiles(
            options.extract,
            options.separateMappings,
            options.separateObjects,
            options.metadata,
            {
              useStringArrays: options.useStringArrays,
              noDecode: options.decode,
              coords: options.coords,
              includeDefault: options.default,
              includeActiveValues: options.includeActiveValues,
              target: options.target,
              includeReadOnly: options.readOnly,
              onlyRealm: options.realmOnly,
              onlyGlobal: options.globalOnly,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // unrecognized combination of options or no options
        else {
          verboseMessage(
            'Unrecognized combination of options or no options...'
          );
          program.help();
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
