import { Option } from 'commander';
import { configManagerExportOAuth2Agents } from '../../../configManagerOps/FrConfigOauth2AgentOps';
import * as s from '../../../help/SampleData';
import { ownedObjectsHelp } from '../../../ops/ApplicationOwnedObjectsHelp';
import { getTokens } from '../../../ops/AuthenticateOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { KEY_SET_PULL_SENTENCE } from '../../../utils/PlaceholderValues';
import { FrodoCommand } from '../../FrodoCommand';
import { refuseEmptySelector, selectorOption } from '../../SelectorOption';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull oauth-clients');

  program
    .summary('Export OAuth2 clients, one file per client.')
    .description(
      'Export the OAuth2 clients of all realms or of one realm to realms/<realm>/realm-config/agents/OAuth2Client/<id>.json, one file for each. The files are the ones that the deprecated "pull oauth2-agents" writes for the OAuth2 clients, at the same paths. The other agent types are pulled by "pull agents".'
    )
    .addOption(
      selectorOption(
        '-i, --client-id <id>',
        'OAuth2 client id. If specified, pulls only that client. Needs a single realm (the realm argument). Cannot be used with --config-file.'
      ).conflicts(['configFile'])
    )
    .addOption(
      new Option(
        '--config-file <file>',
        `A JSON file that lists the OAuth2 clients to pull for each realm, with overrides. ex: "${s.oauth2AgentsConfigFile}". Without it, every OAuth2 client of every realm is pulled. The realm argument narrows a pull without a file; with a file the realms of the file are pulled and the realm argument is not used. Cannot be used with -i.`
      )
        .argParser(refuseEmptySelector)
        .conflicts(['clientId'])
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Pull every OAuth2 client of every realm to realms/<realm>/realm-config/agents/OAuth2Client/<id>.json in the working directory:\n` +
        c.command(`  $ frodo config-manager pull oauth-clients ${s.connId}\n`) +
        `  Pull the OAuth2 clients of one realm:\n` +
        c.command(
          `  $ frodo config-manager pull oauth-clients ${s.connId} ${s.realm}\n`
        ) +
        `  Pull one OAuth2 client of a realm:\n` +
        c.command(
          `  $ frodo config-manager pull oauth-clients -i ${s.oauth2ClientId} ${s.connId} ${s.realm}\n`
        ) +
        `  Pull the OAuth2 clients that ${s.oauth2AgentsConfigFile} lists, for the realms of the file:\n` +
        c.command(
          `  $ frodo config-manager pull oauth-clients --config-file ${s.oauth2AgentsConfigFile} ${s.connId}\n`
        ) +
        `  Pull to a config directory other than the working directory:\n` +
        c.command(
          `  $ frodo config-manager pull oauth-clients -D ./config ${s.connId}\n`
        ) +
        `  Succeed although some OAuth2 clients could not be pulled (the failures are still summarised):\n` +
        c.command(
          `  $ frodo config-manager pull oauth-clients --config-file ${s.oauth2AgentsConfigFile} --allow-failures ${s.connId}\n`
        )
    )
    .addHelpText(
      'after',
      '\nWithout a config file, every OAuth2 client of every realm is pulled, or of the realm that is given. To pull one of them (-i), name the realm too. To pull only some of them, or to apply overrides, create a config file such as ' +
        `${s.oauth2AgentsConfigFile} and pass it with --config-file.\n` +
        `The config file is the one that "pull agents" and "pull all" read too, so that one file can serve them all: each command pulls the entries of its own types and skips the others with a warning that names the command that pulls them. The config file is never changed.\n` +
        `Config file example:\n` +
        `------------  Example OAuth2 clients export config for ${s.oauth2AgentsConfigFile} file -----------\n` +
        '{\n' +
        '  "/": {},\n' +
        '  "alpha": {\n' +
        '    "OAuth2Client": [\n' +
        '      {\n' +
        '        "id": "my-policy-client",\n' +
        '        "overrides": {\n' +
        '          "userpassword": "${MY_CLIENT_SECRET}"\n' +
        '        }\n' +
        '      }\n' +
        '    ]\n' +
        '  },\n' +
        '  "bravo": {}\n' +
        '}\n' +
        '* -------------------------------------------------------------------------------------------- \n' +
        `${KEY_SET_PULL_SENTENCE}\n` +
        'An entry you write is a request: if the OAuth2 client does not exist, that entry fails with the text of the server, the other entries are still pulled, and the command exits with 1 unless --allow-failures is given.\n'
    )
    .addHelpText('after', ownedObjectsHelp('OAuth2 clients'))
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

      const getTokensIsSuccessful = await getTokens();
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }
      verboseMessage(
        options.clientId
          ? `Exporting OAuth2 client "${options.clientId}".`
          : 'Exporting OAuth2 clients.'
      );
      // With a file the realms of the file are pulled and the realm is not used;
      // without one, the realm narrows the pull (see configManagerExportOAuth2Agents).
      const outcome = await configManagerExportOAuth2Agents(
        options.configFile ?? null,
        options.allowFailures,
        undefined,
        realmOfRun(command, realm),
        options.clientId,
        'oauth-clients'
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
