import { frodo } from '@rockcarver/frodo-lib';
import { configManagerImportThemes } from '../../../configManagerOps/FrConfigThemeOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
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
    'frodo config push themes',
    [],
    deploymentTypes
  );

  program
    .description('Import themes.')
    .addOption(
      selectorOption(
        '-i, --theme-id <id>',
        'Theme id. If specified, imports only the theme with the given id. Needs a single realm. Cannot be used with -n.'
      ).conflicts(['themeName'])
    )
    .addOption(
      selectorOption(
        '-n, --theme-name <name>',
        'Theme name. If specified, imports only the theme with the given name. Needs a single realm. Cannot be used with -i.'
      ).conflicts(['themeId'])
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
        const selected = options.themeId ?? options.themeName;
        verboseMessage(
          selected ? `Importing theme "${selected}"` : 'Importing themes'
        );
        const outcome = await configManagerImportThemes(
          realmOfRun(command, realm),
          options.allowFailures,
          options.themeId,
          options.themeName
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });
  return program;
}
