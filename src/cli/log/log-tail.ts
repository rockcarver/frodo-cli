import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { ensureLogApiCredentials, tailLogs } from '../../ops/LogOps';
import * as config from '../../utils/Config';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';
import { sourcesOptionM } from './log';

const { resolveLevel } = frodo.cloud.log;

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo log tail',
    ['realm'],
    deploymentTypes
  );
  program
    .description('Tail Identity Cloud logs.')
    .addOption(sourcesOptionM)
    .addOption(
      new Option(
        '-l, --level <level>',
        'Set log level filter. You can specify the level as a number or a string. \
  Following values are possible (values on the same line are equivalent): \
  \n0, SEVERE, FATAL, or ERROR\n1, WARNING, WARN or CONFIG\
  \n2, INFO or INFORMATION\n3, DEBUG, FINE, FINER or FINEST\
  \n4 or ALL'
      ).default('ALL', `${resolveLevel('ALL')}`)
    )
    .addOption(
      new Option('-t, --transaction-id <txid>', 'Filter by transactionId')
    )
    .addOption(
      new Option('-d, --defaults', 'Use default logging noise filters').default(
        false,
        `Use custom logging noise filters defined in $HOME/${config.FRODO_LOG_NOISEFILTER_FILENAME}`
      )
    )
    .action(async (host, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(host, user, password, options, command);

      const foundCredentials = await ensureLogApiCredentials(deploymentTypes);

      if (foundCredentials) {
        printMessage(
          `Tailing ID Cloud logs from the following sources: ${
            options.sources
          } and levels [${resolveLevel(
            options.level
          )}] of ${state.getHost()}...`
        );
        await tailLogs(
          command.opts().sources,
          resolveLevel(command.opts().level),
          command.opts().transactionId,
          config.getNoiseFilters(options.defaults)
        );
      }
      // no log api credentials
      else {
        printMessage('No log api credentials found!');
        process.exitCode = 1;
        program.help();
      }
    });

  return program;
}
