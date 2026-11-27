import { configManagerImportAgents } from '../../../configManagerOps/FrConfigOauth2AgentOps';
import * as s from '../../../help/SampleData';
import { ownedObjectsPushHelp } from '../../../ops/ApplicationOwnedObjectsHelp';
import { getTokens } from '../../../ops/AuthenticateOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import {
  KEY_SET_PUSH_SENTENCE,
  PLACEHOLDER_VALUES_RULE,
} from '../../../utils/PlaceholderValues';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config push oauth-clients');

  program
    .summary('Import OAuth2 clients from the files written by pull.')
    .description(
      'Import the OAuth2 clients from the files realms/<realm>/realm-config/agents/OAuth2Client/<id>.json that "pull oauth-clients" writes, from the working directory (-D). The agents that "push agents" handles are not pushed here.'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Push every OAuth2 client file of the tree in the working directory (realms/<realm>/realm-config/agents/OAuth2Client/<id>.json) to the tenant:\n` +
        c.command(`  $ frodo config push oauth-clients ${s.connId}\n`) +
        `  Push from a config directory other than the working directory:\n` +
        c.command(
          `  $ frodo config push oauth-clients -D ./config ${s.connId}\n`
        ) +
        `  Succeed although some OAuth2 clients could not be pushed (the failures are still summarised):\n` +
        c.command(
          `  $ frodo config push oauth-clients --allow-failures ${s.connId}\n`
        )
    )
    .addHelpText(
      'after',
      '\nThe files in the folder realms/<realm>/realm-config/agents/OAuth2Client are pushed. The folders of the agent types that "push agents" handles are not read here: "push agents" pushes them.\n' +
        'The agent types CIMDProfile, TrustedJwtIssuer and SoftwarePublisher have a command of their own: "frodo config push oauth-cimd-profiles", "frodo config push oauth-issuers" and "frodo config push oauth-software-publishers". The folders of those types are skipped here with a warning; no file in them is read or changed.\n' +
        `Each \${NAME} in a file ${PLACEHOLDER_VALUES_RULE} The client secret is pulled with an override that holds such a placeholder. ${KEY_SET_PUSH_SENTENCE}\n` +
        'A file you push is a request: if the deployment cannot serve it, that file fails with the text of the library or of the server, the other files are still pushed, and the command exits with 1 unless --allow-failures is given.\n'
    )
    .addHelpText('after', ownedObjectsPushHelp('OAuth2 clients'))
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

      const getTokensIsSuccessful = await getTokens();
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }

      verboseMessage('Importing OAuth2 clients.');
      const outcome = await configManagerImportAgents(
        options.allowFailures,
        'oauth-clients'
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
