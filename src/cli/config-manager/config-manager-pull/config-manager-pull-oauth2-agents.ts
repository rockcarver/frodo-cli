import { Option } from 'commander';

import { configManagerExportOAuth2Agents } from '../../../configManagerOps/FrConfigOauth2AgentOps';
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
        'Example command: frodo config-manager pull oauth2-agents -f oauth2-agents.json -D ../testDir frodo-dev\n\n' +
        `Config file example:\n` +
        '------------  Example Oauth2 agents export config for oauth2-agents.json file -----------\n' +
        '{\n' +
        '  "/": {},\n' +
        '  "alpha": {\n' +
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
      if (!getTokensIsSuccessful) process.exit(1);
      verboseMessage('Exporting OAuth2 agents.');
      const outcome = await configManagerExportOAuth2Agents(options.file);
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
