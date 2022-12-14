import { Command, Option } from 'commander';
import { Authenticate, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';
import { verboseMessage } from '../../utils/Console.js';
import {
  importFirstIdentityGatewayAgentFromFile,
  importIdentityGatewayAgentFromFile,
  importIdentityGatewayAgentsFromFile,
  importIdentityGatewayAgentsFromFiles,
} from '../../ops/AgentOps.js';

const { getTokens } = Authenticate;

const program = new Command('frodo agent gateway import');

program
  .description('Import gateway agents.')
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
      'Agent id. If specified, only one agent is imported and the options -a and -A are ignored.'
    )
  )
  .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
  .addOption(
    new Option(
      '-a, --all',
      'Import all agents from single file. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Import all agents from separate files (*.identitygatewayagent.json) in the current directory. Ignored with -i or -a.'
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
        // import
        if (options.agentId) {
          verboseMessage(`Importing web agent ${options.agentId} from file...`);
          await importIdentityGatewayAgentFromFile(
            options.agentId,
            options.file
          );
        }
        // --all -a
        else if (options.all && options.file) {
          verboseMessage(
            `Importing all web agents from a single file (${options.file})...`
          );
          await importIdentityGatewayAgentsFromFile(options.file);
        }
        // --all-separate -A
        else if (options.allSeparate && !options.file) {
          verboseMessage('Importing all web agents from separate files...');
          await importIdentityGatewayAgentsFromFiles();
        }
        // import first journey in file
        else if (options.file) {
          verboseMessage('Importing first web agent in file...');
          await importFirstIdentityGatewayAgentFromFile(options.file);
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
