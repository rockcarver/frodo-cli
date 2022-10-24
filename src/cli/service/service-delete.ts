import { Command, Option } from 'commander';
import { Service, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';
import { getTokens } from '@rockcarver/frodo-lib/types/ops/AuthenticateOps.js';

const { deleteServiceOp } = Service;

const program = new Command('frodo service delete');

interface ServiceDeleteOptions {
  name?: string;
  type?: string;
  insecure?: boolean;
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
  .addOption(new Option('-n, --name <name>', ''))
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
        return deleteServiceOp(options.name);
      }

      program.help();
    }
  );

program.parse();
