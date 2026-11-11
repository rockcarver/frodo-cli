import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { configManagerImportCIMDProfiles } from '../../../ops/CIMDProfileConfigOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager push cimd-profiles');

  program
    .summary('Import CIMD profiles from the files written by pull.')
    .description(
      'Import CIMD profiles from the files realms/<realm>/realm-config/agents/CIMDProfile/<name>.json that "pull cimd-profiles" writes, from the working directory (-D). A profile that does not exist is created and one that does is replaced by exactly what the file holds: what the file leaves out is removed. ${NAME} in a file is replaced by the value of the environment variable NAME. No profile is ever deleted. The scripts and journeys that a profile names must exist already, so push those first. A realm or a deployment that does not offer CIMD profiles is skipped with a warning.'
    )
    .addOption(
      new Option(
        '-n, --name <name>',
        'CIMD profile name. If specified, pushes only the profile of the file with that name. Needs a single realm.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Push all CIMD profile files of all realms from the working directory to the tenant:\n` +
        c.command(`  $ frodo config-manager push cimd-profiles ${s.connId}\n`) +
        `  Push the CIMD profile files of one realm:\n` +
        c.command(
          `  $ frodo config-manager push cimd-profiles ${s.connId} ${s.realm}\n`
        ) +
        `  Push one CIMD profile of a realm:\n` +
        c.command(
          `  $ frodo config-manager push cimd-profiles -n ${s.cimdProfileId} ${s.connId} ${s.realm}\n`
        ) +
        `  Push from a config directory other than the working directory:\n` +
        c.command(
          `  $ frodo config-manager push cimd-profiles -D ./config ${s.connId}\n`
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

      if (await getTokens()) {
        verboseMessage(
          options.name
            ? `Importing CIMD profile "${options.name}".`
            : 'Importing CIMD profiles.'
        );
        const outcome = await configManagerImportCIMDProfiles(
          options.name,
          realmOfRun(command, realm),
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
