import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteCors } from '../../../configManagerOps/FrConfigCorsOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

const { CLASSIC_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

export default function setup() {
  const program = new FrodoCommand('frodo config delete cors');

  program
    .description('Delete CORS configurations.')
    .addOption(
      new Option(
        '--deep',
        'Also reset the IDM CORS filter to its default values (Cloud and ForgeOps; a classic deployment has none). Nothing is deleted by this option. Cannot be used with -i.'
      ).conflicts(['corsId'])
    )
    .addOption(
      selectorOption(
        '-i, --cors-id <id>',
        'CORS configuration id (its name, for example cors); delete only that configuration. If omitted, all named CORS configurations are deleted.',
        ['-n', '--name']
      ).conflicts(['deep'])
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show what would be deleted or reset, without changing anything.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all CORS configurations (no -i). Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Without -i every named CORS configuration is deleted, the one that a new tenant starts with included; browsers that were allowed by a deleted configuration are refused until one allows them again. The IDM CORS filter is not touched unless --deep is given. The CORS service entry itself (the switch that turns the CORS filter of AM on and off) is not changed by this command.\n` +
        `--deep sets initParams and urlPatterns of the IDM CORS filter to the default values and keeps every other key, the filter class among them; it writes only if something differs, and it never deletes the filter. No document states the default values: they are the ones that Cloud and ForgeOps tenants answer with. A classic deployment has no IDM, so the filter is skipped there.\n` +
        `A configuration that is not in the list exits with code 1, also with --dry-run and --allow-failures. The id that the tenant lists is what is deleted, so a value that is written as a path is a configuration that does not exist, and a listed id that is not a plain name (no slash, backslash, question mark, hash, percent sign, double dot, control character, text direction control or invisible separator) is never sent: it counts as failed. Every configuration, and the reset of the filter, is one operation of the summary: one that fails does not stop the others, the command prints one summary and exits with code 1 if any failed; --allow-failures keeps the exit code at 0 for them.\n` +
        `Usage Examples:\n` +
        `  Delete all named CORS configurations without asking, which is required without a terminal (without -y a terminal is asked first):\n` +
        c.command(`  $ frodo config delete cors -y ${s.connId}\n`) +
        `  Preview that:\n` +
        c.command(`  $ frodo config delete cors -d ${s.connId}\n`) +
        `  Delete one CORS configuration:\n` +
        c.command(`  $ frodo config delete cors -i cors ${s.connId}\n`) +
        `  Preview that:\n` +
        c.command(`  $ frodo config delete cors -i cors -d ${s.connId}\n`) +
        `  Delete all named CORS configurations and reset the IDM CORS filter to its default values (nothing is deleted by --deep):\n` +
        c.command(`  $ frodo config delete cors --deep -y ${s.connId}\n`) +
        `  Preview what --deep would reset:\n` +
        c.command(`  $ frodo config delete cors --deep -d ${s.connId}\n`)
    )
    .multiOp()
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
      const named = options.corsId !== undefined;
      if (named && options.corsId.trim() === '') {
        printMessage(
          'The CORS configuration id (-i) must not be empty. To delete all CORS configurations, leave out -i.',
          'error'
        );
        process.exitCode = 1;
        return;
      }

      // a delete of all CORS configurations is asked about, as for a command
      // that can delete more than the one object it names
      // (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md);
      // a run that nobody can be asked about is refused before the login
      const guardOptions = {
        what: options.deep
          ? 'all CORS configurations and reset the IDM CORS filter to its default values'
          : 'all CORS configurations',
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

      // the plan names the configurations and what --deep resets, so the
      // question says what it is about
      const showPlan = () =>
        configManagerDeleteCors(undefined, true, false, {
          deep: options.deep,
          plan: true,
        });
      // the question is about the tenant and not about a realm, which CORS
      // ignores, and it says what --deep resets in a sentence of its own; a
      // classic deployment has no IDM CORS filter, so its question leaves the
      // reset out (the refusal before the login cannot know the deployment)
      const resets =
        options.deep &&
        state.getDeploymentType() !== CLASSIC_DEPLOYMENT_TYPE_KEY;
      const warning = `This permanently deletes all CORS configurations from ${state.getHost()}${resets ? ' and resets the IDM CORS filter to its default values' : ''}.`;
      const asked = {
        ...guardOptions,
        what: resets ? guardOptions.what : 'all CORS configurations',
      };
      if (
        !named &&
        !(await confirmBulkDelete({ ...asked, showPlan, warning }))
      ) {
        process.exitCode = 1;
        return;
      }

      verboseMessage(
        named
          ? `Deleting CORS configuration '${options.corsId}'.`
          : 'Deleting all CORS configurations.'
      );
      const outcome = await configManagerDeleteCors(
        options.corsId,
        options.dryRun,
        options.allowFailures,
        { deep: options.deep }
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
