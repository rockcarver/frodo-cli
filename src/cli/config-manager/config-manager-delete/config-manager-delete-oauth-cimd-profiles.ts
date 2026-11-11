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

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager delete oauth-cimd-profiles'
  );

  program
    .summary('Delete CIMD profiles.')
    .description(
      'Delete the CIMD profiles (the allow-list of client ID URL patterns) from the tenant, by name or all of the selected realms. A client that identifies itself with a Client ID Metadata Document that only a deleted profile allowed is rejected until a profile for it exists again. A realm or a deployment that does not offer CIMD profiles has nothing to delete.'
    )
    .addOption(
      new Option(
        '-n, --name <name>',
        'CIMD profile name. If specified, deletes only the profile with the given name, without asking. Needs a single realm.'
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
        'Do not ask for confirmation before deleting more than one CIMD profile (no -n). Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Preview the deletion of all CIMD profiles of a realm:\n` +
        c.command(
          `  $ frodo config-manager delete oauth-cimd-profiles -d ${s.connId} ${s.realm}\n`
        ) +
        `  Delete all CIMD profiles of a realm without asking, which is required without a terminal (without -y a terminal is asked first). Clients that only these profiles allowed are rejected afterwards:\n` +
        c.command(
          `  $ frodo config-manager delete oauth-cimd-profiles -y ${s.connId} ${s.realm}\n`
        ) +
        `  Delete one CIMD profile of a realm:\n` +
        c.command(
          `  $ frodo config-manager delete oauth-cimd-profiles -n ${s.cimdProfileId} ${s.connId} ${s.realm}\n`
        ) +
        `  Preview the deletion of one CIMD profile:\n` +
        c.command(
          `  $ frodo config-manager delete oauth-cimd-profiles -n ${s.cimdProfileId} -d ${s.connId} ${s.realm}\n`
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

      // an empty name must never mean "all": "not given" and "given but empty"
      // are different (-n "$UNSET" gives an empty name)
      const named = options.name !== undefined;
      if (named && options.name.trim() === '') {
        printMessage(
          'The CIMD profile name must not be empty. To delete all CIMD profiles, leave out -n.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      // only a single name is deleted without a question (cli record 0037); a
      // run that nobody can be asked about is refused before the login
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
            showCIMDProfileDeletePlan(options.name, realmOfRun(command, realm)),
        }))
      ) {
        process.exitCode = 1;
        return;
      }

      verboseMessage(
        named
          ? `Deleting CIMD profile "${options.name}".`
          : 'Deleting CIMD profiles.'
      );
      const outcome = await configManagerDeleteCIMDProfiles(
        options.name,
        realmOfRun(command, realm),
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
