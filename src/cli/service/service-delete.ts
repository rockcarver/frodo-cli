import { Authenticate, Service, state } from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';

const { deleteServiceOp } = Service;
const { getTokens } = Authenticate;

const program = new Command('frodo service delete');

interface ServiceDeleteOptions {
  id?: string;
  type?: string;
  insecure?: boolean;
  silent?: boolean;
}

program
  .description('service delete.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(
    new Option(
      '-i, --id <id>',
      'Id of Service to be deleted.'
    ).makeOptionMandatory()
  )
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
      if (await getTokens()) {
        return deleteServiceOp(options.id);
      } else {
        program.help();
      }
    }
  );

program.parse();
