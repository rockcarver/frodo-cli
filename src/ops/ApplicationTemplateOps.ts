import fs from 'fs';
import { frodo } from '@rockcarver/frodo-lib';
import { isAirGappedError } from '../utils/AirGapHint';
import {
  catalogOptionsOf,
  type CatalogChannel,
  type CatalogSource,
} from '../utils/ApplicationTemplateSource';
import {
  capabilitiesOf,
  categoryOf,
  connectorSummaryOf,
  countsOf,
  displayNameOf,
  formSectionsOf,
  groupTemplates,
  isoDate,
  listKeyOf,
  marksOf,
  objectTypesOf,
  providesOf,
  provOf,
  recordOf,
  selectTemplate,
  textOf,
  versionsKeyOf,
  type FieldRow,
  type Json,
  type TemplateGroup,
  type TemplateSelector,
  type TemplateVersion,
} from '../utils/ApplicationTemplateView';
import c from '../utils/ColorTheme';
import { createTable, printError, printMessage } from '../utils/Console';

// The application template catalog has a library module of its own. Every
// library symbol this file uses is named here, so a rename is one line.
const {
  listTemplates,
  readCatalog,
  readTemplate: readTemplateInLibrary,
} = frodo.app.template;

const { getFilePath, saveTextToFile } = frodo.utils;

/** The catalog of the library together with what is known about it. */
type CatalogResult = Awaited<ReturnType<typeof readCatalog>>;

/** What to do when the catalog cannot be read because air-gapped mode is on. `printError` already says that air-gapped mode is on and how to turn it off. */
export const AIR_GAPPED_CATALOG_ADVICE =
  "Pass the application template catalog as a file with --templates <file>. Save the file with 'frodo app template download' on a machine that can reach the internet.";

/**
 * Print a failure of a template command. An air-gapped refusal of the library
 * gets the advice of this command line after the one `printError` prints for
 * every air-gapped refusal: the catalog can be given as a file.
 * @param {unknown} error the error that was caught
 */
function printCatalogFailure(error: unknown): void {
  printError(error as Error);
  if (isAirGappedError(error)) printMessage(AIR_GAPPED_CATALOG_ADVICE, 'info');
}

/** The name of the file `download` saves to when it is not given one. */
export const DEFAULT_CATALOG_FILE = 'appTemplates.json';

/**
 * The number of template versions and of product groups of a catalog.
 * @param {CatalogResult['catalog']} catalog the catalog
 * @returns {{ templates: number; groups: number }} the counts
 */
export function countCatalog(catalog: CatalogResult['catalog']): {
  templates: number;
  groups: number;
} {
  let templates = 0;
  let groups = 0;
  for (const tier of Object.values(catalog.AppTemplates ?? {})) {
    for (const group of Object.values(tier ?? {})) {
      groups++;
      templates += Object.keys(group ?? {}).length;
    }
  }
  return { templates, groups };
}

/** The options of the library for one read: the catalog, and the templates of the tenant if there is one. */
type LibraryOptions = ReturnType<typeof catalogOptionsOf> & {
  includeOverrides: boolean;
};

/**
 * The entries of the versions listed, by the key the catalog keeps them under.
 * The catalog is read once and the entries are taken from it; an entry the
 * tenant defines itself (it replaces the catalog's) is read through the library,
 * which also finds it if the catalog has no such entry.
 * @param {TemplateVersion[]} items the versions to read
 * @param {CatalogSource} source which catalog to read
 * @param {LibraryOptions} libraryOptions the options for the library
 * @returns {Promise<Map<string, Json>>} the entries by `templateId`; a version that could not be read is missing
 */
async function readEntries(
  items: TemplateVersion[],
  source: CatalogSource,
  libraryOptions: LibraryOptions
): Promise<Map<string, Json>> {
  const entries = new Map<string, Json>();
  const catalog = items.some((item) => !item.isOverride)
    ? (await readCatalog(catalogOptionsOf(source))).catalog
    : undefined;
  for (const version of items) {
    // the library is asked with the row as it listed it, not with the text
    // that is made safe to print
    const item = version.source;
    let entry = item.isOverride
      ? undefined
      : recordOf(
          catalog?.AppTemplates?.[item.tier]?.[item.group ?? '']?.[
            item.templateId
          ]
        );
    if (!entry) {
      const resolution = await readTemplateInLibrary(
        { templateName: item.name, templateVersion: item.templateVersion },
        libraryOptions
      );
      entry = recordOf(resolution.template);
    }
    if (entry) entries.set(item.templateId, entry);
  }
  return entries;
}

