import fs from 'fs';
import path from 'path';
import {
  frodo,
  FrodoError,
  MANAGED_OBJECT_SCHEMA_CREATABLE_PROPERTY_TYPES as SCHEMA_PROPERTY_TYPES,
} from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { createManagedObjectSchemaProperty } from '../../ops/IdmOps';
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

function parseDefaultValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export default function setup() {
  const program = new FrodoCommand(
    'frodo idm schema property create',
    [],
    deploymentTypes
  );

  program
    .description('Create IDM managed object property schema definition.')
    .addOption(
      new Option(
        '-o, --managed-object <type>',
        'Managed object type.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '-p, --property <name>',
        'Property name.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '--sub-property <path>',
        'Create the property nested inside an existing object property, as a dot-path relative to -p. Requires every level to already exist and be of type "object".'
      )
    )
    .addOption(
      new Option(
        '--property-type <type>',
        `Type of the property to create. Valid types: ${SCHEMA_PROPERTY_TYPES.join(', ')}.`
      )
        .choices(SCHEMA_PROPERTY_TYPES)
        .makeOptionMandatory()
    )
    .addOption(
      new Option(
        '--array',
        'Whether this is an array of --property-type. Default: false.'
      )
    )
    .addOption(new Option('--title <text>', 'Display title.'))
    .addOption(new Option('--description <text>', 'Property description.'))
    .addOption(
      new Option(
        '--required',
        'Require a value for this property. Default: false.'
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
        '--return-by-default',
        'Return this property by default on reads. Default: false.'
      )
    )
    .addOption(
      new Option(
        '--default <value>',
        'Default value. Parsed as JSON when possible (e.g. "5" becomes the number 5, "true" the boolean true), otherwise used as a literal string.'
      )
    )
    .addOption(
      new Option(
        '--enum <csv>',
        'Comma-separated list of allowed values, turning this into an enumerated (dropdown-style) property.'
      )
    )
    .addOption(
      new Option(
        '--enum-titles <csv>',
        'Comma-separated list of display labels for --enum, in the same order. Requires --enum.'
      )
    )
    .addOption(
      new Option(
        '--on-retrieve-script <file>',
        'Make this a script-derived virtual property: compute its value on read from this local JavaScript file.'
      )
    )
    .addOption(
      new Option(
        '--on-store-script <file>',
        "Compute this property's stored value on write from this local JavaScript file."
      )
    )
    .addOption(
      new Option(
        '--derive-from-relationship <name>',
        'Make this a relationship-derived virtual property (RDVP): compute its value by querying through this relationship property. E.g. "memberOfOrg".'
      )
    )
    .addOption(
      new Option(
        '--derive-fields <csv>',
        'Comma-separated list of fields to pull from each object referenced by --derive-from-relationship. Requires --derive-from-relationship.'
      )
    )
    .addOption(
      new Option(
        '--flatten',
        'Flatten --derive-fields values from a to-many relationship into a single array, instead of one array entry per referenced object. Requires --derive-from-relationship.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Add the "${s.propertyName}" property to the "${s.managedObjectTitle}" type:\n` +
        c.command(
          `  $ frodo idm schema property create -o ${s.managedObjectType} -p ${s.propertyName} --property-type number --title "Max Crew" --required ${s.amBaseUrl}\n`
        ) +
        `  Add a searchable array-of-strings property:\n` +
        c.command(
          `  $ frodo idm schema property create -o ${s.managedObjectType} -p ${s.arrayPropertyName} --property-type string --array --title "Call Signs" --searchable ${s.connId}\n`
        ) +
        `  Add an (initially empty) object property, to hold sub-properties:\n` +
        c.command(
          `  $ frodo idm schema property create -o ${s.managedObjectType} -p ${s.objectPropertyName} --property-type object --title "Cabin" ${s.connId}\n`
        ) +
        `  Add a sub-property nested inside that object property:\n` +
        c.command(
          `  $ frodo idm schema property create -o ${s.managedObjectType} -p ${s.objectPropertyName} --sub-property ${s.subPropertyName} --property-type number --title "Seat Count" ${s.connId}\n`
        ) +
        `  Add an enumerated property with a default value:\n` +
        c.command(
          `  $ frodo idm schema property create -o ${s.managedObjectType} -p custom_status --property-type string --enum "active,retired" --enum-titles "Active,Retired" --default active ${s.connId}\n`
        ) +
        `  Add a script-derived virtual property, computed on read:\n` +
        c.command(
          `  $ frodo idm schema property create -o ${s.managedObjectType} -p custom_isFlightworthy --property-type boolean --on-retrieve-script isFlightworthy.onRetrieve.js ${s.connId}\n`
        ) +
        `  Add a relationship-derived virtual property (RDVP), flattened across the to-many "${s.manyRelationshipPropertyName}" relationship:\n` +
        c.command(
          `  $ frodo idm schema property create -o ${s.managedObjectType} -p custom_crewNames --property-type string --array --derive-from-relationship ${s.manyRelationshipPropertyName} --derive-fields sn --flatten ${s.connId}\n`
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
        if (options.enumTitles && !options.enum) {
          printError(new FrodoError('--enum-titles requires --enum.'));
          process.exitCode = 1;
          return;
        }
        if (
          (options.deriveFields || options.flatten) &&
          !options.deriveFromRelationship
        ) {
          printError(
            new FrodoError(
              '--derive-fields/--flatten require --derive-from-relationship.'
            )
          );
          process.exitCode = 1;
          return;
        }
        const onRetrieveScript = options.onRetrieveScript
          ? fs.readFileSync(
              path.resolve(process.cwd(), options.onRetrieveScript),
              'utf8'
            )
          : undefined;
        const onStoreScript = options.onStoreScript
          ? fs.readFileSync(
              path.resolve(process.cwd(), options.onStoreScript),
              'utf8'
            )
          : undefined;
        if (await getTokens(false, true, deploymentTypes)) {
          verboseMessage(
            `Creating property "${options.property}" on "${options.managedObject}"...`
          );
          const outcome = await createManagedObjectSchemaProperty(
            options.managedObject,
            options.property,
            {
              type: options.propertyType,
              array: !!options.array,
              title: options.title,
              description: options.description,
              required: options.required ? true : undefined,
              searchable: options.searchable ? true : undefined,
              userEditable: !!options.userEditable,
              notViewable: !!options.notViewable,
              returnByDefault: !!options.returnByDefault,
              defaultValue:
                options.default !== undefined
                  ? parseDefaultValue(options.default)
                  : undefined,
              enumValues: options.enum ? splitCsv(options.enum) : undefined,
              enumTitles: options.enumTitles
                ? splitCsv(options.enumTitles)
                : undefined,
              onRetrieveScript,
              onStoreScript,
              deriveFromRelationship: options.deriveFromRelationship
                ? splitCsv(options.deriveFromRelationship)
                : undefined,
              deriveFields: options.deriveFields
                ? splitCsv(options.deriveFields)
                : undefined,
              flatten: !!options.flatten,
            },
            options.subProperty
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
