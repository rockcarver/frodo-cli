import { frodo } from '@rockcarver/frodo-lib';
import * as s from '../../../help/SampleData';
import { configManagerExportApplications } from '../../../ops/ApplicationConfigOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { APPLICATION_KEY_SET_PULL_SENTENCE } from '../../../utils/PlaceholderValues';
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
    'frodo config-manager pull applications',
    [],
    deploymentTypes
  );

  program
    .summary(
      'Export applications, one folder per application with the objects it owns.'
    )
    .description(
      'Export applications: one folder realms/<realm>/applications/<name>/ for each, with the application and the objects it owns (the OAuth2 client, the SAML providers, the connector and its mappings). The scripts and circles of trust that an application uses are exported where "pull scripts" and "pull saml" export them. Members, owners and roles of an application, and the glossary values and request forms of Identity Governance tenants, are not exported. ' +
        APPLICATION_KEY_SET_PULL_SENTENCE
    )
    .addOption(
      selectorOption(
        '-i, --app-id <id>',
        'Application id. If specified, pulls only the application with the given id. Needs a single realm. Cannot be used with -n.'
      ).conflicts(['appName'])
    )
    .addOption(
      selectorOption(
        '-n, --app-name <name>',
        'Application name. If specified, pulls only the application with the given name. Needs a single realm. Cannot be used with -i.',
        ['--name']
      ).conflicts(['appId'])
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
            ? `Exporting application "${selected}".`
            : 'Exporting applications.'
        );
        const outcome = await configManagerExportApplications(
          options.appName,
          realmOfRun(command, realm),
          false,
          options.allowFailures,
          undefined,
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
