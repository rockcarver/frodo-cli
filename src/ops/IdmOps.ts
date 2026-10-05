import fs from 'fs';
import path from 'path';
import confirm from '@inquirer/confirm';
import {
  buildManagedObjectSchemaRelationshipPropertyPayload as buildRelationshipPropertyPayload,
  buildManagedObjectSchemaPropertyPayload as buildSchemaPropertyPayload,
  extractManagedObjectSchemaRelationshipPropertyFields as extractRelationshipFields,
  extractManagedObjectSchemaPropertyFields as extractSchemaPropertyFields,
  frodo,
  FrodoError,
  inferManagedObjectSchemaRelationshipReverseIdentity as inferReverseIdentity,
  navigatePropertyPath,
  navigateToPropertyContainer,
  parseSubPropertyPath,
  setSchemaProperty,
  toManagedObjectSchemaRelationshipReverseFields as toReverseDescriptorFields,
  type ConfigEntityExportInterface,
  type IdObjectSkeletonInterface,
  type ManagedObjectSchema,
  type MappingSkeleton,
  type PropertyContainer,
  type ManagedObjectSchemaRelationshipPropertyFields as RelationshipPropertyFields,
  type ManagedObjectSchemaRelationshipReverseFields as RelationshipReverseCreateFields,
  type ManagedObjectSchemaPropertyFields as SchemaPropertyFields,
  type SyncSkeleton,
} from '@rockcarver/frodo-lib';
import c from '../utils/ColorTheme';
import {
  extractDataToFile,
  getExtractedData,
  getExtractedJsonData,
} from '../utils/Config';
import {
  createObjectTable,
  createProgressIndicator,
  createTable,
  printError,
  printMessage,
  stopProgressIndicator,
} from '../utils/Console';
import {
  getLegacyMappingsFromFiles,
  writeMappingJsonToDirectory,
  writeSyncJsonToDirectory,
} from './MappingOps';
import { errorHandler } from './utils/OpsUtils';

const {
  getFilePath,
  getTypedFilename,
  readFiles,
  getWorkingDirectory,
  saveJsonToFile,
  saveToFile,
} = frodo.utils;

const {
  readConfigEntities,
  exportConfigEntity,
  exportConfigEntities,
  deleteConfigEntity,
  importConfigEntities,
  readSubConfigEntity,
  importSubConfigEntity,
} = frodo.idm.config;
const { countManagedObjects: countManagedObjectsOfType } = frodo.idm.managed;
const {
  readManagedObjectSchema,
  updateManagedObjectSchemaProperty,
  createManagedObjectSchemaFlatProperty,
  updateManagedObjectSchemaFlatProperty,
  removeManagedObjectSchemaFlatProperty,
  createManagedObjectSchemaRelationshipProperty: createRelationshipPropertyLib,
  updateManagedObjectSchemaRelationshipProperty: updateRelationshipPropertyLib,
  removeManagedObjectSchemaRelationshipProperty: removeRelationshipPropertyLib,
  readManagedObjectSchemaRelationshipPropertyOrNull:
    tryReadRelationshipProperty,
} = frodo.idm.managed.schema;
const { testConnectorServers } = frodo.idm.system;

type MatchResult = { path: string; source: string; type: string };

/**
 * Warn about and list offline remote connector servers
 * @return {Promise<boolean>} a promise that resolves to true if a warning was printed, false otherwise
 */
