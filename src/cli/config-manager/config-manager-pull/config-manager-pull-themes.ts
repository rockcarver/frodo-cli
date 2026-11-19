import { frodo } from '@rockcarver/frodo-lib';
import { configManagerExportThemes } from '../../../configManagerOps/FrConfigThemeOps';
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
    'frodo config-manager pull themes',
    [],
    deploymentTypes
  );

  program
    .description('Export themes.')
    .addOption(
      selectorOption(
        '-i, --theme-id <id>',
        'Theme id. If specified, pulls only the theme with the given id. Needs a single realm. Cannot be used with -n.'
      ).conflicts(['themeName'])
    )
    .addOption(
      selectorOption(
        '-n, --theme-name <name>',
        'Theme name. If specified, pulls only the theme with the given name. Needs a single realm. Cannot be used with -i.'
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
          selected ? `Exporting theme "${selected}"...` : 'Exporting themes...'
        );
        const outcome = await configManagerExportThemes(
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
