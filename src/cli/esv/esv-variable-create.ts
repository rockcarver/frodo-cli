import { frodo } from '@rockcarver/frodo-lib';

import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { createVariable } from '../../ops/cloud/VariablesOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv variable create',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Create variables.')
    .requiredOption('-i, --variable-id <variable-id>', 'Variable id.')
    .requiredOption('--value <value>', 'Variable value.')
    .option('--description [description]', 'Variable description.')
    .option(
      '--variable-type [variable-type]',
      'Variable type. Must be one of "string", "list", "array", "object", "bool", "int", or "number".',
      'string'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Create an ESV variable using implied default type "string":\n` +
        `  $ frodo esv variable create --variable-id "esv-trinity-phone" --value "(312)-555-0690" --description "Trinity's phone number." ${s.connId}\n`[
          'brightCyan'
        ] +
        `  Create an ESV variable of type "array":\n` +
        `  $ frodo esv variable create --variable-id "esv-nebuchadnezzar-crew" --variable-type array --value '["Morpheus","Trinity","Link","Tank","Dozer","Apoc","Cypher","Mouse","Neo","Switch"]' --description "The crew of the Nebuchadnezzar hovercraft." ${s.connId}\n`[
          'brightCyan'
        ] +
        `  Create an ESV variable of type "object":\n` +
        `  $ frodo esv variable create --variable-id "esv-nebuchadnezzar-crew-structure" --variable-type object --value '{"Captain":"Morpheus","FirstMate":"Trinity","Operator":["Link","Tank"],"Medic":"Dozer","Crewmen":["Apoc","Cypher","Mouse","Neo","Switch"]}' --description "The structure of the crew of the Nebuchadnezzar hovercraft." ${s.connId}\n`[
          'brightCyan'
        ] +
        `  Create an ESV variable of type "int":\n` +
        `  $ frodo esv variable create --variable-id "esv-neo-age" --variable-type int --value '28' --description "Neo's age in the matrix." ${s.connId}\n`[
          'brightCyan'
        ] +
        `  Create an ESV variable of type "bool":\n` +
        `  $ frodo esv variable create --variable-id "esv-blue-piller" --variable-type bool --value 'false' --description "Zion membership criteria." ${s.connId}\n`[
          'brightCyan'
        ]
    )
    .action(
      // implement command logic inside action handler
      async (host, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          user,
          password,
          options,
          command
        );
        if (await getTokens(false, true, deploymentTypes)) {
          verboseMessage('Creating variable...');
          const outcome = await createVariable(
            options.variableId,
            options.value,
            options.description,
            options.variableType
          );
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
