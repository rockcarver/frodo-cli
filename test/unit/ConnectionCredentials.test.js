import { Command } from 'commander';
import { hasExplicitCredentialSource } from '../../src/utils/interactive/ConnectionCredentials.ts';

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
});
