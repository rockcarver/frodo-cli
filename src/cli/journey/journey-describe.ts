import fs from 'fs';
import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  describeJourney,
  describeJourneyMd,
  describeJourneys,
} from '../../ops/JourneyOps';
import c from '../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { saveTextToFile } = frodo.utils;
const { createFileParamTreeExportResolver } = frodo.authn.journey;

export default function setup() {
  const program = new FrodoCommand('frodo journey describe');

  program
    .description(
      'If -h is supplied, describe the journey/tree indicated by -i, or all journeys/trees in the realm if no -i is supplied, otherwise describe the journey/tree export file indicated by -f.'
    )
    .addOption(
      new Option('-i, --journey-id <journey>', 'Name of a journey/tree.')
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the journey export file to describe.'
      )
    )
    .addOption(
      new Option(
        '-O, --output-file <file>',
        'Name of the file to write the output to.'
      )
    )
    .addOption(new Option('--markdown', 'Output in markdown.'))
    .addOption(
      new Option(
        '-o, --override-version <version>',
        "Override version. Notation: '<major>.<minor>.<patch>' e.g. '7.2.0'. Override detected version with any version. This is helpful in order to check if journeys in one environment would be compatible running in another environment (e.g. in preparation of migrating from on-prem to ForgeRock Identity Cloud."
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Describe one live journey using a connection profile:\n` +
        c.command(
          `  $ frodo journey describe -i ${s.journeyId} ${s.connId}\n`
        ) +
        `  Describe every live journey in a realm and log in with AM base URL, username, and password:\n` +
        c.command(
          `  $ frodo journey describe ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Describe a journey from an export file without logging in:\n` +
        c.command(
          `  $ frodo journey describe -i ${s.journeyId} -f ${s.journeyFile}\n`
        ) +
        `  Write a journey's description as Markdown to a file:\n` +
        c.command(
          `  $ frodo journey describe -i ${s.journeyId} --markdown -O ${s.journeyMarkdownFile} ${s.connId}\n`
        )
    )
    .multiOp()
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
        host = host ? host : state.getHost();
        if (options.outputFile) state.setOutputFile(options.outputFile);
        // TODO: review checks for arguments
        if (
          typeof host === 'undefined' ||
          typeof options.file !== 'undefined'
        ) {
          if (
            typeof host === 'undefined' &&
            typeof options.file === 'undefined'
          ) {
            printMessage('Need either [host] or -f.', 'error');
            process.exitCode = 1;
            return;
          }
          verboseMessage(`Describing local journey file ${options.file}...`);
          try {
            // override version
            if (typeof options.overrideVersion !== 'undefined') {
              state.setAmVersion(options.overrideVersion);
            }
            const fileData = JSON.parse(fs.readFileSync(options.file, 'utf8'));
            let journeyData;
            // single or multi tree export?
            // multi - by id
            if (
              typeof options.journeyId !== 'undefined' &&
              fileData.trees &&
              fileData.trees[options.journeyId]
            ) {
              journeyData = fileData.trees[options.journeyId];
            }
            // multi - first
            else if (
              typeof options.journeyId === 'undefined' &&
              fileData.trees
            ) {
              [journeyData] = Object.values(fileData.trees);
            }
            // single - by id
            else if (
              typeof options.journeyId !== 'undefined' &&
              options.journeyId === fileData.tree?._id
            ) {
              journeyData = fileData;
            }
            // single
            else if (
              typeof options.journeyId === 'undefined' &&
              fileData.tree?._id
            ) {
              journeyData = fileData;
            }
            // no journey/tree found
            else {
              throw new Error(
                typeof options.journeyId === 'undefined'
                  ? `No journey found in ${options.file}`
                  : `Journey '${options.journeyId}' not found in ${options.file}`
              );
            }
            // ANSI text output
            if (!options.markdown) {
              const outcome = await describeJourney(
                journeyData,
                createFileParamTreeExportResolver(options.file)
              );
              if (!outcome) process.exitCode = 1;
            }
            // Markdown output
            else {
              // reset output file
              if (options.outputFile) saveTextToFile('', options.outputFile);
              const outcome = await describeJourneyMd(
                journeyData,
                createFileParamTreeExportResolver(options.file)
              );
              if (!outcome) process.exitCode = 1;
            }
          } catch (error) {
            printMessage(error.message, 'error');
            process.exitCode = 1;
          }
        } else if (await getTokens()) {
          verboseMessage(
            `Describing journey(s) in realm "${state.getRealm()}"...`
          );
          const outcome = await describeJourneys(
            {
              journeyId: options.journeyId,
              markdown: options.markdown,
              outputFile: options.outputFile,
              overrideVersion: options.overrideVersion,
            },
            options.allowFailures
          );
          if (!outcome) process.exitCode = 1;
        }
        // a failed login has been reported by getTokens
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
