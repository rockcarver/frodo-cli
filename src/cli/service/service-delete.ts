import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteService, deleteServices } from '../../ops/ServiceOps.js';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo service delete');

  interface ServiceDeleteOptions {
    id?: string;
    yes?: boolean;
    type?: string;
    insecure?: boolean;
    verbose?: boolean;
    debug?: boolean;
    curlirize?: boolean;
    all?: boolean;
    global?: boolean;
    allowFailures?: boolean;
  }

  program
    .description('Delete AM services.')
    .multiOp()
    .addOption(
      new Option(
        '-i, --id <id>',
        'Id of Service to be deleted. Cannot be used with -a.'
      ).conflicts(['all'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all services. Cannot be used with -i.'
      ).conflicts(['id'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all services. Required with -a when there is no terminal.'
      )
    )
    .addOption(new Option('-g, --global', 'Delete global services.'))
    // without it `-y` alone reached the delete of every service
    .requireOneOf({ options: ['id', 'all'], purpose: 'what to delete' })
    .action(
      async (
        host: string,
        realm: string,
        user: string,
        password: string,
        options: ServiceDeleteOptions,
        command
      ) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
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
            what: 'all services',
            yes: options.yes,
            dryRunAvailable: false,
          })
        ) {
          process.exitCode = 1;
          return;
        }

        const globalConfig = options.global ?? false;

        // The login comes first: a service that was not given is asked for by
        // the framework once it worked (a service picker, record 0038), and a
        // declined pick makes getTokens fail.
        if (await getTokens()) {
          // delete by id
          if (options.id) {
            const outcome = await deleteService(options.id, globalConfig);
            if (!outcome) process.exitCode = 1;
          }
          // --all -a
          else if (options.all) {
            if (
              !(await confirmBulkDelete({
                what: 'all services',
                yes: options.yes,
                dryRunAvailable: false,
              }))
            ) {
              process.exitCode = 1;
              return;
            }
            const outcome = await deleteServices(
              globalConfig,
              options.allowFailures
            );
            if (!outcome) process.exitCode = 1;
          }
          // neither -i nor -a: the picker had no service to offer. Never fall
          // through to deleting all services.
          else {
            printMessage('There is no service to choose from.', 'error');
            process.exitCode = 1;
          }
        }
        // getTokens() failed, or the user escaped the entity picker (declined
        // to run): keep the old exit-1 semantics.
        else {
          process.exitCode = 1;
        }
      }
    );

  return program;
}
