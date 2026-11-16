import { Option } from 'commander';
import { configManagerExportOAuth2Agents } from '../../../configManagerOps/FrConfigOauth2AgentOps';
import * as s from '../../../help/SampleData';
import { ownedObjectsHelp } from '../../../ops/ApplicationOwnedObjectsHelp';
import { getTokens } from '../../../ops/AuthenticateOps';
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
      '\nAgent types: IdentityGatewayAgent, J2EEAgent, WebAgent, 2.2_Agent and SharedAgent (these have a password: use an override with a placeholder, as in the example), OAuth2Client and RemoteConsentAgent.\n' +
        'The agent types CIMDProfile, TrustedJwtIssuer and SoftwarePublisher have a kind of their own: "frodo config-manager pull oauth-cimd-profiles", "frodo config-manager pull oauth-issuers" and "frodo config-manager pull oauth-software-publishers". An entry of one of these types in this file is skipped here with a warning and its overrides are not applied; the file is not changed. Move the entry to the overrides file of that command (--config-file).\n'
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
