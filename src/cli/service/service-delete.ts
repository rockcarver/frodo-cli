import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteService, deleteServices } from '../../ops/ServiceOps.js';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import {
  deferEntityPicks,
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
import { FrodoCommand } from '../FrodoCommand';

type AmServiceSkeleton = Awaited<
  ReturnType<typeof frodo.service.getListOfServices>
>[number];

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
  }

  program
    .description('Delete AM services.')
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

        if (options.id && (await getTokens())) {
          const outcome = await deleteService(options.id, globalConfig);
          if (!outcome) process.exitCode = 1;
        }
        // -a/--all, or an interactive pick (resolveEntityPicks is a no-op
        // outside the prompt gate, so a non-interactive run with neither
        // option never reaches deleteServices here -- same as before
        // in the pre-picker layout, where the error branch below handled that case).
        else if (
          (options.all || (await resolveEntityPicks(command))) &&
          (await getTokens())
        ) {
          if (options.id) {
            const outcome = await deleteService(options.id, globalConfig);
            if (!outcome) process.exitCode = 1;
          } else {
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
            const outcome = await deleteServices(globalConfig);
            if (!outcome) process.exitCode = 1;
          }
        }
        // No branch ran: with requireOneOf satisfied, the only ways here
        // are getTokens() failing (keep the old exit-1 semantics) or the
        // user escaping the entity picker (declined to run).
        else {
          process.exitCode = 1;
        }
      }
    );

  deferEntityPicks(program, [
    // The loader reads the option value at pick time, so -g/--global still
    // scopes the dropdown.
    entityPick<AmServiceSkeleton>({
      name: 'id',
      kind: 'service',
      load: () =>
        frodo.service.getListOfServices(
          program.getOptionValue('global') ?? false
        ),
      label: (service) => service._id ?? '',
    }),
  ]);

  return program;
}
