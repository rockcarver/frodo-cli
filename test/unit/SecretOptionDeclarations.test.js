import { beforeAll, describe, expect, it } from '@jest/globals';
import {
  isSecretOption,
  SECRET_OPTION_HELP,
} from '../../src/utils/interactive/SecretOptions.ts';
import { fullName, loadCommandTree } from '../utils/CommandExamples.js';

/**
 * How the real commands declare options whose value is a secret, and a guard
 * against the declaration mistakes behind the `conn set --password` report: an
 * optional value (`--x [value]`) whose bare form stored `true`, and a mandatory
 * option that a bare flag satisfied. Correcting those is a fix for a defect
 * (record 0048) and is listed in MIGRATION.md.
 */

/** The options that ask for their value when used bare. */
const SECRETS = [
  'frodo conn set --password',
  'frodo conn set --log-api-secret',
  'frodo conn save --log-api-secret',
  'frodo admin get-access-token --client-secret',
  'frodo admin create-oauth2-client-with-admin-privileges --client-secret',
  'frodo idm remote-proxy create --basic-password',
  'frodo idm remote-proxy create --client-secret',
  'frodo idm remote-proxy update --basic-password',
  'frodo idm remote-proxy update --client-secret',
];

/**
 * The options whose value is a secret but that need a value (`--x <value>`),
 * as the 5.x migration notes say of these options: a bare flag is rejected.
 * They are marked secret so that the command preview masks them and no default
 * is saved, and they cannot be asked for.
 */
const MASKED_ONLY = [
  'frodo conn save --authentication-header-overrides',
  'frodo conn save --configuration-header-overrides',
  'frodo conn set --authentication-header-overrides',
  'frodo conn set --configuration-header-overrides',
];

let rows;

beforeAll(async () => {
  const { leaves } = await loadCommandTree();
  rows = leaves.flatMap((command) =>
    command.options.map((option) => ({
      command,
      option,
      id: `${fullName(command)} ${option.long}`,
    }))
  );
});

describe('secret options in the command tree', () => {
  it('are exactly the ones this rule covers', () => {
    expect(
      rows
        .filter((r) => isSecretOption(r.option))
        .map((r) => r.id)
        .sort()
    ).toEqual([...SECRETS, ...MASKED_ONLY].sort());
  });

  it('need a value when they cannot be asked for, and show no preset', () => {
    for (const { option, id } of rows.filter((r) =>
      MASKED_ONLY.includes(r.id)
    )) {
      expect(`${id}: ${option.required}`).toBe(`${id}: true`);
      expect(`${id}: ${option.optional}`).toBe(`${id}: false`);
      expect(`${id}: ${option.presetArg}`).toBe(`${id}: undefined`);
    }
  });

  it('take an optional value, show no preset in the help, and say what a bare flag does', () => {
    for (const { option, id } of rows.filter((r) => SECRETS.includes(r.id))) {
      expect(`${id}: ${option.optional}`).toBe(`${id}: true`);
      expect(`${id}: ${option.presetArg}`).toBe(`${id}: undefined`);
      expect(option.description).toContain(SECRET_OPTION_HELP);
    }
  });

  it('cover every option named like a secret that has an optional value', () => {
    const missed = rows
      .filter(
        (r) =>
          r.option.optional &&
          /secret|password|passphrase|token/i.test(r.option.long ?? '') &&
          !isSecretOption(r.option)
      )
      .map((r) => r.id);
    expect(missed).toEqual([]);
  });

  it('never leave a mandatory option with an optional value, which a bare flag would satisfy', () => {
    const wrong = rows
      .filter(
        (r) =>
          r.option.mandatory && r.option.optional && !isSecretOption(r.option)
      )
      .map((r) => r.id);
    expect(wrong).toEqual([]);
  });
});
