import { Option } from 'commander';
import { configManagerExportOAuth2Agents } from '../../../configManagerOps/FrConfigOauth2AgentOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { KEY_SET_PULL_SENTENCE } from '../../../utils/PlaceholderValues';
import { FrodoCommand } from '../../FrodoCommand';
import { refuseEmptySelector, selectorOption } from '../../SelectorOption';

export default function setup() {
  const program = new FrodoCommand('frodo config pull agents');

  program
    .summary('Export agents, one file per agent.')
    .description(
      'Export the agents (the gateway, Java, web and policy agents and the other agent types listed below, but not the OAuth2 clients) of all realms or of one realm to realms/<realm>/realm-config/agents/<type>/<id>.json, one file for each. The OAuth2 clients are pulled by "pull oauth-clients".'
    )
    .addOption(
      selectorOption(
        '-i, --agent-id <id>',
        'Agent id. If specified, pulls only that agent. Needs a single realm (the realm argument); an id that more than one agent of the realm has fails and names them. Cannot be used with --config-file.'
      ).conflicts(['configFile'])
    )
    .addOption(
      new Option(
        '--config-file <file>',
        `A JSON file that lists the agents to pull for each realm, with overrides. ex: "${s.oauth2AgentsConfigFile}". Without it, every agent of every realm is pulled. The realm argument narrows a pull without a file; with a file the realms of the file are pulled and the realm argument is not used. Cannot be used with -i.`
      )
        .argParser(refuseEmptySelector)
        .conflicts(['agentId'])
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Pull every agent of every realm to realms/<realm>/realm-config/agents/<type>/<id>.json in the working directory:\n` +
        c.command(`  $ frodo config pull agents ${s.connId}\n`) +
        `  Pull the agents of one realm:\n` +
        c.command(`  $ frodo config pull agents ${s.connId} ${s.realm}\n`) +
        `  Pull one agent of a realm:\n` +
        c.command(
          `  $ frodo config pull agents -i ${s.agentId} ${s.connId} ${s.realm}\n`
        ) +
        `  Pull the agents that ${s.oauth2AgentsConfigFile} lists, for the realms of the file:\n` +
        c.command(
          `  $ frodo config pull agents --config-file ${s.oauth2AgentsConfigFile} ${s.connId}\n`
        ) +
        `  Pull to a config directory other than the working directory:\n` +
        c.command(`  $ frodo config pull agents -D ./config ${s.connId}\n`) +
        `  Succeed although some agents could not be pulled (the failures are still summarised):\n` +
        c.command(
          `  $ frodo config pull agents --config-file ${s.oauth2AgentsConfigFile} --allow-failures ${s.connId}\n`
        )
    )
    .addHelpText(
      'after',
      '\nWithout a config file, every agent of every realm is pulled, or of the realm that is given. To pull one of them (-i), name the realm too. To pull only some of them, or to apply overrides, create a config file such as ' +
        `${s.oauth2AgentsConfigFile} and pass it with --config-file.\n` +
        `The config file is the one that "pull oauth-clients" and "pull all" read too, so that one file can serve them all: each command pulls the entries of its own types and skips the others with a warning that names the command that pulls them. The config file is never changed.\n` +
        `Config file example:\n` +
        `------------  Example agents export config for ${s.oauth2AgentsConfigFile} file -----------\n` +
        '{\n' +
        '  "/": {},\n' +
        '  "alpha": {\n' +
        '    "2.2_Agent": [\n' +
        '      {\n' +
        '        "id": "my-policy-agent",\n' +
        '        "overrides": {\n' +
        '          "userpassword": "${MY_POLICY_AGENT_PASSWORD}"\n' +
        '        }\n' +
        '      }\n' +
        '    ],\n' +
        '    "IdentityGatewayAgent": [\n' +
        '      {\n' +
        '        "id": "my-ig-agent",\n' +
        '        "overrides": {\n' +
        '          "userpassword": "${IG_AGENT_PASSWORD}"\n' +
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
        '          "userpassword": "${MY_SHARED_AGENT_PASSWORD}"\n' +
        '        }\n' +
        '      }\n' +
        '    ],\n' +
        '    "J2EEAgent": [\n' +
        '      {\n' +
        '        "id": "my-java-agent",\n' +
        '        "overrides": {\n' +
        '          "userpassword": "${MY_JAVA_AGENT_PASSWORD}"\n' +
        '        }\n' +
        '      }\n' +
        '    ],\n' +
        '    "WebAgent": [\n' +
        '      {\n' +
        '        "id": "my-web-agent",\n' +
        '        "overrides": {\n' +
        '          "userpassword": "${MY_WEB_AGENT_PASSWORD}"\n' +
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
      '\nAgent types: IdentityGatewayAgent, J2EEAgent, WebAgent, 2.2_Agent and SharedAgent (these have a password: use an override with a placeholder, as in the example), RemoteConsentAgent, SoapSTSAgent (it exists only in classic deployments) and OAuth2Thing (it exists only where the deployment has enabled it).\n' +
        'The OAuth2 clients are pulled by "frodo config pull oauth-clients". An OAuth2Client entry in the config file is skipped here with a warning; its overrides are not applied and the file is not changed. Move the entry to the config file of that command (--config-file).\n' +
        'The agent types CIMDProfile, TrustedJwtIssuer and SoftwarePublisher have a command of their own: "frodo config pull oauth-cimd-profiles", "frodo config pull oauth-issuers" and "frodo config pull oauth-software-publishers". An entry of one of these types in the config file is skipped here with a warning, too.\n' +
        `${KEY_SET_PULL_SENTENCE} The type with a key set is RemoteConsentAgent.\n` +
        'An entry you write is a request: if the deployment cannot serve its type (for example OAuth2Thing where it is not enabled), that entry fails with the text of the server, the other entries are still pulled, and the command exits with 1 unless --allow-failures is given.\n'
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

      const getTokensIsSuccessful = await getTokens();
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }
      verboseMessage(
        options.agentId
          ? `Exporting agent "${options.agentId}".`
          : 'Exporting agents.'
      );
      // With a file the realms of the file are pulled and the realm is not used;
      // without one, the realm narrows the pull (see configManagerExportOAuth2Agents).
      const outcome = await configManagerExportOAuth2Agents(
        options.configFile ?? null,
        options.allowFailures,
        undefined,
        realmOfRun(command, realm),
        options.agentId,
        'agents'
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
