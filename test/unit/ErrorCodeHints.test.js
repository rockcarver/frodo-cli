import { FrodoError } from '@rockcarver/frodo-lib';
import {
  LOGIN_ERROR_HINTS,
  loginErrorCodeOf,
  loginHintFor,
} from '../../src/utils/LoginErrorHints.ts';
import {
  fullName,
  loadCommandTree,
  renderFullHelp,
} from '../utils/CommandExamples.js';

// frodo-lib states what is wrong and tags the error with a stable code; the
// advice (options, commands, environment variables) is ours.

// eslint-disable-next-line no-control-regex -- strips colour codes from rendered help
const ANSI = /\x1b\[[0-9;]*m/g;

/** Every command of the tree, groups included, by its full name. */
function allCommands(groups) {
  const byName = new Map();
  const visit = (command) => {
    byName.set(fullName(command), command);
    command.commands.forEach(visit);
  };
  groups.forEach(visit);
  return byName;
}

describe('the hints for the login errors of frodo-lib', () => {
  test('1: there is a hint for every code of the library, and for no other', () => {
    expect(Object.keys(LOGIN_ERROR_HINTS).sort()).toEqual(
      [...FrodoError.codes].sort()
    );
  });

  test('2: a hint is one line of advice', () => {
    for (const [code, hint] of Object.entries(LOGIN_ERROR_HINTS)) {
      expect({ code, hint }).toEqual({
        code,
        hint: expect.stringMatching(/^[^\n]+$/),
      });
      expect(hint.length).toBeGreaterThan(20);
    }
  });

  test('3: every option, command and environment variable a hint names exists in this command line', async () => {
    const { groups } = await loadCommandTree();
    const commands = allCommands(groups);
    const options = new Set(
      [...commands.values()].flatMap((command) =>
        command.options.map((option) => option.long)
      )
    );
    const journeyList = commands.get('frodo journey list');
    expect(journeyList).toBeDefined();
    // the environment variables are listed from help level 2 on
    const savedArgv = process.argv;
    process.argv = [...savedArgv, '--help-all'];
    let help;
    try {
      help = renderFullHelp(journeyList).replace(ANSI, '');
    } finally {
      process.argv = savedArgv;
    }

    const named = { options: [], commands: [], variables: [] };
    for (const hint of Object.values(LOGIN_ERROR_HINTS)) {
      named.options.push(...(hint.match(/--[a-z][a-z-]*/g) ?? []));
      named.variables.push(...(hint.match(/\bFRODO_[A-Z_]+\b/g) ?? []));
      for (const [, quoted] of hint.matchAll(/'(frodo [^']+)'/g)) {
        // the words before the first option are the command
        named.commands.push(quoted.split(/\s+-/)[0]);
        named.options.push(...(quoted.match(/--[a-z][a-z-]*/g) ?? []));
      }
    }

    // the checks must have something to check
    expect(named.options).toEqual(
      expect.arrayContaining(['--type', '--login-client-id', '--browser'])
    );
    expect(named.commands).toEqual(
      expect.arrayContaining(['frodo login', 'frodo login setup'])
    );
    expect(named.variables).toEqual(
      expect.arrayContaining(['FRODO_PASSWORD', 'FRODO_LOGIN_CLIENT_ID'])
    );

    expect([...new Set(named.options)].filter((o) => !options.has(o))).toEqual(
      []
    );
    expect(
      [...new Set(named.commands)].filter((c) => !commands.has(c))
    ).toEqual([]);
    expect(
      [...new Set(named.variables)].filter((v) => !help.includes(v))
    ).toEqual([]);
  });

  test('4: no hint names an option that is not one (a user and a password are arguments)', () => {
    expect(LOGIN_ERROR_HINTS.LOGIN_NO_STORED_PASSWORD).not.toMatch(
      /--(user|username|password)\b/
    );
  });

  test('5: the document a hint points to exists in this repository', async () => {
    const fs = await import('fs');
    const urls = Object.values(LOGIN_ERROR_HINTS).flatMap(
      (hint) => hint.match(/https:\/\/\S+/g) ?? []
    );
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      const file = url.replace(
        'https://github.com/rockcarver/frodo-cli/blob/main/',
        ''
      );
      expect(fs.existsSync(new URL(`../../${file}`, import.meta.url))).toBe(
        true
      );
    }
  });
});