/**
 * A right-aligned cell of a table.
 * @param {string} text the text of the cell
 * @returns {{ hAlign: 'right'; content: string }} the cell
 */
function right(text: string): { hAlign: 'right'; content: string } {
  return { hAlign: 'right', content: text };
}

/**
 * List the application templates: the id of the newest version of each
 * template, or with `long` or `allVersions` (which are the same) a table with a
 * row for each: the newest version of each template, or with `allVersions` every
 * version, newest first. The templates of the tenant are merged over the
 * catalog when a connection to the tenant was made.
 * @param {CatalogSource & { long?: boolean; allVersions?: boolean; includeOverrides?: boolean }} options which catalog to read, how much to print, and whether the tenant's templates are merged in
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listApplicationTemplates(
  options: CatalogSource & {
    long?: boolean;
    allVersions?: boolean;
    includeOverrides?: boolean;
  }
): Promise<boolean> {
  try {
    const libraryOptions = {
      ...catalogOptionsOf(options),
      includeOverrides: options.includeOverrides === true,
    };
    const groups = groupTemplates(await listTemplates(libraryOptions));
    if (!options.long && !options.allVersions) {
      groups.forEach((group) => printMessage(group.name, 'data'));
      return true;
    }
    // --all-versions is the table, and has a row for every version
    const shown = groups.flatMap((group) =>
      (options.allVersions ? group.versions : [group.newest]).map((item) => ({
        group,
        item,
      }))
    );
    const entries = await readEntries(
      shown.map(({ item }) => item),
      options,
      libraryOptions
    );
    const table = createTable([
      'Id',
      'Ver',
      'Updated',
      'Name',
      'Category',
      'Prov',
    ]);
    const cells = shown.map(({ item }) => {
      const entry = entries.get(item.templateId) ?? {};
      return { entry, prov: provOf(entry, item.templateType) };
    });
    shown.forEach(({ group, item }, index) => {
      table.push([
        item.name,
        `${item.templateVersion}${marksOf(group, item)}`,
        isoDate(item.dateUpdated),
        displayNameOf(item),
        categoryOf(cells[index].entry),
        cells[index].prov,
      ]);
    });
    const key = listKeyOf({
      custom: shown.some(({ item }) => item.isOverride),
      unknown: cells.some(({ prov }) => prov === '?'),
    });
    printMessage(`${table.toString()}\n\n${key}`, 'data');
    return true;
  } catch (error) {
    printCatalogFailure(error);
  }
  return false;
}

/** A label and a value of the header of `describe`; a line without a value is not printed. */
type Line = [string, string | undefined];

/**
 * Print a section heading after an empty line.
 * @param {string} title the heading
 */
function printSection(title: string): void {
  // an empty message prints nothing, so the empty line is part of the heading
  printMessage(`\n${c.heading(title)}`, 'data');
}

/**
 * Print label and value lines, leaving out the lines that have no value.
 * @param {Line[]} lines the lines
 * @param {string} indent what each line starts with
 */
function printLines(lines: Line[], indent = '  '): void {
  lines
    .filter(([, value]) => value)
    .forEach(([label, value]) => {
      printMessage(`${indent}${label}: ${value}`, 'data');
    });
}

/**
 * The fields of a configuration or a form as one line: the labels, with a star
 * after the ones that are required.
 * @param {FieldRow[]} fields the fields
 * @returns {string} the labels
 */
function fieldLabels(fields: FieldRow[]): string {
  return fields
    .map((field) => `${field.label}${field.required ? '*' : ''}`)
    .join(', ');
}

/**
 * Print the fields of a connector configuration: one line of labels, or with
 * `long` a table with the property, the type and whether it is required.
 * @param {string} title what the fields are
 * @param {FieldRow[]} fields the fields
 * @param {boolean} long whether to print a table
 */
