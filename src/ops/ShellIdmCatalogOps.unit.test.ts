import { describe, expect, it } from '@jest/globals';
import {
  parseIdmArgContext,
  parseIdmObjectContext,
  parseIdmStringContext,
} from './ShellAutoCompleteOps';
import {
  actionSuggestions,
  IdmCatalog,
  paramKeySuggestions,
  queryParamSuggestions,
  resourceSuggestions,
} from './ShellIdmCatalogOps';

/**
 * Unit tests for the IDM resource catalog and the string scanner that
 * feeds it (openidm.* quoted-string completion). The live enrichment is
 * exercised against a tenant in the PTY layer; here the pure pieces are
 * pinned: what the scanner recognizes, how the catalog composes
 * families, types, relationships and query params, and how the action
 * map filters by the first argument.
 */

const offline: IdmCatalog = {
  managedTypes: [],
  configIds: [],
  configFamilies: [],
  connectorIds: [],
  connectorObjectTypes: {},
};

const enriched: IdmCatalog = {
  managedTypes: ['alpha_user', 'alpha_role', 'alpha_assignment', 'user'],
  configIds: [
    'sync/AlphaUser2GoogleApps',
    'scheduler/nightly',
    'provisioner.openicf/GoogleApps',
  ],
  configFamilies: ['provisioner.openicf', 'scheduler', 'sync'],
  connectorIds: ['GoogleApps', 'ldap'],
  connectorObjectTypes: {
    GoogleApps: ['__ACCOUNT__', '__GROUP__'],
    ldap: ['account', 'group'],
  },
};

describe('parseIdmStringContext', () => {
  it('finds an open single-quoted string inside an openidm call', () => {
    const ctx = parseIdmStringContext("openidm.read('mana");
    expect(ctx).not.toBeNull();
    expect(ctx!.fnName).toBe('read');
    expect(ctx!.argIndex).toBe(0);
    expect(ctx!.content).toBe('mana');
  });

  it('handles double quotes', () => {
    const ctx = parseIdmStringContext('openidm.read("managed/user');
    expect(ctx!.content).toBe('managed/user');
  });

  it('tracks the argument position across commas outside strings', () => {
    const ctx = parseIdmStringContext("openidm.query('managed/user', '");
    expect(ctx!.argIndex).toBe(1);
    expect(ctx!.content).toBe('');
  });

  it('ignores commas inside nested braces (a filter object is one arg)', () => {
    const ctx = parseIdmStringContext(
      "openidm.query('managed/user', {_queryFilter: 'a eq \"x,y\"'}, '"
    );
    expect(ctx!.argIndex).toBe(2);
  });

  it('captures the first string argument for action filtering', () => {
    const ctx = parseIdmStringContext("openidm.action('recon', 're");
    expect(ctx!.fnName).toBe('action');
    expect(ctx!.argIndex).toBe(1);
    expect(ctx!.firstArg).toBe('recon');
    expect(ctx!.content).toBe('re');
  });

  it('respects escaped quotes inside the string', () => {
    const ctx = parseIdmStringContext("openidm.read('a\\'b");
    expect(ctx!.content).toBe("a\\'b");
  });

  it('returns null for non-openidm calls and non-string cursors', () => {
    expect(
      parseIdmStringContext("frodo.script.getScriptByName('na")
    ).toBeNull();
    expect(parseIdmStringContext("const x = 'just a str")).toBeNull();
    // String closed, cursor outside it.
    expect(parseIdmStringContext("openidm.read('managed/user')")).toBeNull();
  });
});

