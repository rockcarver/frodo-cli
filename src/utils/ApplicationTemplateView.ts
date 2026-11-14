/**
 * What `frodo app template list` and `describe` print about an application
 * template, and how they find the template a user asked for. Everything here is
 * a pure function of the catalog entries: no I/O and no library import, so it
 * loads in a unit test without the library.
 *
 * The entries come from the CDN catalog or, for the templates a tenant defines
 * itself, from the tenant, and the library checks only a few of their fields
 * (`displayName`, `templateType`, `dateUpdated`). Every read below is therefore
 * defensive: a field of an unexpected shape is left out, never an error. Text
 * from an entry is printed with its control characters (the C0 and C1 ones,
 * line and paragraph separators, and the characters that change the direction
 * of the text) replaced, so an entry cannot move the cursor, recolor the
 * terminal or reorder what is printed. The text of the rows of a list (id,
 * display name, version, group) is made safe once, in `groupTemplates`.
 */

/** A JSON object whose fields are not known. */
export type Json = Record<string, unknown>;

/** One template version, as the library lists it (the fields the commands use). */
export type TemplateRow = {
  /** The key the catalog keeps the version under, for example `3_3-azure-ad`. The commands do not print or accept it. */
  templateId: string;
  /** The id of the template, for example `azure.ad`. */
  name: string;
  group?: string;
  tier: 'consumer' | 'enterprise';
  templateVersion: string;
  displayName?: string;
  templateType?: string;
  dateUpdated?: string;
  isOverride: boolean;
  newestInGroup: boolean;
};

/**
 * A version of a list as the commands use it: the text fields are safe to print
 * (see `textOf`), and `source` is the row as the library listed it, for the
 * calls that name the template to the library.
 */
export type TemplateVersion = TemplateRow & { source: TemplateRow };

/** All versions of one template, oldest to newest as the library lists them. */
export type TemplateGroup = {
  /** The comparison key of the id: dots and hyphens are one, the case is not significant. */
  key: string;
  /** The id of the template, for example `azure.ad`. */
  name: string;
  versions: TemplateVersion[];
  /** The version the commands use when no version is given. */
  newest: TemplateVersion;
};

/** What the user typed to name a template. */
export type TemplateSelector = {
  /** `-i`: the id of the template. */
  id?: string;
  /** `-n`: the display name of the template. */
  name?: string;
  /** `-v`: a version other than the newest. */
  version?: string;
};

/** The template and the version a selector names, or why it names none. */
export type TemplateSelection =
  { group: TemplateGroup; item: TemplateVersion } | { error: string };

/**
 * The object if the value is one (not null, not an array).
 * @param {unknown} value any value
 * @returns {Json | undefined} the object, if the value is one
 */
export function recordOf(value: unknown): Json | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : undefined;
}

/**
 * The characters that are never printed: the C0 and C1 control characters (the
 * escape that starts a color or a cursor move, U+009B that starts the same in
 * 8 bits), the line and paragraph separators, the marks and the embeddings,
 * overrides and isolates that change the direction of the text (U+202E), the
 * zero-width characters and the byte order mark.
 */
const UNSAFE_CHARACTERS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]+/g;

/**
 * The text of a value that is printed on one line: a string (the characters
 * that are not safe to print, line breaks included, become a space) or a finite
 * number.
 * @param {unknown} value any value
 * @returns {string | undefined} the text, if there is any
 */
export function textOf(value: unknown): string | undefined {
  let text: string | undefined;
  if (typeof value === 'string') text = value;
  else if (typeof value === 'number' && Number.isFinite(value)) {
    text = String(value);
  }
  if (text === undefined) return undefined;
  const clean = text.replace(UNSAFE_CHARACTERS, ' ').trim();
  return clean || undefined;
}

/**
 * The comparison key of a template id: the library's own key (dots and hyphens
 * are one) in lower case.
 * @param {string} name the id a user typed or a catalog lists
 * @returns {string} the key
 */
