import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { configManagerImportApplications } from '../../../ops/ApplicationConfigOps';
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
    'frodo config-manager push applications',
    [],
    deploymentTypes
  );

  program
    .summary(
      'Import applications, one folder per application with the objects it owns.'
    )
    .description(
      'Import applications from the folders realms/<realm>/applications/<name>/ that "pull applications" writes. For each application the scripts it uses, its connector and mappings, its OAuth2 client and its SAML providers are imported first, then the circles of trust the providers are members of, and the application itself last. An application is matched by its name: the tenant\'s application of that name is updated in place, and a new one is created if there is none. The secret of an OAuth2 client is read from the environment variable named in its file (APP_<NAME>_CLIENT_SECRET); an application whose variable is not set is not imported. Members, owners and roles of an application, and the glossary values and request forms of Identity Governance tenants, are never changed.'
    )
    .addOption(
      new Option(
        '-n, --name <name>',
        'Application name. If specified, imports only the application with the given name. Needs a single realm.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Push all applications of all realm folders from realms/<realm>/applications/<name>/:\n` +
        c.command(`  $ frodo config-manager push applications ${s.connId}\n`) +
        `  Push all applications of one realm:\n` +
        c.command(
          `  $ frodo config-manager push applications ${s.connId} ${s.realm}\n`
        ) +
        `  Push one application of a realm:\n` +
        c.command(
          `  $ frodo config-manager push applications -n "${s.pullApplicationName}" ${s.connId} ${s.realm}\n`
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
            ? `Importing application "${options.name}".`
            : 'Importing applications.'
        );
        const outcome = await configManagerImportApplications(
          options.name,
          realm,
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
