import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteSecret, deleteSecrets } from '../../ops/cloud/SecretsOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv secret delete',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Delete secrets.')
    .addOption(
      new Option(
        '-i, --secret-id <secret-id>',
        'Secret id. Cannot be used with -a.'
      ).conflicts(['all'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all secrets in a realm. Cannot be used with -i.'
      ).conflicts(['secretId'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all secrets. Required with -a when there is no terminal.'
      )
    )
    .requireOneOf({ options: ['secretId', 'all'], purpose: 'which secrets' })
    .multiOp()
    .action(
      // implement command logic inside action handler
      async (host, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          user,
          password,
          options,
          command
        );
        // a run that nobody can be asked about is refused before the login
        // (cli record 0037)
        if (
          options.all &&
          !checkBulkDelete({
            what: 'all secrets',
            yes: options.yes,
            dryRunAvailable: false,
          })
        ) {
          process.exitCode = 1;
          return;
        }
        // The login comes first: a secret that was not given is asked for by
        // the framework once it worked (a secret picker, record 0038), and a
        // declined pick makes getTokens fail.
        if (await getTokens(false, true, deploymentTypes)) {
          // delete by id
          if (options.secretId) {
            verboseMessage(`Deleting secret ${options.secretId}...`);
            const outcome = await deleteSecret(options.secretId);
            if (!outcome) process.exitCode = 1;
          }
          // --all -a
          else if (options.all) {
            if (
              !(await confirmBulkDelete({
                what: 'all secrets',
                yes: options.yes,
                dryRunAvailable: false,
              }))
            ) {
              process.exitCode = 1;
              return;
            }
            verboseMessage('Deleting all secrets...');
            const outcome = await deleteSecrets(options.allowFailures);
            if (!outcome) process.exitCode = 1;
          }
          // neither -i nor -a: the picker had no secret to offer. Never fall
          // through to deleting all secrets.
          else {
            printMessage('There is no secret to choose from.', 'error');
            process.exitCode = 1;
          }
        }
        // getTokens() failed, or the user escaped the entity picker (declined
        // to run): keep the old exit-1 semantics.
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
