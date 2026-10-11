import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteConfigEntityById } from '../../ops/IdmOps';
import {
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
import { FrodoCommand } from '../FrodoCommand';

type IdObjectSkeletonInterface = Awaited<
  ReturnType<typeof frodo.idm.config.readConfigEntities>
>[number];

export default function setup() {
  const program = new FrodoCommand('frodo idm delete');

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

        // const globalConfig = options.global ?? false;

        // An unspecified id prompts for a config entity from the live
        // system (no-op outside the prompt gate) before getTokens.
        if (
          (options.id ||
            (await resolveEntityPicks(command, [
              entityPick<IdObjectSkeletonInterface>({
                name: 'id',
                kind: 'config entity',
                load: () => frodo.idm.config.readConfigEntities(),
                label: (entity) => entity._id ?? '',
              }),
            ]))) &&
          (await getTokens())
        ) {
          const outcome = await deleteConfigEntityById(options.id);
          if (!outcome) process.exitCode = 1;
        }
        // The only ways no branch runs are getTokens() failing (keep the
        // old exit-1 semantics) or the user escaping the entity picker.
        else {
          process.exitCode = 1;
        }
      }
    );

  return program;
}
