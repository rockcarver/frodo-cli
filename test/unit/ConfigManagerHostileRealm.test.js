import { beforeAll, describe, expect, it } from '@jest/globals';
import {
  isConfigManagerCommand,
  realmUseOf,
} from '../../src/utils/interactive/RealmUse.ts';
import { fullName, loadLeafCommands } from '../utils/CommandExamples.js';

/**
 * A realm is `/`, a name, or a path of names (`/parent/child`), never a path of the file system:
 * the realm becomes a folder of the config tree (`realms/<realm>/...`), so a realm of `../../alpha`
 * would read or write beside the working directory while the request still goes to the realm
 * `alpha` (the URL is normalised, the folder is not). Every command that declares `usesRealm()`
 * (the 34 that ConfigManagerRealmUse.test.js lists) refuses such a realm before it prompts or logs
 * in, with exit code 1, as an empty selector is refused (SelectorOption.test.js): the real commands
 * are parsed here with the real hooks, and the action, which would log in, is replaced by one that
 * only says it ran. The default of the argument (FRODO_REALM) is refused too: commander does not
 * parse a default, so it is checked on the value that the action would get.
 *
 * What the folders are for the realms that are valid, and the characters that are refused, is in
 * ConfigTreePath.test.js; the tenant that receives no request at all is in
 * ConfigManagerSelectorPathsFakeTenant.test.js.
 */

const HOST = 'https://matrix.example.com/am';

/** What a realm that is not refused is typed as: a name, a path from the root, a sub-realm, the root. */
const VALID = ['alpha', '/alpha', 'bravo', '/parent/child', '/'];

const HOSTILE = [
  '..',
  '/..',
  '../alpha',
  '../../alpha',
  'alpha/..',
  'alpha/../bravo',
  '.',
  './alpha',
  'a\\b',
  '..\\alpha',
  'C:\\x',
  'a?b',
  'a#b',
  'a%2e%2e',
  '%2e%2e',
  'a\u0000b',
  'a\tb',
  // the library removes every `C:` from a path after it is built, so `..C:` would be `..` in the folder
  '..C:',
  '.C:.',
  'a/..C:',
  '/..C:/alpha',
  'C:',
  'c:x',
  'a:b',
];

let gated = [];
/** The config-manager commands that take a realm argument and do not declare usesRealm(): they ignore it. */
let ignoring = [];

beforeAll(async () => {
  const leaves = await loadLeafCommands();
  gated = leaves.filter(
    (leaf) => isConfigManagerCommand(leaf) && realmUseOf(leaf) !== undefined
  );
  ignoring = leaves.filter(
    (leaf) =>
      isConfigManagerCommand(leaf) &&
      realmUseOf(leaf) === undefined &&
      leaf.registeredArguments.some((argument) => argument.name() === 'realm')
  );
});

/** Parses the arguments on the command as the real hooks see them, and answers what came of it. */
async function parse(leaf, args) {
  let acted = false;
  let written = '';
  leaf.exitOverride();
  leaf.configureOutput({
    writeOut: () => {},
    writeErr: (text) => {
      written += text;
    },
  });
  leaf.action(async () => {
    acted = true;
  });
  const error = await leaf.parseAsync(args, { from: 'user' }).then(
    () => undefined,
    (caught) => caught
  );
  return { acted, error, written };
}

describe('the commands that use their realm refuse a realm that is a path', () => {
  it('covers every command that declares usesRealm(): at least the 34 of ConfigManagerRealmUse.test.js', () => {
    expect(gated.length).toBeGreaterThanOrEqual(34);
  });

  it.each(HOSTILE)(
    'the realm %j is refused by every one of them, before the action: exit code 1, the realm is named',
    async (realm) => {
      for (const leaf of gated) {
        const { acted, error, written } = await parse(leaf, [HOST, realm]);

        expect([fullName(leaf), acted, error?.code, error?.exitCode]).toEqual([
          fullName(leaf),
          false,
          'commander.invalidArgument',
          1,
        ]);
        expect(error.message).toContain(
          `error: command-argument value '${realm}' is invalid for argument 'realm'.`
        );
        expect(written).toContain(error.message);
      }
    }
  );

  it.each(HOSTILE)(
    'the realm %j is refused when it is the default of the argument, which is what FRODO_REALM sets',
    async (realm) => {
      for (const leaf of gated) {
        const argument = leaf.registeredArguments.find(
          (candidate) => candidate.name() === 'realm'
        );
        const before = argument.defaultValue;
        argument.defaultValue = realm;
        try {
          const { acted, error } = await parse(leaf, [HOST]);

          expect([fullName(leaf), acted, error?.code, error?.exitCode]).toEqual(
            [fullName(leaf), false, 'commander.invalidArgument', 1]
          );
        } finally {
          argument.defaultValue = before;
        }
      }
    }
  );

  // a command may refuse for another reason (`pull all` needs a folder): that is not the realm
  const refusesTheRealm = (error) =>
    error?.code === 'commander.invalidArgument' &&
    error.message.includes("for argument 'realm'");

  it.each(VALID)(
    'the realm %j is not refused: the command goes on to its action',
    async (realm) => {
      let acting = 0;
      for (const leaf of gated) {
        const { acted, error } = await parse(leaf, [HOST, realm]);

        expect([fullName(leaf), refusesTheRealm(error)]).toEqual([
          fullName(leaf),
          false,
        ]);
        if (acted) acting++;
      }
      // most of the commands need nothing else, so they get as far as their action
      expect(acting).toBeGreaterThan(gated.length / 2);
    }
  );

  it('the default of the argument that is not set (the sentinel of the library) is not refused either', async () => {
    let acting = 0;
    for (const leaf of gated) {
      const { acted, error } = await parse(leaf, [HOST]);

      expect([fullName(leaf), refusesTheRealm(error)]).toEqual([
        fullName(leaf),
        false,
      ]);
      if (acted) acting++;
    }
    expect(acting).toBeGreaterThan(gated.length / 2);
  });

  it('the check reaches only the commands that declare usesRealm(): a command that ignores its realm argument is not refused', async () => {
    expect(ignoring.length).toBeGreaterThan(0);

    let acting = 0;
    for (const leaf of ignoring) {
      for (const realm of ['../../alpha', 'a\\b']) {
        const { acted, error } = await parse(leaf, [HOST, realm]);

        expect([fullName(leaf), realm, refusesTheRealm(error)]).toEqual([
          fullName(leaf),
          realm,
          false,
        ]);
        if (acted) acting++;
      }
    }
    expect(acting).toBeGreaterThan(0);
  });
});
