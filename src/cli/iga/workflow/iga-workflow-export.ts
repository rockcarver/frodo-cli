import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../../ops/AuthenticateOps';
import {
  exportWorkflowsToFile,
  exportWorkflowsToFiles,
  exportWorkflowToFile,
} from '../../../ops/cloud/iga/IgaWorkflowOps';
import { printMessage, verboseMessage } from '../../../utils/Console.js';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo iga workflow export',
    [],
    deploymentTypes
  );

  program
    .description('Export workflows.')
    .addOption(
      new Option(
        '-i, --workflow-id <workflow-id>',
        'Workflow id. If specified, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-f, --file [file]',
        'Name of the export file. Ignored with -A. Defaults to <workflow-id>.workflow.json.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Export all workflows to a single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all workflows as separate files <workflow-id>.workflow.json. Ignored with -i, and -a.'
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
        '-M, --modified-properties',
        'Include modified properties in export (e.g. lastModifiedDate, lastModifiedBy, createdBy, creationDate, etc.)'
      ).default(false, 'false')
    )
    .addOption(
      new Option(
        '-x, --no-extract',
        'Do not extract the scripts from the exported file and save them to separate files. Ignored with -a.'
      ).default(true, 'true')
    )
    .addOption(
      new Option(
        '--use-string-arrays',
        'Where applicable, use string arrays to store scripts.'
      ).default(false, 'off')
    )
    .addOption(
      new Option(
        '-R, --read-only',
        'Export non-mutable workflows in addition to the mutable workflows.'
      )
    )
    .addOption(
      new Option(
        '--no-coords',
        'Do not include the x and y coordinate positions of the workflow tasks.'
      )
    )
    .addOption(
      new Option(
        '--no-deps',
        'Do not include any dependencies (email templates, request forms, events, etc.).'
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
        if (!options.workflowId && !options.all && !options.allSeparate) {
          printMessage(
            'Unrecognized combination of options or no options...',
            'error'
          );
          program.help();
          process.exitCode = 1;
          return;
        }
        const getTokensIsSuccessful = await getTokens(
          false,
          true,
          deploymentTypes
        );
        if (!getTokensIsSuccessful) {
          process.exitCode = 1;
          return;
        }
        if (!state.getIsIGA()) {
          printMessage(
            'Command not supported for non-IGA cloud tenants',
            'error'
          );
          process.exitCode = 1;
          return;
        }
        // --workflow-id -i
        if (options.workflowId) {
          verboseMessage(`Exporting workflow "${options.workflowId}"...`);
          const outcome = await exportWorkflowToFile(
            options.workflowId,
            options.file,
            options.metadata,
            options.modifiedProperties,
            options.extract,
            {
              deps: options.deps,
              useStringArrays: options.useStringArrays,
              coords: options.coords,
              includeReadOnly: options.readOnly,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (options.all) {
          verboseMessage('Exporting all workflows to a single file...');
          const outcome = await exportWorkflowsToFile(
            options.file,
            options.metadata,
            options.modifiedProperties,
            {
              deps: options.deps,
              useStringArrays: options.useStringArrays,
              coords: options.coords,
              includeReadOnly: options.readOnly,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (options.allSeparate) {
          verboseMessage('Exporting all workflows to separate files...');
          const outcome = await exportWorkflowsToFiles(
            options.metadata,
            options.modifiedProperties,
            options.extract,
            {
              deps: options.deps,
              useStringArrays: options.useStringArrays,
              coords: options.coords,
              includeReadOnly: options.readOnly,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
