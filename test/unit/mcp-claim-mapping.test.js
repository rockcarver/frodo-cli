/**
 * Unit tests for McpClaimMapping.ts: the external-IDP "shared mode" claim
 * mapping config loader and resolver.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  loadClaimMappingConfig,
  resolveServiceAccountForClaims,
} from '../../src/ops/McpClaimMapping.ts';

function writeConfig(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-claim-mapping-'));
  const file = path.join(dir, 'claims.json');
  fs.writeFileSync(
    file,
    typeof content === 'string' ? content : JSON.stringify(content)
  );
  return file;
}

describe('loadClaimMappingConfig', () => {
  test('loads a valid config', () => {
    const file = writeConfig({
      claimName: 'groups',
      mappings: [
        { claimValue: 'frodo-mcp-admins', serviceAccount: 'admin-sa' },
        { claimValue: 'frodo-mcp-readonly', serviceAccount: 'readonly-sa' },
      ],
    });

    const config = loadClaimMappingConfig(file);

    expect(config.claimName).toBe('groups');
    expect(config.mappings).toHaveLength(2);
  });

  test('throws on missing file', () => {
    expect(() =>
      loadClaimMappingConfig('/nonexistent/claims.json')
    ).toThrow(/Failed to read or parse/);
  });

  test('throws on invalid JSON', () => {
    const file = writeConfig('not json');
    expect(() => loadClaimMappingConfig(file)).toThrow(
      /Failed to read or parse/
    );
  });

  test('throws when claimName is missing', () => {
    const file = writeConfig({ mappings: [] });
    expect(() => loadClaimMappingConfig(file)).toThrow(/Invalid claim-mapping config/);
  });

  test('throws when a mapping entry is malformed', () => {
    const file = writeConfig({
      claimName: 'groups',
      mappings: [{ claimValue: 'x' }],
    });
    expect(() => loadClaimMappingConfig(file)).toThrow(/mappings\[0\]/);
  });

  test('throws on a duplicate claimValue', () => {
    const file = writeConfig({
      claimName: 'groups',
      mappings: [
        { claimValue: 'frodo-mcp-admins', serviceAccount: 'admin-sa' },
        { claimValue: 'frodo-mcp-admins', serviceAccount: 'other-sa' },
      ],
    });
    expect(() => loadClaimMappingConfig(file)).toThrow(/duplicate claimValue/);
  });
});

describe('resolveServiceAccountForClaims', () => {
  const config = {
    claimName: 'groups',
    mappings: [
      { claimValue: 'frodo-mcp-admins', serviceAccount: 'admin-sa' },
      { claimValue: 'frodo-mcp-readonly', serviceAccount: 'readonly-sa' },
    ],
  };

  test('resolves a scalar claim value', () => {
    expect(
      resolveServiceAccountForClaims(config, { groups: 'frodo-mcp-readonly' })
    ).toBe('readonly-sa');
  });

  test('resolves an array claim value, first configured match wins', () => {
    expect(
      resolveServiceAccountForClaims(config, {
        groups: ['some-other-group', 'frodo-mcp-admins'],
      })
    ).toBe('admin-sa');
  });

  test('returns undefined when nothing matches (fail-closed contract)', () => {
    expect(
      resolveServiceAccountForClaims(config, { groups: ['unmapped-group'] })
    ).toBeUndefined();
  });

  test('returns undefined when the configured claim is absent entirely', () => {
    expect(resolveServiceAccountForClaims(config, {})).toBeUndefined();
  });
});
