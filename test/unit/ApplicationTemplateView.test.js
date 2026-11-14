/**
 * Unit tests for what `frodo app template list` and `describe` derive from a
 * catalog entry and how they find the template a user named
 * (src/utils/ApplicationTemplateView.ts). The module is pure, so nothing is
 * mocked. What these tests guard:
 * - the version is never decided by a date, and a date that is not a date is
 *   printed as it is;
 * - an id is found whatever its case and whether it is written with dots or
 *   hyphens, a display name whatever its case, and the key the catalog keeps a
 *   version under (`3_4-azure-ad`) is not an id;
 * - every field of an entry may have the wrong type, and nothing throws;
 * - a text from an entry cannot carry a control character to the terminal:
 *   the escape that starts a color, U+009B (the same in 8 bits) and U+202E
 *   (a bidi override), and the text of every row of a list (id, display name,
 *   version, group, type, date) is made safe, one test per field.
 */
import { describe, expect, test } from '@jest/globals';
import {
  fixtureCatalog,
  fixtureTenantTemplates,
  listItemsOf,
  POISON,
  POISONABLE_FIELDS,
  poisonFixture,
  UNSAFE_OUTPUT,
} from '../utils/ApplicationTemplateFixtures.js';

const view = await import('../../src/utils/ApplicationTemplateView.ts');

const entryOf = (key) => {
  for (const tier of Object.values(fixtureCatalog.AppTemplates)) {
    for (const group of Object.values(tier)) {
      if (group[key]) return group[key];
    }
  }
  throw new Error(`no entry ${key} in the fixture`);
};

const groups = view.groupTemplates(listItemsOf(fixtureCatalog));

describe('text and dates', () => {
  test('1: a control character in a text becomes a space, and a text that is only such characters is no text', () => {
    expect(view.textOf('before\u001b[31mred\nafter\u0007')).toBe(
      'before [31mred after'
    );
    expect(view.textOf('\u001b\u0007')).toBeUndefined();
    // the 8-bit CSI, a bidi override, an isolate, a zero-width space, a line separator
    for (const unsafe of [
      '\u009b',
      '\u202e',
      '\u2066',
      '\u200b',
      '\u2028',
      '\u061c',
      '\ufeff',
    ]) {
      expect(view.textOf(`a${unsafe}b`)).toBe('a b');
    }
    expect(view.textOf(POISON)).toBe('[31m');
    // ordinary text from other scripts stays
    expect(view.textOf('Привет 日本語 é')).toBe('Привет 日本語 é');
    expect(view.textOf('  padded  ')).toBe('padded');
    expect(view.textOf(12)).toBe('12');
    expect(view.textOf(NaN)).toBeUndefined();
    expect(view.textOf(['a'])).toBeUndefined();
    expect(view.textOf(null)).toBeUndefined();
  });

  test('2: the catalog writes the month first, with and without a leading zero, and the date is printed as an ISO date', () => {
    expect(view.isoDate('08-19-2026')).toBe('2026-08-19');
    expect(view.isoDate('10-5-2023')).toBe('2023-10-05');
    expect(view.isoDate('2-5-2026')).toBe('2026-02-05');
  });

  test('3: a text that is not a date, or a date that does not exist, is printed as it is, and nothing is a crash', () => {
    expect(view.isoDate('13-45-2026')).toBe('13-45-2026');
    expect(view.isoDate('02-30-2026')).toBe('02-30-2026');
    expect(view.isoDate('sometime in 2023')).toBe('sometime in 2023');
    expect(view.isoDate(undefined)).toBe('');
    expect(view.isoDate(20260819)).toBe('20260819');
    expect(view.isoDate({})).toBe('');
  });
});

