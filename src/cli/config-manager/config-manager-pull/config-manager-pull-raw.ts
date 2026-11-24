import { InvalidArgumentError, Option } from 'commander';
import { configManagerExportRaw } from '../../../configManagerOps/FrConfigRawOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import c from '../../../utils/ColorTheme';
import { printMessage } from '../../../utils/Console';
import { FrodoCommand, ObjectOption } from '../../FrodoCommand';

/** The only two properties of a push API version. */
const PUSH_API_VERSION_PROPERTIES = ['protocol', 'resource'];

/**
 * The parser of --path: the value as it was typed, unless it is empty or blank. An empty
 * value must never mean "no path", because then `--path "$P"` with `P` unset would pull
 * everything the config file lists.
 * @param {string} value the value of the option
 * @returns {string} the value
 * @throws {InvalidArgumentError} when the value is empty or blank
 */
function refuseBlankPath(value: string): string {
  if (value.trim() === '') {
    throw new InvalidArgumentError(
      'The path must not be empty or blank: leave --path out to pull what the config file lists.'
    );
  }
  return value;
}

/**
 * What is wrong with the value of --push-api-version, which is checked before the command
 * logs in: it needs a protocol and a resource version, each one text, and nothing else.
 * @param {unknown} value the value of the option, the object that its dot notation built
 * @returns {string | undefined} what is wrong with it, or undefined when it is fine
 */
function pushApiVersionProblem(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const example = 'for example -V.protocol 2.1 -V.resource 1.0';
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return `--push-api-version needs a protocol and a resource version, ${example}.`;
  }
  const properties = value as Record<string, unknown>;
  for (const name of Object.keys(properties)) {
    if (!PUSH_API_VERSION_PROPERTIES.includes(name)) {
      return `--push-api-version takes the properties protocol and resource only, not '${name}'.`;
    }
  }
  for (const name of PUSH_API_VERSION_PROPERTIES) {
    if (properties[name] === undefined) {
      return '--push-api-version requires resource and protocol versions.';
    }
    const version = properties[name];
    if (typeof version !== 'string' || version.trim() === '') {
      return `The ${name} of --push-api-version must be a version, ${example}.`;
    }
  }
  return undefined;
}

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull raw');

  program
    .description('Export raw configurations from the tenant.')
    .addOption(
      new Option(
        '--config-file <file>',
        'A JSON file that lists the raw configurations to pull: each item has a "path" and may have "overrides" and "pushApiVersion". Required unless --path is given. With --path, the item of the file that lists that path is pulled, with its overrides and push API version.'
      )
    )
    .addOption(
      new Option(
        '--path <path>',
        'The API path of the one raw configuration to pull, for example /openidm/config/authentication. Without --config-file it is pulled as it is.'
      ).argParser(refuseBlankPath)
    )
    .addOption(
      new Option(
        '--stdout',
        'Print the configuration as JSON on standard output instead of writing files: the object itself with --path, otherwise one list in the order of the config file. Cannot be used with -D.'
      ).conflicts(['directory'])
    )
    .addOption(
      new ObjectOption(
        '-V, --push-api-version <value>',
        'The API version that a push of the pulled file sends, recorded in the file as _pushApiVersion for a path under /am. Set both properties with dot notation, for example: -V.protocol 2.1 -V.resource 1.0. It applies to the item of --path; the items of a config file have their own "pushApiVersion". A read always uses the default API version.'
      )
    )
    .requireOneOf({
      options: ['configFile', 'path'],
      purpose: 'what to pull',
    })
    .addHelpText(
      'after',
      'HELP MESSAGE:\n' +
        'Make sure to create an export config file: raw.json to run this command, or name one API path with --path.\n' +
        `Example command: frodo config-manager pull raw --config-file raw.json -D ../testDir ${s.connId}\n\n` +
        `Config file example:\n` +
        '------------  Example raw export config file raw.json -----------\n' +
        '[\n' +
        '  { "path": "/openidm/config/authentication" },\n' +
        '  {\n' +
        '    "path": "/am/json/realms/root/realms/alpha/realm-config/webhooks/test-webhook",\n' +
        '    "overrides": { "url": "${TEST_WEBHOOK_URL}" },\n' +
        '    "pushApiVersion": {\n' +
        '      "protocol": "2.0",\n' +
        '      "resource": "1.0"\n' +
        '    }\n' +
        '  },\n' +
        '  {"path": "/environment/release"}\n' +
        ']  \n' +
        '* -------------------------------------------------------------------------------------------- \n'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Pull the raw configurations that a config file lists, to the working directory:\n` +
        c.command(
          `  $ frodo config-manager pull raw --config-file raw.json ${s.connId}\n`
        ) +
        `  Pull them to a config directory other than the working directory:\n` +
        c.command(
          `  $ frodo config-manager pull raw --config-file raw.json -D ./config ${s.connId}\n`
        ) +
        `  Pull one raw configuration by its API path, without a config file:\n` +
        c.command(
          `  $ frodo config-manager pull raw --path /openidm/config/authentication ${s.connId}\n`
        ) +
        `  Pull the item of the config file that lists the path, with its overrides and push API version:\n` +
        c.command(
          `  $ frodo config-manager pull raw --config-file raw.json --path /am/json/realms/root/realms/alpha/realm-config/webhooks/test-webhook ${s.connId}\n`
        ) +
        `  Record the API version that a push of the pulled file sends:\n` +
        c.command(
          `  $ frodo config-manager pull raw --path /am/json/realms/root/realms/alpha/realm-config/webhooks/test-webhook -V protocol=2.1 -V resource=1.0 ${s.connId}\n`
        ) +
        `  Print one raw configuration as JSON and push it to another tenant:\n` +
        c.command(
          `  $ frodo config-manager pull raw --path /openidm/config/authentication --stdout ${s.connId} | frodo config-manager push raw --path /openidm/config/authentication --stdin ${s.connId2}\n`
        )
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

      const problem = pushApiVersionProblem(options.pushApiVersion);
      if (problem) {
        printMessage(problem, 'error');
        process.exitCode = 1;
        return;
      }

      if (await getTokens()) {
        const outcome: boolean = await configManagerExportRaw(
          options.configFile,
          options.allowFailures,
          options.path,
          options.stdout,
          options.pushApiVersion
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