function printConfiguration(
  title: string,
  fields: FieldRow[],
  long: boolean
): void {
  if (fields.length === 0) return;
  if (!long) {
    printMessage(
      `  ${title} (${fields.length}, * required): ${fieldLabels(fields)}`,
      'data'
    );
    return;
  }
  printMessage(`  ${title} (${fields.length}):`, 'data');
  const table = createTable(['Label', 'Property', 'Type', 'Required']);
  fields.forEach((field) => {
    table.push([
      field.label,
      field.property,
      field.type,
      field.required ? 'yes' : '',
    ]);
  });
  printMessage(table.toString(), 'data');
}

/**
 * Print the sections of a template that follow its header: the versions, the
 * connector, the capabilities, the object types and the application form.
 * Sections the entry has no data for are left out.
 * @param {TemplateGroup} group all versions of the template
 * @param {TemplateVersion} item the version that is described
 * @param {Json} entry the entry of that version
 * @param {Map<string, Json>} entries the entries of all versions
 * @param {boolean} long whether to print the properties of the object types and the fields of the forms
 */
function printTemplateSections(
  group: TemplateGroup,
  item: TemplateVersion,
  entry: Json,
  entries: Map<string, Json>,
  long: boolean
): void {
  if (group.versions.length > 1) {
    printSection('Versions');
    const rows = group.versions.map((version) => {
      const versionEntry =
        version === item ? entry : (entries.get(version.templateId) ?? {});
      return {
        version,
        bundle: textOf(versionEntry['bundleVersion']) ?? '',
        counts: countsOf(versionEntry),
      };
    });
    // a column that is empty for every version (templates without a connector
    // or object types) is left out
    const withBundle = rows.some((row) => row.bundle);
    const withObjectTypes = rows.some((row) => row.counts.objectTypes > 0);
    const table = createTable([
      'Version',
      'Updated',
      ...(withBundle ? ['Connector bundle'] : []),
      ...(withObjectTypes ? [right('Object types'), right('Properties')] : []),
      'Note',
    ]);
    rows.forEach(({ version, bundle, counts }) => {
      table.push([
        `${version.templateVersion}${marksOf(group, version)}`,
        isoDate(version.dateUpdated),
        ...(withBundle ? [bundle] : []),
        ...(withObjectTypes
          ? [
              right(counts.objectTypes ? String(counts.objectTypes) : ''),
              right(counts.properties ? String(counts.properties) : ''),
            ]
          : []),
        version === item ? 'shown' : '',
      ]);
    });
    // the marks behind the versions are explained when the table has them
    const key = versionsKeyOf({
      newest: rows.some(({ version }) => marksOf(group, version).includes('*')),
      custom: rows.some(({ version }) => version.isOverride),
    });
    printMessage(
      key ? `${table.toString()}\n\n${key}` : table.toString(),
      'data'
    );
  }
  const connector = connectorSummaryOf(entry);
  if (connector) {
    printSection('Connector');
    printLines([
      ['Name', connector.name],
      ['Class', connector.className],
      [
        'Bundle',
        [connector.bundleName, connector.bundleRange].filter(Boolean).join(' '),
      ],
      ['Template version', connector.templateVersion],
      ['Paging', connector.pagingType],
      ['Type', connector.connectorType],
      ['Needs a remote connector server (RCS)', connector.rcsOnly ? 'yes' : ''],
      ['Prerequisites', connector.prerequisites],
    ]);
    printConfiguration('Basic configuration', connector.basic, long);
    printConfiguration('Advanced configuration', connector.advanced, long);
  }
  const capabilities = capabilitiesOf(entry);
  const capabilityLines: Line[] = [
    [
      'Provisioning',
      capabilities.provisioning
        ? capabilities.provisioning.join(', ') || 'none'
        : '',
    ],
    ['SSO', capabilities.sso.join(', ')],
    ['SSO setup', capabilities.ssoSetup.join(', ')],
    ['Incremental reconciliation', capabilities.incrementalRecon],
    ['Target', capabilities.target ? 'yes' : ''],
    ['Needs an OAuth flow', capabilities.requiresOauthFlow ? 'yes' : ''],
    ['Client types', capabilities.clients.join(', ')],
  ];
  if (capabilityLines.some(([, value]) => value)) {
    printSection('Capabilities');
    printLines(capabilityLines);
  }
  const objectTypes = objectTypesOf(entry);
  if (objectTypes.length > 0) {
    printSection('Object types');
    const table = createTable([
      'Name',
      'Native type',
      'Managed resource',
      right('Properties'),
      right('Required'),
    ]);
    objectTypes.forEach((objectType) => {
      table.push([
        objectType.name,
        objectType.nativeType,
        objectType.managedResource,
        right(String(objectType.properties.length)),
        right(String(objectType.required)),
      ]);
    });
    printMessage(table.toString(), 'data');
    if (long) {
      objectTypes.forEach((objectType) => {
        if (objectType.properties.length === 0) return;
        printSection(
          `Properties of ${objectType.name || objectType.nativeType}`
        );
        // the native name is only a column when it differs from the name
        const withNative = objectType.properties.some(
          (property) => property.nativeName !== property.name
        );
        const properties = createTable([
          'Name',
          ...(withNative ? ['Native name'] : []),
          'Type',
          'Flags',
        ]);
        objectType.properties.forEach((property) => {
          properties.push([
            property.name,
            ...(withNative ? [property.nativeName] : []),
            property.type,
            property.flags.join(', '),
          ]);
        });
        printMessage(properties.toString(), 'data');
      });
    }
  }
  const sections = formSectionsOf(entry);
  if (sections.length > 0) {
    printSection('Application form');
    sections.forEach((section) => {
      const noun = section.kind === 'fields' ? 'field' : 'default value';
      const count = `${section.names.length} ${noun}${
        section.names.length === 1 ? '' : 's'
      }`;
      printMessage(
        `  ${section.section}: ${count}${
          long && section.names.length > 0
            ? `: ${section.names.join(', ')}`
            : ''
        }`,
        'data'
      );
    });
  }
}