describe('the templates of a list', () => {
  test('4: versions are grouped by template in the order of the list, and the newest is the one the library marked, not the one with the latest date', () => {
    expect(groups.map((group) => group.name)).toEqual([
      'ai.target',
      'azure.ad',
      'bookmark',
      'class.name',
      'escape',
      'ldap',
      'odd',
      'saml',
    ]);
    const ldap = groups.find((group) => group.name === 'ldap');
    // the versions of a template are newest first, by the number and not by the date
    expect(ldap.versions.map((item) => item.templateVersion)).toEqual([
      '2.10',
      '2.3',
    ]);
    // 2.10 is newer than 2.3 by number although its date is not a date
    expect(ldap.newest.templateVersion).toBe('2.10');
    const saml = groups.find((group) => group.name === 'saml');
    expect(saml.newest.templateVersion).toBe('1.3');
  });

  test('5: without a mark the last version of the list is the newest', () => {
    const items = listItemsOf(fixtureCatalog).map((item) => ({
      ...item,
      newestInGroup: false,
    }));
    const regrouped = view.groupTemplates(items);
    expect(
      regrouped.find((group) => group.name === 'saml').newest.templateVersion
    ).toBe('1.3');
  });

  test('6: the key of the comparison is the id with dots and hyphens alike, in lower case', () => {
    expect(view.nameKey('Azure.AD')).toBe('azure-ad');
    expect(view.nameKey(' azure-ad ')).toBe('azure-ad');
  });
});

describe('the text of the rows of a list', () => {
  // every field the library hands to the commands without a check is made
  // safe once, in groupTemplates; the library is still asked with the row as
  // it listed it
  const safeFields = (row) =>
    [
      'name',
      'group',
      'templateVersion',
      'displayName',
      'templateType',
      'dateUpdated',
    ]
      .map((field) => row[field])
      .filter((value) => value !== undefined);

  test.each(POISONABLE_FIELDS)(
    '7: %s with an escape, U+009B and U+202E in it is printed without them',
    (field) => {
      const poisoned = view.groupTemplates(listItemsOf(poisonFixture(field)));
      const saml = poisoned.find((group) => group.key.startsWith('sa'));
      expect(saml).toBeDefined();
      expect(saml.name).not.toMatch(UNSAFE_OUTPUT);
      for (const row of [saml.newest, ...saml.versions]) {
        for (const value of safeFields(row)) {
          expect(value).not.toMatch(UNSAFE_OUTPUT);
        }
      }
      // the row as the library listed it keeps the characters, for the calls to the library
      const raw = JSON.stringify(saml.versions.map((row) => row.source));
      expect(raw).toContain(JSON.stringify(POISON).slice(1, -1));
    }
  );

  test('8: the other fields of the rows are as the library listed them', () => {
    const [group] = view
      .groupTemplates(listItemsOf(fixtureCatalog))
      .filter((candidate) => candidate.name === 'azure.ad');
    expect(group.newest).toMatchObject({
      name: 'azure.ad',
      group: 'AzureAD',
      templateVersion: '3.4',
      displayName: 'Microsoft Entra',
      templateType: 'Enterprise',
      dateUpdated: '08-19-2026',
      tier: 'enterprise',
      isOverride: false,
      newestInGroup: true,
      templateId: '3_4-azure-ad',
    });
    expect(group.newest.source.name).toBe('azure.ad');
  });
});

