import { frodo } from '@rockcarver/frodo-lib';

/**
 * The IDM resource catalog for string completion in the frodo JS console
 * (`frodo shell`): what fills the quoted first argument of
 * `openidm.read(...)` and friends, the `_action` of `openidm.action`, and
 * the query parameters after `?`.
 *
 * Names that describe a tenant (managed types, config instances,
 * connectors, system object types) come from live enrichment, fetched
 * once per connect and cached here. What is genuinely fixed (resource
 * families, relationship sub-paths, the resource-to-action map, the CREST
 * query parameters) is static. Offline or before enrichment, completion
 * degrades to the static families.
 */

/**
 * One suggestible segment: the text to insert and what it means (the hint
 * line shows the description).
 */
export type CatalogEntry = {
  /** The path segment as it goes into the string, e.g. `managed/user`. */
  readonly path: string;
  /** One-line meaning for the hint line. */
  readonly description?: string;
};

/**
 * The `openidm.action` map: resource prefix to the actions it accepts.
 * Verified against the Management API collection (recon, sync, scheduler,
 * system, taskscanner, external/email, policy, profile) and the IDM
 * scripting docs (collection-level CREST actions).
 */
const ACTION_MAP: ReadonlyArray<{ prefix: string; actions: string[] }> = [
  { prefix: 'recon', actions: ['recon', 'reconById'] },
  { prefix: 'recon/<reconId>', actions: ['cancel', 'markCanceled'] },
  { prefix: 'sync', actions: ['performAction', 'getLinkedResources'] },
  {
    prefix: 'scheduler/job',
    actions: [
      'trigger',
      'pause',
      'pauseJobs',
      'resume',
      'resumeJobs',
      'listCurrentlyExecutingJobs',
      'validateQuartzCronExpression',
    ],
  },
  {
    prefix: 'system/<connector>',
    actions: [
      'test',
      'liveSync',
      'availableConnectors',
      'availableConnectorServers',
    ],
  },
  { prefix: 'external/email', actions: ['send'] },
  { prefix: 'taskscanner', actions: ['execute'] },
  { prefix: 'taskscanner/<taskId>', actions: ['cancel'] },
  {
    prefix: 'policy/managed/<type>',
    actions: ['validateObject', 'validateProperty'],
  },
  {
    prefix: 'profile/managed/<type>/<id>',
    actions: ['increment', 'completeness'],
  },
  // Collection-level CREST actions the scripting docs define; valid on any
  // collection resource (managed/<type>, repo/managed/<type>, internal/...).
  { prefix: '<collection>', actions: ['create', 'patch', 'update'] },
];

/**
 * CREST query parameters, valid on every queryable resource. Confirmed in
 * the Management API collection (managed, internal, recon, sync,
 * scheduler all carry these) and the CREST reference.
 */
const CREST_QUERY_PARAMS: readonly string[] = [
  '_queryFilter',
  '_queryId',
  '_fields',
  '_pageSize',
  '_pagedResultsOffset',
  '_pagedResultsCookie',
  '_totalPagedResultsPolicy',
  '_sortKeys',
  '_sortDir',
  '_mimeType',
];

/**
 * Family extras: query parameters specific to a first segment (from the
 * collection: recon carries mapping, sync carries action/resourceName).
 */
const FAMILY_QUERY_PARAMS: Readonly<Record<string, readonly string[]>> = {
  recon: ['mapping'],
  sync: ['action', 'resourceName'],
};

/**
 * Relationship sub-paths per container, from the recorded schema
 * relationship properties and the Management API collection. `_notifications`
 * is a virtual sub-path (not a schema property). Each supports full CRUD
 * and the CREST params, like the parent tree.
 */
const RELATIONSHIP_MAP: Readonly<
  Record<string, readonly { name: string; target: string }[]>
