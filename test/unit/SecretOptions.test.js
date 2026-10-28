import { describe, expect, it } from '@jest/globals';
import { Command, Option } from 'commander';
import {
  assertNoPendingSecrets,
  collectSecretsByPrompt,
  collectSecretsFromStdin,
  failFirstPendingSecret,
} from '../../src/utils/interactive/SecretCollector.ts';
import {
  isSecretOption,
  markSecret,
  pendingSecretOptions,
  secretNeedsValueMessage,
  stripTrailingNewline,
} from '../../src/utils/interactive/SecretOptions.ts';

/**
 * Secret options (a password, a client secret) may be given without a value:
 * frodo then asks for it with the input hidden, or reads it from stdin when
 * input is piped. The marker and the collection rules are tested here without
 * a terminal and without frodo-lib; the class commands declare is
 * `SecretOption` in FrodoCommand.ts (see SecretOptionDeclarations.test.js).
 */

/** A command with two secrets, a plain optional-value option and a plain flag. */
function build() {
  const command = new Command('control').exitOverride();
  command.configureOutput({ writeErr: () => {}, outputError: () => {} });
  const password = markSecret(new Option('--password [password]'));
  const secret = markSecret(new Option('--log-api-secret [secret]'));
  command.addOption(password);
  command.addOption(new Option('--alias [name]'));
  command.addOption(secret);
  command.addOption(new Option('-x, --extra'));
  return command;
}

/** Runs the parser, so the value is what a user's command line produces. */
function parsed(argv) {
  const command = build();
  command.action(() => {});
  command.parse(argv, { from: 'user' });
  return command;
}

const failure = (fn) => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('the marker', () => {
  it('is on a marked option and survives the copy FrodoCommand makes of shared options', () => {
    const option = markSecret(new Option('--password [password]'));
    expect(isSecretOption(option)).toBe(true);
    expect(isSecretOption(new Option('--alias [name]'))).toBe(false);
    const cloned = Object.assign(new Option(option.flags, option.description), {
      ...option,
    });
    expect(isSecretOption(cloned)).toBe(true);
  });

  it('reads a bare flag as pending, and a given value as a string', () => {
    expect(parsed(['--password']).getOptionValue('password')).toBe(true);
    expect(parsed(['--password', 'x']).getOptionValue('password')).toBe('x');
  });

  it('keeps a value that was given with the flag', () => {
    const command = parsed(['--password', 'hunter2']);
    expect(command.getOptionValue('password')).toBe('hunter2');
    expect(pendingSecretOptions(command)).toEqual([]);
  });

  it('takes a following operand as the value, which is why the help says the host comes first', () => {
    const command = parsed(['--password', 'nightly']);
    expect(command.getOptionValue('password')).toBe('nightly');
  });

  it('does not take a following option as the value', () => {
    const command = parsed(['--password', '--log-api-secret']);
    expect(command.getOptionValue('password')).toBe(true);
    expect(command.getOptionValue('logApiSecret')).toBe(true);
  });
});

describe('pendingSecretOptions', () => {
  it('lists the bare secrets in declaration order, whatever the command line order', () => {
    const command = parsed(['--log-api-secret', '--password']);
    expect(pendingSecretOptions(command).map((o) => o.attributeName())).toEqual(
      ['password', 'logApiSecret']
    );
  });

  it('ignores a plain optional-value option used bare', () => {
    const command = parsed(['--alias']);
    expect(pendingSecretOptions(command)).toEqual([]);
  });

  it('adds a mandatory secret that was left out, from the deferred violations', () => {
    const command = parsed([]);
    const flags = '--log-api-secret [secret]';
    expect(pendingSecretOptions(command)).toEqual([]);
    expect(pendingSecretOptions(command, [flags]).map((o) => o.flags)).toEqual([
      flags,
    ]);
  });
});

