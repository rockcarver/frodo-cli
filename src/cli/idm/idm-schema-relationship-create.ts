import {
  frodo,
  FrodoError,
  type ManagedObjectSchemaRelationshipPropertyFields as RelationshipPropertyFields,
  type ManagedObjectSchemaRelationshipReverseFields as RelationshipReverseCreateFields,
} from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { createManagedObjectSchemaRelationshipProperty } from '../../ops/IdmOps';
import c from '../../utils/ColorTheme';
import { printError, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export default function setup() {
  const program = new FrodoCommand(
    'frodo idm schema relationship create',
    [],
    deploymentTypes
  );

  program
    .description('Create IDM managed object relationship schema definition.')
    .addOption(
      new Option(
        '-o, --managed-object <type>',
        'Managed object type.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '-p, --property <name>',
        'Relationship property name.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '--target-object <type>',
        'Managed object type this relationship points to.'
      ).makeOptionMandatory()
    )
    .addOption(new Option('--many', 'This is a to-many (array) relationship.'))
    .addOption(
      new Option('--single', 'This is a to-one (single) relationship.')
    )
    .addOption(
      new Option(
        '--query-fields <csv>',
        'Comma-separated list of fields to fetch from the target object.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '--title <text>',
        'Display title. Defaults to a title-cased version of the property name.'
      )
    )
    .addOption(new Option('--description <text>', 'Property description.'))
    .addOption(
      new Option(
        '--label <text>',
        'Resource collection label. Defaults to a title-cased version of --target-object.'
      )
    )
    .addOption(
      new Option(
        '--query-filter <filter>',
        'Query filter applied against the target object. Default: "true" (match all).'
      )
    )
    .addOption(
      new Option('--sort-keys <csv>', 'Comma-separated list of sort keys.')
    )
    .addOption(
      new Option(
        '--notify',
        'Notify the target object of relationship changes. Default: false.'
      )
    )
    .addOption(
      new Option(
        '--notify-self',
        'Notify this object of relationship changes. Default: false.'
      )
    )
    .addOption(
      new Option('--searchable', 'Mark the property searchable in the UI.')
    )
    .addOption(
      new Option(
        '--user-editable',
        'Allow end users to edit this property. Default: false.'
      )
    )
    .addOption(
      new Option(
        '--not-viewable',
        'Hide this property in the UI. Default: viewable.'
      )
    )
    .addOption(
      new Option(
        '--not-validate',
        'Skip target-existence validation on write. Default: validated.'
      )
    )
    .addOption(
      new Option(
        '--return-by-default',
        'Return this property by default on reads. Default: false.'
      )
    )
    .addOption(
      new Option(
        '--reverse-property-name <name>',
        'Marks this relationship as having a reverse property of this name on --target-object, without writing that property. Use --reverse-property instead to also create it.'
      )
    )
    .addOption(
      new Option(
        '--reverse-property <name>',
        'Also create the reverse side of this relationship, as this property name on --target-object, pointing back at -o/--managed-object.'
      )
    )
    .addOption(
      new Option(
        '--reverse-many',
        'The reverse side is a to-many (array) relationship.'
      )
    )
    .addOption(
      new Option(
        '--reverse-single',
        'The reverse side is a to-one (single) relationship.'
      )
    )
    .addOption(
      new Option(
        '--reverse-query-fields <csv>',
        'Comma-separated list of fields to fetch from -o/--managed-object, for the reverse side.'
      )
    )
    .addOption(
      new Option(
        '--reverse-title <text>',
        'Reverse side display title. Defaults to a title-cased version of --reverse-property.'
      )
    )
    .addOption(
      new Option(
        '--reverse-description <text>',
        'Reverse side display description.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Create the "${s.relationshipPropertyName}" relationship, pointing from "${s.managedObjectTitle}" at "${s.targetManagedObjectType}":\n` +
        c.command(
          `  $ frodo idm schema relationship create -o ${s.managedObjectType} -p ${s.relationshipPropertyName} --target-object ${s.targetManagedObjectType} --single --query-fields "${s.relationshipQueryFields}" ${s.amBaseUrl}\n`
        ) +
        `  Create it bidirectionally, auto-creating the reverse "${s.reverseRelationshipPropertyName}" property on "${s.targetManagedObjectType}":\n` +
        c.command(
          `  $ frodo idm schema relationship create -o ${s.managedObjectType} -p ${s.relationshipPropertyName} --target-object ${s.targetManagedObjectType} --single --query-fields "${s.relationshipQueryFields}" --reverse-property ${s.reverseRelationshipPropertyName} --reverse-many --reverse-query-fields name ${s.connId}\n`
        ) +
        `  Create a to-many relationship instead, one "${s.managedObjectTitle}" pointing at multiple "${s.targetManagedObjectType}" records:\n` +
        c.command(
          `  $ frodo idm schema relationship create -o ${s.managedObjectType} -p ${s.manyRelationshipPropertyName} --target-object ${s.targetManagedObjectType} --many --query-fields "${s.relationshipQueryFields}" ${s.connId}\n`
        ) +
        `  Create it with a custom label, query filter, sort order, and change notifications on both sides:\n` +
        c.command(
          `  $ frodo idm schema relationship create -o ${s.managedObjectType} -p ${s.relationshipPropertyName} --target-object ${s.targetManagedObjectType} --single --query-fields "${s.relationshipQueryFields}" --label "Pilot" --query-filter 'accountStatus eq "active"' --sort-keys sn --notify --notify-self ${s.connId}\n`
        ) +
        `  Mark it as having a reverse property that already exists on "${s.targetManagedObjectType}", without creating it:\n` +
        c.command(
          `  $ frodo idm schema relationship create -o ${s.managedObjectType} -p ${s.relationshipPropertyName} --target-object ${s.targetManagedObjectType} --single --query-fields "${s.relationshipQueryFields}" --reverse-property-name ${s.reverseRelationshipPropertyName} ${s.connId}\n`
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
        if (options.many && options.single) {
          printError(
            new FrodoError('Pass only one of --many or --single, not both.')
          );
          process.exitCode = 1;
          return;
        }
        if (!options.many && !options.single) {
          printError(new FrodoError('One of --many or --single is required.'));
          process.exitCode = 1;
          return;
        }
        if (options.reverseProperty && options.reversePropertyName) {
          printError(
            new FrodoError(
              '--reverse-property already implies a reverse property name; do not also pass --reverse-property-name.'
            )
          );
          process.exitCode = 1;
          return;
        }
        let reverse: RelationshipReverseCreateFields | undefined;
        if (options.reverseProperty) {
          if (options.reverseMany && options.reverseSingle) {
            printError(
              new FrodoError(
                'Pass only one of --reverse-many or --reverse-single, not both.'
              )
            );
            process.exitCode = 1;
            return;
          }
          if (!options.reverseMany && !options.reverseSingle) {
            printError(
              new FrodoError(
                '--reverse-property requires one of --reverse-many or --reverse-single.'
              )
            );
            process.exitCode = 1;
            return;
          }
          if (!options.reverseQueryFields) {
            printError(
              new FrodoError(
                '--reverse-property requires --reverse-query-fields.'
              )
            );
            process.exitCode = 1;
            return;
          }
          reverse = {
            propertyName: options.reverseProperty,
            many: !!options.reverseMany,
            queryFields: splitCsv(options.reverseQueryFields),
            title: options.reverseTitle,
            description: options.reverseDescription,
          };
        } else if (
          options.reverseMany ||
          options.reverseSingle ||
          options.reverseQueryFields ||
          options.reverseTitle ||
          options.reverseDescription
        ) {
          printError(
            new FrodoError(
              '--reverse-many/--reverse-single/--reverse-query-fields/--reverse-title/--reverse-description require --reverse-property.'
            )
          );
          process.exitCode = 1;
          return;
        }
        if (await getTokens(false, true, deploymentTypes)) {
          verboseMessage(
            `Creating relationship property "${options.property}" on "${options.managedObject}"...`
          );
          const fields: RelationshipPropertyFields = {
            targetObject: options.targetObject,
            many: !!options.many,
            queryFields: splitCsv(options.queryFields),
            title: options.title,
            description: options.description,
            label: options.label,
            queryFilter: options.queryFilter,
            sortKeys: options.sortKeys ? splitCsv(options.sortKeys) : undefined,
            notify: !!options.notify,
            notifySelf: !!options.notifySelf,
            searchable: options.searchable ? true : undefined,
            userEditable: !!options.userEditable,
            notViewable: !!options.notViewable,
            notValidate: !!options.notValidate,
            returnByDefault: !!options.returnByDefault,
            reversePropertyName: options.reversePropertyName,
          };
          const outcome = await createManagedObjectSchemaRelationshipProperty(
            options.managedObject,
            options.property,
            fields,
            reverse
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