export function nameKey(name: string): string {
  return String(name).trim().replace(/\./g, '-').toLowerCase();
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * A catalog date as `YYYY-MM-DD`. The catalog writes `MM-DD-YYYY` and `M-D-YYYY`
 * (`08-19-2026`, `10-5-2023`); the month comes first. A text that is not such a
 * date is returned as it is. Dates only decorate a listing: they are never used
 * to order versions (they do not follow the version order).
 * @param {unknown} value the `dateUpdated` of an entry
 * @returns {string} the date, or '' if there is none
 */
export function isoDate(value: unknown): string {
  const raw = textOf(value);
  if (!raw) return '';
  const match = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(raw);
  if (match) {
    const [month, day, year] = [Number(match[1]), Number(match[2]), match[3]];
    const check = new Date(Date.UTC(Number(year), month - 1, day));
    if (
      check.getUTCFullYear() === Number(year) &&
      check.getUTCMonth() === month - 1 &&
      check.getUTCDate() === day
    ) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }
  return raw;
}

/**
 * The name of a template as the commands show and accept it with `-n`: the
 * display name, or the id of a template that has none.
 * @param {TemplateRow} item a version of the template
 * @returns {string} the name
 */
export function displayNameOf(item: TemplateRow): string {
  return item.displayName || item.name;
}

/**
 * A row of the list with every text made safe to print, once, so that no
 * command prints an escape sequence that an entry carries in its id, display
 * name, version, group, type or date. The library keeps asking for the row as
 * it listed it (`source`).
 * @param {TemplateRow} item the row as the library lists it
 * @returns {TemplateVersion} the row for the commands
 */
function safeRow(item: TemplateRow): TemplateVersion {
  return {
    ...item,
    name: textOf(item.name) ?? '',
    group: textOf(item.group),
    templateVersion: textOf(item.templateVersion) ?? '',
    displayName: textOf(item.displayName),
    templateType: textOf(item.templateType),
    dateUpdated: textOf(item.dateUpdated),
    source: item,
  };
}

/**
 * Group the versions of a list by template, in the order of the list. The text
 * of the rows is made safe to print (see `safeRow`).
 * @param {TemplateRow[]} items the versions as the library lists them
 * @returns {TemplateGroup[]} one group per template
 */
export function groupTemplates(items: TemplateRow[]): TemplateGroup[] {
  const groups = new Map<string, TemplateGroup>();
  for (const original of items) {
    const item = safeRow(original);
    const key = nameKey(item.name);
    let group = groups.get(key);
    if (!group) {
      group = { key, name: item.name, versions: [], newest: item };
      groups.set(key, group);
    }
    group.versions.push(item);
  }
  for (const group of groups.values()) {
    // the library marks the newest by the version number (never by the date);
    // without a mark the last version of the list is the newest
    group.newest =
      group.versions.find((item) => item.newestInGroup) ??
      group.versions[group.versions.length - 1];
  }
  return [...groups.values()];
}

/**
 * Find the template and the version a user named.
 * @param {TemplateGroup[]} groups the templates of the list
 * @param {TemplateSelector} selector the id (`-i`) or display name (`-n`), and the version (`-v`)
 * @returns {TemplateSelection} the version, or an error to print
 */
export function selectTemplate(
  groups: TemplateGroup[],
  selector: TemplateSelector
): TemplateSelection {
  const id = textOf(selector.id);
  const name = textOf(selector.name);
  // a version that is given and empty (-v "$UNSET") is a version that does not exist
  const versionGiven =
    selector.version !== undefined && selector.version !== null;
  const version = textOf(selector.version) ?? '';
  let byId: TemplateGroup | undefined;
  let byName: TemplateGroup | undefined;
  if (id) {
    byId = groups.find((group) => group.key === nameKey(id));
    if (!byId) {
      const prefixed = /^\d+_\d+-/.test(id)
        ? ' An id carries no version: name the version with -v.'
        : '';
      return {
        error: `Application template "${id}" not found. "frodo app template list" prints the ids.${prefixed}`,
      };
    }
  }
  if (name) {
    const wanted = name.toLowerCase();
    const named = groups.filter(
      (group) => displayNameOf(group.newest).toLowerCase() === wanted
    );
    if (named.length > 1) {
      return {
        error: `More than one application template has the display name "${name}": ${named
          .map((group) => group.name)
          .join(', ')}. Name one with -i.`,
      };
    }
    byName = named[0];
    if (!byName) {
      return {
        error: `No application template has the display name "${name}". "frodo app template list --long" prints the display names.`,
      };
    }
  }
  if (byId && byName && byId !== byName) {
    return {
      error: `-i "${id}" and -n "${name}" name different application templates (${byId.name} and ${byName.name}). Give only one.`,
    };
  }
  const group = byId ?? byName;
  if (!group) {
    return { error: 'Name the template with -i (id) or -n (display name).' };
  }
  if (!versionGiven) return { group, item: group.newest };
  const wanted = version.toLowerCase();
  const item = group.versions.find(
    (candidate) => candidate.templateVersion.toLowerCase() === wanted
  );
  if (!item) {
    return {
      error: `Application template ${group.name} has no version ${version || '""'}. Versions: ${group.versions
        .map((candidate) => candidate.templateVersion)
        .join(', ')}.`,
    };
  }
  return { group, item };
}

/**
 * The category the catalog gives the template (the first of `categories`).
 * @param {Json} template the entry
 * @returns {string} the category, or '' if there is none
 */
export function categoryOf(template: Json): string {
  const categories = template['categories'];
  if (Array.isArray(categories)) {
    for (const category of categories) {
      const text = textOf(category);
      if (text) return text;
    }
    return '';
  }
  return textOf(categories) ?? '';
}

/**
 * Whether the entry has a connector: a provisioning template.
 * @param {Json} template the entry
 * @returns {boolean} true if it has one
 */
export function hasConnector(template: Json): boolean {
  return (
    recordOf(template['connectorTemplate']) !== undefined ||
    textOf(template['connectorName']) !== undefined
  );
}

/** A text that is a dotted class name (`org.forgerock.openicf.connectors.epic.ser.SerConnector`). */
const CLASS_NAME = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/;

/**
 * The name of the connector for a list: its display name without the word
 * "Connector" (`MSGraphAPI Connector` is `MSGraphAPI`), else the class name
 * of the connector without its package and without the word "Connector"
 * (`org.example.epic.SerConnector` is `Ser`). A display name that is itself a
 * class name (one entry of the catalog has such a name) is shortened the same
 * way.
 * @param {Json} template the entry
 * @returns {string} the name, or '' if the entry has no connector
 */
export function connectorOf(template: Json): string {
  const display = textOf(template['connectorDisplayName']);
  if (display && !CLASS_NAME.test(display)) {
    return display.replace(/\s+connector$/i, '') || display;
  }
  const className = display ?? textOf(template['connectorName']);
  const last = className ? (className.split('.').pop() ?? className) : '';
  // the word Connector is left out of a class name as it is of a display name
  return last.replace(/(?<=.)Connector$/, '') || last;
}

/**
 * The SSO protocols the entry says it supports (`capabilities.sso`, the ones
 * that are true).
 * @param {Json} template the entry
 * @returns {string[]} the protocols, for example `SAML`, `OIDC`
 */
export function ssoProtocolsOf(template: Json): string[] {
  const sso = recordOf(recordOf(template['capabilities'])?.['sso']);
  return sso
    ? Object.entries(sso)
        .filter(([, supported]) => supported === true)
        .map(([protocol]) => textOf(protocol) ?? '')
        .filter(Boolean)
    : [];
}

/**
 * What the template provides, in a few words: `target+provisioning` (an AI
 * target with a connector), `provisioning` (a connector), `SSO: SAML/OIDC` (the
 * protocols of `capabilities.sso`), both of the last two joined by a comma, or
 * else the `templateType` (`Bookmark`).
 * @param {Json} template the entry
 * @returns {string} the words, or '' if the entry says nothing
 */
export function providesOf(template: Json): string {
  const parts: string[] = [];
  const target = template['target'] === true;
  if (hasConnector(template)) {
    parts.push(target ? 'target+provisioning' : 'provisioning');
  } else if (target) {
    parts.push('target');
  }
  const sso = ssoProtocolsOf(template);
  if (sso.length > 0) parts.push(`SSO: ${sso.join('/')}`);
  return parts.length > 0
    ? parts.join(', ')
    : (textOf(template['templateType']) ?? '');
}

/** The letters of the `Prov` column of `list --long`, in the order they are printed. */
const PROV_ORDER = 'APSOFTB';

/** The letter of each SSO protocol the entry can name (the protocols of `capabilities.sso`, in lower case). */
const SSO_LETTERS: Record<string, string> = {
  saml: 'S',
  oidc: 'O',
  'ws-fed': 'F',
  'ws-trust': 'T',
};

/**
 * The `Prov` cell of `list --long`: one letter for each thing the template
 * provides, in the order A P S O F T B. `P` provisioning (a connector and the
 * provisioning capability), `A` an AI target (`target`), `S` SAML, `O` OIDC,
 * `F` WS-Fed and `T` WS-Trust (the protocols of `capabilities.sso`), `B` the
 * bookmark template. An entry that matches none of them gets `?`, never an
 * empty cell.
 * @param {Json} template the entry
 * @param {string} [templateType] the `templateType` of the list row, for an entry that does not say it
 * @returns {string} the letters, or `?`
 */
export function provOf(template: Json, templateType?: string): string {
  const letters = new Set<string>();
  if (template['target'] === true) letters.add('A');
  const provisioning = recordOf(
    recordOf(template['capabilities'])?.['provisioning']
  );
  if (hasConnector(template) && provisioning) letters.add('P');
  for (const protocol of ssoProtocolsOf(template)) {
    const letter = SSO_LETTERS[protocol.toLowerCase()];
    if (letter) letters.add(letter);
  }
  const type = textOf(template['templateType']) ?? textOf(templateType) ?? '';
  if (type.toLowerCase() === 'bookmark') letters.add('B');
  return (
    [...PROV_ORDER].filter((letter) => letters.has(letter)).join('') || '?'
  );
}

/** What the letters of the `Prov` column mean, as `list --long` prints it below its table. */
export const PROV_KEY =
  'P provisioning  A AI target  S SAML  O OIDC  F WS-Fed  T WS-Trust  B bookmark';

/**
 * The line below the table of `list --long`: what the abbreviations of the
 * columns that were printed mean. A mark is explained only if its column is
 * printed.
 * @param {{ allVersions: boolean; newestColumn: boolean; overrideColumn: boolean; unknown: boolean }} columns which view and which columns the table has
 * @param {boolean} columns.allVersions the table has a row for every version, so a version carries no star
 * @param {boolean} columns.newestColumn the table has the column `N` that marks the newest version
 * @param {boolean} columns.overrideColumn the table has the column `D` that marks a template the tenant defines
 * @param {boolean} columns.unknown a `Prov` cell says `?`
 * @returns {string} the line
 */
export function listKeyOf(columns: {
  allVersions: boolean;
  newestColumn: boolean;
  overrideColumn: boolean;
  unknown: boolean;
}): string {
  return [
    PROV_KEY,
    ...(columns.allVersions ? [] : ['* older versions exist']),
    ...(columns.newestColumn ? ['N newest version'] : []),
    ...(columns.overrideColumn ? ['D defined by the tenant'] : []),
    ...(columns.unknown ? ['? not known'] : []),
  ].join('  ');
}

const OPERATIONS = ['create', 'read', 'update', 'delete'];

/**
 * The operations of provisioning the entry allows (`capabilities.provisioning`,
 * the ones that are true), create, read, update, delete first.
 * @param {Json} template the entry
 * @returns {string[] | undefined} the operations; undefined if the entry says nothing about provisioning
 */
export function provisioningOperationsOf(template: Json): string[] | undefined {
  const provisioning = recordOf(
    recordOf(template['capabilities'])?.['provisioning']
  );
  if (!provisioning) return undefined;
  const allowed = Object.entries(provisioning)
    .filter(([, supported]) => supported === true)
    .map(([operation]) => (textOf(operation) ?? '').toLowerCase())
    .filter(Boolean);
  return [
    ...OPERATIONS.filter((operation) => allowed.includes(operation)),
    ...allowed.filter((operation) => !OPERATIONS.includes(operation)),
  ];
}

/** One configuration field of a connector or a field of the application form. */
export type FieldRow = {
  label: string;
  /** The property the field sets (`model`), if the entry says. */
  property: string;
  type: string;
  required: boolean;
};

/**
 * The fields in a value that holds them as a list of lists (the way the Admin
 * UI lays out a form), as rows.
 * @param {unknown} value the list
 * @param {number} depth how deep the list is nested (guards a cycle of lists)
 * @returns {FieldRow[]} the fields
 */
function fieldsIn(value: unknown, depth = 0): FieldRow[] {
  if (Array.isArray(value)) {
    return depth > 4
      ? []
      : value.flatMap((entry) => fieldsIn(entry, depth + 1));
  }
  const field = recordOf(value);
  if (!field) return [];
  const property = textOf(field['model']) ?? '';
  const label =
    textOf(field['label']) ?? (property || (textOf(field['name']) ?? ''));
  if (!label) return [];
  return [
    {
      label,
      property,
      type: textOf(field['type']) ?? '',
      required: recordOf(field['validation'])?.['required'] === true,
    },
  ];
}

/** What the connector of a template is and how it is configured. */
export type ConnectorSummary = {
  name: string;
  className: string;
  bundleName: string;
  bundleRange: string;
  templateVersion: string;
  pagingType: string;
  rcsOnly: boolean;
  connectorType: string;
  basic: FieldRow[];
  advanced: FieldRow[];
  prerequisites: string;
};

/**
 * The connector of the entry.
 * @param {Json} template the entry
 * @returns {ConnectorSummary | undefined} the connector; undefined if the entry has none
 */
export function connectorSummaryOf(
  template: Json
): ConnectorSummary | undefined {
  if (!hasConnector(template)) return undefined;
  const connector = recordOf(template['connectorTemplate']) ?? {};
  return {
    name: textOf(template['connectorDisplayName']) ?? connectorOf(template),
    className: textOf(template['connectorName']) ?? '',
    bundleName: textOf(template['bundleName']) ?? '',
    bundleRange: textOf(template['bundleVersion']) ?? '',
    templateVersion: textOf(connector['version']) ?? '',
    pagingType: textOf(connector['pagingType']) ?? '',
    rcsOnly: connector['rcsOnly'] === true,
    connectorType: textOf(connector['connectorType']) ?? '',
    basic: fieldsIn(connector['basic']),
    advanced: fieldsIn(connector['advanced']),
    prerequisites: textOf(connector['prerequisitesTitle']) ?? '',
  };
}

/** One property of an object type. */
export type PropertyRow = {
  name: string;
  nativeName: string;
  type: string;
  /** Short words for what is special about the property: `required`, `multi-valued`, `read-only`, ... */
  flags: string[];
};

/** One object type a template provisions (users, groups, ...). */
export type ObjectTypeRow = {
  name: string;
  nativeType: string;
  managedResource: string;
  properties: PropertyRow[];
  required: number;
};

const PROPERTY_FLAGS: [string, string][] = [
  ['required', 'required'],
  ['multiValued', 'multi-valued'],
  ['notReadable', 'not readable'],
  ['notCreatable', 'not creatable'],
  ['notUpdateable', 'not updateable'],
  ['notReturnedByDefault', 'not returned by default'],
  ['isUsername', 'username'],
  ['isDisplay', 'display'],
  ['isMail', 'mail'],
  ['nonAccountObject', 'not an account'],
];

/**
 * The words for what is special about a property. A property that can be
 * neither created nor updated is `read-only`.
 * @param {Json} property the property of an object type
 * @returns {string[]} the words
 */
function flagsOf(property: Json): string[] {
  const flags = PROPERTY_FLAGS.filter(([key]) => property[key] === true).map(
    ([, words]) => words
  );
  if (flags.includes('not creatable') && flags.includes('not updateable')) {
    const at = flags.indexOf('not creatable');
    return [
      ...flags.slice(0, at),
      'read-only',
      ...flags.slice(at + 1).filter((words) => words !== 'not updateable'),
    ];
  }
  return flags;
}

/**
 * The object types of the entry and their properties.
 * @param {Json} template the entry
 * @returns {ObjectTypeRow[]} the object types; none if the entry has none
 */
export function objectTypesOf(template: Json): ObjectTypeRow[] {
  const objectTypes = template['objectTypes'];
  if (!Array.isArray(objectTypes)) return [];
  const rows: ObjectTypeRow[] = [];
  for (const entry of objectTypes) {
    const objectType = recordOf(entry);
    if (!objectType) continue;
    const properties: PropertyRow[] = [];
    const list = objectType['properties'];
    for (const item of Array.isArray(list) ? list : []) {
      const property = recordOf(item);
      if (!property) continue;
      const nativeName = textOf(property['nativeName']) ?? '';
      properties.push({
        name: textOf(property['name']) ?? nativeName,
        nativeName,
        type: textOf(property['type']) ?? '',
        flags: flagsOf(property),
      });
    }
    rows.push({
      name: textOf(objectType['name']) ?? textOf(objectType['id']) ?? '',
      nativeType: textOf(objectType['nativeType']) ?? '',
      managedResource: textOf(objectType['managedResource']) ?? '',
      properties,
      required: properties.filter((property) =>
        property.flags.includes('required')
      ).length,
    });
  }
  return rows;
}

/** One section of the application form of a template. */
export type FormSection = {
  section: string;
  /** `fields` for a list of form fields, `defaults` for a set of default values. */
  kind: 'fields' | 'defaults';
  /** The labels of the fields, or the names of the default values. */
  names: string[];
};

/**
 * The sections of the application form (`schema`) of the entry.
 * @param {Json} template the entry
 * @returns {FormSection[]} the sections; none if the entry has none
 */
export function formSectionsOf(template: Json): FormSection[] {
  const schema = recordOf(template['schema']);
  if (!schema) return [];
  const sections: FormSection[] = [];
  for (const [section, value] of Object.entries(schema)) {
    const name = textOf(section);
    if (!name) continue;
    const defaults = recordOf(recordOf(value)?.['defaultValues']);
    const kind = defaults ? 'defaults' : 'fields';
    const names = defaults
      ? Object.keys(defaults)
          .map((key) => textOf(key) ?? '')
          .filter(Boolean)
      : fieldsIn(value).map((field) => field.label);
    // a section of a shape the commands do not know, or an empty one, says nothing
    if (names.length > 0) sections.push({ section: name, kind, names });
  }
  return sections;
}

/** What else the entry says it can do. */
export type CapabilitiesSummary = {
  provisioning?: string[];
  sso: string[];
  /** The keys of the `sso` block (the setup instructions and defaults of an SSO template). */
  ssoSetup: string[];
  incrementalRecon: string;
  target: boolean;
  requiresOauthFlow: boolean;
  clients: string[];
};

/**
 * The capabilities of the entry.
 * @param {Json} template the entry
 * @returns {CapabilitiesSummary} what the entry says
 */
export function capabilitiesOf(template: Json): CapabilitiesSummary {
  const recon = recordOf(template['incrementalRecon']);
  const reconProperty = textOf(recon?.['propertyName']);
  const operator = textOf(recon?.['comparisonOperator']);
  const clients = template['clients'];
  return {
    provisioning: provisioningOperationsOf(template),
    sso: ssoProtocolsOf(template),
    ssoSetup: Object.keys(recordOf(template['sso']) ?? {})
      .map((key) => textOf(key) ?? '')
      .filter(Boolean),
    incrementalRecon: reconProperty
      ? operator
        ? `${reconProperty} (${operator})`
        : reconProperty
      : '',
    target: template['target'] === true,
    requiresOauthFlow: template['requiresOauthFlow'] === true,
    clients: Array.isArray(clients)
      ? clients.map((client) => textOf(client) ?? '').filter(Boolean)
      : [],
  };
}

/**
 * The numbers of object types and properties of an entry, for a table of the
 * versions.
 * @param {Json} template the entry
 * @returns {{ objectTypes: number; properties: number }} the counts
 */
export function countsOf(template: Json): {
  objectTypes: number;
  properties: number;
} {
  const objectTypes = objectTypesOf(template);
  return {
    objectTypes: objectTypes.length,
    properties: objectTypes.reduce(
      (total, objectType) => total + objectType.properties.length,
      0
    ),
  };
}