describe('collecting by prompt', () => {
  it('asks for each pending secret in order, and writes what was typed', async () => {
    const command = parsed(['--log-api-secret', '--password']);
    const asked = [];
    const done = await collectSecretsByPrompt(command, [], async (message) => {
      asked.push(message);
      return asked.length === 1 ? 'pw' : 'sec';
    });
    expect(done).toBe(true);
    expect(asked).toEqual([
      'Enter a value for --password [password] (input is hidden):',
      'Enter a value for --log-api-secret [secret] (input is hidden):',
    ]);
    expect(command.getOptionValue('password')).toBe('pw');
    expect(command.getOptionValue('logApiSecret')).toBe('sec');
  });

  it('stops at the first declined prompt and asks nothing more', async () => {
    const command = parsed(['--password', '--log-api-secret']);
    let calls = 0;
    const done = await collectSecretsByPrompt(command, [], async () => {
      calls += 1;
      return '';
    });
    expect(done).toBe(false);
    expect(calls).toBe(1);
    expect(command.getOptionValue('password')).toBe(true);
  });

  it('asks for nothing when no secret is pending', async () => {
    const command = parsed(['--alias']);
    let calls = 0;
    expect(
      await collectSecretsByPrompt(command, [], async () => {
        calls += 1;
        return 'x';
      })
    ).toBe(true);
    expect(calls).toBe(0);
  });

  it('collects a mandatory secret that was left out', async () => {
    const command = parsed([]);
    const done = await collectSecretsByPrompt(
      command,
      ['--password [password]'],
      async () => 'typed'
    );
    expect(done).toBe(true);
    expect(command.getOptionValue('password')).toBe('typed');
  });
});

describe('collecting from stdin', () => {
  const piped = (text) => ({ isTTY: false, read: () => text });

  it('does nothing when no secret is pending, and never reads stdin', () => {
    const command = parsed(['--alias', 'x']);
    const stdin = {
      isTTY: false,
      read: () => {
        throw new Error('stdin was read');
      },
    };
    expect(() => collectSecretsFromStdin(command, stdin)).not.toThrow();
  });

  it('reads all of stdin and drops one trailing newline', () => {
    const command = parsed(['--password']);
    collectSecretsFromStdin(command, piped('s3 cr\net \n'));
    expect(command.getOptionValue('password')).toBe('s3 cr\net ');
  });

  it('drops a trailing carriage return and newline, and keeps trailing spaces', () => {
    expect(stripTrailingNewline('abc\r\n')).toBe('abc');
    expect(stripTrailingNewline('abc \n')).toBe('abc ');
    expect(stripTrailingNewline('abc\n\n')).toBe('abc\n');
    expect(stripTrailingNewline('abc')).toBe('abc');
  });

  it('fails without reading when stdin is a terminal', () => {
    const command = parsed(['--password']);
    const error = failure(() =>
      collectSecretsFromStdin(command, {
        isTTY: true,
        read: () => {
          throw new Error('stdin was read');
        },
      })
    );
    expect(error.code).toBe('frodo.secretValueMissing');
    expect(error.message).toBe(
      secretNeedsValueMessage(
        command.options.find((o) => o.attributeName() === 'password')
      )
    );
    expect(error.message).toContain('Pipe the value on stdin');
  });

  it('fails without reading when two secrets are bare, and names both', () => {
    const command = parsed(['--password', '--log-api-secret']);
    const error = failure(() =>
      collectSecretsFromStdin(command, {
        isTTY: false,
        read: () => {
          throw new Error('stdin was read');
        },
      })
    );
    expect(error.message).toContain("'--password' and '--log-api-secret'");
    expect(error.message).toContain('stdin can supply only one');
  });

  it('serves the one bare secret while the other was given on the command line', () => {
    const command = parsed(['--password', '--log-api-secret', 'given']);
    collectSecretsFromStdin(command, piped('from-stdin\n'));
    expect(command.getOptionValue('password')).toBe('from-stdin');
    expect(command.getOptionValue('logApiSecret')).toBe('given');
  });

  it('fails when nothing was piped', () => {
    const command = parsed(['--password']);
    const error = failure(() => collectSecretsFromStdin(command, piped('\n')));
    expect(error.message).toContain('nothing was piped on stdin');
    expect(command.getOptionValue('password')).toBe(true);
  });
});

describe('the safety net', () => {
  it('ends the command when a marker is still there, and passes when every secret has a value', () => {
    const command = parsed(['--password']);
    expect(failure(() => assertNoPendingSecrets(command)).code).toBe(
      'frodo.secretValueMissing'
    );
    command.setOptionValueWithSource('password', 'typed', 'cli');
    expect(() => assertNoPendingSecrets(command)).not.toThrow();
  });

  it("reports a declined bare secret as 'without a value' and a missing mandatory one as commander does", () => {
    const bare = parsed(['--password']);
    expect(
      failure(() =>
        failFirstPendingSecret(bare, [], () => {
          throw new Error('not mandatory');
        })
      ).message
    ).toBe("error: option '--password [password]' was given without a value.");

    const absent = parsed([]);
    const missing = failure(() =>
      failFirstPendingSecret(absent, ['--password [password]'], (flags) => {
        throw new Error(`required option '${flags}' not specified`);
      })
    );
    expect(missing.message).toBe(
      "required option '--password [password]' not specified"
    );
  });
});