describe('resourceSuggestions', () => {
  it('offers the static families offline', () => {
    const entries = resourceSuggestions('', offline);
    const paths = entries.map((e) => e.path);
    expect(paths).toContain('managed/');
    expect(paths).toContain('repo/link');
    expect(paths).toContain('internal/user');
  });

  it('completes managed types from live enrichment only', () => {
    const alpha = resourceSuggestions('managed/al', enriched);
    expect(alpha.map((e) => e.path)).toEqual(
      expect.arrayContaining(['managed/alpha_user', 'managed/alpha_role'])
    );
    expect(alpha.map((e) => e.path)).not.toContain('managed/user');
    // Plain type for self-managed deployments completes too.
    expect(
      resourceSuggestions('managed/us', enriched).map((e) => e.path)
    ).toContain('managed/user');
    // Offline: nothing after managed/.
    expect(resourceSuggestions('managed/', offline)).toEqual([]);
  });

  it('offers relationship sub-paths after an id segment, keyed by base type', () => {
    const rels = resourceSuggestions('managed/alpha_user/jdoe/', enriched);
    const paths = rels.map((e) => e.path);
    expect(paths).toContain('managed/alpha_user/jdoe/roles');
    expect(paths).toContain('managed/alpha_user/jdoe/authzRoles');
    // A bravo type maps to the same base-type relationships.
    const bravo = resourceSuggestions('managed/bravo_user/x/m', enriched);
    expect(bravo.map((e) => e.path)).toEqual(
      expect.arrayContaining([
        'managed/bravo_user/x/manager',
        'managed/bravo_user/x/memberOfOrg',
      ])
    );
  });

  it('suggests nothing for an id position (ids are data)', () => {
    expect(resourceSuggestions('managed/alpha_user/', enriched)).toEqual([]);
  });

  it('completes config families and full config instance ids', () => {
    const fams = resourceSuggestions('config/sy', enriched);
    expect(fams.map((e) => e.path)).toContain('config/sync');
    const full = resourceSuggestions('config/sy', enriched);
    expect(full.map((e) => e.path)).toContain(
      'config/sync/AlphaUser2GoogleApps'
    );
  });

  it('completes connectors and their object types', () => {
    expect(
      resourceSuggestions('system/Goo', enriched).map((e) => e.path)
    ).toEqual(['system/GoogleApps']);
    expect(
      resourceSuggestions('system/GoogleApps/', enriched).map((e) => e.path)
    ).toEqual(
      expect.arrayContaining([
        'system/GoogleApps/__ACCOUNT__',
        'system/GoogleApps/__GROUP__',
      ])
    );
    expect(
      resourceSuggestions('system/ldap/', enriched).map((e) => e.path)
    ).toEqual(['system/ldap/account', 'system/ldap/group']);
  });

  it('completes repo sub-paths and repo/managed types', () => {
    expect(resourceSuggestions('repo/', enriched).map((e) => e.path)).toEqual(
      expect.arrayContaining([
        'repo/managed/',
        'repo/link',
        'repo/synchronisation/pooledSyncStage/',
      ])
    );
    expect(
      resourceSuggestions('repo/managed/alpha_r', enriched).map((e) => e.path)
    ).toContain('repo/managed/alpha_role');
    expect(
      resourceSuggestions(
        'repo/synchronisation/pooledSyncStage/Goo',
        enriched
      ).map((e) => e.path)
    ).toContain('repo/synchronisation/pooledSyncStage/GoogleApps');
  });
});

describe('actionSuggestions', () => {
  it('filters by the resource prefix', () => {
    expect(actionSuggestions('recon', '').map((a) => a.path)).toEqual(
      expect.arrayContaining(['recon', 'reconById'])
    );
    expect(actionSuggestions('recon/abc123', '').map((a) => a.path)).toEqual(
      expect.arrayContaining(['cancel', 'markCanceled'])
    );
    expect(actionSuggestions('external/email', '')).toEqual([
      expect.objectContaining({ path: 'send' }),
    ]);
    expect(
      actionSuggestions('system/GoogleApps', '').map((a) => a.path)
    ).toEqual(expect.arrayContaining(['test', 'liveSync']));
  });

  it('offers collection-level CREST actions on managed resources', () => {
    const acts = actionSuggestions('managed/alpha_user', '').map((a) => a.path);
    expect(acts).toEqual(
      expect.arrayContaining(['create', 'patch', 'triggerSyncCheck'])
    );
  });

  it('narrows by the typed partial', () => {
    expect(actionSuggestions('scheduler/job', 'pa').map((a) => a.path)).toEqual(
      ['pause', 'pauseJobs']
    );
  });
});

