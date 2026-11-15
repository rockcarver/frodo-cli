import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  importAllConfigEntitiesFromFile,
  importAllConfigEntitiesFromFiles,
  importConfigEntityByIdFromFile,
  importFirstConfigEntityFromFile,
  importRawConfigEntityFromFile,
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
  const program = new FrodoCommand('frodo idm import', [], deploymentTypes);

  interface IdmImportOptions {
    type?: string;
    insecure?: boolean;
    verbose?: boolean;
    debug?: boolean;
    curlirize?: boolean;
    entityId?: string;
    file?: string;
    entitiesFile?: string;
    envFile?: string;
    all?: string;
    allSeparate?: string;
    directory?: string;
    allowFailures?: boolean;
    raw?: boolean;
  }

  program
    .description('Import IDM configuration objects.')
    .addOption(
      new Option(
        '-i, --entity-id <id>',
        'Config entity id/name. E.g. "managed", "sync", "provisioner-<connector-name>", etc. Cannot be used with -e, -a or -A.'
      ).conflicts(['entitiesFile', 'all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file [file]',
        'Import file. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-e, --entities-file <entities-file>',
        'Name of the entity file. Cannot be used with -i.'
      ).conflicts(['entityId'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all IDM configuration objects from a single file in directory -D. Cannot be used with -i or -A.'
      ).conflicts(['entityId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all IDM configuration objects from separate files in directory -D. Cannot be used with -i, -f or -a.'
      ).conflicts(['entityId', 'file', 'all'])
    )
    .addOption(
      new Option(
        '-r, --raw',
        'Import a file that holds the configuration object as IDM serves it, without the "idm" wrapper (what "idm export --raw" writes). The object is named by -i, or by its _id when only -f is given; with -i and no -f the file is <id>.json. Cannot be used with -a, -A or -e.'
      ).conflicts(['all', 'allSeparate', 'entitiesFile'])
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Import the sync mappings from sync.idm.json, exported earlier with -i:\n` +
        c.command(
          `  $ frodo idm import -i sync -f sync.idm.json ${s.connId}\n`
        ) +
        `  Import every IDM configuration object from a single file, exported earlier with -a:\n` +
        c.command(`  $ frodo idm import -a -f idm-config.json ${s.connId}\n`) +
        `  Import every IDM configuration object from the separate files of a directory, exported earlier with -A:\n` +
        c.command(`  $ frodo idm import -A -D ./idm ${s.connId}\n`) +
        `  Import a file that holds the configuration object as IDM serves it, without the "idm" wrapper (exported with "idm export --raw", or copied from the conf directory of IDM):\n` +
        c.command(
          `  $ frodo idm import -i sync --raw -f sync.json ${s.connId}\n`
        )
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'entityId', 'file'],
      purpose: 'what to import',
    })
    .multiOp()
    .action(
      // implement command logic inside action handler
      async (
        host: string,
        realm: string,
        user: string,
        password: string,
        options: IdmImportOptions,
        command
      ) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );
        const entitiesMessage = options.entitiesFile
          ? ` specified in ${options.entitiesFile}`
          : '';
        const envMessage = options.envFile
          ? ` using ${options.envFile} for variable replacement`
          : '';
        const fileMessage = options.file ? ` from ${options.file}` : '';
        const directoryMessage = state.getDirectory()
          ? ` from separate files in ${state.getDirectory()}`
          : '';
        // require --directory -D for all-separate functions
        if (options.allSeparate && !state.getDirectory()) {
          printMessage(
            '-D or --directory required when using -A or --all-separate',
            'error'
          );
          process.exitCode = 1;
          program.help();
        }
        // unrecognized combination of options (-a needs -f) or no options
        else if (!(options.entityId || options.file || options.allSeparate)) {
          printMessage(
            'Unrecognized combination of options or no options...',
            'error'
          );
          process.exitCode = 1;
          program.help();
        }
        // a failed login has printed its reason: that is the whole answer
        else if (!(await getTokens(false, true, deploymentTypes))) {
          process.exitCode = 1;
        }
        // raw: the configuration object as IDM serves it
        else if (options.raw) {
          verboseMessage(
            `Importing raw object${options.entityId ? ` "${options.entityId}"` : ''}${envMessage}${fileMessage}...`
          );
          const outcome = await importRawConfigEntityFromFile(
            options.entityId,
            typeof options.file === 'string' ? options.file : undefined
          );
          if (!outcome) process.exitCode = 1;
        }
        // import by id/name
        else if (options.entityId) {
          verboseMessage(
            `Importing object "${options.entityId}"${envMessage}${fileMessage}...`
          );
          const outcome = await importConfigEntityByIdFromFile(
            options.entityId,
            options.file
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (options.all && options.file) {
          verboseMessage(
            `Importing IDM configuration objects${entitiesMessage}${envMessage}${fileMessage}`
          );
          const outcome = await importAllConfigEntitiesFromFile(
            options.file,
            options.entitiesFile,
            false,
            options.allowFailures
          );
          if (!outcome) process.exitCode = 1;
        }
        // import from file
        else if (options.file) {
          verboseMessage(
            `Importing first object${envMessage}${fileMessage}...`
          );
          const outcome = await importFirstConfigEntityFromFile(options.file);
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (options.allSeparate) {
          verboseMessage(
            `Importing IDM configuration objects${entitiesMessage}${envMessage}${directoryMessage}`
          );
          const outcome = await importAllConfigEntitiesFromFiles(
            options.entitiesFile,
            false,
            options.allowFailures
          );
          if (!outcome) process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
