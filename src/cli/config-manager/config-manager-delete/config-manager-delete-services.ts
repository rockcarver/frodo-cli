import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteServices } from '../../../configManagerOps/FrConfigServiceOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

const { DEFAULT_REALM_KEY } = frodo.utils.constants;

export default function setup() {
  const program = new FrodoCommand('frodo config delete services');

  program
    .description('Delete realm services.')
    .addOption(
      selectorOption(
        '-i, --service-id <id>',
        'Service id, for example email; delete only that service of the realm (a realm argument is required). If omitted, all services are deleted.',
        ['-n', '--name']
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which services would be deleted without deleting them.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all services (no -i). Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `A realm service is a setting of the realm (session, base URL, OAuth 2.0 provider, identity stores, and so on); deleting it removes it with its next descendents. Without -i every service that pull services covers is deleted in the selected realms (every realm without a realm argument), DataStoreService excepted. Services that other objects use are not looked up: a journey, client or user that needs a deleted service fails when it runs. Global services are not touched.\n` +
        `A delete of all services names the services that a realm commonly depends on (the identity stores, the OAuth 2.0 provider, the social identity providers, the email service, the PingOne connection, the self-service journeys, the session settings, the base URL and the valid goto URLs) in its plan, and says what goes with them. It does not refuse to delete them: AM accepts every one of these deletions, and what a realm does without one has not been observed by this command. A service that was deleted by mistake can be created again with config push services from a pull services made before, as far as pull services exports it: it never exports DataStoreService, which a delete that names it can still delete.\n` +
        `A service that is not in the realm exits with code 1, also with --dry-run and --allow-failures. Every service is one operation of the summary, named realm/service (root/service in the root realm); a realm whose services cannot be listed, or that the tenant lists with a name that is not a realm name, is one operation of its own, written as realm and its name (realm alpha), so the summary counts it as one. --allow-failures keeps the exit code at 0 for a service that could not be read or deleted and for a realm that could not be listed, but never for a service that is not there. A service whose id, or the type or id of one of its next descendents, is not a plain name (no slash, backslash, question mark, hash, percent sign, double dot, control character or format character) is never deleted: no request is sent for it and it counts as one failed service, however many of its next descendents are not plain. --allow-failures forgives that in a delete of all services, and never in a delete that names the service with -i. A delete of all services that asks first stops at a plan that shows such an id, before the question, and says so. With -i only the named service counts: another service of the realm that cannot be read is a warning.\n` +
        `Usage Examples:\n` +
        `  Delete all services of every realm without asking, which is required without a terminal (without -y a terminal is asked first):\n` +
        c.command(`  $ frodo config delete services -y ${s.connId}\n`) +
        `  Preview the deletion of all services of every realm:\n` +
        c.command(`  $ frodo config delete services -d ${s.connId}\n`) +
        `  Delete all services of the alpha realm without asking:\n` +
        c.command(`  $ frodo config delete services -y ${s.connId} alpha\n`) +
        `  Delete one service of the alpha realm:\n` +
        c.command(
          `  $ frodo config delete services -i email ${s.connId} alpha\n`
        ) +
        `  Preview the deletion of one service of the alpha realm:\n` +
        c.command(
          `  $ frodo config delete services -i email -d ${s.connId} alpha\n`
        )
    )
    .multiOp()
    .usesRealm()
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      // "not given" and "given but empty" are different: an empty id must never
      // mean "all" (-i "$UNSET" gives an empty id); an empty value is refused
      // while the command line is parsed, so this is a blank one
      const named = options.serviceId !== undefined;
      if (named && options.serviceId.trim() === '') {
        printMessage(
          'The service id (-i) must not be empty. To delete all services, leave out -i.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      if (named && (!realm || realm === DEFAULT_REALM_KEY)) {
        printMessage(
          'The -i, --service-id option requires a realm argument to be specified.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      // a delete of all services is asked about, as for a command that can
      // delete more than the one object it names
      // (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md);
      // a run that nobody can be asked about is refused before the login
      const guardOptions = {
        what: 'all services in the selected realms',
        yes: options.yes,
        dryRun: options.dryRun,
      };
      if (!named && !checkBulkDelete(guardOptions)) {
        process.exitCode = 1;
        return;
      }
      if (!(await getTokens())) {
        process.exitCode = 1;
        return;
      }
      const selectedRealm = realmOfRun(command, realm);
      // the plan names the realms, the count and the services, so the question
      // says what it is about
      const showPlan = () =>
        configManagerDeleteServices(undefined, selectedRealm, true, false, {
          plan: true,
        });
      // the question names the realm only when one was given: for every realm
      // the plan above it names the realms, and the default realm of the
      // state (`/`) is none that was asked for
      const realmGiven =
        selectedRealm && selectedRealm !== DEFAULT_REALM_KEY
          ? ` (realm ${selectedRealm})`
          : '';
      const warning = `This permanently deletes ${guardOptions.what} from ${state.getHost()}${realmGiven}.`;
      if (
        !named &&
        !(await confirmBulkDelete({ ...guardOptions, showPlan, warning }))
      ) {
        process.exitCode = 1;
        return;
      }
      verboseMessage(
        named
          ? `Deleting service '${options.serviceId}'.`
          : 'Deleting services.'
      );
      const outcome = await configManagerDeleteServices(
        options.serviceId,
        selectedRealm,
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