describe('finding the template a user named', () => {
  const select = (selector) => view.selectTemplate(groups, selector);

  test('9: -i takes the newest version, whatever the case, and dots or hyphens', () => {
    for (const id of ['azure.ad', 'AZURE.AD', 'azure-ad', ' Azure-Ad ']) {
      const selection = select({ id });
      expect(selection.item.name).toBe('azure.ad');
      expect(selection.item.templateVersion).toBe('3.4');
    }
  });

  test('10: -v takes another version, and 2.10 is not 2.1', () => {
    expect(
      select({ id: 'azure.ad', version: '3.3' }).item.templateVersion
    ).toBe('3.3');
    expect(select({ id: 'ldap', version: '2.10' }).item.templateVersion).toBe(
      '2.10'
    );
    expect(select({ id: 'ldap', version: '2.1' }).error).toContain(
      'has no version 2.1. Versions: 2.10, 2.3.'
    );
  });

  test('11: -n takes the display name, whatever the case', () => {
    const selection = select({ name: 'microsoft ENTRA' });
    expect(selection.item.name).toBe('azure.ad');
    expect(selection.item.templateVersion).toBe('3.4');
    expect(select({ name: 'AI Target (Demo)', version: '1.0' }).item.name).toBe(
      'ai.target'
    );
  });

  test('12: the id of a version, the key the catalog keeps it under, is not an id: the error says where the ids are, and what to give instead', () => {
    for (const [key, instead] of [
      ['3_4-azure-ad', '-i azure.ad -v 3.4'],
      ['1_2-saml', '-i saml -v 1.2'],
      ['2_10-ldap', '-i ldap -v 2.10'],
      ['3_3-AZURE-AD', '-i azure.ad -v 3.3'],
    ]) {
      const { error } = select({ id: key });
      expect(error).toBe(
        `Application template "${key}" not found. "frodo app template list" prints the ids. "${key}" looks like the id of a version, which is not an id: -i names the template and -v the version (for example ${instead}).`
      );
    }
    // a template that is not there: the hint takes the id as it was typed
    expect(select({ id: '1_0-nothing' }).error).toContain(
      '(for example -i nothing -v 1.0)'
    );
    // an id that is simply wrong gets no remark about versions
    expect(select({ id: 'nope' }).error).toBe(
      'Application template "nope" not found. "frodo app template list" prints the ids.'
    );
    // a version of two numbers is the form; other forms are not
    expect(select({ id: '3_4_1-azure-ad' }).error).not.toContain('looks like');
    expect(select({ id: '3-4-azure-ad' }).error).not.toContain('looks like');
    // a name is not an id either
    expect(select({ id: 'Microsoft Entra' }).error).toContain('not found');
    // -v does not rescue the id of a version
    expect(select({ id: '3_4-azure-ad', version: '3.4' }).error).toContain(
      'not found'
    );
  });

  test('13: an unknown display name says where the names are', () => {
    expect(select({ name: 'Nope' }).error).toBe(
      'No application template has the display name "Nope". "frodo app template list --long" prints the display names.'
    );
  });

  test('14: -i and -n that name different templates are an error, and the same template is not', () => {
    expect(select({ id: 'saml', name: 'Microsoft Entra' }).error).toContain(
      'name different application templates (saml and azure.ad)'
    );
    expect(select({ id: 'azure.ad', name: 'Microsoft Entra' }).item.name).toBe(
      'azure.ad'
    );
  });

  test('15: nothing named is an error, and a display name that two templates share asks for the id', () => {
    expect(select({}).error).toContain('-i (id) or -n (display name)');
    expect(select({ id: '  ' }).error).toContain('-i (id) or -n');
    const twins = view.groupTemplates([
      ...listItemsOf(fixtureCatalog),
      {
        ...listItemsOf(fixtureCatalog)[0],
        name: 'twin.one',
        displayName: 'LDAP',
        newestInGroup: true,
        isOverride: true,
      },
    ]);
    const { error } = view.selectTemplate(twins, { name: 'ldap' });
    expect(error).toContain('More than one application template');
    expect(error).toContain('ldap, twin.one');
  });

  test('16: a version that is given and empty (an unset shell variable) is a version that does not exist, like any other', () => {
    for (const version of ['', '   ']) {
      const { error } = select({ id: 'azure.ad', version });
      expect(error).toBe(
        'Application template azure.ad has no version "". Versions: 3.4, 3.3.'
      );
    }
    // no version at all is the newest
    expect(
      select({ id: 'azure.ad', version: undefined }).item.templateVersion
    ).toBe('3.4');
  });

  test('17: a template without a display name is named by its id with -n, the name the pickers and the list show for it', () => {
    const items = listItemsOf(fixtureCatalog).map((item) =>
      item.name === 'odd' ? { ...item, displayName: undefined } : item
    );
    const nameless = view.groupTemplates(items);
    expect(
      view.displayNameOf(nameless.find((g) => g.name === 'odd').newest)
    ).toBe('odd');
    expect(view.selectTemplate(nameless, { name: 'ODD' }).item.name).toBe(
      'odd'
    );
    // a display name that is also the id of another template is not guessed
    const clash = view.groupTemplates(
      items.map((item) =>
        item.name === 'saml' ? { ...item, displayName: 'odd' } : item
      )
    );
    expect(view.selectTemplate(clash, { name: 'odd' }).error).toContain(
      'More than one application template has the display name "odd"'
    );
  });
});

