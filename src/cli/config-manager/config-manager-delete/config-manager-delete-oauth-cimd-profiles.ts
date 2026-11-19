import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  configManagerDeleteCIMDProfiles,
  showCIMDProfileDeletePlan,
} from '../../../ops/CIMDProfileConfigOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager delete oauth-cimd-profiles'
  );

  program
    .summary('Delete CIMD profiles.')
    .description(
      'Delete the CIMD profiles (the allow-list of client ID URL patterns) from the tenant, by id or all of the selected realms. A client that identifies itself with a Client ID Metadata Document that only a deleted profile allowed is rejected until a profile for it exists again. A realm or a deployment that does not offer CIMD profiles has nothing to delete.'
    )
    .addOption(
      selectorOption(
        '-i, --profile-id <id>',
        'CIMD profile id. If specified, deletes only the profile with the given id, without asking. Needs a single realm.',
        ['-n', '--name']
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which CIMD profiles would be deleted without deleting them.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting more than one CIMD profile (no -i). Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Preview the deletion of all CIMD profiles of a realm:\n` +
        c.command(
          `  $ frodo config-manager delete oauth-cimd-profiles --dry-run ${s.connId} ${s.realm}\n`
        ) +
        `  Delete all CIMD profiles of a realm without asking, which is required without a terminal (without -y a terminal is asked first). Clients that only these profiles allowed are rejected afterwards:\n` +
        c.command(
          `  $ frodo config-manager delete oauth-cimd-profiles -y ${s.connId} ${s.realm}\n`
        ) +
        `  Delete one CIMD profile of a realm:\n` +
        c.command(
          `  $ frodo config-manager delete oauth-cimd-profiles -i ${s.cimdProfileId} ${s.connId} ${s.realm}\n`
        ) +
        `  Preview the deletion of one CIMD profile:\n` +
        c.command(
          `  $ frodo config-manager delete oauth-cimd-profiles -i ${s.cimdProfileId} --dry-run ${s.connId} ${s.realm}\n`
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

      // an empty id must never mean "all": "not given" and "given but empty"
      // are different (-i "$UNSET" gives an empty id); an empty value is
      // refused while the command line is parsed, so this is a blank one
      const named = options.profileId !== undefined;
      if (named && options.profileId.trim() === '') {
        printMessage(
          'The CIMD profile id (-i) must not be empty. To delete all CIMD profiles, leave out -i.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      // only a single id is deleted without a question, as for a command that
      // can delete more than the one object it names (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md); a run that nobody can
      // be asked about is refused before the login
      const what = 'all CIMD profiles in the selected realms';
      if (
        !named &&
        !checkBulkDelete({ what, yes: options.yes, dryRun: options.dryRun })
      ) {
        process.exitCode = 1;
        return;
      }
      if (!(await getTokens())) {
        process.exitCode = 1;
        return;
      }
      if (
        !named &&
        !(await confirmBulkDelete({
          what,
          yes: options.yes,
          dryRun: options.dryRun,
          showPlan: () =>
            showCIMDProfileDeletePlan(
              options.profileId,
              realmOfRun(command, realm)
            ),
        }))
      ) {
        process.exitCode = 1;
        return;
      }

      verboseMessage(
        named
          ? `Deleting CIMD profile "${options.profileId}".`
          : 'Deleting CIMD profiles.'
      );
      const outcome = await configManagerDeleteCIMDProfiles(
        options.profileId,
        realmOfRun(command, realm),
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
