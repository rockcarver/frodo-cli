import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { configManagerMigrateApplications } from '../../../ops/ApplicationMigrateOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { TREE_LAYOUT_MARKER_FILE } from '../../../utils/TreeLayout';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager migrate applications',
    [],
    deploymentTypes
  );

  program
    .summary(
      'Move a tree to one folder per application, with the objects it owns.'
    )
    .description(
      `Move a tree that keeps the objects of an application at the paths of their own kinds (the layout of config-manager before applications) to one folder per application. The tenant says which objects an application owns, so the command reads it. It writes each application as "pull applications" does (realms/<realm>/applications/<name>/), removes the files of the objects the application owns from the paths of their own kinds (OAuth2 clients, SAML providers, connectors and mappings; never scripts or circles of trust), and writes ${TREE_LAYOUT_MARKER_FILE} at the root of the tree last, only if everything succeeded. An application that cannot be written keeps its files where they are, and the command can be run again. Use -d to see what would happen first. The command does not ask: the tree is a working copy, and the preview is the safeguard. A tree that already keeps one folder per application is left alone.`
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show the folders that would be written and the files that would be removed, and change nothing.'
      )
    )
    .addOption(
      new Option(
        '-C, --config-folder <config-folder-path>',
        'Path to the folder with the config files of "pull oauth2-agents" and "pull saml" (oauth2-agents.json and saml.json). Their entries that name an object an application owns are reported. The files are never changed.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  See what moving the tree in the current directory would do, without changing anything:\n` +
        c.command(
          `  $ frodo config-manager migrate applications -d ${s.connId}\n`
        ) +
        `  Move the tree in a directory:\n` +
        c.command(
          `  $ frodo config-manager migrate applications -D ../testDir ${s.connId}\n`
        ) +
        `  Move it, and report the entries of the config files of "pull oauth2-agents" and "pull saml" that name objects an application owns:\n` +
        c.command(
          `  $ frodo config-manager migrate applications -C ../config ${s.connId}\n`
        ) +
        `  Move the applications of one realm only (the tree is not marked until the whole tree is moved):\n` +
        c.command(
          `  $ frodo config-manager migrate applications ${s.connId} ${s.realm}\n`
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

      if (await getTokens(false, true, deploymentTypes)) {
        verboseMessage(
          options.dryRun
            ? 'Previewing the move of the tree to one folder per application.'
            : 'Moving the tree to one folder per application.'
        );
        const outcome = await configManagerMigrateApplications(
          realm,
          options.dryRun,
          options.allowFailures,
          options.configFolder
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
