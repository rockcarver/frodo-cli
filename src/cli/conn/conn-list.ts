import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { ConnectionProfile } from '@rockcarver/frodo-lib';

const { listConnectionProfiles } = ConnectionProfile;

const program = new FrodoCommand('frodo conn list', [
  'host',
  'realm',
  'username',
  'password',
  'type',
  'insecure',
  'curlirize',
]);

program
  .description('List connection profiles.')
  .addOption(
    new Option('-l, --long', 'Long with all fields.').default(false, 'false')
  )
  .action(
    // implement command logic inside action handler
    async (options, command) => {
      command.handleDefaultArgsAndOpts(options, command);
      listConnectionProfiles(options.long);
    }
    // end command logic inside action handler
  );

program.parse();