describe('what an entry provides', () => {
  test('18: a connector is provisioning, a target with a connector is both, SSO lists its protocols, and a bare entry says its type', () => {
    expect(view.providesOf(entryOf('3_4-azure-ad'))).toBe('provisioning');
    expect(view.providesOf(entryOf('1_0-ai-target'))).toBe(
      'target+provisioning'
    );
    expect(view.providesOf(entryOf('1_3-saml'))).toBe('SSO: SAML');
    expect(view.providesOf(entryOf('1_0-bookmark'))).toBe('Bookmark');
    // SSO that is false is not offered; both together are joined
    expect(
      view.providesOf({
        connectorName: 'x.Y',
        capabilities: { sso: { SAML: true, OIDC: true, 'WS-Fed': false } },
      })
    ).toBe('provisioning, SSO: SAML/OIDC');
    expect(view.providesOf({ target: true })).toBe('target');
    expect(view.providesOf({})).toBe('');
  });

  test('19: the connector is named without the word Connector, or by the last part of a class name', () => {
    expect(view.connectorOf(entryOf('3_4-azure-ad'))).toBe('MSGraphAPI');
    expect(view.connectorOf(entryOf('1_0-class-name'))).toBe('Ser');
    expect(
      view.connectorOf({ connectorName: 'org.example.epic.EpicConnector' })
    ).toBe('Epic');
    // the word alone is a name
    expect(view.connectorOf({ connectorName: 'org.example.Connector' })).toBe(
      'Connector'
    );
    expect(view.connectorOf({ connectorDisplayName: 'Connector' })).toBe(
      'Connector'
    );
    expect(view.connectorOf(entryOf('1_3-saml'))).toBe('');
  });

  test('20: the category is the first the catalog gives, as it gives it', () => {
    expect(view.categoryOf(entryOf('3_4-azure-ad'))).toBe('Uncategorized');
    expect(view.categoryOf(entryOf('1_3-saml'))).toBe('saml');
    expect(view.categoryOf(entryOf('1_0-odd'))).toBe('oops');
    expect(view.categoryOf({ categories: [null, 3, 'second'] })).toBe('3');
    expect(view.categoryOf({ categories: [] })).toBe('');
    expect(view.categoryOf({})).toBe('');
  });
});

