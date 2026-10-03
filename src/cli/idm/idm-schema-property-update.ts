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
import { updateManagedObjectSchemaPropertyCli } from '../../ops/IdmOps';
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
    'frodo idm schema property update',
    [],
    deploymentTypes
  );

  program
    .description('Update IDM managed object property schema definition.')
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
        'Update a nested property, as a dot-path relative to -p. Requires every level but the last to already exist and be of type "object".'
      )
    )
    .addOption(
      new Option(
        '--property-type <type>',
        `Change the property type. Valid types: ${SCHEMA_PROPERTY_TYPES.join(', ')}.`
      ).choices(SCHEMA_PROPERTY_TYPES)
    )
    .addOption(new Option('--array', 'Change to an array of --property-type.'))
    .addOption(new Option('--title <text>', 'Change the display title.'))
    .addOption(
      new Option('--description <text>', 'Change the property description.')
    )
    .addOption(new Option('--required', 'Require a value for this property.'))
    .addOption(
      new Option('--searchable', 'Mark the property searchable in the UI.')
    )
    .addOption(
      new Option('--user-editable', 'Allow end users to edit this property.')
    )
    .addOption(new Option('--not-viewable', 'Hide this property in the UI.'))
    .addOption(
      new Option(
        '--return-by-default',
        'Return this property by default on reads.'
      )
    )
    .addOption(
      new Option(
        '--default <value>',
        'Change the default value. Parsed as JSON when possible (e.g. "5" becomes the number 5, "true" the boolean true), otherwise used as a literal string.'
      )
    )
    .addOption(
      new Option(
        '--enum <csv>',
        'Change the comma-separated list of allowed values.'
      )
    )
    .addOption(
      new Option(
        '--enum-titles <csv>',
        'Change the comma-separated list of display labels for --enum, in the same order. Requires --enum.'
      )
    )
    .addOption(
      new Option(
        '--on-retrieve-script <file>',
        "Change this to a script-derived virtual property: compute its value on read from this local JavaScript file. Doesn't affect an existing --on-store-script."
      )
    )
    .addOption(
      new Option(
        '--on-store-script <file>',
        "Compute this property's stored value on write from this local JavaScript file. Doesn't affect an existing --on-retrieve-script."
      )
    )
    .addOption(
      new Option(
        '--derive-from-relationship <name>',
        'Change this to a relationship-derived virtual property (RDVP): compute its value by querying through this relationship property. E.g. "memberOfOrg".'
      )
    )
    .addOption(
      new Option(
        '--derive-fields <csv>',
        'Change the comma-separated list of fields pulled from each referenced object. Requires --derive-from-relationship (on this call, or already configured).'
      )
    )
    .addOption(
      new Option(
        '--flatten',
        'Flatten --derive-fields values from a to-many relationship into a single array. Requires --derive-from-relationship (on this call, or already configured).'
      )
    )
    .addOption(new Option('-y, --yes', 'Answer y/yes to all prompts.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Update the "${s.propertyName}" property's title:\n` +
        c.command(
          `  $ frodo idm schema property update -o ${s.managedObjectType} -p ${s.propertyName} --title "Max Crew" -y ${s.amBaseUrl}\n`
        ) +
        `  Make it both searchable and required in the same call:\n` +
        c.command(
          `  $ frodo idm schema property update -o ${s.managedObjectType} -p ${s.propertyName} --searchable --required -y ${s.connId}\n`
        ) +
        `  Update the "${s.subPropertyName}" sub-property nested inside "${s.objectPropertyName}":\n` +
        c.command(
          `  $ frodo idm schema property update -o ${s.managedObjectType} -p ${s.objectPropertyName} --sub-property ${s.subPropertyName} --title "Seat Count" --required -y ${s.connId}\n`
        ) +
        `  Change its allowed values and default:\n` +
        c.command(
          `  $ frodo idm schema property update -o ${s.managedObjectType} -p custom_status --enum "active,retired,decommissioned" --default active -y ${s.connId}\n`
        ) +
        `  Point its on-retrieve script at an updated local file:\n` +
        c.command(
          `  $ frodo idm schema property update -o ${s.managedObjectType} -p custom_isFlightworthy --on-retrieve-script isFlightworthy.onRetrieve.js -y ${s.connId}\n`
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
            `Updating property "${options.property}" on "${options.managedObject}"...`
          );
          const outcome = await updateManagedObjectSchemaPropertyCli(
            options.managedObject,
            options.property,
            {
              type: options.propertyType,
              array: options.array ? true : undefined,
              title: options.title,
              description: options.description,
              required: options.required ? true : undefined,
              searchable: options.searchable ? true : undefined,
              userEditable: options.userEditable ? true : undefined,
              notViewable: options.notViewable ? true : undefined,
              returnByDefault: options.returnByDefault ? true : undefined,
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
              flatten: options.flatten ? true : undefined,
            },
            options.yes,
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
