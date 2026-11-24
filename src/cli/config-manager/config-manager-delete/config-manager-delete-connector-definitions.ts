import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteConnectorDefinitions } from '../../../configManagerOps/FrConfigConnectorDefinitionsOps';
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
    'frodo config-manager delete connector-definitions',
    [],
    deploymentTypes
  );

  program
    .description(
      'Delete one connector definition by id, or delete all connector definitions. A connector definition that other objects still name is not deleted without --force.'
    )
    .addOption(
      selectorOption(
        '-i, --connector-id <id>',
        'Id (name) of the connector definition to delete, without the type prefix, matched exactly. If it is left out, all connector definitions are deleted, after a question or with -y.',
        ['-n', '--name']
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show what would be deleted, and what other objects name it (at most 20 for each connector definition when all are deleted), without deleting anything.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all connector definitions, or before deleting one with --force. Without a terminal those two are refused unless -y or -d is given; deleting one without --force never asks.'
      )
    )
    .addOption(
      new Option(
        '--force',
        'Delete the connector definition with -i although other objects still name it. It deletes the connector definition and nothing else: every object that names it is left as it is, is listed, and names a connector definition that does not exist afterwards. It also deletes it when not every source of what names it could be read. Only with -i.'
      )
    )
    .addHelpText(
      'after',
      `Without --force, a connector definition that a mapping, an application, a schedule or an authentication module still names is not deleted, the command says which and exits with code 1. --allow-failures keeps the exit code at 0 for a delete that failed, but never for a refusal or for a connector definition that does not exist. An answer that nothing names it is not proof that it is unused: a connector definition that a script, an endpoint, a reconciliation or a client of the REST API names is not seen.\n` +
        `Deleting all connector definitions deletes every one of them, and does not refuse for what names them. The plan that -d shows, and the plan before the question on a terminal, list what names each of them (at most 20 for each connector definition), from one lookup for all; a delete with -y looks up nothing.\n` +
        `Usage Examples:\n` +
        `  Delete all connector definitions without asking, which is required without a terminal (without -y a terminal is asked first):\n` +
        c.command(
          `  $ frodo config-manager delete connector-definitions -y ${s.connId}\n`
        ) +
        `  Preview the deletion of all connector definitions and what names them:\n` +
        c.command(
          `  $ frodo config-manager delete connector-definitions -d ${s.connId}\n`
        ) +
        `  Delete a connector definition (refused if other objects still name it):\n` +
        c.command(
          `  $ frodo config-manager delete connector-definitions -i ${s.connectorId} ${s.connId}\n`
        ) +
        `  Preview the deletion of a connector definition and what names it:\n` +
        c.command(
          `  $ frodo config-manager delete connector-definitions -i ${s.connectorId} -d ${s.connId}\n`
        ) +
        `  Delete a connector definition that other objects name, and leave them as they are, without asking:\n` +
        c.command(
          `  $ frodo config-manager delete connector-definitions -i ${s.connectorId} --force -y ${s.connId}\n`
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
      // an empty id must never mean "all": "not given" and "given but empty"
      // are different (-i "$UNSET" gives an empty id); an empty value is
      // refused while the command line is parsed, so this is a blank one
      const named = options.connectorId !== undefined;
      if (named && options.connectorId.trim() === '') {
        printMessage(
          'The connector definition id (-i) must not be empty. To delete all connector definitions, leave out -i.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      if (!named && options.force) {
        printMessage(
          '--force applies to a named connector definition only: add -i/--connector-id, or leave it out.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      // a delete of all connector definitions is asked about, as is a forced
      // delete of a named one, which goes ahead although other objects name it
      // (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md);
      // a run that nobody can be asked about is refused before the login
      const guardOptions = {
        what: named
          ? `delete connector definition '${options.connectorId}' although other objects may name it`
          : 'all connector definitions',
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
        configManagerDeleteConnectorDefinitions(
          options.connectorId,
          true,
          false,
          { force: options.force, plan: true }
        );
      if (!named && !(await confirmBulkDelete({ ...guardOptions, showPlan }))) {
        process.exitCode = 1;
        return;
      }
      if (
        named &&
        options.force &&
        !(await confirmProceed({
          ...guardOptions,
          warning: `Connector definition '${options.connectorId}' is deleted, and nothing else is changed. This cannot be undone.`,
          showPlan,
        }))
      ) {
        process.exitCode = 1;
        return;
      }
      verboseMessage(
        named
          ? `Deleting connector definition '${options.connectorId}'.`
          : 'Deleting all connector definitions.'
      );
      const outcome = await configManagerDeleteConnectorDefinitions(
        options.connectorId,
        options.dryRun,
        options.allowFailures,
        { force: options.force }
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
