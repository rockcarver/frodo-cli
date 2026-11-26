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

/**
 * The notice a run prints (`Deprecated feature in use: 'frodo config-manager pull oauth2-agents'. ...`).
 * The command names are checked against the command tree by
 * test/unit/ConfigManagerOauth2AgentsDeprecation.test.js, so a rename of one of them fails there.
 */
export const PULL_OAUTH2_AGENTS_DEPRECATION_MESSAGE =
  'This command is deprecated and will be removed in a future major release. ' +
  'It does what "frodo config-manager pull oauth-clients" and "frodo config-manager pull agents" do together; use them instead.';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull oauth2-agents');

  program
    .description(
      'Deprecated: pulls what "pull oauth-clients" and "pull agents" pull together.'
    )
    .withStability(
      'deprecated',
      undefined,
      PULL_OAUTH2_AGENTS_DEPRECATION_MESSAGE
    )
    .addOption(
      selectorOption(
        '-i, --agent-id <id>',
        'Agent or OAuth2 client id. If specified, pulls only that object. Needs a single realm (the realm argument); an id that more than one object of the realm has fails and names them. Cannot be used with --config-file.'
      ).conflicts(['configFile'])
    )
    .addOption(
      new Option(
        '--config-file <file>',
        'A JSON file that lists the agents to pull for each realm, with overrides. ex: "oauth2-agents.json". Without it, every agent and OAuth2 client of every realm is pulled. The realm argument narrows a pull without a file; with a file the realms of the file are pulled and the realm argument is not used. Cannot be used with -i.'
      )
        .argParser(refuseEmptySelector)
        .conflicts(['agentId'])
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Pull every agent and OAuth2 client of every realm to realms/<realm>/realm-config/agents/<type>/<id>.json in the working directory:\n` +
        c.command(`  $ frodo config-manager pull oauth2-agents ${s.connId}\n`) +
        `  Pull the agents and OAuth2 clients of one realm:\n` +
        c.command(
          `  $ frodo config-manager pull oauth2-agents ${s.connId} ${s.realm}\n`
        ) +
        `  Pull the agents that ${s.oauth2AgentsConfigFile} lists, for the realms of the file:\n` +
        c.command(
          `  $ frodo config-manager pull oauth2-agents --config-file ${s.oauth2AgentsConfigFile} ${s.connId}\n`
        ) +
        `  Pull to a config directory other than the working directory:\n` +
        c.command(
          `  $ frodo config-manager pull oauth2-agents --config-file ${s.oauth2AgentsConfigFile} -D ./config ${s.connId}\n`
        ) +
        `  Succeed although some agents could not be pulled (the failures are still summarised):\n` +
        c.command(
          `  $ frodo config-manager pull oauth2-agents --config-file ${s.oauth2AgentsConfigFile} --allow-failures ${s.connId}\n`
        )
    )
    .addHelpText(
      'after',
      'HELP MESSAGE:\n' +
        'Without a config file, every agent and every OAuth2 client of every realm is pulled, or of the realm that is given (the three agent types that have a command of their own are left to their own commands). To pull one of them (-i), name the realm too. To pull only some of them, or to apply overrides, create a config file such as oauth2-agents.json and pass it with --config-file.\n' +
        `Example command: frodo config-manager pull oauth2-agents --config-file oauth2-agents.json -D ../testDir ${s.connId}\n\n` +
        `Config file example:\n` +
        '------------  Example Oauth2 agents export config for oauth2-agents.json file -----------\n' +
        '{\n' +
        '  "/": {},\n' +
        '  "alpha": {\n' +
        '    "2.2_Agent": [\n' +
        '      {\n' +
        '        "id": "my-policy-agent",\n' +
        '        "overrides": {\n' +
        '          "userpassword": "\\${MY_POLICY_AGENT_PASSWORD}"\n' +
        '        }\n' +
        '      }\n' +
        '    ],\n' +
        '    "IdentityGatewayAgent": [\n' +
        '      {\n' +
        '        "id": "my-ig-agent",\n' +
        '        "overrides": {\n' +
        '          "userpassword": "\\${IG_AGENT_PASSWORD}"\n' +
        '        }\n' +
        '      }\n' +
        '    ],\n' +
        '    "OAuth2Client": [\n' +
        '      {\n' +
        '        "id": "my-policy-client",\n' +
        '        "overrides": {\n' +
        '          "userpassword": "\\${MY_CLIENT_SECRET}"\n' +
        '        }\n' +
        '      }\n' +
        '    ],\n' +
        '    "RemoteConsentAgent": [\n' +
        '      {\n' +
        '        "id": "my-rcs"\n' +
        '      }\n' +
        '    ],\n' +
        '    "SharedAgent": [\n' +
        '      {\n' +
        '        "id": "my-shared-agent",\n' +
        '        "overrides": {\n' +
        '          "userpassword": "\\${MY_SHARED_AGENT_PASSWORD}"\n' +
        '        }\n' +
        '      }\n' +
        '    ],\n' +
        '    "J2EEAgent": [\n' +
        '      {\n' +
        '        "id": "my-java-agent",\n' +
        '        "overrides": {\n' +
        '          "userpassword": "\\${MY_JAVA_AGENT_PASSWORD}"\n' +
        '        }\n' +
        '      }\n' +
        '    ],\n' +
        '    "WebAgent": [\n' +
        '      {\n' +
        '        "id": "my-web-agent",\n' +
        '        "overrides": {\n' +
        '          "userpassword": "\\${MY_WEB_AGENT_PASSWORD}"\n' +
        '        }\n' +
        '      }\n' +
        '    ]\n' +
        '  },\n' +
        '  "bravo": {}\n' +
        '}\n' +
        '* -------------------------------------------------------------------------------------------- \n'
    )
    .addHelpText(
      'after',
      '\nAgent types: IdentityGatewayAgent, J2EEAgent, WebAgent, 2.2_Agent and SharedAgent (these have a password: use an override with a placeholder, as in the example), OAuth2Client, RemoteConsentAgent, SoapSTSAgent (it exists only in classic deployments) and OAuth2Thing (it exists only where the deployment has enabled it).\n' +
        'The agent types CIMDProfile, TrustedJwtIssuer and SoftwarePublisher have a kind of their own: "frodo config-manager pull oauth-cimd-profiles", "frodo config-manager pull oauth-issuers" and "frodo config-manager pull oauth-software-publishers". An entry of one of these types in this file is skipped here with a warning and its overrides are not applied; the file is not changed. Move the entry to the overrides file of that command (--config-file).\n' +
        `${KEY_SET_PULL_SENTENCE} The types with a key set are OAuth2Client and RemoteConsentAgent.\n` +
        'An entry you write is a request: if the deployment cannot serve its type (for example OAuth2Thing where it is not enabled), that entry fails with the text of the server, the other entries are still pulled, and the command exits with 1 unless --allow-failures is given. The kind for CIMD profiles is different: a deployment that does not have them is nothing to do (a note, exit code 0) unless a name is given.\n'
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
        options.agentId
          ? `Exporting agent or OAuth2 client "${options.agentId}".`
          : 'Exporting OAuth2 agents.'
      );
      // With a file the realms of the file are pulled and the realm is not used;
      // without one, the realm narrows the pull (see configManagerExportOAuth2Agents).
      const outcome = await configManagerExportOAuth2Agents(
        options.configFile ?? null,
        options.allowFailures,
        undefined,
        realmOfRun(command, realm),
        options.agentId
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
