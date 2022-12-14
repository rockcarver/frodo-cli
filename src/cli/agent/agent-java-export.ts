import { Command, Option } from 'commander';
import { Authenticate, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';
import { verboseMessage } from '../../utils/Console.js';
import {
  exportJavaAgentsToFile,
  exportJavaAgentsToFiles,
  exportJavaAgentToFile,
} from '../../ops/AgentOps.js';

const { getTokens } = Authenticate;

const program = new Command('frodo agent java export');

program
  .description('Export java agents.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgument)
  .addArgument(common.realmArgument)
  .addArgument(common.usernameArgument)
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
      'Export all java agents to a single file. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Export all java agents to separate files (*.javaagent.json) in the current directory. Ignored with -i or -a.'
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
          verboseMessage('Exporting java agent...');
          await exportJavaAgentToFile(options.agentId, options.file);
        }
        // --all -a
        else if (options.all) {
          verboseMessage('Exporting all java agents to a single file...');
          await exportJavaAgentsToFile(options.file);
        }
        // --all-separate -A
        else if (options.allSeparate) {
          verboseMessage('Exporting all java agents to separate files...');
          await exportJavaAgentsToFiles();
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
