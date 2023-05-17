import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate } from '@rockcarver/frodo-lib';
import { importPolicyFromFile } from '../../ops/PolicyOps';

const { getTokens } = Authenticate;

const program = new FrodoCommand('frodo authz policy import');

program
  .description('Import authorization policies.')
  .addOption(
    new Option(
      '-i, --policy-id <policy-id>',
      'Policy id. If specified, only one policy is imported and the options -a and -A are ignored.'
    )
  )
  .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
  .addOption(
    new Option(
      '-a, --all',
      'Import all policies from single file. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Import all policies from separate files (*.policy.authz.json) in the current directory. Ignored with -i or -a.'
    )
  )
  .action(
    // implement command logic inside action handler
    async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      if (await getTokens()) {
        const outcome = importPolicyFromFile(options.policyId, options.file, {
          deps: options.deps,
        });
        if (!outcome) process.exitCode = 1;
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
