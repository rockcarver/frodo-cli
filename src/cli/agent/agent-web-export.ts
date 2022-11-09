import { Command, Option } from 'commander';
import { Authenticate, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';
import { verboseMessage } from '../../utils/Console.js';
import {
  exportWebAgentsToFile,
  exportWebAgentsToFiles,
  exportWebAgentToFile,
} from '../../ops/AgentOps.js';

const { getTokens } = Authenticate;

const program = new Command('frodo agent web export');

program
  .description('Export web agents.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(common.verboseOption)
  .addOption(common.debugOption)
  .addOption(common.curlirizeOption)
  .addOption(
    new Option(
      '-i, --agent-id <agent-id>',
      'Agent id. If specified, -a and -A are ignored.'
    )
  )
  .addOption(new Option('-f, --file <file>', 'Name of the export file.'))
  .addOption(
    new Option(
      '-a, --all',
      'Export all web agents to a single file. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Export all web agents to separate files (*.webagent.json) in the current directory. Ignored with -i or -a.'
    )
  )
  .action(
    // implement command logic inside action handler
    async (host, realm, user, password, options) => {
      state.default.session.setTenant(host);
      state.default.session.setRealm(realm);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      state.default.session.setCurlirize(options.curlirize);
      if (await getTokens()) {
        // export
        if (options.agentId) {
          verboseMessage('Exporting web agent...');
          await exportWebAgentToFile(options.agentId, options.file);
        }
        // --all -a
        else if (options.all) {
          verboseMessage('Exporting all web agents to a single file...');
          await exportWebAgentsToFile(options.file);
        }
        // --all-separate -A
        else if (options.allSeparate) {
          verboseMessage('Exporting all web agents to separate files...');
          await exportWebAgentsToFiles();
        }
        // unrecognized combination of options or no options
        else {
          verboseMessage(
            'Unrecognized combination of options or no options...'
          );
          program.help();
        }
      }
    }
    // end command logic inside action handler
  );

program.parse();
