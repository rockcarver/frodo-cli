import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteMappings } from '../../../configManagerOps/FrConfigConnectorMappingOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  checkProceed,
  confirmBulkDelete,
  confirmProceed,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager delete connector-mappings',
    [],
    deploymentTypes
  );

  program
    .description(
      'Delete one connector mapping by name, or delete all connector mappings of the sync configuration. A connector mapping that other objects still name is not deleted without --force.'
    )
    .addOption(
      selectorOption(
        '-i, --connector-mapping-id <name>',
        'Name of the connector mapping to delete, without the sync/ prefix, matched exactly. If it is left out, all connector mappings are deleted, after a question or with -y.',
        ['-n', '--name']
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show what would be deleted, and what other objects name it (at most 20 for each connector mapping when all are deleted), without deleting anything.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all connector mappings, or before deleting one with --force. Without a terminal those two are refused unless -y or -d is given; deleting one without --force never asks.'
      )
    )
    .addOption(
      new Option(
        '--force',
        'Delete the connector mapping with -i although other objects still name it. It deletes the connector mapping and clears no reference itself: every object that names it is listed, and names a connector mapping that does not exist afterwards. A schedule, an application or a mapping/<name> configuration that names it is not written; the other entries of the sync configuration are written again by the library. It also deletes it when not every source of what names it could be read. Only with -i.'
      )
    )
    .addHelpText(
      'after',
      `Only the connector mappings of the sync configuration are covered, as in pull and push connector-mappings: a mapping that is stored as mapping/<name> is not deleted, and pull, push and delete of those will likely be added later. What names a connector mapping is looked up in the sync configuration, in the mapping/<name> configurations, in the schedules and in the applications of every realm.\n` +
        `Without --force, a connector mapping that a schedule (invokeContext.mapping), another mapping (links or syncAfter) or an application (mappingNames) still names is not deleted, the command says which and exits with code 1. An application owns the mappings that it names: config-manager delete applications removes both. --allow-failures keeps the exit code at 0 for a delete that failed, but never for a refusal, for a connector mapping that does not exist or for a list of connector mappings that cannot be read. An answer that nothing names it is not proof that it is unused: a connector mapping that a script or an endpoint calls, that has links in a link table or that a running or past reconciliation used is not seen.\n` +
        `Deleting all connector mappings deletes every one of them, one write each, and does not refuse for what names them. The plan that -d shows, and the plan before the question on a terminal, list what names each of them (at most 20 for each connector mapping), from one lookup for all; a delete with -y looks up nothing.\n` +
        `Usage Examples:\n` +
        `  Delete all connector mappings without asking, which is required without a terminal (without -y a terminal is asked first):\n` +
        c.command(
          `  $ frodo config-manager delete connector-mappings -y ${s.connId}\n`
        ) +
        `  Preview the deletion of all connector mappings and what names them:\n` +
        c.command(
          `  $ frodo config-manager delete connector-mappings -d ${s.connId}\n`
        ) +
        `  Delete a connector mapping (refused if other objects still name it):\n` +
        c.command(
          `  $ frodo config-manager delete connector-mappings -i ${s.mappingId} ${s.connId}\n`
        ) +
        `  Preview the deletion of a connector mapping and what names it:\n` +
        c.command(
          `  $ frodo config-manager delete connector-mappings -i ${s.mappingId} -d ${s.connId}\n`
        ) +
        `  Delete a connector mapping that other objects name, and clear no reference, without asking:\n` +
        c.command(
          `  $ frodo config-manager delete connector-mappings -i ${s.mappingId} --force -y ${s.connId}\n`
        )
    )
    .multiOp()
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      // an empty name must never mean "all": "not given" and "given but empty"
      // are different (-i "$UNSET" gives an empty name); an empty value is
      // refused while the command line is parsed, so this is a blank one
      const named = options.connectorMappingId !== undefined;
      if (named && options.connectorMappingId.trim() === '') {
        printMessage(
          'The connector mapping name (-i) must not be empty. To delete all connector mappings, leave out -i.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      if (!named && options.force) {
        printMessage(
          '--force applies to a named connector mapping only: add -i/--connector-mapping-id, or leave it out.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      // a delete of all connector mappings is asked about, as is a forced
      // delete of a named one, which goes ahead although other objects name it
      // (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md);
      // a run that nobody can be asked about is refused before the login
      const guardOptions = {
        what: named
          ? `delete connector mapping '${options.connectorMappingId}' although other objects may name it`
          : 'all connector mappings',
        yes: options.yes,
        dryRun: options.dryRun,
      };
      if (!named && !checkBulkDelete(guardOptions)) {
        process.exitCode = 1;
        return;
      }
      if (named && options.force && !checkProceed(guardOptions)) {
        process.exitCode = 1;
        return;
      }
      if (!(await getTokens(false, true, deploymentTypes))) {
        process.exitCode = 1;
        return;
      }
      const showPlan = () =>
        configManagerDeleteMappings(options.connectorMappingId, true, false, {
          force: options.force,
          plan: true,
        });
      if (!named && !(await confirmBulkDelete({ ...guardOptions, showPlan }))) {
        process.exitCode = 1;
        return;
      }
      if (
        named &&
        options.force &&
        !(await confirmProceed({
          ...guardOptions,
          warning: `Connector mapping '${options.connectorMappingId}' is deleted, and this command clears no reference to it. This cannot be undone.`,
          showPlan,
        }))
      ) {
        process.exitCode = 1;
        return;
      }
      verboseMessage(
        named
          ? `Deleting connector mapping '${options.connectorMappingId}'.`
          : 'Deleting all connector mappings.'
      );
      const outcome = await configManagerDeleteMappings(
        options.connectorMappingId,
        options.dryRun,
        options.allowFailures,
        { force: options.force }
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
