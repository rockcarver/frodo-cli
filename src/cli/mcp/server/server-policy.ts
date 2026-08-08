export type McpPolicyPreset = 'read-only' | 'agentic' | 'standard' | 'admin';

export type McpServicePolicySelection = {
  policyPreset: 'read-only' | 'standard' | 'admin';
  policyOverride?: {
    name?: string;
    denyOperationTypes?: Array<'delete' | 'import' | 'export'>;
  };
};

/**
 * Maps user-facing policy choices to a compatible createMcpService input.
 */
export function resolvePolicySelection(
  policy: McpPolicyPreset
): McpServicePolicySelection {
  if (policy === 'agentic') {
    return {
      policyPreset: 'standard',
      policyOverride: {
        name: 'agentic',
        denyOperationTypes: ['delete', 'import', 'export'],
      },
    };
  }

  return {
    policyPreset: policy,
  };
}
