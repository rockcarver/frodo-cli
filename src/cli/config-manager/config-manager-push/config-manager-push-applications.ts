import { frodo } from '@rockcarver/frodo-lib';
import * as s from '../../../help/SampleData';
import { configManagerImportApplications } from '../../../ops/ApplicationConfigOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { APPLICATION_KEY_SET_PUSH_SENTENCE } from '../../../utils/PlaceholderValues';
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
    'frodo config-manager push apps',
    [],
    deploymentTypes
  );

  program
    .summary(
      'Import applications, one folder per application with the objects it owns.'
    )
    .description(
      'Import applications from the folders realms/<realm>/applications/<name>/ that "pull apps" writes. For each application the scripts it uses, its connector and mappings, its OAuth2 client and its SAML providers are imported first, then the circles of trust the providers are members of, and the application itself last. An application is matched by its name: the tenant\'s application of that name is updated in place, and a new one is created if there is none. The secret of an OAuth2 client is read from the environment variable named in its file (APP_<NAME>_CLIENT_SECRET); an application whose variable is not set is not imported. ' +
        APPLICATION_KEY_SET_PUSH_SENTENCE +
        ' Members, owners and roles of an application, and the glossary values and request forms of Identity Governance tenants, are never changed.'
    )
    .addOption(
      selectorOption(
        '-i, --app-id <id>',
        'Application id, the id that the application has on the tenant (the files of a pull do not hold it). If specified, imports only the folder of that application. Needs a single realm. Cannot be used with -n.'
      ).conflicts(['appName'])
    )
    .addOption(
      selectorOption(
        '-n, --app-name <name>',
        'Application name. If specified, imports only the application with the given name. Needs a single realm. Cannot be used with -i.',
        ['--name']
      ).conflicts(['appId'])
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Push all applications of all realm folders from realms/<realm>/applications/<name>/:\n` +
        c.command(`  $ frodo config-manager push apps ${s.connId}\n`) +
        `  Push all applications of one realm:\n` +
        c.command(
          `  $ frodo config-manager push apps ${s.connId} ${s.realm}\n`
        ) +
        `  Push one application of a realm:\n` +
        c.command(
          `  $ frodo config-manager push apps -n "${s.pullApplicationName}" ${s.connId} ${s.realm}\n`
        )
    )
    .multiOp()
    .usesRealm()
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
        const selected = options.appId ?? options.appName;
        verboseMessage(
          selected
            ? `Importing application "${selected}".`
            : 'Importing applications.'
        );
        const outcome = await configManagerImportApplications(
          options.appName,
          realmOfRun(command, realm),
          options.allowFailures,
          options.appId
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
