import { FrodoError } from '@rockcarver/frodo-lib';
import { Command } from 'commander';
import {
  ERROR_CODE_HINTS,
  errorCodeOf,
  errorHintFor,
} from '../../src/utils/ErrorCodeHints.ts';
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
    expect(Object.keys(ERROR_CODE_HINTS).sort()).toEqual(
      [...FrodoError.codes].sort()
    );
  });

  test('2: a hint is one line of advice', () => {
    for (const [code, hint] of Object.entries(ERROR_CODE_HINTS)) {
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
    // the environment variables a command lists depend on the command: the
    // connection ones on any command with a host, the log ones on `frodo log`
    const journeyList = commands.get('frodo journey list');
    const logCommand = [...commands.values()].find(
      (command) =>
        fullName(command).startsWith('frodo log ') &&
        command.commands.length === 0
    );
    expect(journeyList).toBeDefined();
    expect(logCommand).toBeDefined();
    // the tree of the helpers has no root program, and which environment
    // variables a command lists depends on its path from the root (`frodo log
    // list`), so give the group the root that the real program has
    const topOf = (command) =>
      command.parent ? topOf(command.parent) : command;
    for (const command of [journeyList, logCommand]) {
      const top = topOf(command);
      if (top.name() !== 'frodo') new Command('frodo').addCommand(top);
    }
    // the environment variables are listed from help level 2 on
    const savedArgv = process.argv;
    process.argv = [...savedArgv, '--help-all'];
    let help;
    try {
      help = [journeyList, logCommand]
        .map((command) => renderFullHelp(command).replace(ANSI, ''))
        .join('\n');
    } finally {
      process.argv = savedArgv;
    }

    const named = { options: [], commands: [], variables: [] };
    for (const hint of Object.values(ERROR_CODE_HINTS)) {
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
    expect(ERROR_CODE_HINTS.LOGIN_NO_STORED_PASSWORD).not.toMatch(
      /--(user|username|password)\b/
    );
  });

  test('5: the document a hint points to exists in this repository', async () => {
    const fs = await import('fs');
    const urls = Object.values(ERROR_CODE_HINTS).flatMap(
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

describe('errorCodeOf', () => {
  const coded = (code, message = 'the facts') =>
    new FrodoError(message, null, code);

  test('6: reads the code of the error itself', () => {
    expect(errorCodeOf(coded('BROWSER_LOGIN_NO_SESSION'))).toBe(
      'BROWSER_LOGIN_NO_SESSION'
    );
  });

  test('7: reads the code through the wrapper that frodo-lib puts around a login failure', () => {
    const wrapped = new FrodoError(
      'Error getting tokens',
      coded('LOGIN_NO_STORED_PASSWORD')
    );
    expect(wrapped.code).toBeUndefined();
    expect(errorCodeOf(wrapped)).toBe('LOGIN_NO_STORED_PASSWORD');
  });

  test('8: reads the code through several wrappers, and the first coded error wins', () => {
    const deep = new FrodoError(
      'outer',
      new FrodoError(
        'middle',
        new FrodoError('inner', coded('BROWSER_LOGIN_NO_SESSION'))
      )
    );
    expect(errorCodeOf(deep)).toBe('BROWSER_LOGIN_NO_SESSION');

    const two = new FrodoError('outer', [
      new Error('no code'),
      coded('BROWSER_LOGIN_DEPLOYMENT_TYPE_UNKNOWN'),
      coded('BROWSER_LOGIN_NO_SESSION'),
    ]);
    expect(errorCodeOf(two)).toBe('BROWSER_LOGIN_DEPLOYMENT_TYPE_UNKNOWN');
  });

  test('9: an error without a code has none, so a library that words the advice itself gets no second hint', () => {
    expect(
      errorCodeOf(
        new FrodoError(
          'Error getting tokens',
          new FrodoError(
            'Browser login on classic requires an OAuth2 client id. Pass --login-client-id (or set FRODO_LOGIN_CLIENT_ID), ...'
          )
        )
      )
    ).toBeUndefined();
    expect(errorHintFor(new Error('plain'))).toBeUndefined();
  });

  test('10: the code of a transport error is not a login code', () => {
    // what axios raises, without the dependency: a name and a code of its own
    const transport = Object.assign(new Error('connect failed'), {
      name: 'AxiosError',
      code: 'ECONNREFUSED',
    });
    expect(errorCodeOf(transport)).toBeUndefined();
    expect(
      errorCodeOf(new FrodoError('Error getting tokens', transport))
    ).toBeUndefined();
  });

  test('11: only a FrodoError is asked, and only for a code that has a hint', () => {
    const lookalike = Object.assign(new Error('x'), {
      code: 'BROWSER_LOGIN_NO_SESSION',
    });
    expect(errorCodeOf(lookalike)).toBeUndefined();
    const unknown = Object.assign(new FrodoError('x'), {
      code: 'SOMETHING_THE_LIBRARY_ADDS_LATER',
    });
    expect(errorCodeOf(unknown)).toBeUndefined();
    expect(
      errorCodeOf(Object.assign(new FrodoError('x'), { code: 7 }))
    ).toBeUndefined();
  });

  test('12: anything that is not an error has no code, and a loop ends', () => {
    for (const value of [undefined, null, 'text', 42, {}, []]) {
      expect(errorCodeOf(value)).toBeUndefined();
    }
    const loop = new FrodoError('loop');
    loop.originalErrors = [loop];
    expect(errorCodeOf(loop)).toBeUndefined();
  });

  test('13b: an MCP tool error with a code of its own gets its own hint', () => {
    const error = new FrodoError(
      'MCP runtime error: requires a Log API key/secret',
      null,
      'LOG_API_CREDENTIAL_MISSING'
    );
    expect(errorCodeOf(error)).toBe('LOG_API_CREDENTIAL_MISSING');
    expect(errorHintFor(error)).toContain('FRODO_LOG_KEY');
    expect(errorHintFor(error)).toContain('--log-api-key');
  });

  test('13: the hint is the line of the table', () => {
    const error = new FrodoError(
      'Error getting tokens',
      coded('BROWSER_LOGIN_NO_SESSION')
    );
    expect(errorHintFor(error)).toBe(ERROR_CODE_HINTS.BROWSER_LOGIN_NO_SESSION);
    expect(errorHintFor(error)).toBe("Run 'frodo login --browser' first.");
  });
});

// A request that failed because of its proxy (frodo-lib#986): the library says
// which proxy and what it did, with a code on the error of the request; the
// FrodoError that wraps that error has the code, and the advice is ours.
describe('the hints for a request that failed because of its proxy', () => {
  const PROXY_CODES = [
    'PROXY_AUTHENTICATION_REQUIRED',
    'PROXY_TUNNEL_REFUSED',
    'PROXY_CONNECTION_REFUSED',
    'PROXY_CONNECTION_CLOSED',
    'PROXY_UNREACHABLE',
  ];

  /** What frodo-lib raises for a request that a proxy failed: the error of the request carries `proxyFailure`. */
  const requestFailedAtProxy = (code, extra = {}) =>
    Object.assign(new Error('Request failed with status code 403'), {
      name: 'AxiosError',
      code: 'ERR_BAD_REQUEST',
      proxyFailure: {
        code,
        proxy: { protocol: 'http', host: 'proxy.example', port: 3128 },
        target: 'https',
        message:
          'The proxy proxy.example:3128 refused the CONNECT request for an HTTPS target with status 403 (Forbidden).',
        ...extra,
      },
    });

  test('14: the library has a code for each kind of proxy failure, and each has a hint', () => {
    expect(FrodoError.codes).toEqual(expect.arrayContaining(PROXY_CODES));
    for (const code of PROXY_CODES) {
      expect(ERROR_CODE_HINTS).toHaveProperty(code);
    }
  });

  test('15: an error of an ops function that wraps the failed request gets the hint of its code', () => {
    for (const code of PROXY_CODES) {
      const wrapped = new FrodoError(
        'Error getting tokens',
        requestFailedAtProxy(code)
      );
      expect(errorCodeOf(wrapped)).toBe(code);
      expect(errorHintFor(wrapped)).toBe(ERROR_CODE_HINTS[code]);
    }
  });

  test('16: the hint is found through the wrappers of a login, too', () => {
    const deep = new FrodoError(
      'Error getting tokens',
      new FrodoError(
        'Error getting server info',
        requestFailedAtProxy('PROXY_CONNECTION_REFUSED')
      )
    );
    expect(errorHintFor(deep)).toBe(ERROR_CODE_HINTS.PROXY_CONNECTION_REFUSED);
  });

  test('17: each kind of failure has its own advice', () => {
    const hints = PROXY_CODES.map((code) => ERROR_CODE_HINTS[code]);
    expect(new Set(hints).size).toBe(PROXY_CODES.length);
  });

  test('18: a hint is advice of at most two short sentences that names the variables of the proxy support', () => {
    for (const code of PROXY_CODES) {
      const hint = ERROR_CODE_HINTS[code];
      // sentences end in a full stop that is followed by a space or the end
      const sentences = hint.split(/\.(?:\s|$)/).filter(Boolean);
      expect({ code, sentences: sentences.length <= 2 }).toEqual({
        code,
        sentences: true,
      });
      expect(hint.length).toBeLessThan(260);
      expect(hint).toMatch(/\b(HTTPS_PROXY|HTTP_PROXY|NO_PROXY)\b/);
    }
    // the proxy is the one the person configured: the three variables are the ones to look at
    const all = PROXY_CODES.map((code) => ERROR_CODE_HINTS[code]).join(' ');
    for (const name of ['HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY']) {
      expect(all).toContain(name);
    }
  });

  test('19: a hint never prints a credential: no user and password but the placeholders of the form', () => {
    for (const code of PROXY_CODES) {
      const hint = ERROR_CODE_HINTS[code];
      for (const [, userInfo] of hint.matchAll(/:\/\/([^@\s]+)@/g)) {
        expect(userInfo).toBe('user:password');
      }
      expect(hint).not.toMatch(/[?&](token|key|password)=/i);
    }
  });

  test('20: the advice is for a proxy failure only: the same transport errors without the fact get none', () => {
    // a tenant that is down, or refuses the credentials itself, with no proxy involved
    for (const [code, status] of [
      ['ECONNREFUSED', undefined],
      ['ERR_BAD_REQUEST', 407],
      ['ERR_BAD_REQUEST', 403],
      ['ECONNRESET', undefined],
    ]) {
      const transport = Object.assign(new Error('failed'), {
        name: 'AxiosError',
        code,
        ...(status && { response: { status } }),
      });
      const wrapped = new FrodoError('Error getting tokens', transport);
      expect(errorCodeOf(wrapped)).toBeUndefined();
      expect(errorHintFor(wrapped)).toBeUndefined();
    }
  });

  test('21: a code of another condition gets its own hint, not a proxy one', () => {
    const error = new FrodoError(
      'Error getting tokens',
      requestFailedAtProxy('PROXY_TUNNEL_REFUSED'),
      'BROWSER_LOGIN_NO_SESSION'
    );
    expect(errorHintFor(error)).toBe(ERROR_CODE_HINTS.BROWSER_LOGIN_NO_SESSION);
  });

  test('22: each code is given the advice for its kind of failure', () => {
    expect(ERROR_CODE_HINTS.PROXY_AUTHENTICATION_REQUIRED).toContain(
      'user name and password'
    );
    expect(ERROR_CODE_HINTS.PROXY_TUNNEL_REFUSED).toContain(
      "allows connections to the tenant's host and port"
    );
    expect(ERROR_CODE_HINTS.PROXY_CONNECTION_REFUSED).toContain(
      'address and port of the proxy'
    );
    expect(ERROR_CODE_HINTS.PROXY_CONNECTION_CLOSED).toContain(
      'with the scheme it speaks'
    );
    expect(ERROR_CODE_HINTS.PROXY_UNREACHABLE).toContain(
      'host name of the proxy'
    );
    // a tenant that can be reached without the proxy is the way out of a refusal
    for (const code of [
      'PROXY_AUTHENTICATION_REQUIRED',
      'PROXY_TUNNEL_REFUSED',
    ]) {
      expect(ERROR_CODE_HINTS[code]).toContain('NO_PROXY');
    }
  });
});
