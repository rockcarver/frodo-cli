import { execFileSync } from 'child_process';
import { describe, expect, it } from '@jest/globals';
import setupPullVariables from '../../src/cli/config-manager/config-manager-pull/config-manager-pull-variables.ts';
import { formatEnvAssignment } from '../../src/configManagerOps/FrConfigVariableOps.ts';

/**
 * `frodo config-manager pull variables -u` prints `NAME='value'` lines that are
 * meant to be sourced into a shell, so a value must come back unchanged
 * whatever it contains. `-u` and `-r` cannot be combined: the report path
 * returns before the dump, so `-u` would be silently ignored (record 0032).
 */

const sourced = (line) =>
  execFileSync('sh', ['-c', `${line}\nprintf %s "$ESV_X"`], {
    encoding: 'utf8',
  });

describe('formatEnvAssignment', () => {
  it('writes a plain value as it always did', () => {
    expect(formatEnvAssignment('ESV_X', 'plain value')).toBe(
      "ESV_X='plain value'"
    );
    expect(formatEnvAssignment('ESV_X', 'a,b,c,d')).toBe("ESV_X='a,b,c,d'");
  });

  it("escapes a single quote as '\\''", () => {
    expect(formatEnvAssignment('ESV_X', "it's")).toBe("ESV_X='it'\\''s'");
  });

  it('writes a missing value as an empty string, not as the word undefined', () => {
    expect(formatEnvAssignment('ESV_X', undefined)).toBe("ESV_X=''");
    expect(formatEnvAssignment('ESV_X', null)).toBe("ESV_X=''");
  });

  const values = [
    'plain',
    "it's",
    "a 'quoted' word",
    "'",
    "''",
    "'; echo pwned; '",
    '$(echo pwned)',
    '`echo pwned`',
    '$HOME',
    '"double"',
    'back\\slash',
    '{"allow":["145.118.0.0/16"],"note":"x\'y"}',
    'two\nlines',
    '',
  ];

  (process.platform === 'win32' ? it.skip : it).each(values)(
    'sourced in a shell, %j comes back unchanged',
    (value) => {
      expect(sourced(formatEnvAssignment('ESV_X', value))).toBe(value);
    }
  );
});

describe('frodo config-manager pull variables options', () => {
  const options = setupPullVariables().options;
  const dump = options.find((o) => o.long === '--dump');
  const report = options.find((o) => o.long === '--report');

  it('dumps with -u and reports with -r', () => {
    expect(dump.short).toBe('-u');
    expect(report.short).toBe('-r');
  });

  it('declares the conflict on both options, and says so in the help', () => {
    expect(dump.conflictsWith).toContain('report');
    expect(report.conflictsWith).toContain('dump');
    expect(dump.description).toContain('Cannot be used with -r');
    expect(report.description).toContain('Cannot be used with -u');
  });
});
