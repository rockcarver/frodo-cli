import { Authenticate, state } from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import { deleteService, deleteServices } from '../../ops/ServiceOps.js';
import * as common from '../cmd_common.js';

const { getTokens } = Authenticate;

const program = new Command('frodo service delete');

interface ServiceDeleteOptions {
  id?: string;
  type?: string;
  insecure?: boolean;
  verbose?: boolean;
  debug?: boolean;
  curlirize?: boolean;
  all?: boolean;
}

program
  .description('Delete AM services.')
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
  .addOption(new Option('-i, --id <id>', 'Id of Service to be deleted.'))
  .addOption(new Option('-a, --all', 'Delete all services. Ignored with -i.'))
  .action(
    async (
      host: string,
      realm: string,
      user: string,
      password: string,
      options: ServiceDeleteOptions
    ) => {
      state.default.session.setTenant(host);
      state.default.session.setRealm(realm);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      state.default.session.setCurlirize(options.curlirize);
      if (options.id && (await getTokens())) {
        await deleteService(options.id);
      } else if (options.all && (await getTokens())) {
        await deleteServices();
      } else {
        program.help();
      }
    }
  );

program.parse();
