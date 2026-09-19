import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import fs from 'fs';

import * as s from '../../help/SampleData';
import c from '../../utils/ColorTheme';
import {
  failSpinner,
  printError,
  printMessage,
  showSpinner,
  succeedSpinner,
} from '../../utils/Console';
import { FrodoCommand, hostArgument } from '../FrodoCommand';

const { validateServiceAccount } = frodo.cloud.serviceAccount;
const { loadConnectionProfileByHost } = frodo.conn;

export default function setup() {
  const program = new FrodoCommand(
    'frodo conn service-account add',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description(
      'Add a named, independently-addressable service account to a connection profile, alongside (not instead of) its own single primary service account.'
    )
    .addArgument(hostArgument)
    .addOption(
      new Option(
        '--name <name>',
        'Unique name for this additional service account, within this profile. Used later to address it (e.g. by an MCP claim-to-credential mapping).'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option('--sa-id <id>', 'Service account uuid.').makeOptionMandatory()
    )
    .addOption(
      new Option(
        '--sa-jwk-file <file>',
        'Path to the service account private key JWK file.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '--scope <scope>',
        'Granted OAuth2 scope, if known. Advisory only — not enforced by this command.'
      )
    )
    .addOption(
      new Option(
        '--no-validate',
        'Do not validate the service account against the target host before saving.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Add a named additional service account to an existing connection profile:\n` +
        c.command(
          `  $ frodo conn service-account add --name readonly-sa --sa-id ${s.saId} --sa-jwk-file ${s.saJwkFile} ${s.amBaseUrl}\n`
        )
    )
    .action(async (host: string, options: any, command: FrodoCommand) => {
      command.handleDefaultArgsAndOpts(host, options, command);
      try {
        // `handleDefaultArgsAndOpts` only sets state's host to whatever
        // was typed verbatim (alias, substring, or full URL) -- it never
        // resolves it. Every other call below (`addAdditionalServiceAccount`
        // etc.) takes `host` as an explicit argument and resolves it
        // internally, but `validateServiceAccount` takes no host argument
        // at all and reads `state.getHost()` directly, so an unresolved
        // alias reached it as a literal string and failed to parse as a
        // URL. Resolving here first (the same step `getTokens()` would
        // otherwise do as a side effect, which this command deliberately
        // never calls -- it validates a *different* credential than the
        // profile's own primary one) fixes that for every ambient-state
        // read below, not just this one.
        await loadConnectionProfileByHost(host);
        const jwk = JSON.parse(fs.readFileSync(options.saJwkFile, 'utf8'));
        if (options.validate) {
          showSpinner(`Validating service account ${options.saId}...`);
          const token = await validateServiceAccount(options.saId, jwk);
          if (!token) {
            failSpinner(`Failed to validate service account ${options.saId}.`);
            process.exitCode = 1;
            return;
          }
          succeedSpinner(
            `Successfully validated service account ${options.saId}.`
          );
        }
        await frodo.conn.addAdditionalServiceAccount(
          host,
          options.name,
          options.saId,
          jwk,
          options.scope
        );
        printMessage(
          `Added additional service account '${options.name}' to connection profile ${host}.`
        );
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  return program;
}