describe('queryParamSuggestions', () => {
  it('offers the CREST standard set after ?', () => {
    const params = queryParamSuggestions('managed/user?_');
    expect(params).toEqual(
      expect.arrayContaining([
        '_queryFilter',
        '_queryId',
        '_fields',
        '_pageSize',
      ])
    );
  });

  it('adds family extras (recon carries mapping)', () => {
    expect(queryParamSuggestions('recon?m')).toContain('mapping');
    expect(queryParamSuggestions('managed/user?m')).not.toContain('mapping');
  });

  it('excludes params already present', () => {
    const params = queryParamSuggestions('managed/user?_queryFilter=true&_');
    expect(params).not.toContain('_queryFilter');
    expect(params).toContain('_pageSize');
  });

  it('offers params after a second &', () => {
    const params = queryParamSuggestions('managed/user?_queryFilter=true&_fi');
    expect(params).toEqual(['_fields']);
  });
});

describe('parseIdmObjectContext', () => {
  it('finds an open params object and collects typed keys', () => {
    const ctx = parseIdmObjectContext(
      "openidm.query('managed/alpha_user', {_queryFilter: 'true', _pa"
    );
    expect(ctx).not.toBeNull();
    expect(ctx!.fnName).toBe('query');
    expect(ctx!.argIndex).toBe(1);
    expect(ctx!.typedKeys).toEqual(['_queryFilter']);
    expect(ctx!.partial).toBe('_pa');
    expect(ctx!.firstArg).toBe('managed/alpha_user');
  });

  it('reports an empty object and no partial', () => {
    const ctx = parseIdmObjectContext("openidm.query('managed/user', {");
    expect(ctx!.typedKeys).toEqual([]);
    expect(ctx!.partial).toBe('');
  });

  it('collects quoted keys too', () => {
    const ctx = parseIdmObjectContext(
      "openidm.query('managed/user', {'_queryFilter': 'true', '_"
    );
    expect(ctx!.typedKeys).toEqual(['_queryFilter']);
  });

  it('stops at the object close (back to null)', () => {
    expect(
      parseIdmObjectContext(
        "openidm.query('managed/user', {_queryFilter: 'x'})"
      )
    ).toBeNull();
  });

  it('ignores non-openidm object literals', () => {
    expect(parseIdmObjectContext('const x = { fo')).toBeNull();
    expect(
      parseIdmObjectContext("frodo.config.readConfigEntity('sync', { o")
    ).toBeNull();
  });
});

describe('paramKeySuggestions', () => {
  it('offers the CREST keys, excluding typed ones', () => {
    const keys = paramKeySuggestions('managed/user', ['_queryFilter'], '_');
    expect(keys).toContain('_pageSize');
    expect(keys).not.toContain('_queryFilter');
  });

  it('adds the family extras by resource (recon carries mapping)', () => {
    expect(paramKeySuggestions('recon', [], 'm')).toContain('mapping');
    expect(paramKeySuggestions('managed/user', [], 'm')).not.toContain(
      'mapping'
    );
  });

  it('narrows by the partial', () => {
    expect(paramKeySuggestions('managed/user', [], '_pa')).toEqual([
      '_pageSize',
      '_pagedResultsOffset',
      '_pagedResultsCookie',
    ]);
  });
});

describe('parseIdmArgContext', () => {
  it('reports the argument position past strings and nulls', () => {
    const ctx = parseIdmArgContext("openidm.update('managed/user/x', null,");
    expect(ctx!.argIndex).toBe(2);
    expect(ctx!.fnName).toBe('update');
  });

  it('returns null inside strings and objects (they hint themselves)', () => {
    expect(parseIdmArgContext("openidm.read('mana")).toBeNull();
    expect(parseIdmArgContext("openidm.query('managed/user', {_")).toBeNull();
  });
});