/**
 * Whether the catalog (not the templates of the tenant) has a version under the
 * key of this one: a version that the tenant defines itself replaces the
 * catalog's version of the same id and version, or has no counterpart.
 * @param {TemplateVersion} item the version, a custom one
 * @param {CatalogSource} source which catalog to read
 * @returns {Promise<boolean>} true if the catalog has the version
 */
async function catalogHasVersion(
  item: TemplateVersion,
  source: CatalogSource
): Promise<boolean> {
  const { catalog } = await readCatalog(catalogOptionsOf(source));
  return Object.values(catalog.AppTemplates ?? {}).some((tier) =>
    Object.values(tier ?? {}).some(
      (group) =>
        recordOf(group) !== undefined &&
        Object.prototype.hasOwnProperty.call(group, item.source.templateId)
    )
  );
}

/**
 * Describe an application template: a summary of the version (the newest
 * unless a version is named), its other versions, its connector, capabilities,
 * object types and application form, or with `json` the whole entry.
 * @param {TemplateSelector} selector the template (`-i` id or `-n` display name) and the version (`-v`)
 * @param {CatalogSource & { json?: boolean; long?: boolean; includeOverrides?: boolean }} options which catalog to read, how much to print, and whether the tenant's templates are merged in
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeApplicationTemplate(
  selector: TemplateSelector,
  options: CatalogSource & {
    json?: boolean;
    long?: boolean;
    includeOverrides?: boolean;
  }
): Promise<boolean> {
  try {
    const libraryOptions = {
      ...catalogOptionsOf(options),
      includeOverrides: options.includeOverrides === true,
    };
    const selection = selectTemplate(
      groupTemplates(await listTemplates(libraryOptions)),
      selector
    );
    if ('error' in selection) {
      printMessage(selection.error, 'error');
      return false;
    }
    const { group, item } = selection;
    const resolution = await readTemplateInLibrary(
      {
        templateName: item.source.name,
        templateVersion: item.source.templateVersion,
      },
      libraryOptions
    );
    const template = resolution.template;
    if (!template) {
      printMessage(
        `Application template ${item.name} ${item.templateVersion} could not be read.`,
        'error'
      );
      return false;
    }
    if (options.json) {
      printMessage(JSON.stringify(template, null, 2), 'data');
      return true;
    }
    const entry = recordOf(template) ?? {};
    const description = textOf(entry['description']);
    const supportUrl = textOf(entry['supportUrl']);
    const header: Line[] = [
      ['Id', group.name],
      ['Display name', displayNameOf(item)],
      [
        'Group',
        item.group ? `${item.group} (${item.tier})` : `(none, ${item.tier})`,
      ],
      ['Category', categoryOf(entry)],
      ['Provides', providesOf(entry)],
      [
        'Version',
        item.newestInGroup
          ? `${item.templateVersion} (newest)`
          : `${item.templateVersion} (the newest is ${group.newest.templateVersion})`,
      ],
      ['Updated', isoDate(item.dateUpdated)],
      [
        'Custom',
        item.isOverride
          ? `yes, ${
              (await catalogHasVersion(item, options))
                ? `replaces the catalog version ${item.templateVersion}`
                : 'no catalog counterpart'
            }`
          : '',
      ],
      ['Description', description],
      ['Support URL', supportUrl],
    ];
    printLines(header, '');
    // the other versions are read for the table of the versions; the version that
    // is described has been read
    const entries = await readEntries(
      group.versions.filter((version) => version !== item),
      options,
      libraryOptions
    );
    printTemplateSections(group, item, entry, entries, options.long === true);
    return true;
  } catch (error) {
    printCatalogFailure(error);
  }
  return false;
}

/**
 * Download the application template catalog and save it to a file, for a
 * machine that cannot reach the CDN. The library keeps the catalog in a
 * cache (the CLI switches it on at start) and the request is conditional, so
 * a catalog that did not change is not downloaded again. The file is the
 * decoded catalog as the library keeps it, unchanged: the text of the cached
 * file is copied. It can be given to `--templates` on the other machine.
 * @param {string | undefined} file the file to save to; default `appTemplates.json` in the working directory
 * @param {string | undefined} channel which catalog of the CDN: production (default) or development
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function downloadApplicationTemplateCatalog(
  file?: string,
  channel?: string
): Promise<boolean> {
  try {
    const { catalog, metadata } = await readCatalog({
      refresh: true,
      ...(channel ? { channel: channel as CatalogChannel } : {}),
    });
    const filePath = getFilePath(file || DEFAULT_CATALOG_FILE, true);
    const cached =
      metadata.cachePath && fs.existsSync(metadata.cachePath)
        ? fs.readFileSync(metadata.cachePath, 'utf8')
        : undefined;
    saveTextToFile(cached ?? JSON.stringify(catalog, null, 2), filePath);
    const { templates, groups } = countCatalog(catalog);
    if (!file) {
      printMessage(
        `No file given: saved as ${DEFAULT_CATALOG_FILE} in the working directory.`,
        'info'
      );
    }
    printMessage(`Saved the application template catalog to ${filePath}.`);
    printMessage(`  Templates: ${templates} versions in ${groups} groups`);
    printMessage(`  Source: ${metadata.source.location}`);
    printMessage(`  Cache: ${describeCacheOutcome(metadata)}`);
    if (metadata.etag) printMessage(`  ETag: ${metadata.etag}`);
    if (metadata.lastModified) {
      printMessage(`  Last-Modified: ${metadata.lastModified}`);
    }
    if (metadata.fetchedAt) printMessage(`  Checked: ${metadata.fetchedAt}`);
    if (metadata.cacheError) {
      printMessage(
        `The source could not be used (${metadata.cacheError}), so this is the copy kept earlier.`,
        'warn'
      );
    }
    printMessage(
      `To use it on a machine that cannot reach the internet, copy the file there and pass it with --templates <file>.`,
      'info'
    );
    return true;
  } catch (error) {
    printCatalogFailure(error);
  }
  return false;
}

/**
 * What the cache did for a read, in words.
 * @param {CatalogResult['metadata']} metadata what is known about the catalog
 * @returns {string} one line
 */
export function describeCacheOutcome(
  metadata: CatalogResult['metadata']
): string {
  const words: Record<CatalogResult['metadata']['cache'], string> = {
    disabled: 'not used',
    miss: 'downloaded (there was no kept copy)',
    fresh: 'the kept copy is recent, nothing was requested',
    revalidated: 'unchanged at the source, nothing was downloaded',
    refreshed: 'a newer catalog was downloaded and kept',
    'stale-after-error':
      'the source could not be used, the copy kept earlier is used',
    offline: 'air-gapped mode is on, the kept copy was used without a request',
  };
  const where = metadata.cachePath ? ` (${metadata.cachePath})` : '';
  return `${words[metadata.cache]}${where}`;
}
