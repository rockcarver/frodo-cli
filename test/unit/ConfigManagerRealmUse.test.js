import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from '@jest/globals';
import { FrodoCommand } from '../../src/cli/FrodoCommand.ts';
import {
  ignoresRealm,
  isConfigManagerCommand,
  realmUseOf,
} from '../../src/utils/interactive/RealmUse.ts';
import { fullName, loadLeafCommands } from '../utils/CommandExamples.js';

/**
 * Every config-manager command is one of two kinds, and must say which:
 *
 * - it USES its realm positional: no realm means every realm, the post-auth
 *   realm picker offers `All realms` first, and the command reads a realm
 *   that was picked after login with realmOfRun (the picker runs inside
 *   getTokens(), after the action bound its `realm` parameter);
 * - it IGNORES the realm (cors, secrets, promote, ...): the picker would offer
 *   a choice that changes nothing, so it does not open.
 *
 * `.usesRealm()` is the declaration. The expected set below is the list of
 * commands that declare it. The test also reads the source of each command: a
 * command that hands its `realm` parameter to anything after login but does
 * not declare `.usesRealm()` would have a picker that does nothing, and one
 * that declares it but passes the stale `realm` parameter would ignore a
 * pick. A new config-manager command therefore has to choose.
 */
const USES_REALM = [
  'frodo config-manager delete applications',
  'frodo config-manager delete cimd-profiles',
  'frodo config-manager delete scripts',
  'frodo config-manager delete themes',
  'frodo config-manager migrate applications',
  'frodo config-manager pull all',
  'frodo config-manager pull all-static',
  'frodo config-manager pull applications',
  'frodo config-manager pull authentication',
  'frodo config-manager pull cimd-profiles',
  'frodo config-manager pull journeys',
  'frodo config-manager pull org-privileges',
  'frodo config-manager pull password-policy',
  'frodo config-manager pull scripts',
  'frodo config-manager pull secret-mappings',
  'frodo config-manager pull services',
  'frodo config-manager pull themes',
  'frodo config-manager pull trusted-jwt-issuers',
  'frodo config-manager push applications',
  'frodo config-manager push authentication',
  'frodo config-manager push cimd-profiles',
  'frodo config-manager push journeys',
  'frodo config-manager push password-policy',
  'frodo config-manager push saml',
  'frodo config-manager push scripts',
  'frodo config-manager push secret-mappings',
  'frodo config-manager push services',
  'frodo config-manager push themes',
];

/** The commands that also cover configuration of the tenant, which no realm limits. */
const ALSO_TENANT_WIDE = [
  'frodo config-manager pull all',
  'frodo config-manager pull all-static',
];

const HOW_TO_FIX =
  'A config-manager command whose action hands its `realm` parameter to anything after login ' +
  'declares `.usesRealm()` and passes `realmOfRun(command, realm)` instead of `realm` ' +
  '(src/utils/interactive/PositionalArgs.ts; add `{ tenantWide: true }` if it also covers ' +
  'configuration that no realm limits). One that does not use its realm declares nothing ' +
  'and gets no realm picker. Then add or remove its name in USES_REALM in ' +
  'test/unit/ConfigManagerRealmUse.test.js.';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

/** The source file of a leaf: `frodo config-manager pull all-static` -> config-manager-pull-all-static.ts */
function sourceOf(name) {
  const [, , group, ...rest] = name.split(' ');
  // `test` under pull, push and delete is `conn test`, mounted three times
  if (rest.join('-') === 'test')
    return path.join(root, 'src/cli/conn/conn-test.ts');
  return path.join(
    root,
    'src/cli/config-manager',
    `config-manager-${group}`,
    `config-manager-${group}-${rest.join('-')}.ts`
  );
}

