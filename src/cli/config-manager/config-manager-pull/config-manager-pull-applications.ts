import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { configManagerExportApplications } from '../../../ops/ApplicationConfigOps';
import { getTokens } from '../../../ops/AuthenticateOps';
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
    'frodo config-manager pull applications',
    [],
    deploymentTypes
  );

  program
    .summary(
      'Export applications, one folder per application with the objects it owns.'
    )
    .description(
      'Export applications: one folder realms/<realm>/applications/<name>/ for each, with the application and the objects it owns (the OAuth2 client, the SAML providers, the connector and its mappings). The scripts and circles of trust that an application uses are exported where "pull scripts" and "pull saml" export them. Members, owners and roles of an application, and the glossary values and request forms of Identity Governance tenants, are not exported.'
    )
    .addOption(
      new Option(
        '-n, --name <name>',
        'Application name. If specified, pulls only the application with the given name. Needs a single realm.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Pull all applications of all realms to realms/<realm>/applications/<name>/:\n` +
        c.command(`  $ frodo config-manager pull applications ${s.connId}\n`) +
        `  Pull all applications of one realm:\n` +
        c.command(
          `  $ frodo config-manager pull applications ${s.connId} ${s.realm}\n`
        ) +
        `  Pull one application of a realm:\n` +
        c.command(
          `  $ frodo config-manager pull applications -n "${s.pullApplicationName}" ${s.connId} ${s.realm}\n`
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
          options.name
            ? `Exporting application "${options.name}".`
            : 'Exporting applications.'
        );
        const outcome = await configManagerExportApplications(
          options.name,
          realm,
          false,
          options.allowFailures
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