> = {
  user: [
    { name: 'roles', target: 'managed/alpha_role' },
    { name: 'assignments', target: 'managed/alpha_assignment' },
    { name: 'groups', target: 'managed/alpha_group' },
    { name: 'applications', target: 'managed/alpha_application' },
    { name: 'reports', target: 'managed/alpha_user' },
    { name: 'manager', target: 'managed/alpha_user' },
    { name: 'memberOfOrg', target: 'managed/alpha_organization' },
    { name: 'adminOfOrg', target: 'managed/alpha_organization' },
    { name: 'ownerOfOrg', target: 'managed/alpha_organization' },
    { name: 'ownerOfApp', target: 'managed/alpha_application' },
    { name: 'authzRoles', target: 'internal/role' },
    { name: '_notifications', target: 'internal/notification' },
  ],
  role: [
    { name: 'members', target: 'managed/alpha_user' },
    { name: 'assignments', target: 'managed/alpha_assignment' },
    { name: 'applications', target: 'managed/alpha_application' },
  ],
  organization: [
    { name: 'members', target: 'managed/alpha_user' },
    { name: 'admins', target: 'managed/alpha_user' },
    { name: 'owners', target: 'managed/alpha_user' },
    { name: 'parent', target: 'managed/alpha_organization' },
    { name: 'children', target: 'managed/alpha_organization' },
  ],
  assignment: [{ name: 'roles', target: 'managed/alpha_role' }],
  'internal/role': [{ name: 'authzMembers', target: 'internal/user' }],
};

/**
 * The static resource families: the first path segment suggestions when
 * nothing live is known. Each carries what it means (hint line) and which
 * families are queryable containers (so `?` completion applies).
 */
const RESOURCE_FAMILIES: readonly CatalogEntry[] = [
  { path: 'managed/', description: 'managed objects (live types)' },
  {
    path: 'repo/managed/',
    description:
      'managed objects via the repo interface; bypasses lifecycle hooks and filters',
  },
  { path: 'repo/link', description: 'sync link data via the repo interface' },
  {
    path: 'repo/synchronisation/pooledSyncStage/',
    description: 'pooled sync stages per connector (live connector names)',
  },
  { path: 'internal/user', description: 'internal user records (repo-backed)' },
  { path: 'internal/role', description: 'internal role records (repo-backed)' },
  {
    path: 'config/',
    description:
      'configuration (live instances: sync mappings, scheduler jobs, connectors, ...)',
  },
  {
    path: 'system/',
    description:
      'external system objects via connectors (live connector names)',
  },
  { path: 'recon', description: 'reconciliation runs' },
  { path: 'sync', description: 'synchronization mappings and actions' },
  { path: 'scheduler/job', description: 'scheduled jobs' },
  { path: 'scheduler/trigger', description: 'scheduler triggers' },
  {
    path: 'policy/managed/',
    description: 'policy validation per managed type (live types)',
  },
  { path: 'privilege/', description: 'privilege config (managed types)' },
  {
    path: 'schema/managed/',
    description: 'schema per managed type (live types)',
  },
  {
    path: 'info/',
    description: 'server info: features, login, ping, version, uiconfig',
  },
  {
    path: 'profile/managed/',
    description:
      'per-user profile data: completeness, createDate, loginCount, termsAccepted',
  },
  {
    path: 'selfservice/',
    description: 'self-service config: kba, registration, reset, terms',
  },
  { path: 'taskscanner', description: 'task scanning' },
  {
    path: 'external/email',
    description: 'outbound email template (action: send)',
  },
  { path: 'authentication', description: 'authentication session actions' },
  { path: 'organization', description: 'legacy organization endpoint' },
  { path: 'ui/', description: 'UI configuration' },
  { path: 'endpoint/', description: 'custom endpoint scripts' },
  { path: 'script', description: 'script engine' },
  { path: 'csv/metadata', description: 'CSV import status' },
  { path: 'csv/template', description: 'CSV template' },
];

/**
 * Everything completion can know about a connected tenant. Built once per
 * connect (see refresh); empty fields mean "not enriched yet".
 */
export type IdmCatalog = {
  /** Managed object type names as the tenant configures them. */
  managedTypes: string[];
  /** Config entity ids (`sync/mappingName`, `scheduler/jobName`, ...). */
  configIds: string[];
  /** Config entity families (`sync`, `scheduler`, ...). */
  configFamilies: string[];
  /** Connector ids without the provisioner.openicf prefix. */
  connectorIds: string[];
  /** Object types per connector id (account, group, __ACCOUNT__, ...). */
  connectorObjectTypes: Record<string, string[]>;
  /** Which host the enrichment came from (stale when the tab reconnects). */
  host?: string;
};

const EMPTY_CATALOG: IdmCatalog = {
  managedTypes: [],
  configIds: [],
  configFamilies: [],
  connectorIds: [],
  connectorObjectTypes: {},
};

/**
 * The process-wide catalog for the terminal console (one engine per
 * process). The web engines keep their own per-tab catalog in the engine
 * closure; this holder serves the terminal's accessor.
 */
