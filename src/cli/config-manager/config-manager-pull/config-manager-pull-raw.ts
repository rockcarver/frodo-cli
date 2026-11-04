import { Option } from 'commander';
import { configManagerExportRaw } from '../../../configManagerOps/FrConfigRawOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull raw');

  program
    .description('Export raw configurations from the tenant.')
    .addOption(
      new Option(
        '-f, --config-file <file>',
        'The file path of the service object config file. '
      )
    )
    .addHelpText(
      'after',
      'HELP MESSAGE:\n' +
        'Make sure to create an export config file: raw.json to run this command.\n' +
        'Example command: frodo config-manager pull raw -f raw.json -D ../testDir frodo-dev\n\n' +
        `Config file example:\n` +
        '------------  Example Oauth2 agents export config for oauth2-agents.json file -----------\n' +
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
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      if (await getTokens()) {
        const outcome: boolean = await configManagerExportRaw(
          options.configFile
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
