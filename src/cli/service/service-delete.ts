import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteService, deleteServices } from '../../ops/ServiceOps.js';
import {
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
    .addOption(new Option('-i, --id <id>', 'Id of Service to be deleted.'))
    .addOption(new Option('-a, --all', 'Delete all services. Ignored with -i.'))
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

        const globalConfig = options.global ?? false;

        if (options.id && (await getTokens())) {
          const outcome = await deleteService(options.id, globalConfig);
          if (!outcome) process.exitCode = 1;
        }
        // -a/--all, or an interactive pick (resolveEntityPicks is a no-op
        // outside the prompt gate, so a non-interactive run with neither
        // option never reaches deleteServices here -- same as before
        // Phase 3, where the error branch below handled that case).
        else if (
          (options.all ||
            (await resolveEntityPicks(command, [
              entityPick<AmServiceSkeleton>({
                name: 'id',
                kind: 'service',
                load: () => frodo.service.getListOfServices(globalConfig),
                label: (service) => service._id ?? '',
              }),
            ]))) &&
          (await getTokens())
        ) {
          if (options.id) {
            const outcome = await deleteService(options.id, globalConfig);
            if (!outcome) process.exitCode = 1;
          } else {
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

  return program;
}
