import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { listApplicationTemplates } from '../../ops/ApplicationTemplateOps';
import { getTokens } from '../../ops/AuthenticateOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console.js';
import { positionalValue } from '../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../FrodoCommand';
import { channelOption, templatesOption } from './app-template-options';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo app template list',
    [],
    deploymentTypes
  );

  program
    .description(
      'List application templates, one per template with its newest version: the catalog of the Admin UI, with the templates of the tenant merged over it when a tenant is given.'
    )
    .addOption(
      new Option(
        '-l, --long',
        'Long: a table with the name, category, what the template provides (letters that are explained below the table), its newest version (a star means that older versions exist) and the date of the newest version.'
      ).default(false, 'false')
    )
    .addOption(
      new Option(
        '--all-versions',
        'List every version of every template, not only the newest: the id and the version (with --long also the name, category, what it provides and the date of each version).'
      ).default(false, 'false')
    )
    .addOption(templatesOption())
    .addOption(channelOption())
    // without a tenant there is nothing to connect to: the catalog is public
    .skipConnectionPromptsWhen(
      (command) => !positionalValue(command, 'host') && !state.getHost()
    )
    .addHelpText(
      'after',
      `Without a tenant the command lists the catalog alone and needs no login. With a tenant (AM base URL, connection profile or alias) it logs in and merges the templates the tenant defines itself, marked as overrides. "frodo app template describe" takes an id as printed here and describes the newest version of the template, or the one that -v names.\n\n` +
        `Usage Examples:\n` +
        `  List the ids of the templates of the catalog, without a tenant:\n` +
        c.command(`  $ frodo app template list\n`) +
        `  List them with the name, category, what they provide and the newest version:\n` +
        c.command(`  $ frodo app template list --long\n`) +
        `  List every version of every template:\n` +
        c.command(`  $ frodo app template list --all-versions\n`) +
        `  List every version with its name, category, what it provides and its date:\n` +
        c.command(`  $ frodo app template list --long --all-versions\n`) +
        `  List the catalog and the templates of a tenant, using AM base URL, realm, username and password:\n` +
        c.command(
          `  $ frodo app template list --long ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  List the catalog and the templates of a tenant using a connection profile:\n` +
        c.command(`  $ frodo app template list --long ${s.connId}\n`) +
        `  List the catalog from a file that was saved on another machine:\n` +
        c.command(
          `  $ frodo app template list --long --templates ${s.appTemplatesFile}\n`
        )
    )
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
        const withTenant = !!state.getHost();
        if (withTenant && !(await getTokens(false, true, deploymentTypes))) {
          process.exitCode = 1;
          return;
        }
        verboseMessage(`Listing application templates...`);
        const outcome = await listApplicationTemplates({
          templates: options.templates,
          channel: options.channel,
          long: options.long,
          allVersions: options.allVersions,
          includeOverrides: withTenant,
        });
        if (!outcome) process.exitCode = 1;
      }
      // end command logic inside action handler
    );

  return program;
}