describe('the Prov letters and the key line of list --long', () => {
  const sso = (...protocols) => ({
    capabilities: {
      sso: Object.fromEntries(protocols.map((protocol) => [protocol, true])),
    },
  });
  const provisioning = {
    connectorName: 'org.example.X',
    capabilities: { provisioning: { Read: true } },
  };

  test('21: each letter: P provisioning, A AI target, S SAML, O OIDC, F WS-Fed, T WS-Trust, B bookmark', () => {
    expect(view.provOf(provisioning)).toBe('P');
    expect(view.provOf({ target: true })).toBe('A');
    expect(view.provOf(sso('SAML'))).toBe('S');
    expect(view.provOf(sso('OIDC'))).toBe('O');
    expect(view.provOf(sso('WS-Fed'))).toBe('F');
    expect(view.provOf(sso('WS-Trust'))).toBe('T');
    expect(view.provOf({ templateType: 'Bookmark' })).toBe('B');
    // the type of the row of the list serves when the entry does not say it
    expect(view.provOf({}, 'bookmark')).toBe('B');
    // the entries of the fixture
    expect(view.provOf(entryOf('3_4-azure-ad'))).toBe('P');
    expect(view.provOf(entryOf('1_3-saml'))).toBe('S');
    expect(view.provOf(entryOf('1_0-bookmark'))).toBe('B');
  });

  test('22: an AI target with a connector is AP and WS-Fed with WS-Trust is FT', () => {
    expect(view.provOf(entryOf('1_0-ai-target'))).toBe('AP');
    expect(view.provOf(sso('WS-Fed', 'WS-Trust'))).toBe('FT');
  });

  test('23: the letters come in the order A P S O F T B whatever the order the entry says them in', () => {
    const everything = {
      ...provisioning,
      target: true,
      templateType: 'Bookmark',
      capabilities: {
        sso: { 'WS-Trust': true, 'WS-Fed': true, OIDC: true, SAML: true },
        provisioning: { Read: true },
      },
    };
    expect(view.provOf(everything)).toBe('APSOFTB');
    expect(view.provOf({ ...sso('WS-Trust', 'SAML'), target: true })).toBe(
      'AST'
    );
  });

  test('24: a connector alone is not provisioning, a protocol that is false or has no letter is nothing, and the protocol is read whatever its case', () => {
    expect(view.provOf({ connectorName: 'org.example.X' })).toBe('?');
    expect(
      view.provOf({ capabilities: { provisioning: { Read: true } } })
    ).toBe('?');
    expect(
      view.provOf({ capabilities: { sso: { SAML: false, OIDC: false } } })
    ).toBe('?');
    expect(view.provOf(sso('Agent'))).toBe('?');
    expect(view.provOf(sso('saml', 'Oidc', 'ws-FED'))).toBe('SOF');
    expect(view.provOf({ target: 'yes' })).toBe('?');
  });

  test('25: an entry that matches nothing, or has the wrong shapes, says ? and never throws', () => {
    expect(view.provOf({})).toBe('?');
    expect(view.provOf(entryOf('1_0-odd'))).toBe('?');
    expect(view.provOf(entryOf('1_0-escape'))).toBe('?');
    for (const nothing of [
      { capabilities: [] },
      { capabilities: 'x', connectorTemplate: 5, target: null },
      { capabilities: { sso: [] }, templateType: 12 },
      { capabilities: { provisioning: 'yes' }, connectorName: ['x'] },
      { capabilities: { sso: { SAML: 'true' } } },
    ]) {
      expect(view.provOf(nothing)).toBe('?');
    }
  });

  test('26: the key line is the letters and the star, and says what + and ? mean only where the table has them', () => {
    const none = { custom: false, unknown: false };
    const key =
      'P provisioning  A AI target  S SAML  O OIDC  F WS-Fed  T WS-Trust  B bookmark  * newest version, older ones exist';
    expect(view.listKeyOf(none)).toBe(key);
    expect(view.PROV_KEY).toBe(key);
    expect(view.listKeyOf({ ...none, custom: true })).toBe(
      `${key}  + custom: defined in the tenant`
    );
    expect(view.listKeyOf({ ...none, unknown: true })).toBe(
      `${key}  ? not known`
    );
    // both: the plus first
    expect(view.listKeyOf({ custom: true, unknown: true })).toBe(
      `${key}  + custom: defined in the tenant  ? not known`
    );
    // the pieces that are not printed are not in the line
    expect(view.listKeyOf(none)).not.toContain('+');
    expect(view.listKeyOf(none)).not.toContain('?');
  });

  test('27: the line under the table of the versions of describe explains the marks that are printed', () => {
    expect(view.versionsKeyOf({ newest: false, custom: false })).toBe('');
    expect(view.versionsKeyOf({ newest: true, custom: false })).toBe(
      '* newest version, older ones exist'
    );
    expect(view.versionsKeyOf({ newest: false, custom: true })).toBe(
      '+ custom: defined in the tenant'
    );
    expect(view.versionsKeyOf({ newest: true, custom: true })).toBe(
      '* newest version, older ones exist  + custom: defined in the tenant'
    );
  });
});