describe('loginErrorCodeOf', () => {
  const coded = (code, message = 'the facts') =>
    new FrodoError(message, null, code);

  test('6: reads the code of the error itself', () => {
    expect(loginErrorCodeOf(coded('BROWSER_LOGIN_NO_SESSION'))).toBe(
      'BROWSER_LOGIN_NO_SESSION'
    );
  });

  test('7: reads the code through the wrapper that frodo-lib puts around a login failure', () => {
    const wrapped = new FrodoError(
      'Error getting tokens',
      coded('LOGIN_NO_STORED_PASSWORD')
    );
    expect(wrapped.code).toBeUndefined();
    expect(loginErrorCodeOf(wrapped)).toBe('LOGIN_NO_STORED_PASSWORD');
  });

  test('8: reads the code through several wrappers, and the first coded error wins', () => {
    const deep = new FrodoError(
      'outer',
      new FrodoError(
        'middle',
        new FrodoError('inner', coded('BROWSER_LOGIN_NO_SESSION'))
      )
    );
    expect(loginErrorCodeOf(deep)).toBe('BROWSER_LOGIN_NO_SESSION');

    const two = new FrodoError('outer', [
      new Error('no code'),
      coded('BROWSER_LOGIN_DEPLOYMENT_TYPE_UNKNOWN'),
      coded('BROWSER_LOGIN_NO_SESSION'),
    ]);
    expect(loginErrorCodeOf(two)).toBe('BROWSER_LOGIN_DEPLOYMENT_TYPE_UNKNOWN');
  });

  test('9: an error without a code has none, so a library that words the advice itself gets no second hint', () => {
    expect(
      loginErrorCodeOf(
        new FrodoError(
          'Error getting tokens',
          new FrodoError(
            'Browser login on classic requires an OAuth2 client id. Pass --login-client-id (or set FRODO_LOGIN_CLIENT_ID), ...'
          )
        )
      )
    ).toBeUndefined();
    expect(loginHintFor(new Error('plain'))).toBeUndefined();
  });

  test('10: the code of a transport error is not a login code', () => {
    // what axios raises, without the dependency: a name and a code of its own
    const transport = Object.assign(new Error('connect failed'), {
      name: 'AxiosError',
      code: 'ECONNREFUSED',
    });
    expect(loginErrorCodeOf(transport)).toBeUndefined();
    expect(
      loginErrorCodeOf(new FrodoError('Error getting tokens', transport))
    ).toBeUndefined();
  });

  test('11: only a FrodoError is asked, and only for a code that has a hint', () => {
    const lookalike = Object.assign(new Error('x'), {
      code: 'BROWSER_LOGIN_NO_SESSION',
    });
    expect(loginErrorCodeOf(lookalike)).toBeUndefined();
    const unknown = Object.assign(new FrodoError('x'), {
      code: 'SOMETHING_THE_LIBRARY_ADDS_LATER',
    });
    expect(loginErrorCodeOf(unknown)).toBeUndefined();
    expect(
      loginErrorCodeOf(Object.assign(new FrodoError('x'), { code: 7 }))
    ).toBeUndefined();
  });

  test('12: anything that is not an error has no code, and a loop ends', () => {
    for (const value of [undefined, null, 'text', 42, {}, []]) {
      expect(loginErrorCodeOf(value)).toBeUndefined();
    }
    const loop = new FrodoError('loop');
    loop.originalErrors = [loop];
    expect(loginErrorCodeOf(loop)).toBeUndefined();
  });

  test('13: the hint is the line of the table', () => {
    const error = new FrodoError(
      'Error getting tokens',
      coded('BROWSER_LOGIN_NO_SESSION')
    );
    expect(loginHintFor(error)).toBe(
      LOGIN_ERROR_HINTS.BROWSER_LOGIN_NO_SESSION
    );
    expect(loginHintFor(error)).toBe("Run 'frodo login --browser' first.");
  });
});
