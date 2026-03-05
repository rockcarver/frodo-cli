import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  configManagerExportAgent,
  configManagerExportAgentsAll,
  configManagerExportAgentsRealm,
  configManagerExportConfigAgents,
} from '../../../configManagerOps/FrConfigOauth2AgentOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const deploymentTypes = ['cloud'];
const { constants } = frodo.utils;
const { readRealms } = frodo.realm;

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull oauth2-agents',
    deploymentTypes
  );

  program
    .description('Export OAuth2 Agents')
    .addOption(
      new Option(
        '-r, --realm <realm>',
        'Specifies the realm to export from. Only the agents from this realm will be exported.'
      )
    )
    .addOption(
      new Option(
        '-n, --agent-name <agent name>',
        'Export specific agent using agentId/agentName.'
      )
    )

    .addOption(
      new Option(
        '-f, --file <file>',
        'The OAUTH2_AGENTS_CONFIG json file. ex: "/home/trivir/Documents/oauth2-agents.json", or "oauth2-agents.json"'
      )
    )
    .addHelpText(
      'after',
      'HELP MESSAGE:\n' +
        'Make sure to create the export config file: oauth2-agents.json to run this command.\n' +
        'Example command: frodo config-manager pull oauth2-agents -f oauth2-agents.json -D ../testDir frodo-dev\n\n' +
        `Config file example:\n` +
        '------------  Example Oauth2 agents export config for oauth2-agents.json file -----------\n' +
        '{\n' +
        ' "alpha": {\n' +
        '   "2.2_Agent": [\n' +
        '     {"id": "my-policy-agent"}\n' +
        '    ],\n' +
        '   "RemoteConsentAgent": [\n' +
        '     {"id": "test", "overrides":{"testestest": "hotdog"}}\n' +
        '   ],\n' +
        '   "SoftwarePublisher": [\n' +
        '     {"id": "test software publisher"}\n' +
        '   ],\n' +
        '    "IdentityGatewayAgent": [\n' +
        '     {"id": "cdsso-ig-agent"},\n' +
        '     {"id": "frodo-test-ig-agent"},\n' +
        '     {"id": "frodo-test-ig-agent2"},\n' +
        '     {"id": "ig-agent", "overrides": {"yes": "no, not yes", "taco":"sandwich"}}\n' +
        '   ],\n' +
        '   "J2EEAgent": [\n' +
        '     {"id": "frodo-test-java-agent"},\n' +
        '     {"id": "frodo-test-java-agent2"}\n' +
        '   ],\n' +
        '   "WebAgent": [\n' +
        '     {"id": "frodo-test-web-agent"},\n' +
        '      {"id": "frodo-test-web-agent2"}\n' +
        '   ]\n' +
        ' }\n' +
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

      // -r/--realm flag has precedence over [realm] arguement
      if (options.realm) {
        realm = options.realm;
      }

      if (await getTokens(false, true, deploymentTypes)) {
        let outcome: boolean;

        // -n/--script-name
        if (options.agentName) {
          printMessage(
            `Exporting the agent "${options.agentName}" from the ${state.getRealm()} realm.`
          );

          // try and find the agent in current realm
          outcome = await configManagerExportAgent(
            options.agentName,
            options.file
          );

          // check other realms for the agent
          if (!outcome && !options.file) {
            const checkedRealms: string[] = [state.getRealm()];
            for (const realm of await readRealms()) {
              if (outcome) {
                break;
              }
              if (!checkedRealms.includes(realm.name)) {
                printMessage(
                  `Exporting the agent "${options.agentName}" from the ${state.getRealm()} realm failed.`
                );
                state.setRealm(realm.name);
                checkedRealms.push(state.getRealm());
                printMessage(
                  `Looking for the agent "${options.agentName}" in the ${state.getRealm()} realm now.`
                );
                outcome = await configManagerExportAgent(
                  options.agentName,
                  null
                );
              }
            }
            if (!outcome) {
              printMessage(
                `Did not find the agent "${options.agentName}" anywhere.`
              );
            }
          }
        }

        // -f/--file
        else if (options.file) {
          printMessage(
            `Exporting all the agents defined in the provided config file.`
          );
          outcome = await configManagerExportConfigAgents(options.file);
        }

        // -r/--realm
        else if (realm !== constants.DEFAULT_REALM_KEY) {
          printMessage(
            `Exporting all the agents from the ${state.getRealm()} realm.`
          );
          outcome = await configManagerExportAgentsRealm();
        }

        // export all oauth2 agents, the default when no options are provided
        else {
          printMessage(`Exporting all the agents in the host tenant.`);
          outcome = await configManagerExportAgentsAll();
        }

        if (!outcome) {
          printMessage(
            `Failed to export one or more oauth2 agents. ${options.verbose ? '' : 'Check --verbose for me details.'}`
          );
          process.exitCode = 1;
        }
      }

      // unrecognized combination of options or no options
      else {
        printMessage(
          'Unrecognized combination of options or no options...',
          'error'
        );
        program.help();
        process.exitCode = 1;
      }
    });

  return program;
}