describe('the marks behind a version', () => {
  const tenant = listItemsOf(fixtureCatalog, fixtureTenantTemplates);
  const grouped = view.groupTemplates(tenant);
  const marks = (id, version) => {
    const group = grouped.find((candidate) => candidate.name === id);
    const item = group.versions.find((v) => v.templateVersion === version);
    return view.marksOf(group, item);
  };

  test('28: the star is on the newest version of a template that has older versions, and on no other', () => {
    expect(marks('ldap', '2.10')).toBe('*');
    expect(marks('ldap', '2.3')).toBe('');
    expect(marks('saml', '1.3')).toBe('*');
    expect(marks('saml', '1.2')).toBe('+');
    expect(marks('bookmark', '1.0')).toBe('');
    expect(marks('ai.target', '1.0')).toBe('');
  });

  test('29: the plus is on a custom version, a template of its own, a replacement or a newer version, and on no other', () => {
    expect(marks('ronSoperSpecial', '1.0')).toBe('+');
    expect(marks('saml', '1.2')).toBe('+');
    expect(marks('azure.ad', '3.4')).toBe('');
    expect(marks('azure.ad', '3.3')).toBe('');
  });

  test('30: a custom version that is the newest and has older versions has both, the star first', () => {
    expect(marks('azure.ad', '3.5')).toBe('*+');
    // the same version without the older ones has the plus only
    const alone = view.groupTemplates(
      listItemsOf(fixtureCatalog, fixtureTenantTemplates).filter(
        (item) => item.name !== 'azure.ad' || item.templateVersion === '3.5'
      )
    );
    const group = alone.find((candidate) => candidate.name === 'azure.ad');
    expect(view.marksOf(group, group.newest)).toBe('+');
  });

  test('31: the newest of a template is the one the library marked, not the first and not the latest date, and the versions come newest first', () => {
    const azure = grouped.find((candidate) => candidate.name === 'azure.ad');
    expect(azure.newest.templateVersion).toBe('3.5');
    expect(azure.versions.map((v) => v.templateVersion)).toEqual([
      '3.5',
      '3.4',
      '3.3',
    ]);
  });

  test('32: versions compare number by number, so 2.10 is newer than 2.9 and 1.0 is 1', () => {
    expect(view.compareVersions('2.10', '2.9')).toBeGreaterThan(0);
    expect(view.compareVersions('2.9', '2.10')).toBeLessThan(0);
    expect(view.compareVersions('1.0', '1')).toBe(0);
    expect(view.compareVersions('3.4', '3.3')).toBeGreaterThan(0);
    // a part that is no number compares as text
    expect(view.compareVersions('1.a', '1.b')).toBeLessThan(0);
    // the date plays no part: versions are listed by their number only
    const items = listItemsOf(fixtureCatalog).map((item) =>
      item.name === 'ldap' && item.templateVersion === '2.3'
        ? { ...item, dateUpdated: '12-31-2030' }
        : item
    );
    const ldap = view
      .groupTemplates(items)
      .find((candidate) => candidate.name === 'ldap');
    expect(ldap.versions.map((v) => v.templateVersion)).toEqual([
      '2.10',
      '2.3',
    ]);
  });
});

