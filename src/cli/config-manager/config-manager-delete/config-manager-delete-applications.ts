import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import {
  configManagerDeleteApplications,
  showApplicationDeletePlan,
} from '../../../ops/ApplicationConfigDeleteOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager delete applications',
    [],
    deploymentTypes
  );

  program
    .summary('Delete applications together with the objects they own.')
    .description(
      'Delete applications: the application record first, then the objects it owns (the OAuth2 client, the SAML providers, the connector and its mappings). An owned object that another application still names is kept. The scripts and circles of trust that an application uses are never deleted. An application whose connector is active is not deleted: switch it off first with "frodo app disable". The glossary values and request forms of Identity Governance tenants are not handled by this command.'
    )
    .addOption(
      new Option(
        '-n, --name <name>',
        'Application name. If specified, deletes only the application with the given name, without asking. Needs a single realm.'
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which applications and objects would be deleted without deleting them.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting more than one application (no -n). Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Preview the deletion of all applications of a realm and the objects they own:\n` +
        c.command(
          `  $ frodo config-manager delete applications -d ${s.connId} ${s.realm}\n`
        ) +
        `  Delete all applications of a realm without asking, which is required without a terminal (without -y a terminal is asked first):\n` +
        c.command(
          `  $ frodo config-manager delete applications -y ${s.connId} ${s.realm}\n`
        ) +
        `  Delete one application and the objects it owns:\n` +
        c.command(
          `  $ frodo config-manager delete applications -n "${s.pullApplicationName}" ${s.connId} ${s.realm}\n`
        ) +
        `  Preview the deletion of one application:\n` +
        c.command(
          `  $ frodo config-manager delete applications -n "${s.pullApplicationName}" -d ${s.connId} ${s.realm}\n`
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

      // all applications of a realm can be many, so only a single name is
      // deleted without a question (cli record 0037); a run that nobody can be
      // asked about is refused before the login
      const what = 'all applications and the objects they own';
      if (
        !options.name &&
        !checkBulkDelete({ what, yes: options.yes, dryRun: options.dryRun })
      ) {
        process.exitCode = 1;
        return;
      }
      if (!(await getTokens(false, true, deploymentTypes))) {
        process.exitCode = 1;
        return;
      }

      if (
        !options.name &&
        !(await confirmBulkDelete({
          what,
          yes: options.yes,
          dryRun: options.dryRun,
          showPlan: () => showApplicationDeletePlan(options.name, realm),
        }))
      ) {
        process.exitCode = 1;
        return;
      }

      verboseMessage(
        options.name
          ? `Deleting application "${options.name}".`
          : 'Deleting applications.'
      );
      const outcome = await configManagerDeleteApplications(
        options.name,
        realm,
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
