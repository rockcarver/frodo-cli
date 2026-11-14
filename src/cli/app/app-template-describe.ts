import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { describeApplicationTemplate } from '../../ops/ApplicationTemplateOps';
import { getTokens } from '../../ops/AuthenticateOps';
import c from '../../utils/ColorTheme';
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
    .description(
      'Describe an application template: what it provides, its versions, connector, capabilities, object types and application form. The newest version unless -v names another.'
    )
    .addOption(
      new Option(
        '-i, --template-id <template-id>',
        'Template id: the id of the template, as "frodo app template list" prints it (for example azure.ad). Dots and hyphens are the same, and the case does not matter. Cannot be used with -n.'
      ).conflicts(['templateName'])
    )
    .addOption(
      new Option(
        '-n, --template-name <template-name>',
        'Display name of the template (for example "Microsoft Entra"), as "frodo app template list --long" prints it. The case does not matter. Cannot be used with -i.'
      ).conflicts(['templateId'])
    )
    .addOption(
      new Option(
        '-v, --template-version <version>',
        'The version to describe (for example 3.1). Default: the newest version. The versions of a template are listed in its description.'
      )
    )
    .addOption(
      new Option(
        '-l, --long',
        'Long: also the properties of each object type and the fields of the connector configuration and of the application form.'
      ).default(false, 'false')
    )
    .addOption(
      new Option(
        '--json',
        'Output the whole template (the form definition and the connector defaults) in JSON format.'
      )
    )
    .addOption(templatesOption())
    .addOption(channelOption())
    .requireOneOf({
      options: ['templateId', 'templateName'],
      purpose: 'which template to describe',
    })
    // without a tenant there is nothing to connect to: the catalog is public
    .skipConnectionPromptsWhen(
      (command) => !positionalValue(command, 'host') && !state.getHost()
    )
    .addHelpText(
      'after',
      `Without a tenant the command reads the catalog alone and needs no login. With a tenant it also finds the templates the tenant defines itself. A template has several versions; the description of the newest lists the others, and -v describes one of them.\n\n` +
        `Usage Examples:\n` +
        `  Describe the newest version of the template '${s.appTemplateId}' of the catalog, without a tenant:\n` +
        c.command(`  $ frodo app template describe -i ${s.appTemplateId}\n`) +
        `  Describe another version of it:\n` +
        c.command(
          `  $ frodo app template describe -i ${s.appTemplateId} -v ${s.appTemplateVersion}\n`
        ) +
        `  Name the template by its display name:\n` +
        c.command(
          `  $ frodo app template describe -n "${s.appTemplateName}"\n`
        ) +
        `  Add the properties of the object types and the fields of the forms:\n` +
        c.command(
          `  $ frodo app template describe -i ${s.appTemplateId} --long\n`
        ) +
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
        // an unspecified -i/-n gets a picker from the framework after the
        // login (decision record 0038), so the login comes first
        if (withTenant && !(await getTokens(false, true, deploymentTypes))) {
          process.exitCode = 1;
          return;
        }
        const outcome = await describeApplicationTemplate(
          {
            id: options.templateId,
            name: options.templateName,
            version: options.templateVersion,
          },
          {
            templates: options.templates,
            channel: options.channel,
            json: options.json,
            long: options.long,
            includeOverrides: withTenant,
          }
        );
        if (!outcome) process.exitCode = 1;
      }
      // end command logic inside action handler
    );

  return program;
}
