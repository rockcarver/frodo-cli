import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { describeApplicationTemplate } from '../../ops/ApplicationTemplateOps';
import { getTokens } from '../../ops/AuthenticateOps';
import c from '../../utils/ColorTheme';
import { printMessage } from '../../utils/Console.js';
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
    'frodo app template describe',
    [],
    deploymentTypes
  );

  program
    .description('Describe an application template.')
    .addOption(
      new Option(
        '-i, --template-id <template-id>',
        'Template id: the id of one version of a template, as "frodo app template list" prints it (for example 1_2-saml). Ids are not case-sensitive.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '--json',
        'Output the whole template (the form definition and the connector defaults) in JSON format.'
      )
    )
    .addOption(templatesOption())
    .addOption(channelOption())
    // without a tenant there is nothing to connect to: the catalog is public
    .skipConnectionPromptsWhen(
      (command) => !positionalValue(command, 'host') && !state.getHost()
    )
    .addHelpText(
      'after',
      `Without a tenant the command reads the catalog alone and needs no login. With a tenant it also finds the templates the tenant defines itself.\n\n` +
        `Usage Examples:\n` +
        `  Describe the template '${s.appTemplateId}' of the catalog, without a tenant:\n` +
        c.command(`  $ frodo app template describe -i ${s.appTemplateId}\n`) +
        `  Print the whole template in JSON format:\n` +
        c.command(
          `  $ frodo app template describe -i ${s.appTemplateId} --json\n`
        ) +
        `  Describe a template of a tenant, using AM base URL, realm, username and password:\n` +
        c.command(
          `  $ frodo app template describe -i ${s.appTemplateId} ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Describe a template of a tenant using a connection profile:\n` +
        c.command(
          `  $ frodo app template describe -i ${s.appTemplateId} ${s.connId}\n`
        ) +
        `  Describe it from a file that was saved on another machine:\n` +
        c.command(
          `  $ frodo app template describe -i ${s.appTemplateId} --templates ${s.appTemplatesFile}\n`
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
        // an unspecified -i gets a picker from the framework after the login
        // (decision record 0038), so the login comes first
        if (withTenant && !(await getTokens(false, true, deploymentTypes))) {
          process.exitCode = 1;
          return;
        }
        if (!options.templateId) {
          printMessage(
            `Error: -i, --template-id is required. "frodo app template list" prints the ids.`,
            'error'
          );
          process.exitCode = 1;
          return;
        }
        const outcome = await describeApplicationTemplate(options.templateId, {
          templates: options.templates,
          channel: options.channel,
          json: options.json,
          includeOverrides: withTenant,
        });
        if (!outcome) process.exitCode = 1;
      }
      // end command logic inside action handler
    );

  return program;
}
