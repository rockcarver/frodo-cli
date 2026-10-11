import { frodo, state, type TreeSkeleton } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteJourney, deleteJourneys } from '../../ops/JourneyOps';
import { verboseMessage } from '../../utils/Console';
import {
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo journey delete');

  program
    .description('Delete journeys/trees.')
    .addOption(
      new Option(
        '-i, --journey-id <journey>',
        'Name of a journey/tree. If specified, -a is ignored.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all the journeys/trees in a realm. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '--deep',
        'Deep delete. Also delete journey node artifacts (for older AM versions).'
      )
    )
    .addOption(
      new Option(
        '--no-deep',
        'Deprecated compatibility flag. Deep delete is disabled by default.'
      ).hideHelp()
    )
    .requireOneOf({ options: ['all', 'journeyId'], purpose: 'what to delete' })
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
        // Default to shallow delete. --deep explicitly opts into legacy deep behavior.
        const deep = options.deep === true;
        const verbose = state.getVerbose();
        const deleteJourneyOptions = { deep, verbose, progress: true };
        const deleteJourneysOptions = { deep, verbose };
        // delete by id
        if (options.journeyId && (await getTokens())) {
          verboseMessage(
            `Deleting journey ${
              options.journeyId
            } in realm "${state.getRealm()}"...`
          );
          const outcome = await deleteJourney(
            options.journeyId,
            deleteJourneyOptions
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all -a, or an interactive pick (resolveEntityPicks is a no-op
        // outside the prompt gate, so a non-interactive run with neither
        // option never reaches deleteJourneys here -- same as before
        // Phase 3, where the resolver's error handled that case).
        else if (
          (options.all ||
            (await resolveEntityPicks(command, [
              entityPick<TreeSkeleton>({
                name: 'journeyId',
                kind: 'journey',
                load: () => frodo.authn.journey.readJourneys(),
                label: (journey) => journey._id ?? '',
              }),
            ]))) &&
          (await getTokens())
        ) {
          if (options.journeyId) {
            verboseMessage(
              `Deleting journey ${
                options.journeyId
              } in realm "${state.getRealm()}"...`
            );
            const outcome = await deleteJourney(
              options.journeyId,
              deleteJourneyOptions
            );
            if (!outcome) process.exitCode = 1;
          } else {
            verboseMessage('Deleting all journeys...');
            const outcome = await deleteJourneys(deleteJourneysOptions);
            if (!outcome) process.exitCode = 1;
          }
        }
        // No branch ran: with requireOneOf satisfied, the only way
        // here is getTokens() failing -- keep the old exit-1 semantics
        // (the removed else handled auth failure too).
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