describe('the parts of an entry', () => {
  test('33: the connector has its bundle, paging and configuration fields, with the required ones marked', () => {
    const connector = view.connectorSummaryOf(entryOf('3_4-azure-ad'));
    expect(connector).toMatchObject({
      name: 'MSGraphAPI Connector',
      className: 'org.example.msgraphapi.MSGraphAPIConnector',
      bundleName: 'org.example.msgraphapi-connector',
      bundleRange: '[1.5.20.35, 1.6.0.0)',
      templateVersion: '1.5.20.35',
      pagingType: 'cookie',
      rcsOnly: true,
      prerequisites: 'Register an app in Entra first',
    });
    expect(
      connector.basic.map((field) => [field.label, field.required])
    ).toEqual([
      ['Tenant', true],
      ['Client Secret', false],
    ]);
    expect(connector.basic[1]).toMatchObject({
      property: 'clientSecret',
      type: 'password',
    });
    expect(connector.advanced).toHaveLength(1);
    expect(view.connectorSummaryOf(entryOf('1_3-saml'))).toBeUndefined();
  });

  test('34: object types count their properties and the required ones, and a property that can be neither created nor updated is read-only', () => {
    const [user, group] = view.objectTypesOf(entryOf('3_4-azure-ad'));
    expect(user).toMatchObject({
      name: 'User',
      nativeType: '__ACCOUNT__',
      managedResource: 'user',
      required: 1,
    });
    expect(user.properties).toHaveLength(3);
    expect(user.properties[0].flags).toEqual(['required']);
    expect(user.properties[2].flags).toEqual(['multi-valued', 'read-only']);
    expect(group.required).toBe(1);
    expect(view.countsOf(entryOf('3_4-azure-ad'))).toEqual({
      objectTypes: 2,
      properties: 4,
    });
    expect(view.countsOf(entryOf('1_3-saml'))).toEqual({
      objectTypes: 0,
      properties: 0,
    });
  });

  test('35: a property that is only not creatable stays as it is said', () => {
    const [objectType] = view.objectTypesOf({
      objectTypes: [
        { name: 'T', properties: [{ nativeName: 'p', notCreatable: true }] },
      ],
    });
    expect(objectType.properties[0].flags).toEqual(['not creatable']);
  });

  test('36: the form has its sections with their fields, the defaults of provisioning, and no empty section', () => {
    expect(view.formSectionsOf(entryOf('3_4-azure-ad'))).toEqual([
      {
        section: 'applicationDetails',
        kind: 'fields',
        names: ['Name', 'Description'],
      },
      {
        section: 'provisioning',
        kind: 'defaults',
        names: ['performHardDelete'],
      },
    ]);
    // a field with no label is named by the property it sets
    expect(
      view.formSectionsOf({
        schema: { a: [[{ model: 'x.y' }, { type: 'string' }]] },
      })[0].names
    ).toEqual(['x.y']);
  });

  test('37: capabilities say what is allowed, in the order create, read, update, delete', () => {
    expect(view.capabilitiesOf(entryOf('3_4-azure-ad')).provisioning).toEqual([
      'create',
      'read',
      'update',
      'delete',
    ]);
    expect(view.capabilitiesOf(entryOf('3_4-azure-ad'))).toMatchObject({
      incrementalRecon: 'whenChanged (ge)',
      target: false,
      sso: [],
    });
    expect(view.capabilitiesOf(entryOf('1_3-saml'))).toMatchObject({
      sso: ['SAML'],
      ssoSetup: ['instructions', 'schema', 'defaults'],
      clients: ['iOS', 'Android', 'React'],
    });
    expect(view.capabilitiesOf(entryOf('1_0-ai-target'))).toMatchObject({
      target: true,
      requiresOauthFlow: true,
      provisioning: ['read'],
    });
    expect(
      view.provisioningOperationsOf({
        capabilities: { provisioning: { Delete: true, Archive: true } },
      })
    ).toEqual(['delete', 'archive']);
    expect(
      view.provisioningOperationsOf({
        capabilities: { provisioning: { Create: false } },
      })
    ).toEqual([]);
    expect(
      view.provisioningOperationsOf(entryOf('1_0-bookmark'))
    ).toBeUndefined();
  });

  test('38: an entry whose fields have the wrong types gives nothing and throws nothing', () => {
    const odd = entryOf('1_0-odd');
    expect(view.providesOf(odd)).toBe('Enterprise');
    expect(view.connectorSummaryOf(odd)).toBeUndefined();
    expect(view.objectTypesOf(odd)).toEqual([]);
    expect(view.formSectionsOf(odd)).toEqual([]);
    expect(view.capabilitiesOf(odd)).toEqual({
      provisioning: undefined,
      sso: [],
      ssoSetup: [],
      incrementalRecon: '',
      target: false,
      requiresOauthFlow: false,
      clients: [],
    });
    for (const nothing of [undefined, null, 5, 'text', [], {}]) {
      const entry = view.recordOf(nothing) ?? {};
      expect(() => {
        view.providesOf(entry);
        view.connectorSummaryOf(entry);
        view.objectTypesOf(entry);
        view.formSectionsOf(entry);
        view.capabilitiesOf(entry);
      }).not.toThrow();
    }
    // properties and object types of the wrong type are skipped, not fatal
    expect(
      view.objectTypesOf({
        objectTypes: [
          'x',
          null,
          { name: 'T', properties: ['p', { nativeName: 'q' }] },
        ],
      })[0].properties
    ).toHaveLength(1);
  });
});