let terminalCatalog: IdmCatalog = EMPTY_CATALOG;

/** Read the terminal's catalog (an accessor, so completion sees updates). */
export function getIdmCatalog(): IdmCatalog {
  return terminalCatalog;
}

/**
 * Fetch the tenant-shaped parts of the catalog. Everything is read
 * through frodo-lib against the CURRENT state, so the caller must be the
 * engine whose connection the catalog should describe (the web worker's
 * per-tab state, or the terminal's process state). Any single read may
 * fail (unauthenticated, classic deployment, ...); the field it would
 * fill stays empty rather than failing the whole enrichment.
 */
export async function refreshIdmCatalog(
  previous?: IdmCatalog
): Promise<IdmCatalog> {
  const host = frodo.utils.getIdmBaseUrl() || undefined;
  if (previous?.host === host && previous.managedTypes.length > 0) {
    terminalCatalog = previous;
    return previous; // Already enriched for this connection.
  }
  const catalog: IdmCatalog = { ...EMPTY_CATALOG, host };
  const safe = async <T>(read: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await read();
    } catch {
      return undefined;
    }
  };

  const types = await safe(() => frodo.idm.config.readManagedObjectTypes());
  if (Array.isArray(types)) catalog.managedTypes = types;

  const stubs = await safe(() => frodo.idm.config.readConfigEntityStubs());
  if (Array.isArray(stubs)) {
    catalog.configIds = stubs
      .map((s) => (s as { _id?: string })._id ?? '')
      .filter((id) => id.includes('/'));
    catalog.configFamilies = [
      ...new Set(catalog.configIds.map((id) => id.split('/')[0])),
    ].sort();
  }

  const connectors = await safe(() => frodo.idm.connector.readConnectors());
  if (Array.isArray(connectors)) {
    catalog.connectorIds = connectors
      .map((c) => String((c as { _id?: string })._id ?? '').split('/')[1] ?? '')
      .filter((id) => id.length > 0);
    // Object types per connector need one read each; failures leave that
    // connector's object list empty (the connector name still completes).
    for (const id of catalog.connectorIds.slice(0, 20)) {
      const connector = await safe(() => frodo.idm.connector.readConnector(id));
      const objectTypes = Object.keys(
        (connector as { objectTypes?: Record<string, unknown> })?.objectTypes ??
          {}
      );
      if (objectTypes.length > 0)
        catalog.connectorObjectTypes[id] = objectTypes;
    }
  }
  terminalCatalog = catalog;
  return catalog;
}

/**
 * Suggestions for the first path segment (or after `repo/`, or after a
 * family prefix that keeps composing). Live names replace the static
 * `<type>` placeholders per family; families always come back.
 */
export function familySuggestions(
  catalog: IdmCatalog
): readonly CatalogEntry[] {
  void catalog;
  return RESOURCE_FAMILIES;
}

/**
 * What to suggest given a partial resource string already typed. The
 * scanner passes everything after the opening quote (raw); this returns
 * entries whose path extends what is typed so far.
 */
