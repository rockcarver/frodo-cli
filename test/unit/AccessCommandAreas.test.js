import fs from 'fs';
import { frodo } from '@rockcarver/frodo-lib';
import {
  accessFootnote,
  COMMAND_AREAS,
  commandNeeds,
  INTERACTIVE_REACH,
  serviceAccountAreasOf,
} from '../../src/utils/AccessCommandAreas.ts';
import { ACCESS_MATRIX_DOC } from '../../src/utils/AccessProfileText.ts';
import {
  browserProfile,
  deviceProfile,
} from '../utils/AccessProfileFixtures.js';
import {
  fullName,
  leafCommands,
  loadCommandTree,
  renderFullHelp,
} from '../utils/CommandExamples.js';

// A browser or device login reaches less than a service account. The library
// lists the areas of its API and says what a session reaches; this checks the
// command line's own tables against it: which areas an interactive login
// reaches, and which area each command needs.

const pathOf = (command) => fullName(command).replace(/^frodo /, '');

let leaves;
beforeAll(async () => {
  const { groups } = await loadCommandTree();
  leaves = groups.flatMap((group) => leafCommands(group));
});

describe('which areas an interactive login reaches', () => {
  test('1: the table has an entry for every area of the library, and for no other', () => {
    expect(Object.keys(INTERACTIVE_REACH).sort()).toEqual(
      frodo.login
        .listAccessAreas()
        .map((area) => area.id)
        .sort()
    );
  });

  test('2: the table agrees with the library about a real browser session and a real device session', () => {
    const browser = Object.fromEntries(
      browserProfile().areas.map((area) => [area.id, area.reachable])
    );
    const device = Object.fromEntries(
      deviceProfile().areas.map((area) => [area.id, area.reachable])
    );
    const expected = {
      none: { browser: 'no', device: 'no' },
      browser: { browser: 'yes', device: 'no' },
      'browser-and-device': { browser: 'yes', device: 'yes' },
    };
    for (const [area, reach] of Object.entries(INTERACTIVE_REACH)) {
      expect({ area, browser: browser[area], device: device[area] }).toEqual({
        area,
        ...expected[reach],
      });
    }
  });
});

describe('which areas a command needs', () => {
  test('3: every command of the tree has an entry (a new command or group without one fails here)', () => {
    const unmapped = leaves
      .map(pathOf)
      .filter((path) => commandNeeds(path) === undefined);
    expect(unmapped).toEqual([]);
  });

  test('4: every entry names an area of the library and covers a command that exists', () => {
    const areaIds = frodo.login.listAccessAreas().map((area) => area.id);
    const paths = leaves.map(pathOf);
    for (const [prefix, needs] of Object.entries(COMMAND_AREAS)) {
      if (Array.isArray(needs)) {
        for (const area of needs)
          expect({ prefix, area, known: areaIds.includes(area) }).toEqual({
            prefix,
            area,
            known: true,
          });
      } else {
        expect(['general', 'local']).toContain(needs);
      }
      expect({
        prefix,
        covers: paths.some((p) => p === prefix || p.startsWith(`${prefix} `)),
      }).toEqual({ prefix, covers: true });
    }
  });

  test('5: the longest entry wins: a command of a general group can still need a service account', () => {
    expect(commandNeeds('config-manager pull journeys')).toBe('general');
    expect(commandNeeds('config-manager pull csp')).toEqual([
      'content-security-policy',
    ]);
    expect(
      commandNeeds('admin list-oauth2-clients-with-admin-privileges')
    ).toBe('general');
    expect(commandNeeds('admin federation list')).toEqual(['admin-federation']);
    expect(commandNeeds('no-such-group list')).toBeUndefined();
  });

  test('6: the commands that always need an area no interactive login reaches', () => {
    const accountCommands = leaves
      .map(pathOf)
      .filter((path) => serviceAccountAreasOf(path).length > 0)
      .sort();
    expect(accountCommands).toEqual(
      [
        'admin federation export',
        'admin federation import',
        'admin federation list',
        'config-manager delete telemetry',
        'config-manager promote check-locked-status',
        'config-manager promote check-promotion-reports',
        'config-manager promote check-promotion-status',
        'config-manager promote lock-tenants',
        'config-manager promote rollback',
        'config-manager promote run-dryrun-promotion',
        'config-manager promote run-promotion',
        'config-manager promote unlock-tenants',
        'config-manager pull cookie-domains',
        'config-manager pull csp',
        'config-manager pull iga-workflows',
        'config-manager pull telemetry',
        'config-manager push cookie-domains',
        'config-manager push csp',
        'config-manager push direct-control-abort',
        'config-manager push direct-control-apply',
        'config-manager push direct-control-init',
        'config-manager push direct-control-state',
        'config-manager push iga-workflows',
        'config-manager push telemetry',
        'dcc session abort',
        'dcc session apply',
        'dcc session init',
        'dcc session state',
        'iga workflow delete',
        'iga workflow describe',
        'iga workflow export',
        'iga workflow import',
        'iga workflow list',
        'iga workflow publish',
        'promote',
      ].sort()
    );
  });
});

describe('the note in the help of such a command', () => {
  test('7: it says what is not available, and names the area and the document', () => {
    const note = accessFootnote('iga workflow list');
    expect(note).toBe(
      `Not available with --browser or --device: needs a service account (Governance). See ${ACCESS_MATRIX_DOC}`
    );
    expect(accessFootnote('dcc session init')).toContain(
      '(Direct configuration session)'
    );
  });

  test('8: a command that an interactive login can run has no note', () => {
    expect(accessFootnote('journey list')).toBeUndefined();
    expect(accessFootnote('conn describe')).toBeUndefined();
    expect(accessFootnote('config export')).toBeUndefined();
  });

  test('9: the help of a service-account command ends with the note, at the first help level; the help of another does not', () => {
    const byPath = new Map(leaves.map((command) => [pathOf(command), command]));
    const withNote = renderFullHelp(byPath.get('iga workflow list'));
    expect(withNote).toContain(accessFootnote('iga workflow list'));
    expect(
      withNote.trimEnd().endsWith(accessFootnote('iga workflow list'))
    ).toBe(true);
    const without = renderFullHelp(byPath.get('journey list'));
    expect(without).not.toContain('Not available with --browser or --device');
  });
});

describe('the capability matrix in the documentation', () => {
  const doc = fs.readFileSync(
    new URL('../../docs/BROWSER_LOGIN.md', import.meta.url),
    'utf8'
  );

  test('10: the heading that the links point to exists', () => {
    expect(doc).toMatch(/^## What a browser or device login can do$/m);
    expect(
      ACCESS_MATRIX_DOC.endsWith('#what-a-browser-or-device-login-can-do')
    ).toBe(true);
  });

  test('11: the matrix has a row for every area of the library, with the table of this module', () => {
    const rows = Object.fromEntries(
      [
        ...doc.matchAll(/^\| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm),
      ].map((m) => [m[1].trim(), { browser: m[2].trim(), device: m[3].trim() }])
    );
    for (const area of frodo.login.listAccessAreas()) {
      const row = rows[area.title];
      expect({ title: area.title, row: !!row }).toEqual({
        title: area.title,
        row: true,
      });
      const reach = INTERACTIVE_REACH[area.id];
      expect({
        title: area.title,
        browser: row.browser.startsWith('yes'),
        device: row.device.startsWith('yes'),
      }).toEqual({
        title: area.title,
        browser: reach !== 'none',
        device: reach === 'browser-and-device',
      });
    }
  });
});
