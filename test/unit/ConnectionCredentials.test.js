import { Command } from 'commander';
import { hasExplicitCredentialSource } from '../../src/utils/interactive/ConnectionCredentials.ts';

const credentialVariables = [
  'FRODO_SA_ID',
  'FRODO_SA_JWK',
  'FRODO_AMSTER_PRIVATE_KEY',
  'FRODO_AMSTER_PASSPHRASE',
];
let savedEnvironment;

beforeEach(() => {
  savedEnvironment = { ...process.env };
  for (const name of credentialVariables) delete process.env[name];
});

afterEach(() => {
  for (const name of credentialVariables) {
    if (savedEnvironment[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnvironment[name];
  }
});

function commandWith(args) {
  return new Command()
    .option('--browser')
    .option('--device')
    .option('--sa-id <id>')
    .option('--sa-jwk-file <file>')
    .option('--private-key <file>')
    .option('--passphrase <value>')
    .option('--authentication-service <name>')
    .parse(args, { from: 'user' });
}

describe('explicit credential sources', () => {
  test.each([
    ['--sa-id', 'test-account'],
    ['--sa-id', 'test-account', '--sa-jwk-file', 'throwaway.jwk'],
    ['--sa-jwk-file', 'throwaway.jwk'],
    ['--private-key', 'throwaway.pem'],
    ['--private-key', 'throwaway.pem', '--passphrase', 'test-only'],
    ['--browser'],
    ['--device'],
  ])('%j suppresses username/password completion', (...args) => {
    expect(hasExplicitCredentialSource(commandWith(args))).toBe(true);
  });

  test.each([
    [],
    ['--passphrase', 'test-only'],
    ['--authentication-service', 'Amster'],
  ])('%j alone does not supply credentials', (...args) => {
    expect(hasExplicitCredentialSource(commandWith(args))).toBe(false);
  });

  test.each(credentialVariables.slice(0, 3))(
    '%s names a credential source without parsing its value',
    (name) => {
      process.env[name] = 'deliberately malformed key or id';
      expect(() => hasExplicitCredentialSource(commandWith([]))).not.toThrow();
      expect(hasExplicitCredentialSource(commandWith([]))).toBe(true);
    }
  );

  test.each(credentialVariables)(
    '%s empty is not a credential source',
    (name) => {
      process.env[name] = '';
      expect(hasExplicitCredentialSource(commandWith([]))).toBe(false);
    }
  );

  test.each([
    [['--sa-id', 'test-account'], { FRODO_SA_JWK: 'unparsed JWK' }],
    [['--sa-jwk-file', 'throwaway.jwk'], { FRODO_SA_ID: 'test-account' }],
    [[], { FRODO_SA_ID: 'test-account', FRODO_SA_JWK: 'unparsed JWK' }],
    [['--sa-id', ''], { FRODO_SA_JWK: 'unparsed JWK' }],
    [['--sa-jwk-file', ''], { FRODO_SA_ID: 'test-account' }],
    [['--sa-id', 'test-account'], { FRODO_SA_JWK: '' }],
    [['--sa-jwk-file', 'throwaway.jwk'], { FRODO_SA_ID: '' }],
    [
      ['--private-key', 'throwaway.pem'],
      { FRODO_AMSTER_PASSPHRASE: 'test-only' },
    ],
    [
      ['--passphrase', 'test-only'],
      { FRODO_AMSTER_PRIVATE_KEY: 'unparsed PEM' },
    ],
    [
      [],
      {
        FRODO_AMSTER_PRIVATE_KEY: 'unparsed PEM',
        FRODO_AMSTER_PASSPHRASE: 'test-only',
      },
    ],
  ])('mixed sources %j and %j suppress credential completion', (args, env) => {
    Object.assign(process.env, env);
    expect(hasExplicitCredentialSource(commandWith(args))).toBe(true);
  });

  test('an environment passphrase alone is not a credential source', () => {
    process.env.FRODO_AMSTER_PASSPHRASE = 'test-only';
    expect(hasExplicitCredentialSource(commandWith([]))).toBe(false);
  });

  test.each(['--sa-id', '--sa-jwk-file', '--private-key'])(
    '%s empty with no environment source still needs credentials',
    (option) => {
      expect(hasExplicitCredentialSource(commandWith([option, '']))).toBe(
        false
      );
    }
  );
});