export function resourceSuggestions(
  typed: string,
  catalog: IdmCatalog
): CatalogEntry[] {
  const noQuestion = typed.split('?')[0];
  const segments = noQuestion.split('/');
  const out: CatalogEntry[] = [];

  // The next segment to complete. A trailing empty segment means the user
  // just typed the separator: offer everything valid at that level.
  const completed = segments.slice(0, -1);
  const partial = segments[segments.length - 1];

  const push = (path: string, description?: string) => {
    if (!out.some((e) => e.path === path)) out.push({ path, description });
  };

  // Which family are we in?
  const head = completed[0] ?? '';

  if (completed.length === 0) {
    // First segment: families, filtered by the partial text. When the
    // partial does not prefix-match any family (the user typed a type
    // name directly, `alpha_` instead of `managed/alpha_`), fall back to
    // CONTAIN-matching the live types and the fixed single resources, so
    // `alpha_` still finds managed/alpha_user.
    const f = partial.toLowerCase();
    let any = false;
    for (const fam of RESOURCE_FAMILIES) {
      if (fam.path.toLowerCase().startsWith(f)) {
        out.push(fam);
        any = true;
      }
    }
    if (!any && !partial.includes('/')) {
      for (const t of catalog.managedTypes) {
        if (t.toLowerCase().includes(f)) {
          out.push({
            path: `managed/${t}`,
            description: 'managed object type',
          });
        }
      }
      for (const fam of RESOURCE_FAMILIES) {
        const bare = fam.path.replace(/\/$/, '');
        if (!bare.includes('/') && bare.toLowerCase().includes(f))
          out.push(fam);
      }
    }
    return out;
  }

  const relKey = (t: string) => t.replace(/^(alpha|bravo)_/, '');
  const relsFor = (type: string): readonly { name: string; target: string }[] =>
    RELATIONSHIP_MAP[type] ?? RELATIONSHIP_MAP[relKey(type)] ?? [];

  if (
    head === 'managed' ||
    head === 'repo/managed' ||
    head === 'policy/managed' ||
    head === 'privilege' ||
    head === 'schema/managed'
  ) {
    const depth = completed.length - (head.includes('/') ? 1 : 0);
    // managed/<type> | managed/<type>/<id> | managed/<type>/<id>/<rel>
    if (depth === 1) {
      // Completing the type segment.
      const f = partial.toLowerCase();
      for (const t of catalog.managedTypes) {
        if (t.toLowerCase().startsWith(f)) {
          push(
            completed.concat(t).join('/'),
            head === 'repo/managed'
              ? 'via the repo interface (no lifecycle hooks)'
              : 'managed object type'
          );
        }
      }
      return out;
    }
    if (depth === 2) {
      // After the type: an id (typed by the user) or, when nothing is
      // typed, nothing to suggest (ids are data). Only when the user
      // explicitly typed a separator past the id do relationships apply.
      return out;
    }
    if (depth === 3 && partial.length >= 0) {
      const type = completed[completed.length - 2] ?? completed[1];
      for (const rel of relsFor(relKey(type))) {
        if (rel.name.toLowerCase().startsWith(partial.toLowerCase())) {
          push(
            completed.concat(rel.name).join('/'),
            `relationship to ${rel.target}`
          );
        }
      }
      return out;
    }
    return out;
  }

  if (head === 'config') {
    if (completed.length === 1) {
      // Completing the family or jumping straight to a full config id.
      const f = partial.toLowerCase();
      for (const fam of catalog.configFamilies) {
        if (fam.toLowerCase().startsWith(f)) {
          push(`config/${fam}`, 'config family (live instances follow)');
        }
      }
      for (const id of catalog.configIds) {
        const full = `config/${id}`;
        if (full.toLowerCase().startsWith(`config/${f}`)) push(full);
      }
      return out;
    }
    // config/<family>/<name...>: stubs carry the full id; offer completions
    // of the remaining part.
    const prefix = `config/${completed.slice(1).join('/')}${completed.length > 1 ? '/' : ''}`;
    for (const id of catalog.configIds) {
      if (id.toLowerCase().startsWith(prefix.slice('config/'.length))) {
        const full = `config/${id}`;
        if (!out.some((e) => e.path === full)) push(full);
      }
    }
    return out;
  }

  if (head === 'system') {
    if (completed.length === 1) {
      const f = partial.toLowerCase();
      for (const id of catalog.connectorIds) {
        if (id.toLowerCase().startsWith(f)) {
          push(`system/${id}`, 'connector (object types follow)');
        }
      }
      return out;
    }
    if (completed.length === 2) {
      const connector = completed[1];
      const f = partial.toLowerCase();
      for (const t of catalog.connectorObjectTypes[connector] ?? [
        'account',
        'group',
      ]) {
        if (t.toLowerCase().startsWith(f)) push(completed.concat(t).join('/'));
      }
      return out;
    }
    return out;
  }

  if (head === 'repo') {
    if (completed.length === 1) {
      const f = partial.toLowerCase();
      const subs: CatalogEntry[] = [
        {
          path: 'repo/managed/',
          description: 'managed objects via the repo interface',
        },
        { path: 'repo/link', description: 'sync link data' },
        {
          path: 'repo/synchronisation/pooledSyncStage/',
          description: 'pooled sync stages per connector',
        },
      ];
      for (const s of subs)
        if (s.path.toLowerCase().startsWith(`repo/${f}`)) out.push(s);
      return out;
    }
    if (completed[1] === 'managed') {
      if (completed.length === 2) {
        const f = partial.toLowerCase();
        for (const t of catalog.managedTypes) {
          if (t.toLowerCase().startsWith(f)) {
            push(
              completed.concat(t).join('/'),
              'via the repo interface (no lifecycle hooks)'
            );
          }
        }
        return out;
      }
      return out; // repo/managed/<type>/<id>: ids are data.
    }
    if (completed[1] === 'synchronisation' && completed.length === 3) {
      const f = partial.toLowerCase();
      for (const id of catalog.connectorIds) {
        if (id.toLowerCase().startsWith(f))
          push(completed.concat(id).join('/'));
      }
      return out;
    }
    return out;
  }

  if (head === 'info') {
    const subs = ['features', 'login', 'ping', 'version', 'uiconfig'];
    if (completed.length === 1) {
      for (const s of subs)
        if (s.startsWith(partial.toLowerCase())) push(`info/${s}`);
      return out;
    }
    if (completed.length === 2 && completed[1] === 'features') {
      return out; // feature ids are data-ish; suggest nothing.
    }
    return out;
  }

  if (head === 'selfservice') {
    const subs = ['kba', 'registration', 'reset', 'terms'];
    if (completed.length === 1) {
      for (const s of subs)
        if (s.startsWith(partial.toLowerCase())) push(`selfservice/${s}`);
      return out;
    }
    return out;
  }

  if (head === 'profile/managed') {
    if (completed.length === 2) {
      const f = partial.toLowerCase();
      for (const t of catalog.managedTypes) {
        if (t.toLowerCase().startsWith(f)) push(completed.concat(t).join('/'));
      }
      return out;
    }
    if (completed.length === 4) {
      const subs = [
        'completeness',
        'createDate',
        'loginCount',
        'termsAccepted',
      ];
      for (const s of subs)
        if (s.startsWith(partial.toLowerCase()))
          push(completed.concat(s).join('/'));
      return out;
    }
    return out;
  }

  return out;
}

