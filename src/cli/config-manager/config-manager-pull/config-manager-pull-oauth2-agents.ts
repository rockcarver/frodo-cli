import { Option } from 'commander';
import { configManagerExportOAuth2Agents } from '../../../configManagerOps/FrConfigOauth2AgentOps';
import * as s from '../../../help/SampleData';
import { ownedObjectsHelp } from '../../../ops/ApplicationOwnedObjectsHelp';
import { getTokens } from '../../../ops/AuthenticateOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull oauth2-agents');

  program
    .description('Export OAuth2 Agents')
    .addOption(
      new Option(
        '-f, --file <file>',
        'The OAUTH2_AGENTS_CONFIG json file. ex: "/home/trivir/Documents/oauth2-agents.json", or "oauth2-agents.json"'
      ).makeOptionMandatory()
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Pull the agents that ${s.oauth2AgentsConfigFile} lists, for the realms of the file, to realms/<realm>/realm-config/agents/<type>/<id>.json in the working directory:\n` +
        c.command(
          `  $ frodo config-manager pull oauth2-agents -f ${s.oauth2AgentsConfigFile} ${s.connId}\n`
        ) +
        `  Pull to a config directory other than the working directory:\n` +
        c.command(
          `  $ frodo config-manager pull oauth2-agents -f ${s.oauth2AgentsConfigFile} -D ./config ${s.connId}\n`
        ) +
        `  Succeed although some agents could not be pulled (the failures are still summarised):\n` +
        c.command(
          `  $ frodo config-manager pull oauth2-agents -f ${s.oauth2AgentsConfigFile} --allow-failures ${s.connId}\n`
        )
    )
    .addHelpText(
      'after',
      'HELP MESSAGE:\n' +
        'Make sure to create the export config file: oauth2-agents.json to run this command.\n' +
        `Example command: frodo config-manager pull oauth2-agents -f oauth2-agents.json -D ../testDir ${s.connId}\n\n` +
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
        '    "SoftwarePublisher": [\n' +
        '      {\n' +
        '        "id": "My Publisher",\n' +
        '        "overrides": {\n' +
        '          "jwksUri": {\n' +
        '            "inherited": false,\n' +
        '            "value": "\\${MY_PUBLISHER_JWKS_URI}"\n' +
        '          }\n' +
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
      '\nAgent types: IdentityGatewayAgent, J2EEAgent, WebAgent, 2.2_Agent and SharedAgent (these have a password: use an override with a placeholder, as in the example), OAuth2Client, RemoteConsentAgent, SoftwarePublisher, SoapSTSAgent (it exists only in classic deployments) and OAuth2Thing (it exists only where the deployment has enabled it).\n' +
        'The agent types CIMDProfile and TrustedJwtIssuer have a kind of their own: "frodo config-manager pull oauth-cimd-profiles" and "frodo config-manager pull oauth-issuers". An entry of either type in this file is skipped here with a warning and its overrides are not applied; the file is not changed. Move the entry to the overrides file of that command (--config-file).\n' +
        'An entry you write is a request: if the deployment cannot serve its type (for example OAuth2Thing where it is not enabled), that entry fails with the text of the server, the other entries are still pulled, and the command exits with 1 unless --allow-failures is given. The kind for CIMD profiles is different: a deployment that does not have them is nothing to do (a note, exit code 0) unless a name is given.\n'
    )
    .addHelpText('after', ownedObjectsHelp('OAuth2 clients'))
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
      verboseMessage('Exporting OAuth2 agents.');
      const outcome = await configManagerExportOAuth2Agents(
        options.file,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