export async function warnAboutOfflineConnectorServers(): Promise<boolean> {
  try {
    const all = await testConnectorServers();
    const offline = all
      .filter((status) => !status.ok)
      .map((status) => status.name);
    if (offline.length > 0) {
      printMessage(
        `\nThe following connector server(s) are offline and their connectors and configuration unavailable:\n${offline.join(
          '\n'
        )}`,
        'warn'
      );
      return true;
    }
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * List all IDM configuration objects
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function listAllConfigEntities(): Promise<boolean> {
  try {
    const configurations = await readConfigEntities();
    for (const configEntity of configurations) {
      printMessage(`${configEntity._id}`, 'data');
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

type ObjectSkeleton = IdObjectSkeletonInterface & {
  name: string;
};

export type ManagedSkeleton = IdObjectSkeletonInterface & {
  objects: ObjectSkeleton[];
};

type ManagedObjectTypeConfig = ObjectSkeleton & {
  schema?: ManagedObjectSchema;
};

/**
 * Export an IDM configuration object.
 * @param {string} id the desired configuration object
 * @param {string} file optional export file name (or directory name if exporting mappings separately)
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} extract true to extract idm scripts, false otherwise. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportConfigEntityToFile(
  id: string,
  file?: string,
  includeMeta: boolean = true,
  extract: boolean = false
): Promise<boolean> {
  try {
    const exportData = await exportConfigEntity(id);
    if (!extract) {
      const fileName = file || getTypedFilename(`${id}`, 'idm');
      saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
      return true;
    }
    if (id === 'sync') {
      writeSyncJsonToDirectory(
        exportData.idm[id] as SyncSkeleton,
        'sync',
        includeMeta,
        extract
      );
      return true;
    }
    if (id === 'managed') {
      writeManagedJsonToDirectory(
        exportData.idm[id] as ManagedSkeleton,
        'managed',
        includeMeta,
        extract
      );
      return true;
    }
    writeIdmObjectToDirectory(exportData.idm[id], '.', includeMeta, extract);
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity ${id}`);
  }
  return false;
}

/**
 * Export an IDM configuration managed object.
 * @param {string} name the desired configuration object
 * @param {string} file optional export file name
 * @param {boolean} extract true to extract idm scripts, false otherwise. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportManagedObjectToFile(
  name: string,
  file?: string,
  extract: boolean = false
): Promise<boolean> {
  try {
    const exportData = (await readSubConfigEntity(
      'managed',
      name
    )) as ObjectSkeleton;
    if (extract && extractManagedObjectScriptsToDirectory(exportData)) {
      const fileName = getTypedFilename(name, 'managed');
      saveJsonToFile(
        exportData,
        getFilePath(`${name}/${fileName}`, true),
        false
      );
      return true;
    }
    const fileName = file || getTypedFilename(name, 'managed');
    saveJsonToFile(exportData, getFilePath(fileName, true), false);
    return true;
  } catch (error) {
    printError(error, `Error exporting config managed object ${name}`);
  }
  return false;
}

/**
 * Export all IDM configuration objects
 * @param {string} file file to export to
 * @param {string} entitiesFile JSON file that specifies the config entities to export/import
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportAllConfigEntitiesToFile(
  file?: string,
  entitiesFile?: string,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const options = getIdmImportExportOptions(entitiesFile);
    const exportData = await exportConfigEntities(
      {
        entitiesToExport: options.entitiesToExportOrImport,
      },
      errorHandler
    );
    let fileName = getTypedFilename(`all`, `idm`);
    if (file) {
      fileName = file;
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    return true;
  } catch (error) {
    printError(error, `Error exporting idm config to file`);
  }
  return false;
}

/**
 * Export all IDM configuration objects to separate files
 * @param {string} entitiesFile JSON file that specifies the config entities to export/import
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} extract true to extract idm scripts, false otherwise. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportAllConfigEntitiesToFiles(
  entitiesFile?: string,
  includeMeta: boolean = true,
  extract: boolean = false
): Promise<boolean> {
  const errors: Error[] = [];
  try {
    const options = getIdmImportExportOptions(entitiesFile);
    const exportData = await exportConfigEntities(
      {
        entitiesToExport: options.entitiesToExportOrImport,
      },
      errorHandler
    );
    for (const [id, obj] of Object.entries(exportData.idm)) {
      if (!obj) continue;
      try {
        if (!extract) {
          saveToFile(
            'idm',
            obj,
            '_id',
            getFilePath(`${id}.idm.json`, true),
            includeMeta
          );
          continue;
        }
        if (id === 'sync') {
          writeSyncJsonToDirectory(
            obj as SyncSkeleton,
            'sync',
            includeMeta,
            extract
          );
          continue;
        }
        if (id === 'managed') {
          writeManagedJsonToDirectory(
            obj as ManagedSkeleton,
            'managed',
            includeMeta,
            extract
          );
          continue;
        }
        if (id.startsWith('mapping/')) {
          writeMappingJsonToDirectory(
            obj as MappingSkeleton,
            'mapping',
            includeMeta,
            extract
          );
          continue;
        }
        writeIdmObjectToDirectory(obj, '.', includeMeta, extract);
      } catch (error) {
        errors.push(new FrodoError(`Error saving config entity ${id}`, error));
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error saving config entities`, errors);
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Import an IDM configuration object by id from file.
 * @param {string} entityId the configuration object to import
 * @param {string} file optional file to import
 * @param {boolean} validate True to validate script hooks. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importConfigEntityByIdFromFile(
  entityId: string,
  file?: string,
  validate: boolean = false
): Promise<boolean> {
  try {
    if (!file) {
      file = getTypedFilename(entityId, 'idm');
    }
    const filePath = getFilePath(file);

    const fileData = fs.readFileSync(
      path.resolve(process.cwd(), filePath),
      'utf8'
    );

    let importData;
    if (entityId === 'sync') {
      const syncData = getLegacyMappingsFromFiles([
        {
          content: fileData,
          path: `${filePath.substring(0, filePath.lastIndexOf('/'))}/sync.idm.json`,
        },
      ]);
      importData = { idm: { sync: syncData } };
    } else if (entityId === 'managed') {
      const managedData = getManagedObjectsFromFiles([
        {
          content: fileData,
          path: `${filePath.substring(0, filePath.lastIndexOf('/'))}/managed.idm.json`,
        },
      ]);
      importData = { idm: { managed: managedData } };
    } else {
      importData = JSON.parse(fileData);
      const entity = importData.idm?.[entityId];
      if (entity) {
        const baseDir = path.dirname(filePath);
        resolveAllExtractedScriptsForImport(entity, baseDir);
        importData.idm[entityId] = entity;
      }
    }

    await importConfigEntities(
      importData,
      entityId,
      {
        entitiesToImport: undefined,
        validate,
      },
      errorHandler
    );
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Delete IDM config Entity by id
 * @param {String} id saml entityId
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteConfigEntityById(
  entityId: string
): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting ${entityId}...`
  );
  try {
    await deleteConfigEntity(entityId);
    stopProgressIndicator(spinnerId, `Deleted ${entityId}.`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Import first IDM configuration object from file.
 * @param {string} file optional file to import
 * @param {boolean} validate True to validate script hooks. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importFirstConfigEntityFromFile(
  file: string,
  validate: boolean = false
): Promise<boolean> {
  const filePath = getFilePath(file);
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing ${filePath}...`
    );

    const fileData = fs.readFileSync(
      path.resolve(process.cwd(), filePath),
      'utf8'
    );

    const parsed = JSON.parse(fileData);
    const allEntities = Object.entries(parsed.idm)
      .filter(([id]) => id !== 'meta')
      .map(([, val]) => val) as IdObjectSkeletonInterface[];

    if (allEntities.length === 0) {
      stopProgressIndicator(indicatorId, `No items to import.`, 'success');
      return true;
    }

    const entity = allEntities[0];
    const entityId = entity._id;

    const baseDir = path.dirname(filePath);
    resolveAllExtractedScriptsForImport(entity, baseDir);

    const importData: ConfigEntityExportInterface = {
      idm: { [entityId]: entity },
    };

    if (entityId === 'sync') {
      importData.idm.sync = getLegacyMappingsFromFiles([
        {
          content: fileData,
          path: `${baseDir}/sync.idm.json`,
        },
      ]);
    }

    if (entityId === 'managed') {
      importData.idm.managed = getManagedObjectsFromFiles([
        {
          content: fileData,
          path: `${baseDir}/managed.idm.json`,
        },
      ]);
    }

    await importConfigEntities(
      importData,
      entityId,
      {
        entitiesToImport: undefined,
        validate,
      },
      errorHandler
    );
    stopProgressIndicator(
      indicatorId,
      `Imported ${entityId} from ${filePath}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing ${filePath}.`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Import all IDM configuration objects from a single file
 * @param {string} file the file with the configuration objects
 * @param {string} entitiesFile JSON file that specifies the config entities to export/import
 * @param {boolean} validate True to validate script hooks. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importAllConfigEntitiesFromFile(
  file: string,
  entitiesFile?: string,
  validate: boolean = false
): Promise<boolean> {
  let indicatorId: string;
  let filePath;
  try {
    filePath = getFilePath(file);
    const baseDir = path.dirname(filePath);
    const importData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    resolveAllExtractedScriptsForImport(importData, baseDir);
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing config entities from ${filePath}...`
    );
    const options = getIdmImportExportOptions(entitiesFile);
    await importConfigEntities(
      importData as ConfigEntityExportInterface,
      undefined,
      {
        entitiesToImport: options.entitiesToExportOrImport,
        validate,
      },
      errorHandler
    );
    stopProgressIndicator(indicatorId, `Imported config entities`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing config entities from ${filePath}.`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Identifies which incoming managed-object type entries carry a schema
 * definition, to gate schema-bearing 'frodo idm schema object import'
 * calls behind an explicit confirmation before writing. Managed-object
 * CONFIGURATION (this command) is a superset of managed-object SCHEMA
 * (each object entry's own .schema key) — most configuration edits
 * (notifications, meta, etc.) don't touch schema at all, so this only
 * flags the subset of incoming objects that carry a schema.
 *
 * Deliberately does not compare against the live tenant's current schema
 * (which would need an extra read per type): a type carrying a schema key
 * is flagged whether or not that schema would actually change anything,
 * trading a small amount of false-positive friction for not depending on
 * an extra live read succeeding to make the correct safety call. Does not
 * read or write anything itself; pure/synchronous over the parsed import
 * data already in hand.
 * @param {{name: string; schema?: unknown}[]} objects incoming managed-object type entries about to be imported
 * @returns {string[]} the object type names that carry a schema definition
 */
export function getSchemaBearingObjectNames(
  objects: { name: string; schema?: unknown }[]
): string[] {
  return objects.filter((object) => object.schema).map((object) => object.name);
}

/**
 * Import an individual managed object from a file
 * @param {string} file the file containing the managed object
 * @param {boolean} validate True to validate script hooks. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importManagedObjectFromFile(
  file: string,
  validate: boolean = false
): Promise<boolean> {
  let indicatorId: string;
  let filePath: string;
  try {
    filePath = getFilePath(file);
    const fileData = fs.readFileSync(filePath, 'utf8');
    const importData = JSON.parse(fileData);
    const baseDir = path.dirname(filePath);
    resolveAllExtractedScriptsForImport(importData, baseDir);
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing config managed object from ${filePath}...`
    );
    const options = getIdmImportExportOptions(undefined);
    await importSubConfigEntity('managed', importData, {
      entitiesToImport: options.entitiesToExportOrImport,
      validate,
    });

    stopProgressIndicator(
      indicatorId,
      `Imported config managed object`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing config managed object from ${filePath}.`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Prints a warning and asks for confirmation before a schema-affecting
 * change, unless skipConfirmation is set. Refuses (rather than hanging on a
 * readline call with nowhere to read from) if stdin isn't an interactive
 * terminal and skipConfirmation wasn't passed. Mirrors the confirmation gate
 * `frodo idm schema object import` already uses.
 * @param {string} warning warning message printed before the prompt
 * @param {string} question the yes/no question to prompt
 * @param {boolean} skipConfirmation true to skip the prompt and proceed
 * @return {Promise<boolean>} a promise that resolves to true if the change should proceed
 */
async function confirmChange(
  warning: string,
  question: string,
  skipConfirmation: boolean
): Promise<boolean> {
  printMessage(warning, 'warn');
  if (skipConfirmation) {
    return true;
  }
  if (!process.stdin.isTTY) {
    printMessage(
      '\nRefusing to prompt for confirmation without an interactive terminal. Use -y/--yes to proceed non-interactively.',
      'error'
    );
    return false;
  }
  return confirm({ message: question, default: false });
}

/** One row of a property table: `path` is the property's dot-path (just its own name, when not nested under --recursive). */
type PropertyTableRow = {
  path: string;
  type: string;
  title: string;
  nullable: 'yes' | 'no';
  required: 'yes' | 'no';
  searchable: 'yes' | 'no';
  userEditable: 'yes' | 'no';
  viewable: 'yes' | 'no';
  target: string;
  isRelationship: boolean;
};

/**
 * Renders a property's own JSON-Schema `type` as a table-friendly label,
 * applying the format substitution (date/time/datetime/duration). IDM
 * represents a nullable scalar as `type: [x, "null"]` rather than a plain
 * string; the nullability itself is surfaced separately via the NUL column
 * (see {@link isNullableProperty}) so this only ever returns the non-null
 * type name(s) -- joined with ` | ` in the unlikely case of more than one.
 */
function describeCoreType(core: Record<string, unknown>): string {
  if (Array.isArray(core.type)) {
    const nonNull = core.type.filter((t) => t !== 'null').map(String);
    return nonNull.length > 0 ? nonNull.join(' | ') : 'null';
  }
  return core?.type === 'string' && typeof core.format === 'string'
    ? core.format
    : String(core?.type);
}

/** The property (or, for an array property, its item), unwrapped once so callers can inspect its own `type`/`resourceCollection`/etc. */
function corePropertyDefinition(
  property: Record<string, unknown>
): Record<string, unknown> {
  return (property.type === 'array' ? property.items : property) as Record<
    string,
    unknown
  >;
}

/** True if the property (or its item type, for an array property) is a relationship. */
function isRelationshipProperty(property: Record<string, unknown>): boolean {
  return corePropertyDefinition(property)?.type === 'relationship';
}

/**
 * Renders a relationship property's cardinality as `<this>:<other>`, e.g.
 * `1:n` for a single-valued relationship whose reverse side is an array, or
 * `n:-` for an array-valued relationship with no reverse configured. Both
 * sides come straight from the property's own definition -- no extra read
 * of the target type's schema is needed, since IDM embeds the reverse
 * side's own shape directly at `resourceCollection[0].reverseProperty`.
 */
function relationshipCardinality(property: Record<string, unknown>): string {
  const core = corePropertyDefinition(property);
  const thisSide = property.type === 'array' ? 'n' : '1';
  if (!core.reverseRelationship) {
    return `${thisSide}:-`;
  }
  const resourceCollection = core.resourceCollection as
    Array<{ reverseProperty?: { type?: string } }> | undefined;
  const reverseType = resourceCollection?.[0]?.reverseProperty?.type;
  const otherSide =
    reverseType === 'array' ? 'n' : reverseType === 'relationship' ? '1' : '-';
  return `${thisSide}:${otherSide}`;
}

/** Renders a property's Type-column value: a cardinality notation (e.g. `1:n`) for a relationship, its scalar type (e.g. `string`, `object[]`) otherwise. */
function describePropertyType(property: Record<string, unknown>): string {
  if (isRelationshipProperty(property)) {
    return relationshipCardinality(property);
  }
  const array = property.type === 'array';
  const baseType = describeCoreType(corePropertyDefinition(property));
  return array ? `${baseType}[]` : baseType;
}

/** True if the property's own JSON-Schema `type` is IDM's nullable-scalar array form, `type: [x, "null"]`. */
function isNullableProperty(property: Record<string, unknown>): boolean {
  const core = corePropertyDefinition(property);
  return Array.isArray(core?.type) && core.type.includes('null');
}

/** The target managed-object type of a relationship property, or '' if the property isn't a relationship. */
function relationshipTarget(property: Record<string, unknown>): string {
  const core = corePropertyDefinition(property);
  if (core?.type !== 'relationship') {
    return '';
  }
  const resourceCollection = core.resourceCollection as
    Array<{ path?: string }> | undefined;
  return resourceCollection?.[0]?.path?.replace(/^managed\//, '') || '';
}

/**
 * Flattens a property container into table rows, sorted by name. With
 * `recursive`, nested `type: object` properties are expanded inline
 * underneath their parent, using DOT-PATH names (e.g. `address.street`)
 * rather than indentation -- so a row's `path` is always a valid
 * `--sub-property` value.
 */
function collectPropertyRows(
  properties: Record<string, Record<string, unknown>>,
  required: Set<string>,
  recursive: boolean,
  prefix = ''
): PropertyTableRow[] {
  const rows: PropertyTableRow[] = [];
  Object.entries(properties || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([name, property]) => {
      const path = prefix ? `${prefix}.${name}` : name;
      rows.push({
        path,
        type: describePropertyType(property),
        title: (property.title as string) || '',
        nullable: isNullableProperty(property) ? 'yes' : 'no',
        required: required.has(name) ? 'yes' : 'no',
        searchable: property.searchable ? 'yes' : 'no',
        userEditable: property.userEditable ? 'yes' : 'no',
        viewable: property.viewable === false ? 'no' : 'yes',
        target: relationshipTarget(property),
        isRelationship: isRelationshipProperty(property),
      });
      const array = property.type === 'array';
      const core = (array ? property.items : property) as Record<
        string,
        unknown
      >;
      if (recursive && core?.type === 'object' && core.properties) {
        rows.push(
          ...collectPropertyRows(
            core.properties as Record<string, Record<string, unknown>>,
            new Set((core.required as string[]) || []),
            recursive,
            path
          )
        );
      }
    });
  return rows;
}

/**
 * Refines each relationship row's cardinality using IDM's dedicated v2
 * relationship-schema API, which embeds the reverse side's own shape at
 * `resourceCollection[0].reverseProperty` -- unlike the whole-type schema
 * read {@link collectPropertyRows} normally works from, which only knows a
 * reverse relationship exists (`reverseRelationship: true`), not its
 * cardinality. One extra read per top-level relationship row (parallelized,
 * skipped for a nested --sub-property row -- and for a nested relationship
 * row, if one somehow exists -- since the v2 API only addresses top-level
 * properties); a failed read (e.g. IDM too old for the v2 API) or a nested
 * row keeps that row's original, less-precise cardinality rather than
 * failing the whole describe.
 */
async function resolveRelationshipCardinalities(
  type: string,
  rows: PropertyTableRow[]
): Promise<PropertyTableRow[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (!row.isRelationship || row.path.includes('.')) {
        return row;
      }
      try {
        const property = await tryReadRelationshipProperty(type, row.path);
        return property
          ? { ...row, type: relationshipCardinality(property) }
          : row;
      } catch {
        return row;
      }
    })
  );
}

/** Column headers for a {@link PropertyTableRow} table -- the flag columns are abbreviated to keep the table narrow; see {@link PROPERTY_TABLE_KEY} for what they mean. */
const PROPERTY_TABLE_COLUMNS = [
  'Name',
  'Title',
  'Target',
  'Type',
  'NUL',
  'REQ',
  'SRH',
  'UED',
  'VIW',
];

/**
 * {@link PROPERTY_TABLE_COLUMNS} without the Target column -- for `object
 * describe`'s Properties table (relationships get their own Relationships
 * table) and for `property describe`, which never shows Target even when
 * describing a relationship-typed property: Target is relationship-specific
 * and `relationship describe` is the dedicated command for that.
 */
const PROPERTY_ONLY_TABLE_COLUMNS = PROPERTY_TABLE_COLUMNS.filter(
  (column) => column !== 'Target'
);

/** Printed once below a {@link PROPERTY_TABLE_COLUMNS} table, spelling out its abbreviated flag columns. */
const PROPERTY_TABLE_KEY =
  'NUL=Nullable, REQ=Required, SRH=Searchable, UED=User Editable, VIW=Viewable';

/** Pushes {@link PropertyTableRow}s onto a table already headed with {@link PROPERTY_TABLE_COLUMNS} (from {@link createTable}); pass `includeTarget: false` for a table headed with {@link PROPERTY_ONLY_TABLE_COLUMNS} instead. */
function flag(value: 'yes' | 'no'): string {
  return value === 'yes' ? c.positive(value) : c.negative(value);
}

function pushPropertyTableRows(
  table: ReturnType<typeof createTable>,
  rows: PropertyTableRow[],
  includeTarget: boolean = true
): void {
  rows.forEach((row) => {
    const cells = [row.path, row.title];
    if (includeTarget) {
      cells.push(row.target);
    }
    cells.push(
      row.type,
      flag(row.nullable),
      flag(row.required),
      flag(row.searchable),
      flag(row.userEditable),
      flag(row.viewable)
    );
    table.push(cells);
  });
}

/**
 * List the schema properties of a managed object type -- or, if
 * `subProperty` is given (a dot-path, e.g. `"profile.address"`), the
 * immediate children of that nested `type: object` property instead. Name
 * only by default, one per line; `long` prints the full property table
 * instead (same columns/abbreviations as `property describe`).
 * @param {string} type managed object type, e.g. alpha_user
 * @param {boolean} json true to print raw JSON instead of a table -- always the complete definitions, regardless of `long`
 * @param {boolean} long true to print the full property table instead of just names
 * @param {string} [subProperty] dot-path to a nested object property whose own children to list, instead of the type's top-level properties
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function listManagedObjectSchemaProperties(
  type: string,
  json: boolean = false,
  long: boolean = false,
  subProperty?: string
): Promise<boolean> {
  try {
    const schema = await readManagedObjectSchema(type);
    const container = subProperty
      ? navigateToPropertyContainer(
          schema as unknown as PropertyContainer,
          parseSubPropertyPath(subProperty)
        )
      : (schema as unknown as PropertyContainer);
    if (json) {
      printMessage(JSON.stringify(container.properties, null, 2), 'data');
      return true;
    }
    if (!long) {
      Object.keys(container.properties || {})
        .sort()
        .forEach((name) => printMessage(name, 'data'));
      return true;
    }
    const rows = await resolveRelationshipCardinalities(
      type,
      collectPropertyRows(
        container.properties || {},
        new Set(container.required || []),
        false
      )
    );
    const table = createTable(PROPERTY_ONLY_TABLE_COLUMNS);
    pushPropertyTableRows(table, rows, false);
    printMessage(`${table.toString()}\n\n${PROPERTY_TABLE_KEY}`, 'data');
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Describe a single schema property of a managed object type -- or, with
 * `subProperty`, a nested property reached via that dot-path. Prints the
 * property's own fields first; then, if it's a `type: object` property with
 * any children, the same dot-path-rowed properties table `object describe`
 * uses (always, not gated behind a flag -- a `type: object` property's
 * children are exactly the useful part of describing it); then, if it's a
 * virtual property with an `onRetrieve`/`onStore` script, the script's
 * source printed verbatim rather than mangled into the generic field table
 * one line per row.
 *
 * Reads via the raw `managed` config entity (like `create`/`update`), not
 * the dedicated per-type schema endpoint `object describe`/`property list`
 * use -- confirmed live that the latter silently omits a virtual
 * property's `onRetrieve`/`onStore` script, so this is the one describe
 * path that can actually show it.
 * @param {string} type managed object type, e.g. alpha_user
 * @param {string} propertyName schema property name, e.g. custom_merchantId
 * @param {boolean} json true to print raw JSON instead of a table -- always the complete definition
 * @param {string} [subProperty] dot-path to a nested property beneath propertyName, e.g. "address.street"
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function describeManagedObjectSchemaProperty(
  type: string,
  propertyName: string,
  json: boolean = false,
  subProperty?: string
): Promise<boolean> {
  try {
    const typeConfig = (await readSubConfigEntity(
      'managed',
      type
    )) as ManagedObjectTypeConfig;
    if (!typeConfig.schema) {
      throw new FrodoError(
        `Managed object type "${type}" has no schema definition.`
      );
    }
    const path = [propertyName, ...parseSubPropertyPath(subProperty)];
    const { container, propertyName: leafName } = navigatePropertyPath(
      typeConfig.schema as unknown as PropertyContainer,
      path
    );
    const property = container.properties?.[leafName];
    if (!property) {
      printError(
        new FrodoError(
          `Property "${path.join('.')}" not found on managed object type "${type}".`
        )
      );
      return false;
    }
    if (json) {
      printMessage(JSON.stringify(property, null, 2), 'data');
      return true;
    }
    const nameLabel = path.join('.');
    const header = c.heading(
      property.title ? `${property.title} (${nameLabel})` : nameLabel
    );
    const isObjectContainer = property.type === 'object' && property.properties;
    const scriptKeys = ['onRetrieve', 'onStore'].filter((key) => property[key]);
    const omit = [
      'title',
      ...scriptKeys,
      ...(isObjectContainer ? ['properties', 'order', 'required'] : []),
    ];
    const displayFields = Object.fromEntries(
      Object.entries(property).filter(([key]) => !omit.includes(key))
    );
    const sections = [
      `${header}\n\n${createObjectTable(displayFields).toString()}`,
    ];
    if (isObjectContainer) {
      const childRows = await resolveRelationshipCardinalities(
        type,
        collectPropertyRows(
          property.properties as Record<string, Record<string, unknown>>,
          new Set((property.required as string[]) || []),
          true,
          nameLabel
        )
      );
      if (childRows.length > 0) {
        const table = createTable(PROPERTY_ONLY_TABLE_COLUMNS);
        pushPropertyTableRows(table, childRows, false);
        sections.push(
          `${c.heading('Properties')}\n\n${table.toString()}\n\n${PROPERTY_TABLE_KEY}`
        );
      }
    }
    if (scriptKeys.length > 0) {
      const scriptSections = scriptKeys.map((key) => {
        const script = property[key] as
          { type?: string; source?: string } | undefined;
        return `${c.heading(key)} (${script?.type || 'text/javascript'}):\n\n${(script?.source || '').trimEnd()}`;
      });
      sections.push(
        `${c.heading('Scripts')}\n\n${scriptSections.join('\n\n')}`
      );
    }
    printMessage(sections.join('\n\n'), 'data');
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Create a new schema property on a managed object type -- or, with
 * `subProperty`, a nested property inside an existing `type: object`
 * property reached via that dot-path. Refuses if a property with that name
 * already exists at the target location (use update instead). Applies to
 * any deployment type — this reads and rewrites the whole type definition,
 * the same mechanism `frodo idm schema object export/import` already use.
 * These flags only cover a flat property definition; giving a new object
 * property its own nested sub-properties in one shot still needs the
 * file-based `property export`/`import` round trip.
 * @param {string} type managed object type, e.g. alpha_user
 * @param {string} propertyName schema property name, e.g. custom_merchantId
 * @param {SchemaPropertyFields} fields the property's field values
 * @param {string} [subProperty] dot-path to nest the new property under an existing object property beneath propertyName, e.g. "address.street"
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function createManagedObjectSchemaProperty(
  type: string,
  propertyName: string,
  fields: SchemaPropertyFields,
  subProperty?: string
): Promise<boolean> {
  let indicatorId: string;
  const path = [propertyName, ...parseSubPropertyPath(subProperty)];
  try {
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Creating property "${path.join('.')}" on "${type}"...`
    );
    await createManagedObjectSchemaFlatProperty(
      type,
      propertyName,
      fields,
      subProperty
    );
    stopProgressIndicator(
      indicatorId,
      `Created property "${path.join('.')}" on "${type}".`,
      'success'
    );
    return true;
  } catch (error) {
    if (indicatorId) {
      stopProgressIndicator(
        indicatorId,
        `Error creating property "${path.join('.')}" on "${type}".`,
        'fail'
      );
    }
    printError(error);
  }
  return false;
}

/**
 * Update an existing schema property on a managed object type -- or, with
 * `subProperty`, a nested property reached via that dot-path. Refuses if
 * the property doesn't exist (use create instead). Only the fields whose
 * flags are passed change; everything else keeps its current value. Prints
 * a Current/Proposed diff and prompts for confirmation unless
 * skipConfirmation is set.
 * @param {string} type managed object type, e.g. alpha_user
 * @param {string} propertyName schema property name, e.g. custom_merchantId
 * @param {Partial<SchemaPropertyFields>} changedFields only the explicitly-passed field overrides
 * @param {boolean} skipConfirmation true to skip the confirmation prompt
 * @param {string} [subProperty] dot-path to a nested property beneath propertyName, e.g. "address.street"
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function updateManagedObjectSchemaPropertyCli(
  type: string,
  propertyName: string,
  changedFields: Partial<SchemaPropertyFields>,
  skipConfirmation: boolean = false,
  subProperty?: string
): Promise<boolean> {
  let indicatorId: string;
  const path = [propertyName, ...parseSubPropertyPath(subProperty)];
  try {
    // A confirm-before-write diff needs the current/proposed definitions up
    // front, before frodo-lib's own read-modify-write runs -- so this reads
    // the type once here purely to build that preview (discarded after),
    // then lets updateManagedObjectSchemaFlatProperty do its own independent
    // read-modify-write for the actual change.
    const typeConfig = (await readSubConfigEntity(
      'managed',
      type
    )) as ManagedObjectTypeConfig;
    if (!typeConfig.schema) {
      throw new FrodoError(
        `Managed object type "${type}" has no schema definition.`
      );
    }
    const { container, propertyName: leafName } = navigatePropertyPath(
      typeConfig.schema as unknown as PropertyContainer,
      path
    );
    const current = container.properties?.[leafName];
    if (!current) {
      printError(
        new FrodoError(
          `Property "${path.join('.')}" not found on managed object type "${type}". Use create instead.`
        )
      );
      return false;
    }
    const overrides = pruneUndefined(changedFields);
    const mergedFields = {
      ...extractSchemaPropertyFields(current),
      ...overrides,
    };
    const propertyData = buildSchemaPropertyPayload(leafName, mergedFields);
    const warning = `Current:\n${JSON.stringify(current, null, 2)}\nProposed:\n${JSON.stringify(propertyData, null, 2)}`;
    if (
      !(await confirmChange(
        warning,
        `Update property "${path.join('.')}" on managed object type "${type}"? This affects every instance of that type. Continue? (y|n):`,
        skipConfirmation
      ))
    ) {
      printMessage('Update aborted.', 'warn');
      return false;
    }
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Updating property "${path.join('.')}" on "${type}"...`
    );
    await updateManagedObjectSchemaFlatProperty(
      type,
      propertyName,
      changedFields,
      subProperty
    );
    stopProgressIndicator(
      indicatorId,
      `Updated property "${path.join('.')}" on "${type}".`,
      'success'
    );
    return true;
  } catch (error) {
    if (indicatorId) {
      stopProgressIndicator(
        indicatorId,
        `Error updating property "${path.join('.')}" on "${type}".`,
        'fail'
      );
    }
    printError(error);
  }
  return false;
}

/**
 * Export a single schema property definition to a local file. Available on
 * any deployment type -- reads the whole type definition (via the raw
 * `managed` config entity, not the dedicated per-type schema endpoint,
 * which silently omits a virtual property's `onRetrieve`/`onStore` script)
 * and extracts the one property, the same mechanism `property
 * describe`/`create`/`update` already use.
 * @param {string} type managed object type, e.g. alpha_user
 * @param {string} propertyName schema property name, e.g. custom_merchantId
 * @param {string} [file] export file; defaults to a generated filename
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportManagedObjectSchemaPropertyToFile(
  type: string,
  propertyName: string,
  file?: string
): Promise<boolean> {
  try {
    const typeConfig = (await readSubConfigEntity(
      'managed',
      type
    )) as ManagedObjectTypeConfig;
    const property = typeConfig.schema?.properties?.[propertyName];
    if (!property) {
      printError(
        new FrodoError(
          `Property "${propertyName}" not found on managed object type "${type}".`
        )
      );
      return false;
    }
    const fileName =
      file || getTypedFilename(`${type}-${propertyName}`, 'managed.property');
    saveJsonToFile(property, getFilePath(fileName, true), false);
    return true;
  } catch (error) {
    printError(
      error,
      `Error exporting property "${propertyName}" on "${type}"`
    );
  }
  return false;
}

/**
 * Import a single schema property definition from a local file, creating it
 * if it doesn't already exist or overwriting it (with confirmation, unless
 * skipConfirmation is set) if it does. The file's content is written
 * verbatim, unlike `create`/`update`, which build the definition from flags
 * -- this is the escape hatch for property shapes those flags can't express
 * (e.g. a `type: object` property with nested sub-properties).
 * @param {string} type managed object type, e.g. alpha_user
 * @param {string} propertyName schema property name, e.g. custom_merchantId
 * @param {string} file file containing the property definition to import
 * @param {boolean} skipConfirmation true to skip the confirmation prompt when overwriting an existing property
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importManagedObjectSchemaPropertyFromFile(
  type: string,
  propertyName: string,
  file: string,
  skipConfirmation: boolean = false
): Promise<boolean> {
  let indicatorId: string;
  let filePath: string;
  try {
    filePath = getFilePath(file);
    const propertyData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const typeConfig = (await readSubConfigEntity(
      'managed',
      type
    )) as ManagedObjectTypeConfig;
    if (!typeConfig.schema) {
      throw new FrodoError(
        `Managed object type "${type}" has no schema definition.`
      );
    }
    const current = typeConfig.schema.properties?.[propertyName];
    if (current) {
      const warning = `Current:\n${JSON.stringify(current, null, 2)}\nProposed:\n${JSON.stringify(propertyData, null, 2)}`;
      if (
        !(await confirmChange(
          warning,
          `Import property "${propertyName}" on managed object type "${type}", overwriting its current definition? This affects every instance of that type. Continue? (y|n):`,
          skipConfirmation
        ))
      ) {
        printMessage('Import aborted.', 'warn');
        return false;
      }
    }
    setSchemaProperty(
      typeConfig.schema as unknown as PropertyContainer,
      propertyName,
      propertyData
    );
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing property "${propertyName}" on "${type}" from ${filePath}...`
    );
    await importSubConfigEntity('managed', typeConfig, { validate: false });
    stopProgressIndicator(
      indicatorId,
      `Imported property "${propertyName}" on "${type}".`,
      'success'
    );
    return true;
  } catch (error) {
    if (indicatorId) {
      stopProgressIndicator(
        indicatorId,
        `Error importing property "${propertyName}" on "${type}".`,
        'fail'
      );
    }
    printError(error);
  }
  return false;
}

/**
 * Delete a schema property from a managed object type -- or, with
 * `subProperty`, a nested property reached via that dot-path. Prompts for
 * confirmation unless skipConfirmation is set.
 * @param {string} type managed object type, e.g. alpha_user
 * @param {string} propertyName schema property name, e.g. custom_merchantId
 * @param {boolean} skipConfirmation true to skip the confirmation prompt
 * @param {string} [subProperty] dot-path to a nested property beneath propertyName, e.g. "address.street"
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function deleteManagedObjectSchemaPropertyCli(
  type: string,
  propertyName: string,
  skipConfirmation: boolean = false,
  subProperty?: string
): Promise<boolean> {
  let indicatorId: string;
  const path = [propertyName, ...parseSubPropertyPath(subProperty)];
  try {
    // See updateManagedObjectSchemaPropertyCli's comment: this read is only
    // to confirm the property exists before prompting, and is discarded --
    // removeManagedObjectSchemaFlatProperty does its own read-modify-write.
    const typeConfig = (await readSubConfigEntity(
      'managed',
      type
    )) as ManagedObjectTypeConfig;
    if (!typeConfig.schema) {
      throw new FrodoError(
        `Managed object type "${type}" has no schema definition.`
      );
    }
    const { container, propertyName: leafName } = navigatePropertyPath(
      typeConfig.schema as unknown as PropertyContainer,
      path
    );
    if (!container.properties?.[leafName]) {
      printError(
        new FrodoError(
          `Property "${path.join('.')}" not found on managed object type "${type}"`
        )
      );
      return false;
    }
    const warning = `This permanently deletes property "${path.join('.')}" from managed object type "${type}".`;
    if (
      !(await confirmChange(
        warning,
        `Delete property "${path.join('.')}" from managed object type "${type}"? This affects every instance of that type. Continue? (y|n):`,
        skipConfirmation
      ))
    ) {
      printMessage('Delete aborted.', 'warn');
      return false;
    }
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Deleting property "${path.join('.')}" from "${type}"...`
    );
    await removeManagedObjectSchemaFlatProperty(
      type,
      propertyName,
      subProperty
    );
    stopProgressIndicator(
      indicatorId,
      `Deleted property "${path.join('.')}" from "${type}".`,
      'success'
    );
    return true;
  } catch (error) {
    if (indicatorId) {
      stopProgressIndicator(
        indicatorId,
        `Error deleting property "${path.join('.')}" from "${type}".`,
        'fail'
      );
    }
    printError(error);
  }
  return false;
}

/** Drops keys whose value is `undefined`, so a partial CLI-flag object only overrides what was actually passed. */
function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

/**
 * Describe a single relationship schema property of a managed object type,
 * via the dedicated v2 API (requires IDM 7.5+; Cloud always qualifies). `withReverse` also reads and displays
 * the reverse side, inferred from the forward property's own definition.
 * @param {string} type managed object type, e.g. alpha_aiagentprivilege
 * @param {string} propertyName relationship property name, e.g. agent
 * @param {boolean} json true to print raw JSON instead of a table
 * @param {boolean} withReverse true to also read and display the reverse side
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function describeManagedObjectSchemaRelationshipProperty(
  type: string,
  propertyName: string,
  json: boolean = false,
  withReverse: boolean = false
): Promise<boolean> {
  try {
    const property = await tryReadRelationshipProperty(type, propertyName);
    if (!property) {
      printError(
        new FrodoError(
          `Relationship "${propertyName}" not found on managed object type "${type}".`
        )
      );
      return false;
    }
    let reverse:
      | {
          type: string;
          propertyName: string;
          property: Record<string, unknown>;
        }
      | undefined;
    if (withReverse) {
      const identity = inferReverseIdentity(property);
      if (!identity) {
        printError(
          new FrodoError(
            `Relationship "${propertyName}" on managed object type "${type}" has no reverse relationship configured.`
          )
        );
        return false;
      }
      const reverseProperty = await tryReadRelationshipProperty(
        identity.type,
        identity.propertyName
      );
      if (!reverseProperty) {
        printError(
          new FrodoError(
            `Reverse relationship "${identity.propertyName}" not found on managed object type "${identity.type}".`
          )
        );
        return false;
      }
      reverse = { ...identity, property: reverseProperty };
    }
    if (json) {
      printMessage(
        JSON.stringify(
          reverse
            ? {
                [type]: { [propertyName]: property },
                [reverse.type]: { [reverse.propertyName]: reverse.property },
              }
            : property,
          null,
          2
        ),
        'data'
      );
      return true;
    }
    const describeRelationship = (
      name: string,
      relationshipProperty: Record<string, unknown>,
      suffix?: string
    ): string => {
      const title = relationshipProperty.title as string | undefined;
      const label =
        (title ? `${title} (${name})` : name) + (suffix ? ` ${suffix}` : '');
      const fields = Object.fromEntries(
        Object.entries(relationshipProperty).filter(([key]) => key !== 'title')
      );
      return `${c.heading(label)}\n\n${createObjectTable(fields).toString()}`;
    };
    const sections = [
      describeRelationship(`${type}.${propertyName}`, property),
    ];
    if (reverse) {
      sections.push(
        describeRelationship(
          `${reverse.type}.${reverse.propertyName}`,
          reverse.property,
          '(reverse)'
        )
      );
    }
    printMessage(sections.join('\n\n'), 'data');
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Create a new relationship schema property, via IDM's dedicated v2 schema
 * API (requires IDM 7.5+; Cloud always qualifies). Refuses if a
 * property with that name already exists (use update
 * instead). When `reverse` is given, the reverse side on
 * `fields.targetObject` is auto-created by the server in the same write --
 * see {@link buildReversePropertyDescriptor} -- rather than through a
 * separate CLI-side write; live-confirmed to work for all four single/many
 * combinations on both sides. Note the server does not honor a custom
 * reverse title/description (it always uses the raw property name for
 * both), even though `--reverse-title`/`--reverse-description` are threaded
 * through in case that changes.
 * @param {string} type managed object type, e.g. alpha_aiagentprivilege
 * @param {string} propertyName relationship property name, e.g. agent
 * @param {RelationshipPropertyFields} fields the forward side's field values
 * @param {RelationshipReverseCreateFields} [reverse] the reverse side's field values, if creating both sides
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function createManagedObjectSchemaRelationshipProperty(
  type: string,
  propertyName: string,
  fields: RelationshipPropertyFields,
  reverse?: RelationshipReverseCreateFields
): Promise<boolean> {
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      reverse
        ? `Creating relationship "${propertyName}" on "${type}", with reverse relationship "${reverse.propertyName}" on "${fields.targetObject}"...`
        : `Creating relationship "${propertyName}" on "${type}"...`
    );
    await createRelationshipPropertyLib(type, propertyName, fields, reverse);
    stopProgressIndicator(
      indicatorId,
      reverse
        ? `Created relationship "${propertyName}" on "${type}", with reverse relationship "${reverse.propertyName}" auto-created on "${fields.targetObject}".`
        : `Created relationship "${propertyName}" on "${type}".`,
      'success'
    );
    return true;
  } catch (error) {
    if (indicatorId) {
      stopProgressIndicator(
        indicatorId,
        `Error creating relationship "${propertyName}" on "${type}".`,
        'fail'
      );
    }
    printError(error);
  }
  return false;
}

/**
 * Update an existing relationship schema property, via IDM's dedicated v2
 * schema API (requires IDM 7.5+; Cloud always qualifies). Refuses
 * if the property doesn't exist (use create
 * instead). Only the fields present in `changedFields` change; everything
 * else keeps its current value. `withReverse` infers the reverse side from
 * the forward property's own current definition (no separate identity
 * flags needed) and applies the same explicit overrides to it too; no
 * automatic rollback if the reverse write fails after the forward side
 * already succeeded.
 * @param {string} type managed object type, e.g. alpha_aiagentprivilege
 * @param {string} propertyName relationship property name, e.g. agent
 * @param {Partial<RelationshipPropertyFields>} changedFields only the explicitly-passed field overrides
 * @param {boolean} skipConfirmation true to skip the confirmation prompt
 * @param {boolean} withReverse true to also update the inferred reverse side
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function updateManagedObjectSchemaRelationshipPropertyCli(
  type: string,
  propertyName: string,
  changedFields: Partial<RelationshipPropertyFields>,
  skipConfirmation: boolean = false,
  withReverse: boolean = false
): Promise<boolean> {
  let indicatorId: string;
  try {
    // A confirm-before-write diff needs the current/proposed definition(s)
    // up front, before frodo-lib's own read-modify-write runs -- so this
    // preview is built here (and discarded), then
    // updateManagedObjectSchemaRelationshipProperty does its own
    // independent read-modify-write for the actual change (see the
    // analogous comment on updateManagedObjectSchemaPropertyCli).
    const current = await tryReadRelationshipProperty(type, propertyName);
    if (!current) {
      printError(
        new FrodoError(
          `Relationship "${propertyName}" not found on managed object type "${type}". Use create instead.`
        )
      );
      return false;
    }
    // A configured reverse side's descriptor must be re-supplied on every
    // write, not just when --with-reverse asks to also change its fields --
    // see toReverseDescriptorFields. So the reverse side is fetched whenever
    // one exists, regardless of --with-reverse.
    const reverseIdentity = inferReverseIdentity(current);
    if (withReverse && !reverseIdentity) {
      printError(
        new FrodoError(
          `Relationship "${propertyName}" on managed object type "${type}" has no reverse relationship configured; --with-reverse cannot be used.`
        )
      );
      return false;
    }
    let reverseCurrent: Record<string, unknown> | null = null;
    if (reverseIdentity) {
      reverseCurrent = await tryReadRelationshipProperty(
        reverseIdentity.type,
        reverseIdentity.propertyName
      );
      if (!reverseCurrent) {
        printError(
          new FrodoError(
            `Reverse relationship "${reverseIdentity.propertyName}" not found on managed object type "${reverseIdentity.type}".`
          )
        );
        return false;
      }
    }
    const overrides = pruneUndefined(changedFields);
    const mergedForwardFields = {
      ...extractRelationshipFields(current),
      ...overrides,
    };
    const mergedReverseFields =
      reverseCurrent && reverseIdentity
        ? withReverse
          ? { ...extractRelationshipFields(reverseCurrent), ...overrides }
          : extractRelationshipFields(reverseCurrent)
        : undefined;
    const forwardPayload = buildRelationshipPropertyPayload(
      propertyName,
      mergedForwardFields,
      mergedReverseFields && reverseIdentity
        ? toReverseDescriptorFields(
            reverseIdentity.propertyName,
            mergedReverseFields
          )
        : undefined
    );
    let warning = `Current (${type}.${propertyName}):\n${JSON.stringify(current, null, 2)}\nProposed:\n${JSON.stringify(forwardPayload, null, 2)}`;
    if (withReverse && mergedReverseFields && reverseIdentity) {
      const reversePayload = buildRelationshipPropertyPayload(
        reverseIdentity.propertyName,
        mergedReverseFields,
        toReverseDescriptorFields(propertyName, mergedForwardFields)
      );
      warning += `\nCurrent (${reverseIdentity.type}.${reverseIdentity.propertyName}, reverse):\n${JSON.stringify(reverseCurrent, null, 2)}\nProposed:\n${JSON.stringify(reversePayload, null, 2)}`;
    }
    if (
      !(await confirmChange(
        warning,
        `Update relationship "${propertyName}" on managed object type "${type}"${withReverse ? ' and its reverse side' : ''}? This affects every instance of that type. Continue? (y|n):`,
        skipConfirmation
      ))
    ) {
      printMessage('Update aborted.', 'warn');
      return false;
    }
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      withReverse
        ? `Updating relationship "${propertyName}" on "${type}" and its reverse side...`
        : `Updating relationship "${propertyName}" on "${type}"...`
    );
    await updateRelationshipPropertyLib(
      type,
      propertyName,
      changedFields,
      withReverse
    );
    stopProgressIndicator(
      indicatorId,
      `Updated relationship "${propertyName}" on "${type}".`,
      'success'
    );
    return true;
  } catch (error) {
    if (indicatorId) {
      stopProgressIndicator(
        indicatorId,
        `Error updating relationship "${propertyName}" on "${type}".`,
        'fail'
      );
    }
    printError(error);
  }
  return false;
}

/**
 * Export a single relationship schema property definition to a local file,
 * via IDM's dedicated v2 schema API (requires IDM 7.5+; Cloud always
 * qualifies). Exports the named side only -- the reverse side, if any, is
 * exported separately by naming it directly.
 * @param {string} type managed object type, e.g. alpha_aiagentprivilege
 * @param {string} propertyName relationship property name, e.g. agent
 * @param {string} [file] export file; defaults to a generated filename
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportManagedObjectSchemaRelationshipPropertyToFile(
  type: string,
  propertyName: string,
  file?: string
): Promise<boolean> {
  try {
    const property = await tryReadRelationshipProperty(type, propertyName);
    if (!property) {
      printError(
        new FrodoError(
          `Relationship "${propertyName}" not found on managed object type "${type}".`
        )
      );
      return false;
    }
    const fileName =
      file ||
      getTypedFilename(`${type}-${propertyName}`, 'managed.relationship');
    saveJsonToFile(property, getFilePath(fileName, true), false);
    return true;
  } catch (error) {
    printError(
      error,
      `Error exporting relationship "${propertyName}" on "${type}"`
    );
  }
  return false;
}

/**
 * Import a single relationship schema property definition from a local
 * file, via IDM's dedicated v2 schema API (requires IDM 7.5+; Cloud always
 * qualifies), creating it if it doesn't already exist or overwriting it
 * (with confirmation, unless skipConfirmation is set) if it does. The
 * file's content is written verbatim, unlike `create`/`update`, which build
 * the definition from flags -- this is the escape hatch for relationship
 * shapes those flags can't express. Imports the named side only; the
 * reverse side, if any, needs its own separate import.
 * @param {string} type managed object type, e.g. alpha_aiagentprivilege
 * @param {string} propertyName relationship property name, e.g. agent
 * @param {string} file file containing the relationship property definition to import
 * @param {boolean} skipConfirmation true to skip the confirmation prompt when overwriting an existing relationship
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importManagedObjectSchemaRelationshipPropertyFromFile(
  type: string,
  propertyName: string,
  file: string,
  skipConfirmation: boolean = false
): Promise<boolean> {
  let indicatorId: string;
  let filePath: string;
  try {
    filePath = getFilePath(file);
    const propertyData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const current = await tryReadRelationshipProperty(type, propertyName);
    if (current) {
      const warning = `Current:\n${JSON.stringify(current, null, 2)}\nProposed:\n${JSON.stringify(propertyData, null, 2)}`;
      if (
        !(await confirmChange(
          warning,
          `Import relationship "${propertyName}" on managed object type "${type}", overwriting its current definition? This affects every instance of that type. Continue? (y|n):`,
          skipConfirmation
        ))
      ) {
        printMessage('Import aborted.', 'warn');
        return false;
      }
    }
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing relationship "${propertyName}" on "${type}" from ${filePath}...`
    );
    await updateManagedObjectSchemaProperty(type, propertyName, propertyData);
    stopProgressIndicator(
      indicatorId,
      `Imported relationship "${propertyName}" on "${type}".`,
      'success'
    );
    return true;
  } catch (error) {
    if (indicatorId) {
      stopProgressIndicator(
        indicatorId,
        `Error importing relationship "${propertyName}" on "${type}".`,
        'fail'
      );
    }
    printError(error);
  }
  return false;
}

/**
 * Delete a relationship schema property, via IDM's dedicated v2 schema API
 * (requires IDM 7.5+; Cloud always qualifies). `withReverse`
 * infers the reverse side from the forward property's
 * own current definition (no separate identity flags needed) and deletes
 * it first, then the forward side, so a failed second delete leaves the
 * explicitly-named side as the one still consistently present.
 * @param {string} type managed object type, e.g. alpha_aiagentprivilege
 * @param {string} propertyName relationship property name, e.g. agent
 * @param {boolean} skipConfirmation true to skip the confirmation prompt
 * @param {boolean} withReverse true to also delete the inferred reverse side
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function deleteManagedObjectSchemaRelationshipPropertyCli(
  type: string,
  propertyName: string,
  skipConfirmation: boolean = false,
  withReverse: boolean = false
): Promise<boolean> {
  let indicatorId: string;
  try {
    // See updateManagedObjectSchemaRelationshipPropertyCli's comment: this
    // preview is only to build the confirm warning, and is discarded --
    // removeManagedObjectSchemaRelationshipProperty does its own
    // independent read(s)/delete(s).
    const current = await tryReadRelationshipProperty(type, propertyName);
    if (!current) {
      printError(
        new FrodoError(
          `Relationship "${propertyName}" not found on managed object type "${type}"`
        )
      );
      return false;
    }
    let reverseIdentity: { type: string; propertyName: string } | null = null;
    let reverseCurrent: Record<string, unknown> | null = null;
    if (withReverse) {
      reverseIdentity = inferReverseIdentity(current);
      if (!reverseIdentity) {
        printError(
          new FrodoError(
            `Relationship "${propertyName}" on managed object type "${type}" has no reverse relationship configured; --with-reverse cannot be used.`
          )
        );
        return false;
      }
      reverseCurrent = await tryReadRelationshipProperty(
        reverseIdentity.type,
        reverseIdentity.propertyName
      );
      if (!reverseCurrent) {
        printError(
          new FrodoError(
            `Reverse relationship "${reverseIdentity.propertyName}" not found on managed object type "${reverseIdentity.type}".`
          )
        );
        return false;
      }
    }
    let warning = `This permanently removes the relationship "${propertyName}" from managed object type "${type}":\n${JSON.stringify(current, null, 2)}`;
    if (withReverse && reverseCurrent && reverseIdentity) {
      warning += `\n...and its reverse relationship, from managed object type "${reverseIdentity.type}":\n${JSON.stringify(reverseCurrent, null, 2)}`;
    }
    warning += `\nThis removes the relationship definition only.`;
    if (
      !(await confirmChange(
        warning,
        `Delete relationship "${propertyName}" from managed object type "${type}"${withReverse ? ' and its reverse side' : ''}? This affects every instance of that type. Continue? (y|n):`,
        skipConfirmation
      ))
    ) {
      printMessage('Delete aborted.', 'warn');
      return false;
    }
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      withReverse
        ? `Deleting relationship "${propertyName}" from "${type}" and its reverse side...`
        : `Deleting relationship "${propertyName}" from "${type}"...`
    );
    await removeRelationshipPropertyLib(type, propertyName, withReverse);
    stopProgressIndicator(
      indicatorId,
      `Deleted relationship "${propertyName}" from "${type}".`,
      'success'
    );
    return true;
  } catch (error) {
    if (indicatorId) {
      stopProgressIndicator(
        indicatorId,
        `Error deleting relationship "${propertyName}" from "${type}".`,
        'fail'
      );
    }
    printError(error);
  }
  return false;
}

/**
 * Create a new managed object type. Refuses if a type with that name
 * already exists (use update instead). Prompts for confirmation, reusing
 * the same schema-change gate `frodo idm schema object import` already
 * uses, unless skipConfirmation is set.
 * @param {string} type managed object type, e.g. alpha_widget
 * @param {string} title display title for the new type
 * @param {string} [icon] display icon; defaults to a generic icon if not passed
 * @param {string} [description] display description; omitted from the definition if not passed
 * @param {boolean} skipConfirmation true to skip the confirmation prompt
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function createManagedObjectType(
  type: string,
  title: string,
  icon: string | undefined,
  description: string | undefined,
  skipConfirmation: boolean = false
): Promise<boolean> {
  let indicatorId: string;
  try {
    if (
      !(await confirmChange(
        `This creates the new managed object type "${type}".`,
        'Schema changes affect every instance of this managed object type. Continue? (y|n):',
        skipConfirmation
      ))
    ) {
      printMessage('Create aborted.', 'warn');
      return false;
    }
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Creating managed object type "${type}"...`
    );
    await frodo.idm.managed.schema.createManagedObjectType(type, {
      title,
      icon,
      description,
    });
    stopProgressIndicator(
      indicatorId,
      `Created managed object type "${type}".`,
      'success'
    );
    return true;
  } catch (error) {
    if (indicatorId) {
      stopProgressIndicator(
        indicatorId,
        `Error creating managed object type "${type}".`,
        'fail'
      );
    }
    printError(error);
  }
  return false;
}

/**
 * Update an existing managed object type. Refuses if the type doesn't
 * exist (use create instead). Only the fields whose flags are passed
 * change; everything else keeps its current value. Prints a
 * current/proposed preview and prompts for confirmation, unless
 * skipConfirmation is set.
 * @param {string} type managed object type, e.g. alpha_widget
 * @param {{title?: string, icon?: string, description?: string}} changedFields only the explicitly-passed field overrides
 * @param {boolean} skipConfirmation true to skip the confirmation prompt
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function updateManagedObjectTypeCli(
  type: string,
  changedFields: { title?: string; icon?: string; description?: string },
  skipConfirmation: boolean = false
): Promise<boolean> {
  let indicatorId: string;
  try {
    // A confirm-before-write diff needs the current/proposed metadata up
    // front, before frodo-lib's own read-modify-write runs -- so this reads
    // the type once here purely to build that preview (discarded after),
    // then lets updateManagedObjectType do its own independent
    // read-modify-write for the actual change (see the analogous comment on
    // updateManagedObjectSchemaPropertyCli).
    const typeConfig = (await readSubConfigEntity(
      'managed',
      type
    )) as ManagedObjectTypeConfig;
    if (!typeConfig.schema) {
      printError(
        new FrodoError(
          `Managed object type "${type}" not found. Use create instead.`
        )
      );
      return false;
    }
    const schemaRecord = typeConfig.schema as unknown as Record<
      string,
      unknown
    >;
    const current = {
      title: typeConfig.schema.title,
      icon: schemaRecord['mat-icon'] as string | undefined,
      description: schemaRecord.description as string | undefined,
    };
    const proposed = {
      title: changedFields.title ?? current.title,
      icon: changedFields.icon ?? current.icon,
      description: changedFields.description ?? current.description,
    };
    const warning = `This updates the managed object type "${type}".\nCurrent:\n${JSON.stringify(current, null, 2)}\nProposed:\n${JSON.stringify(proposed, null, 2)}`;
    if (
      !(await confirmChange(
        warning,
        'Schema changes affect every instance of this managed object type. Continue? (y|n):',
        skipConfirmation
      ))
    ) {
      printMessage('Update aborted.', 'warn');
      return false;
    }
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Updating managed object type "${type}"...`
    );
    await frodo.idm.managed.schema.updateManagedObjectType(type, changedFields);
    stopProgressIndicator(
      indicatorId,
      `Updated managed object type "${type}".`,
      'success'
    );
    return true;
  } catch (error) {
    if (indicatorId) {
      stopProgressIndicator(
        indicatorId,
        `Error updating managed object type "${type}".`,
        'fail'
      );
    }
    printError(error);
  }
  return false;
}

/**
 * Describe a single managed object type: its own metadata (name/title/icon)
 * plus a Properties table and, if the type has any, a Relationships table
 * (which -- unlike Properties -- keeps the Target column). Flat by default
 * -- one row per top-level property; with `recursive`, nested `type: object`
 * properties expand inline, named by dot-path (e.g. `address.street`),
 * matching exactly what `--sub-property` on the property commands accepts.
 * @param {string} type managed object type, e.g. alpha_user or user
 * @param {boolean} json true to print raw JSON instead of a table -- always the complete definition, regardless of `recursive`
 * @param {boolean} recursive true to expand nested object properties inline in the table
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function describeManagedObjectType(
  type: string,
  json: boolean = false,
  recursive: boolean = false
): Promise<boolean> {
  try {
    const schema = await readManagedObjectSchema(type);
    if (json) {
      printMessage(JSON.stringify(schema, null, 2), 'data');
      return true;
    }
    const rows = await resolveRelationshipCardinalities(
      type,
      collectPropertyRows(
        (schema.properties || {}) as unknown as Record<
          string,
          Record<string, unknown>
        >,
        new Set(schema.required || []),
        recursive
      )
    );
    const propertyRows = rows.filter((row) => !row.isRelationship);
    const relationshipRows = rows.filter((row) => row.isRelationship);
    const matIcon = (schema as unknown as Record<string, unknown>)[
      'mat-icon'
    ] as string | undefined;
    const sections = [
      c.heading(schema.title ? `${schema.title} (${type})` : type),
      matIcon ? `icon: ${matIcon}` : undefined,
    ].filter(Boolean);
    if (propertyRows.length > 0) {
      const propertiesTable = createTable(PROPERTY_ONLY_TABLE_COLUMNS);
      pushPropertyTableRows(propertiesTable, propertyRows, false);
      sections.push(
        `${c.heading('Properties')}\n\n${propertiesTable.toString()}`
      );
    }
    if (relationshipRows.length > 0) {
      const relationshipsTable = createTable(PROPERTY_TABLE_COLUMNS);
      pushPropertyTableRows(relationshipsTable, relationshipRows);
      sections.push(
        `${c.heading('Relationships')}\n\n${relationshipsTable.toString()}`
      );
    }
    sections.push(PROPERTY_TABLE_KEY);
    printMessage(sections.join('\n\n'), 'data');
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * List every managed object type defined on the tenant. A single read of
 * the whole `managed` config entity already contains every type's
 * `{name, schema}`, so no per-type follow-up read is needed -- Properties
 * and Relationships (each shown as `total/required`) are both counted from
 * that same local schema, no extra reads. Name only by default, one per
 * line; `long` prints a table (Name/Title/Icon/Properties/Relationships)
 * instead. Unlike `frodo idm count`, this never reflects actual record
 * counts.
 *
 * Known gap, accepted for staying on a single free read rather than one
 * read per type: the bulk `managed` config entity doesn't include IDM's
 * auto-injected `_meta`/`_notifications` relationship properties, which
 * only appear via the dedicated per-type schema read `object
 * describe`/`relationship list` use -- so a type's Properties/Relationships
 * counts here can undercount by up to 2 relative to those commands.
 * @param {boolean} json true to print raw JSON instead of a table -- always the complete list, regardless of `long`
 * @param {boolean} long true to print the full table instead of just names
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function listManagedObjectTypes(
  json: boolean = false,
  long: boolean = false
): Promise<boolean> {
  try {
    const managedConfig = (await frodo.idm.config.readConfigEntity(
      'managed'
    )) as IdObjectSkeletonInterface & { objects?: ManagedObjectTypeConfig[] };
    const objects = managedConfig.objects || [];
    if (json) {
      printMessage(
        JSON.stringify(
          objects.map((object) => object.name),
          null,
          2
        ),
        'data'
      );
      return true;
    }
    const sorted = objects.slice().sort((a, b) => a.name.localeCompare(b.name));
    if (!long) {
      sorted.forEach((object) => printMessage(object.name, 'data'));
      return true;
    }
    const counts = sorted.map((object) => {
      const required = new Set(object.schema?.required || []);
      let propertyCount = 0;
      let requiredPropertyCount = 0;
      let relationshipCount = 0;
      let requiredRelationshipCount = 0;
      Object.entries(object.schema?.properties || {}).forEach(
        ([name, property]) => {
          if (
            isRelationshipProperty(
              property as unknown as Record<string, unknown>
            )
          ) {
            relationshipCount++;
            if (required.has(name)) {
              requiredRelationshipCount++;
            }
          } else {
            propertyCount++;
            if (required.has(name)) {
              requiredPropertyCount++;
            }
          }
        }
      );
      return {
        object,
        propertyCount,
        requiredPropertyCount,
        relationshipCount,
        requiredRelationshipCount,
      };
    });
    // Right-align just the numerator to the widest one in its column, so the "/" lines up across rows -- a plain right-aligned cell wouldn't, since it pads the whole "total/required" string as one block.
    const propertyWidth = Math.max(
      ...counts.map((c) => String(c.propertyCount).length)
    );
    const relationshipWidth = Math.max(
      ...counts.map((c) => String(c.relationshipCount).length)
    );
    const table = createTable([
      'Name',
      'Title',
      'Icon',
      'Properties',
      'Relationships',
    ]);
    counts.forEach(
      ({
        object,
        propertyCount,
        requiredPropertyCount,
        relationshipCount,
        requiredRelationshipCount,
      }) => {
        table.push([
          object.name,
          object.schema?.title || '',
          ((object.schema as unknown as Record<string, unknown>)?.[
            'mat-icon'
          ] as string) || '',
          `${String(propertyCount).padStart(propertyWidth)}/${requiredPropertyCount}`,
          `${String(relationshipCount).padStart(relationshipWidth)}/${requiredRelationshipCount}`,
        ]);
      }
    );
    printMessage(
      `${table.toString()}\n\nProperties/Relationships shown as total/required.`,
      'data'
    );
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * List the relationship schema properties of a managed object type --
 * fills the gap noted when the dedicated v2 relationship-schema API was
 * first exposed via `frodo idm schema relationship`: that API is
 * single-property GET/PUT/DELETE only, no bulk listing, so this falls back
 * to the same whole-type schema read `property list` already uses,
 * filtered to relationship-typed properties. Name only by default, one per
 * line; `long` prints the full relationship table instead (same
 * columns/abbreviations, including cardinality, as `object describe`'s
 * Relationships table).
 * @param {string} type managed object type, e.g. alpha_user
 * @param {boolean} json true to print raw JSON instead of a table -- always the complete definitions, regardless of `long`
 * @param {boolean} long true to print the full relationship table instead of just names
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function listManagedObjectSchemaRelationshipProperties(
  type: string,
  json: boolean = false,
  long: boolean = false
): Promise<boolean> {
  try {
    const schema = await readManagedObjectSchema(type);
    const entries = Object.entries(schema.properties || {}).filter(
      ([, property]) =>
        isRelationshipProperty(property as unknown as Record<string, unknown>)
    );
    if (json) {
      printMessage(
        JSON.stringify(Object.fromEntries(entries), null, 2),
        'data'
      );
      return true;
    }
    if (!long) {
      entries
        .map(([name]) => name)
        .sort()
        .forEach((name) => printMessage(name, 'data'));
      return true;
    }
    const rows = await resolveRelationshipCardinalities(
      type,
      collectPropertyRows(
        Object.fromEntries(entries) as unknown as Record<
          string,
          Record<string, unknown>
        >,
        new Set(schema.required || []),
        false
      )
    );
    const table = createTable(PROPERTY_TABLE_COLUMNS);
    pushPropertyTableRows(table, rows);
    printMessage(`${table.toString()}\n\n${PROPERTY_TABLE_KEY}`, 'data');
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Counts the records of a managed object type. A 404 from the query
 * endpoint reliably means the type's collection was never provisioned —
 * i.e. confirmed zero records, not an unknown failure — so it resolves to
 * 0 rather than propagating. Any other failure (permission, timeout, etc.)
 * propagates, since that genuinely is an unknown count and must not be
 * silently treated as "safe to proceed" (the exact not-found-misclassification
 * anti-pattern the tracker flagged elsewhere).
 * @param {string} type managed object type
 * @return {Promise<number>} a promise that resolves to the record count
 */
async function countManagedObjectRecords(type: string): Promise<number> {
  try {
    return await countManagedObjectsOfType(type);
  } catch (error) {
    if ((error as FrodoError).httpStatus === 404) {
      return 0;
    }
    throw error;
  }
}

/**
 * Delete a managed object type entirely (schema included). Refuses if the
 * type has existing records, or if the record count couldn't be confirmed,
 * unless force is set — every existing record of that type becomes
 * orphaned by this operation, so an -F/--force override is required in
 * addition to skipConfirmation (matching `frodo iga workflow delete -F`'s
 * existing pattern in this codebase: a distinct override for a safety
 * check, not a bigger confirmation prompt). Otherwise prompts for
 * confirmation unless skipConfirmation is set.
 * @param {string} type managed object type to delete, e.g. alpha_customType
 * @param {boolean} skipConfirmation true to skip the confirmation prompt
 * @param {boolean} force true to proceed even if records exist or the record count is unknown
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function deleteManagedObjectTypeCli(
  type: string,
  skipConfirmation: boolean = false,
  force: boolean = false
): Promise<boolean> {
  let indicatorId: string;
  try {
    let recordCount: number | undefined;
    try {
      recordCount = await countManagedObjectRecords(type);
    } catch {
      // count stays undefined; handled as "unknown" below
    }
    if (recordCount === undefined && !force) {
      printError(
        new FrodoError(
          `Unable to confirm number of existing "${type}" instances. Use -F/--force to delete.`
        )
      );
      return false;
    }
    if (recordCount !== undefined && recordCount > 0 && !force) {
      printError(
        new FrodoError(
          `${recordCount} existing "${type}" instance(s). Use -F/--force to delete.`
        )
      );
      return false;
    }
    if (
      !(await confirmChange(
        `This permanently deletes managed object type "${type}".`,
        `Delete managed object type "${type}"? This cannot be undone. Continue? (y|n):`,
        skipConfirmation
      ))
    ) {
      printMessage('Delete aborted.', 'warn');
      return false;
    }
    // No separate existence pre-check: removeManagedObjectType does its own
    // single read of the whole 'managed' config entity and throws its own
    // not-found error if the type is missing, so a second read here would
    // be a redundant round-trip.
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Deleting managed object type "${type}"...`
    );
    await frodo.idm.managed.schema.removeManagedObjectType(type);
    stopProgressIndicator(
      indicatorId,
      `Deleted managed object type "${type}".`,
      'success'
    );
    return true;
  } catch (error) {
    if (indicatorId) {
      stopProgressIndicator(
        indicatorId,
        `Error deleting managed object type "${type}".`,
        'fail'
      );
    }
    printError(error);
  }
  return false;
}

/**
 * Import all IDM configuration objects from working directory
 * @param {string} entitiesFile JSON file that specifies the config entities to export/import
 * @param {boolean} validate True to validate script hooks. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importAllConfigEntitiesFromFiles(
  entitiesFile?: string,
  validate: boolean = false
): Promise<boolean> {
  let indicatorId: string;
  const baseDirectory = getWorkingDirectory();
  try {
    const importData = await getIdmImportDataFromIdmDirectory(baseDirectory);
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing config entities from ${baseDirectory}...`
    );
    const options = getIdmImportExportOptions(entitiesFile);
    await importConfigEntities(
      importData as ConfigEntityExportInterface,
      undefined,
      {
        entitiesToImport: options.entitiesToExportOrImport,
        validate,
      },
      errorHandler
    );
    stopProgressIndicator(indicatorId, `Imported config entities`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing config entities from ${baseDirectory}.`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Count number of managed objects of a given type
 * @param {String} type managed object type, e.g. alpha_user
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function countManagedObjects(type: string): Promise<boolean> {
  try {
    const result = await countManagedObjectsOfType(type);
    printMessage(`${type}: ${result}`, 'data');
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Helper that reads all the idm config entity data from a directory
 * @param directory The directory of the idm config entities
 */
export async function getIdmImportDataFromIdmDirectory(
  directory: string
): Promise<ConfigEntityExportInterface> {
  const importData = { idm: {} } as ConfigEntityExportInterface;
  const idmConfigFiles = await readFiles(directory);
  idmConfigFiles.forEach((f) => (f.path = f.path.replace(/\/$/, '')));
  // Process sync mapping file(s)
  const sync = getLegacyMappingsFromFiles(idmConfigFiles);
  if (sync.mappings && sync.mappings.length > 0) {
    importData.idm.sync = sync;
  }
  const managed = getManagedObjectsFromFiles(idmConfigFiles);
  if (managed.objects && managed.objects.length > 0) {
    importData.idm.managed = managed;
  }
  // Process other files
  for (const f of idmConfigFiles.filter(
    (f) =>
      !f.path.endsWith('sync.idm.json') &&
      !f.path.endsWith('managed.idm.json') &&
      f.path.endsWith('.idm.json')
  )) {
    const baseDirOfThisJson = path.dirname(f.path);
    const entities = Object.values(
      JSON.parse(f.content).idm
    ) as unknown as IdObjectSkeletonInterface[];
    for (const entity of entities) {
      resolveAllExtractedScriptsForImport(entity, baseDirOfThisJson);
      importData.idm[entity._id] = entity;
    }
  }
  return importData;
}

/**
 * Recursive helper that reads in extracted scripts from IDM exports
 * @param {any} obj The object to read scripts in for
 * @param {string} baseDir The base directory where the extracted files are stored relative to
 * @param {WeakSet} visited The visited objects
 */
export function resolveAllExtractedScriptsForImport(
  obj: any,
  baseDir: string,
  visited = new WeakSet()
) {
  if (obj === null || typeof obj !== 'object') {
    return;
  }
  if (visited.has(obj)) return;
  visited.add(obj);
  if (Array.isArray(obj)) {
    for (const item of obj) {
      resolveAllExtractedScriptsForImport(item, baseDir, visited);
    }
    return;
  }
  if (typeof obj.source === 'string' && obj.source.startsWith('file://')) {
    const fileContent = getExtractedData(obj.source, baseDir);
    if (fileContent !== null) {
      obj.source = fileContent;
    }
  }
  for (const key of Object.keys(obj)) {
    resolveAllExtractedScriptsForImport(obj[key], baseDir, visited);
  }
}

/**
 * Helper that returns options for exporting/importing IDM config entities
 * @param {string} entitiesFile JSON file that specifies the config entities to export/import
 * @return {ConfigEntityExportOptions} the config export options
 */
export function getIdmImportExportOptions(entitiesFile?: string): {
  entitiesToExportOrImport: string[];
} {
  // read list of entities to export/import
  let entitiesToExportOrImport: string[] = [];
  if (entitiesFile) {
    const data = fs.readFileSync(entitiesFile, 'utf8');
    const entriesData = JSON.parse(data);
    entitiesToExportOrImport = entriesData.idm;
  }
  return {
    entitiesToExportOrImport,
  };
}

/**
 * Helper that writes objects in the managed IDM config entity to a directory
 * @param {ManagedSkeleton} managed The managed IDM config entity
 * @param {string} directory The directory to save the entity to within the base directory
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} extract true to extract idm scripts, false otherwise. Default: false
 */
export function writeManagedJsonToDirectory(
  managed: ManagedSkeleton,
  directory: string = 'managed',
  includeMeta: boolean = true,
  extract: boolean = false
) {
  const objectPaths = [];
  for (const object of managed.objects) {
    if (!object) {
      // Skip null/malformed entries in the tenant's managed.json objects array.
      continue;
    }
    const fileName = getTypedFilename(object.name, 'managed');
    if (
      extract &&
      extractManagedObjectScriptsToDirectory(
        object,
        `${directory}/${object.name}`
      )
    ) {
      objectPaths.push(
        extractDataToFile(object, `${object.name}/${fileName}`, directory)
      );
    } else {
      objectPaths.push(extractDataToFile(object, fileName, directory));
    }
  }
  managed.objects = objectPaths;
  saveToFile(
    'idm',
    managed,
    '_id',
    getFilePath(`${directory}/managed.idm.json`, true),
    includeMeta
  );
}

/**
 * Helper that extracts scripts from a managed object
 * @param {ObjectSkeleton} object The managed object
 * @param {string} directory The directory to extract scripts to within the base directory
 * @returns {boolean} true if at least one script got extracted, false otherwise
 */
export function extractManagedObjectScriptsToDirectory(
  object: ObjectSkeleton,
  directory: string = object.name
): boolean {
  const scripts = findIdmScripts(object);
  if (!scripts.length) return false;
  for (const script of scripts) {
    const managedObjectPath = script.path
      .replace('schema.', '')
      .replaceAll('properties.', '');
    const sourceObj = getObjectByPath(object, script.path);
    const objectFileName = `${managedObjectPath}.${script.type}`;
    sourceObj.source = extractDataToFile(
      script.source,
      objectFileName,
      directory
    );
  }
  return true;
}

/**
 * Helper that writes an IDM config entity to a directory
 * @param {IdObjectSkeletonInterface} object The IDM config entity
 * @param {string} directory The directory to save the entity to within the base directory
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} extract true to extract idm scripts, false otherwise. Default: false
 */
export function writeIdmObjectToDirectory(
  object: IdObjectSkeletonInterface,
  directory: string = '.',
  includeMeta: boolean = true,
  extract: boolean = false
) {
  let filePath;
  if (extract && extractIdmScriptsToDirectory(object, directory)) {
    filePath = getFilePath(
      `${directory}/${object._id}/${getTypedFilename(object._id.split('/').pop(), 'idm')}`,
      true
    );
  } else {
    filePath = getFilePath(`${directory}/${object._id}.idm.json`, true);
  }
  const directoryPath = path.dirname(filePath);
  if (!fs.existsSync(directoryPath))
    fs.mkdirSync(directoryPath, { recursive: true });
  saveToFile('idm', object, '_id', filePath, includeMeta);
}

/**
 * Helper that extracts scripts from an IDM entity
 * @param {ObjectSkeleton} object The IDM entity
 * @param {string} directory The directory to extract scripts to within the base directory
 * @returns {boolean} true if at least one script got extracted, false otherwise
 */
export function extractIdmScriptsToDirectory(
  object: IdObjectSkeletonInterface,
  directory: string
): boolean {
  const scripts = findIdmScripts(object);
  if (!scripts.length) return false;
  for (const script of scripts) {
    let objectFileName;
    let sourceObject;
    if (!script.path) {
      objectFileName = `${object._id.split('/').pop()}.${script.type}`;
      sourceObject = object;
    } else {
      objectFileName = `${script.path}.${script.type}`;
      sourceObject = getObjectByPath(object, script.path);
    }
    sourceObject.source = extractDataToFile(
      script.source,
      objectFileName,
      `${directory}/${object._id}`
    );
  }
  return true;
}

/**
 * Helper that reads the managed IDM config entity from files
 * @param {{ path: string; content: string }[]} files the files to read the managed IDM config entity object from
 * @returns {ManagedSkeleton} the managed IDM config entity
 */
export function getManagedObjectsFromFiles(
  files: { path: string; content: string }[]
): ManagedSkeleton {
  const managedFiles = files.filter((f) =>
    f.path.endsWith('/managed.idm.json')
  );
  if (managedFiles.length > 1) {
    throw new FrodoError(
      'Multiple managed.idm.json files found in idm directory'
    );
  }
  const managed: ManagedSkeleton = {
    _id: 'managed',
    objects: [],
  };
  if (managedFiles.length === 1) {
    const jsonData = JSON.parse(managedFiles[0].content);
    const managedData = jsonData.managed ?? jsonData.idm?.managed;
    const managedJsonDir = managedFiles[0].path.substring(
      0,
      managedFiles[0].path.indexOf('/managed.idm.json')
    );
    if (managedData?.objects) {
      for (const object of managedData.objects) {
        let resolvedObject: any;
        if (typeof object === 'string') {
          resolvedObject = getExtractedJsonData(object, managedJsonDir);
        } else {
          resolvedObject = object;
        }
        resolveAllExtractedScriptsForImport(
          resolvedObject,
          `${managedJsonDir}/${resolvedObject.name}`
        );
        managed.objects.push(resolvedObject);
      }
    }
  }
  return managed;
}

/**
 * Helper that returns the first object name in a path
 * @param {string} path The object path
 * @returns {string} The first name in the path
 */
export function getTopString(path: string): string {
  return path.split('.')[0];
}

/**
 * Helper that returns the first object in a path
 * @param {string} path The object path
 * @param {any} obj The parent object
 * @returns {any} The first object in the path
 */
export function getTopObject(path: string, obj: any): any {
  return obj[getTopString(path)];
}

/**
 * Helper that returns the last object name in a path
 * @param {string} path The object path
 * @returns {string} The last name in the path
 */
export function getLastString(path: string) {
  const parts = path.split('.');
  return parts[parts.length - 1];
}

/**
 * Helper that returns the object at the specified path
 * @param {string} path The object path
 * @param {any} obj The parent object
 * @returns {any} The object at the path
 */
export function getObjectByPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => {
    const realKey = /^\d+$/.test(key) ? Number(key) : key;
    return acc?.[realKey];
  }, obj);
}

/**
 * Helper that returns the object at the second to last of the specified path
 * @param {string} path The object path
 * @param {any} obj The parent object
 * @returns {any} The object at the second to last of the path
 */
export function getObjectByPathExcludeLast(obj: any, path: string): any {
  const keys = path.split('.');
  keys.pop();
  return getObjectByPath(obj, keys.join('.'));
}

/**
 * Recursive helper that finds all IDM scripts within an object
 * @param {any} obj The object
 * @param {string} currentPath The current path to the object
 * @param {MatchResult[]} result the found IDM scripts so far
 * @returns {MatchResult[]} the found IDM scripts
 */
export function findIdmScripts(
  obj: any,
  currentPath: string = '',
  result: MatchResult[] = []
): MatchResult[] {
  if (typeof obj !== 'object' || obj === null) return result;
  if ('source' in obj && 'type' in obj) {
    const normalizedSource = Array.isArray(obj.source)
      ? obj.source.join('\n')
      : obj.source;
    const scriptType =
      obj.type === 'text/javascript'
        ? 'js'
        : obj.type === 'groovy'
          ? 'groovy'
          : 'unknown';
    result.push({
      path: currentPath,
      source: normalizedSource,
      type: scriptType,
    });
  }

  for (const key of Object.keys(obj)) {
    const newPath = currentPath ? `${currentPath}.${key}` : key;
    findIdmScripts(obj[key], newPath, result);
  }

  return result;
}
