import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { configManagerImportSoftwarePublishers } from '../../../ops/SoftwarePublisherConfigOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import {
  KEY_SET_PUSH_SENTENCE,
  PLACEHOLDER_VALUES_SENTENCE,
} from '../../../utils/PlaceholderValues';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager push oauth-software-publishers'
  );

  program
    .summary('Import software publishers from the files written by pull.')
    .description(
      'Import OAuth2 software publishers from the files realms/<realm>/realm-config/agents/SoftwarePublisher/<name>.json that "pull oauth-software-publishers" and "pull oauth2-agents" write, from the working directory (-D). A publisher that does not exist is created and one that does is replaced by the file. A realm that does not offer the agent type is skipped with a warning. ' +
        `${PLACEHOLDER_VALUES_SENTENCE} ` +
        `${KEY_SET_PUSH_SENTENCE} ` +
        'No publisher is ever deleted. A software publisher is a trust anchor: a software statement it signs is accepted when a client registers itself, so read the files before you push them.'
    )
    .addOption(
      new Option(
        '-n, --name <name>',
        'Software publisher name (the name of the object). If specified, pushes only the publisher of the file with that name. Needs a single realm.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Push all software publisher files of all realms from the working directory to the tenant:\n` +
        c.command(
          `  $ frodo config-manager push oauth-software-publishers ${s.connId}\n`
        ) +
        `  Push the software publisher files of one realm:\n` +
        c.command(
          `  $ frodo config-manager push oauth-software-publishers ${s.connId} ${s.realm}\n`
        ) +
        `  Push one software publisher of a realm:\n` +
        c.command(
          `  $ frodo config-manager push oauth-software-publishers -n ${s.softwarePublisherId} ${s.connId} ${s.realm}\n`
        ) +
        `  Push from a config directory other than the working directory:\n` +
        c.command(
          `  $ frodo config-manager push oauth-software-publishers -D ./config ${s.connId}\n`
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
            ? `Importing software publisher "${options.name}".`
            : 'Importing software publishers.'
        );
        const outcome = await configManagerImportSoftwarePublishers(
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
