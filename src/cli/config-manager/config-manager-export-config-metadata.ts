import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';
import { getConfigMetadata } from '../../configManagerOps/FrConfigCustomConfigMetadata';

const deploymentTypes = ['cloud', 'forgeops'];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager export config-metadata',
    deploymentTypes
  );

  program
    .description(`Shows contents of "<host>/config/custom-config.metadata" if it exists.`)
    .addOption(new Option('-s, --save', 'Saves custom-config.metadata as a json to current working directory'))
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      if (await getTokens(false, true, deploymentTypes)) {
        const outcome = await getConfigMetadata(options.save);
        if (!outcome) process.exitCode = 1;
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
    }
  );

  return program;
}
