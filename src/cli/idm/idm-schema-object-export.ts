import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportConfigEntityToFile,
  exportManagedObjectToFile,
  warnAboutOfflineConnectorServers,
} from '../../ops/IdmOps';
import c from '../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo idm schema object export',
    [],
    deploymentTypes
  );

  program
    .description('Export IDM managed object schema definition.')
    .addOption(
      new Option(
        '-a, --all',
        'Export all IDM configuration managed objects into a single file in directory -D.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all managed object schema definitions into separate JSON files in directory -D.'
      )
    )
    .addOption(
      new Option('-o, --managed-object <type>', 'Managed object type.')
    )
    .addOption(
      new Option(
        '-f, --file [file]',
        'Export file if -x or -a are included. Ignored with -A.'
      )
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Do not include metadata in the export file.'
      )
    )
    .addOption(
      new Option(
        '-x, --no-extract',
        'Do not extract and save idm scripts to separate files. Ignored with -a and -A.'
      ).default(true, 'true')
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Export the "${s.managedObjectTitle}" managed object type:\n` +
        c.command(
          `  $ frodo idm schema object export -o ${s.managedObjectType} ${s.amBaseUrl}\n`
        ) +
        `  Export it to a specific file:\n` +
        c.command(
          `  $ frodo idm schema object export -o ${s.managedObjectType} -f ${s.managedObjectType}.managed.object.json ${s.connId}\n`
        ) +
        `  Export every managed object type into a single file:\n` +
        c.command(
          `  $ frodo idm schema object export -a -f all-managed-objects.json ${s.connId}\n`
        ) +
        `  Export every managed object type into separate files, one per type:\n` +
        c.command(
          `  $ frodo idm schema object export -A -D ./managed-objects ${s.connId}\n`
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
        const envMessage = options.envFile
          ? ` using ${options.envFile} for variable replacement`
          : '';
        const fileMessage = options.file ? ` into ${options.file}` : '';
        const directoryMessage = state.getDirectory()
          ? ` into separate files in ${state.getDirectory()}`
          : '';
        // -o, --managed-object <type>
        if (
          options.managedObject &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Exporting managed object "${options.managedObject}"${envMessage}${fileMessage}...`
          );
          const outcome = await exportManagedObjectToFile(
            options.managedObject,
            options.file,
            options.extract
          );
          if (!outcome) process.exitCode = 1;
        } // -a, --all
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Exporting managed objects ${envMessage}${fileMessage}...`
          );
          const outcome = await exportConfigEntityToFile(
            'managed',
            options.file,
            options.metadata,
            false
          );
          if (!outcome) process.exitCode = 1;
        } // -A, --all-separate
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Exporting managed objects ${envMessage}${directoryMessage}...`
          );
          const outcome = await exportConfigEntityToFile(
            'managed',
            options.file,
            options.metadata,
            true
          );
          if (!outcome) process.exitCode = 1;
          await warnAboutOfflineConnectorServers();
        } // unrecognized combination of options or no options
        else {
          printMessage(
            'Unrecognized combination of options or no options...',
            'error'
          );
          process.exitCode = 1;
          program.help();
        }
      }
      // end command logic inside action handler
    );

  return program;
}
