import { MCP_POLICY_PRESETS } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import c from 'tinyrainbow';

import { printMessage } from '../../../utils/Console';
import { FrodoStubCommand } from '../../FrodoCommand';

type McpPoliciesOptions = {
  json?: boolean;
};

type PolicyPresentation = {
  name: string;
  description: string;
  recommendation: string;
};

const POLICY_PRESENTATION: Record<string, PolicyPresentation> = {
  'read-only': {
    name: 'read-only',
    description:
      'Read-only posture for discovery and reporting workflows. Mutating operations are excluded.',
    recommendation:
      'Use for audits, inventory, diagnostics, and least-privilege agent sessions.',
  },
  agentic: {
    name: 'agentic',
    description:
      'Safe-write posture for agents. Supports create/update flows but blocks delete/import/export and critical-risk skills.',
    recommendation:
      'Default for autonomous assistants that should make progress without high-blast-radius actions.',
  },
  standard: {
    name: 'standard',
    description:
      'Operational posture for guided administration. Adds export while still blocking delete/import and critical-risk skills.',
    recommendation:
      'Use for operator-led maintenance where data extraction is needed but destructive paths remain guarded.',
  },
  admin: {
    name: 'admin',
    description:
      'Full-access posture. No built-in operation or risk-class restrictions are applied.',
    recommendation:
      'Use only in trusted sessions with explicit change control and strong environment safeguards.',
  },
};

/**
 * Lists MCP policy presets with human guidance for selection.
 */
export default function setup() {
  const program = new FrodoStubCommand('policies')
    .description(
      'List MCP skill policy presets with descriptions and usage guidance.'
    )
    .withStability('experimental')
    .addOption(
      new Option('--json', 'Print policy presets as JSON.').default(false)
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  List policy presets with recommendations:\n` +
        c.cyanBright(`  $ frodo mcp server policies\n`) +
        `  Export policy presets as JSON:\n` +
        c.cyanBright(`  $ frodo mcp server policies --json\n`) +
        `  Compare policy impact on skills:\n` +
        c.cyanBright(
          `  $ frodo mcp server info --policy read-only && frodo mcp server info --policy admin\n`
        )
    );

  program.action((options) => {
    const opts = options as McpPoliciesOptions;
    const presets = Object.values(MCP_POLICY_PRESETS).map((preset) => {
      const presentation =
        POLICY_PRESENTATION[preset.name] ||
        ({
          name: preset.name,
          description: 'No curated description available for this preset.',
          recommendation:
            'Review operation and risk filters before using this preset in production.',
        } as PolicyPresentation);

      return {
        name: preset.name,
        description: presentation.description,
        recommendation: presentation.recommendation,
        controls: {
          allowOperationTypes: preset.allowOperationTypes,
          denyOperationTypes: preset.denyOperationTypes,
          allowRiskClasses: preset.allowRiskClasses,
          denyRiskClasses: preset.denyRiskClasses,
          includeSpecial: preset.includeSpecial ?? true,
        },
      };
    });

    if (opts.json) {
      printMessage(
        JSON.stringify(
          {
            total: presets.length,
            presets,
          },
          null,
          2
        ),
        'data'
      );
      return;
    }

    printMessage(`MCP policy presets (${presets.length}):`, 'info');
    for (const preset of presets) {
      printMessage(`- ${preset.name}: ${preset.description}`);
      printMessage(`  Recommended when: ${preset.recommendation}`);
      printMessage(
        `  Operation controls: allow=${joinOrAll(preset.controls.allowOperationTypes)}, deny=${joinOrNone(preset.controls.denyOperationTypes)}`
      );
      printMessage(
        `  Risk controls: allow=${joinOrAll(preset.controls.allowRiskClasses)}, deny=${joinOrNone(preset.controls.denyRiskClasses)}`
      );
      printMessage(
        `  Includes special skills in active skill set: ${preset.controls.includeSpecial}`
      );
    }
  });

  return program;
}

function joinOrAll(values?: string[]): string {
  return values && values.length ? values.join(', ') : 'all';
}

function joinOrNone(values?: string[]): string {
  return values && values.length ? values.join(', ') : 'none';
}
