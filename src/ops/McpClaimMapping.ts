/**
 * Claim-to-credential mapping for the MCP HTTP transport's external-IDP
 * "shared mode" (see McpServerOps.ts's buildExternalIdpVerifier and
 * buildClaimMappedCredentialResolver).
 *
 * @remarks
 * An operator authors this mapping explicitly — a caller-supplied claim
 * value is never used to directly select a parameter that controls
 * privilege. Each entry names one of the connection profile's own
 * `additionalServiceAccounts` (see `frodo conn service-account add`) by
 * name; there is deliberately no way to spell an admin account, the
 * profile's own primary user/service account, or an arbitrary credential
 * type here — the schema itself can't express those, so no separate
 * runtime guardrail is needed to keep external-IDP-gated access scoped to
 * bounded-privilege service accounts only.
 *
 * `profile`/`policy`/`tenant` selection by claim are real, anticipated
 * future extensions (see the plan doc's item 5) — not implemented yet:
 * every session in this mode currently gets the server's own fixed
 * `--profile`/`--policy`/target host, only the AM-side credential varies
 * by claim.
 */
import fs from 'fs';

export type McpClaimMappingEntry = {
  /** The claim value this entry matches (e.g. one group/role name). */
  claimValue: string;
  /**
   * Name of an existing additional service account (see
   * `frodo conn service-account add --name`) on the target connection
   * profile — never the primary account, never an admin account.
   */
  serviceAccount: string;
};

export type McpClaimMappingConfig = {
  /** Name of the claim to read from the verified token (e.g. 'groups', 'roles'). */
  claimName: string;
  mappings: McpClaimMappingEntry[];
};

/**
 * Loads and validates a claim-mapping config file.
 * @throws when the file is missing, isn't valid JSON, or doesn't match the
 * expected shape (fail fast at startup, not on the first request).
 */
export function loadClaimMappingConfig(filePath: string): McpClaimMappingConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Failed to read or parse claim-mapping config '${filePath}': ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (
    !raw ||
    typeof raw !== 'object' ||
    typeof (raw as McpClaimMappingConfig).claimName !== 'string' ||
    !(raw as McpClaimMappingConfig).claimName ||
    !Array.isArray((raw as McpClaimMappingConfig).mappings)
  ) {
    throw new Error(
      `Invalid claim-mapping config '${filePath}': expected { claimName: string, mappings: [{ claimValue, serviceAccount }, ...] }.`
    );
  }
  const config = raw as McpClaimMappingConfig;
  for (const [index, entry] of config.mappings.entries()) {
    if (
      !entry ||
      typeof entry.claimValue !== 'string' ||
      !entry.claimValue ||
      typeof entry.serviceAccount !== 'string' ||
      !entry.serviceAccount
    ) {
      throw new Error(
        `Invalid claim-mapping config '${filePath}': mappings[${index}] must be { claimValue: string, serviceAccount: string }.`
      );
    }
  }
  const seen = new Set<string>();
  for (const entry of config.mappings) {
    if (seen.has(entry.claimValue)) {
      throw new Error(
        `Invalid claim-mapping config '${filePath}': duplicate claimValue '${entry.claimValue}' — each claim value must map to exactly one service account.`
      );
    }
    seen.add(entry.claimValue);
  }
  return config;
}

/**
 * Resolves the additional-service-account name for a verified token's
 * claims, per the configured mapping. The configured claim may be a single
 * string or an array (e.g. a 'groups' claim) — every value is checked, and
 * the first configured match wins.
 * @returns the matched service account name, or `undefined` when nothing
 * in the token's claim matches any configured entry (the caller must fail
 * closed on `undefined`, never fall back to a default credential).
 */
export function resolveServiceAccountForClaims(
  config: McpClaimMappingConfig,
  claims: Record<string, unknown>
): string | undefined {
  const claimValue = claims[config.claimName];
  const values = Array.isArray(claimValue) ? claimValue : [claimValue];
  for (const value of values) {
    const match = config.mappings.find((entry) => entry.claimValue === value);
    if (match) {
      return match.serviceAccount;
    }
  }
  return undefined;
}
