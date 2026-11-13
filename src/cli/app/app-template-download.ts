import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { downloadApplicationTemplateCatalog } from '../../ops/ApplicationTemplateOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  // the catalog is public: the command needs no tenant and no login
  const program = new FrodoCommand(
    'frodo app template download',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description(
      'Download the application template catalog from the CDN and save it to a file, to copy it to a machine that cannot reach the internet.'
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the file to save the catalog to. Default: appTemplates.json in the working directory.'
      )
    )
    .addOption(
      new Option(
        '--channel <channel>',
        'Which catalog of the CDN to download: production or development (the development catalog holds a few more template versions). Default: production.'
      ).choices(['production', 'development'])
    )
    .addHelpText(
      'after',
      `The command asks the CDN whether the catalog changed since the copy frodo keeps in ~/.frodo/AppTemplates; a catalog that did not change is not downloaded again. In air-gapped mode it makes no request and saves the copy that is kept.\n\n` +
        `Usage Examples:\n` +
        `  Download the catalog and save it as ${s.appTemplatesFile}:\n` +
        c.command(`  $ frodo app template download\n`) +
        `  Save it to a file of your choice:\n` +
        c.command(`  $ frodo app template download -f my-templates.json\n`) +
        `  Download the development catalog:\n` +
        c.command(
          `  $ frodo app template download --channel development -f dev-templates.json\n`
        )
    )
    .action(
      // implement command logic inside action handler
      async (options, command) => {
        command.handleDefaultArgsAndOpts(options, command);
        verboseMessage(`Downloading the application template catalog...`);
        const outcome = await downloadApplicationTemplateCatalog(
          options.file,
          options.channel
        );
        if (!outcome) process.exitCode = 1;
      }
      // end command logic inside action handler
    );

  return program;
}
