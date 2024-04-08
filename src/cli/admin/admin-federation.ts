import { Command } from 'commander';

import { addFederationExport } from './admin-federation-export';
import { addFederationImport } from './admin-federation-import';
import { addFederationList } from './admin-federation-list';

export const addFederation = (command: Command) => {
  const federationCommand = command
    .command('federation')
    .description('Manage admin federation configuration.');

  addFederationExport(federationCommand);
  addFederationImport(federationCommand);
  addFederationList(federationCommand);
};
