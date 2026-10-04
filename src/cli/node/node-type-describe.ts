import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { describeNodeType } from '../../ops/NodeOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo node type describe');

  program
    .description(
      "Describe a node type's configurable-property schema (standard or custom)."
    )
    .addOption(
      new Option(
        '-t, --node-type <node-type>',
        'Standard node type, e.g. PasswordCollectorNode.'
      )
    )
    .addOption(
      new Option(
        '-v, --node-type-version <node-type-version>',
        'Standard node type version.'
      ).default('1.0', '1.0')
    )
    .addOption(
      new Option('-i, --node-id <node-id>', 'Custom node id or service name.')
    )
    .addOption(
      new Option('-n, --node-name <node-name>', 'Custom node display name.')
    )
    .addOption(new Option('--json', 'Output in JSON format.'))
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      const hasStandardSelector = Boolean(options.nodeType);
      const hasCustomSelector = Boolean(options.nodeId || options.nodeName);
      if (hasStandardSelector && !hasCustomSelector && (await getTokens())) {
        verboseMessage(`Describing node type ${options.nodeType}...`);
        const outcome = await describeNodeType(
          options.nodeType,
          options.nodeTypeVersion,
          undefined,
          undefined,
          options.json
        );
        if (!outcome) process.exitCode = 1;
      } else if (
        hasCustomSelector &&
        !hasStandardSelector &&
        (await getTokens())
      ) {
        verboseMessage(
          `Describing custom node ${options.nodeName ? options.nodeName : options.nodeId}...`
        );
        const outcome = await describeNodeType(
          undefined,
          undefined,
          options.nodeId,
          options.nodeName,
          options.json
        );
        if (!outcome) process.exitCode = 1;
      } else {
        printMessage(
          'Provide exactly one of -t, --node-type (standard node type) or -i/-n, --node-id/--node-name (custom node) to describe a node type',
          'error'
        );
        process.exitCode = 1;
        program.help();
      }
    });

  return program;
}
