import { frodo, state, type ThemeSkeleton } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  deleteTheme,
  deleteThemeByName,
  deleteThemes,
} from '../../ops/ThemeOps';
import { verboseMessage } from '../../utils/Console';
import {
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo theme delete', [], deploymentTypes);

  program
    .description('Delete themes.')
    .addOption(
      new Option(
        '-n, --theme-name <name>',
        'Name of the theme. If specified, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-i, --theme-id <uuid>',
        'Uuid of the theme. If specified, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all the themes in the realm. Ignored with -n and -i.'
      )
    )
    .requireOneOf({
      options: ['all', 'themeId', 'themeName'],
      purpose: 'what to delete',
    })
    .action(
      // implement command logic inside action handler
      async (host, realm, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );
        // delete by name
        if (
          options.themeName &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Deleting theme with name "${
              options.themeName
            }" from realm "${state.getRealm()}"...`
          );
          const outcome = await deleteThemeByName(options.themeName);
          if (!outcome) process.exitCode = 1;
        }
        // delete by id
        else if (
          options.themeId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Deleting theme with id "${
              options.themeId
            }" from realm "${state.getRealm()}"...`
          );
          const outcome = await deleteTheme(options.themeId);
          if (!outcome) process.exitCode = 1;
        }
        // --all -a, or an interactive pick (resolveEntityPicks is a no-op
        // outside the prompt gate, so a non-interactive run with neither
        // option never reaches deleteThemes here -- same as before Phase
        // 3, where the error branch below handled that case).
        else if (
          (options.all ||
            (await resolveEntityPicks(command, [
              entityPick<ThemeSkeleton>({
                name: 'themeId',
                kind: 'theme',
                load: () => frodo.theme.readThemes(),
                label: (theme) => theme.name ?? '',
                description: (theme) =>
                  theme.isDefault ? 'default theme' : undefined,
              }),
            ]))) &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          if (options.themeName) {
            verboseMessage(
              `Deleting theme with name "${
                options.themeName
              }" from realm "${state.getRealm()}"...`
            );
            const outcome = await deleteThemeByName(options.themeName);
            if (!outcome) process.exitCode = 1;
          } else if (options.themeId) {
            verboseMessage(
              `Deleting theme with id "${
                options.themeId
              }" from realm "${state.getRealm()}"...`
            );
            const outcome = await deleteTheme(options.themeId);
            if (!outcome) process.exitCode = 1;
          } else {
            verboseMessage(
              `Deleting all themes from realm "${state.getRealm()}"...`
            );
            const outcome = await deleteThemes();
            if (!outcome) process.exitCode = 1;
          }
        }
        // No branch ran: with requireOneOf satisfied, the only ways here
        // are getTokens() failing (keep the old exit-1 semantics) or the
        // user escaping the entity picker (declined to run).
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