/** The code of the action after the arguments were handled, without comments and string literals. */
function codeAfterArguments(source) {
  const handled = source.indexOf('command.handleDefaultArgsAndOpts(');
  const end = source.indexOf(');', handled) + 2;
  return source
    .slice(end)
    .replace(/\/\/[^\n]*/g, '')
    .replace(/`(?:\\.|[^`\\])*`/gs, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

/** Whether the action hands its `realm` parameter on after login: a bare `realm` that is not a property. */
const usesRealmParameter = (code) => /(?<![.\w])realm(?!\w)/.test(code);

let leaves = [];
let configManager = [];

beforeAll(async () => {
  leaves = await loadLeafCommands();
  configManager = leaves.filter((leaf) => isConfigManagerCommand(leaf));
});

describe('config-manager commands and their realm', () => {
  it('finds the config-manager commands of the command tree', () => {
    const names = configManager.map(fullName);
    expect(names.length).toBeGreaterThan(90);
    expect(names).toContain('frodo config-manager pull journeys');
    expect(names).toContain('frodo config-manager pull cors');
    expect(names).toContain('frodo config-manager promote run-promotion');
    expect(
      names.every((name) => name.startsWith('frodo config-manager '))
    ).toBe(true);
  });

  it('knows no command outside config-manager as one', () => {
    const others = leaves.filter((leaf) => !isConfigManagerCommand(leaf));
    expect(others.length).toBeGreaterThan(100);
    expect(others.map(fullName)).toContain('frodo journey list');
    expect(others.some((leaf) => realmUseOf(leaf))).toBe(false);
    expect(others.some((leaf) => ignoresRealm(leaf))).toBe(false);
  });

  it('declares .usesRealm() on exactly the commands that use their realm', () => {
    const declared = configManager
      .filter((leaf) => realmUseOf(leaf))
      .map(fullName)
      .sort();
    expect(declared).toEqual([...USES_REALM].sort());
  });

  it('declares that pull all and pull all-static also cover the tenant, and no other command', () => {
    const tenantWide = configManager
      .filter((leaf) => realmUseOf(leaf)?.tenantWide)
      .map(fullName)
      .sort();
    expect(tenantWide).toEqual([...ALSO_TENANT_WIDE].sort());
  });

  it('declares with a chainable method of the command', () => {
    // a command of its own: the declarations of the tree are checked below
    const command = new FrodoCommand('frodo config-manager pull sample');
    expect(realmUseOf(command)).toBeUndefined();
    expect(command.usesRealm()).toBe(command);
    expect(realmUseOf(command)).toEqual({ tenantWide: false });
    expect(command.usesRealm({ tenantWide: true })).toBe(command);
    expect(realmUseOf(command)).toEqual({ tenantWide: true });
  });

  it('has the source of every command', () => {
    const missing = configManager
      .map(fullName)
      .filter((name) => !fs.existsSync(sourceOf(name)));
    expect(missing).toEqual([]);
  });

  it('declares .usesRealm() on a command if and only if its action hands its realm on after login', () => {
    const wrong = configManager
      .map((leaf) => {
        const name = fullName(leaf);
        const uses = usesRealmParameter(
          codeAfterArguments(fs.readFileSync(sourceOf(name), 'utf8'))
        );
        const declares = !!realmUseOf(leaf);
        if (uses && !declares)
          return `${name}: uses its realm, does not declare it`;
        if (declares && !uses)
          return `${name}: declares it, never uses its realm`;
        return undefined;
      })
      .filter(Boolean);
    if (wrong.length > 0) {
      throw new Error(`${wrong.join('\n')}\n\n${HOW_TO_FIX}`);
    }
  });

  it('reads the realm of a command that declares it with realmOfRun', () => {
    const stale = USES_REALM.filter(
      (name) => !fs.readFileSync(sourceOf(name), 'utf8').includes('realmOfRun(')
    );
    if (stale.length > 0) {
      throw new Error(
        `These commands declare .usesRealm() and do not read the realm after login:\n${stale.join('\n')}\n\n${HOW_TO_FIX}`
      );
    }
  });

  it('gives the realm picker to the commands that use their realm and to no other config-manager command', () => {
    for (const leaf of configManager) {
      const name = fullName(leaf);
      expect(ignoresRealm(leaf)).toBe(!USES_REALM.includes(name));
    }
  });
});