/**
 * The `_action` suggestions for `openidm.action(<resource>, '<partial`):
 * the actions the typed resource accepts. The scanner passes the first
 * argument verbatim and the partial second argument.
 */
export function actionSuggestions(
  resource: string,
  typed: string
): { path: string; description?: string }[] {
  const clean = resource.split('?')[0];
  const generic = ACTION_MAP.find((a) => a.prefix === '<collection>');
  const out: { path: string; description?: string }[] = [];
  const add = (actions: readonly string[]) => {
    for (const a of actions) {
      if (a.toLowerCase().startsWith(typed.toLowerCase())) {
        out.push({ path: a });
      }
    }
  };
  if (clean.startsWith('recon')) {
    add(
      clean.includes('/') ? ['cancel', 'markCanceled'] : ['recon', 'reconById']
    );
  } else if (clean.startsWith('sync')) {
    add(['performAction', 'getLinkedResources']);
  } else if (clean.startsWith('scheduler/job')) {
    add(ACTION_MAP.find((a) => a.prefix === 'scheduler/job')!.actions);
  } else if (clean.startsWith('system')) {
    add(['test', 'liveSync']);
  } else if (clean.startsWith('external/email')) {
    add(['send']);
  } else if (clean.startsWith('taskscanner')) {
    add(clean.includes('/') ? ['cancel'] : ['execute']);
  } else if (clean.startsWith('policy')) {
    add(['validateObject', 'validateProperty']);
  } else if (clean.startsWith('profile')) {
    add(['increment', 'completeness']);
  } else if (
    clean.startsWith('managed') ||
    clean.startsWith('repo') ||
    clean.startsWith('internal')
  ) {
    add(['triggerSyncCheck', ...(generic?.actions ?? [])]);
  } else {
    add(generic?.actions ?? []);
  }
  return out;
}

/**
 * Query-parameter suggestions inside a resource string, after `?` (or
 * `&`). CREST standard set everywhere, plus family extras.
 */
export function queryParamSuggestions(typed: string): string[] {
  const query = typed.slice(typed.lastIndexOf('?') + 1);
  const done = query
    .split('&')
    .filter((p) => p.includes('='))
    .map((p) => p.split('=')[0]);
  const partialMatch = /[^&]*$/.exec(query)[0];
  const partial = partialMatch.split('=')[0];
  const family = typed.split('?')[0].split('/')[0];
  const candidates = [
    ...CREST_QUERY_PARAMS,
    ...(FAMILY_QUERY_PARAMS[family] ?? []),
  ];
  const seen = new Set(done);
  return candidates.filter(
    (p) => !seen.has(p) && p.toLowerCase().startsWith(partial.toLowerCase())
  );
}

/**
 * Is the typed string a query-parameter context (a `?` is present and the
 * cursor's partial is param-shaped)?
 */
export function isQueryParamContext(typed: string): boolean {
  return typed.includes('?');
}
