import { describe, expect, test } from '@jest/globals';
import {
  brokenDiagnosis,
  finding,
  healthyDiagnosis,
  unsupportedDiagnosis,
} from '../utils/FeatureDiagnosisFixtures.js';

/**
 * How `frodo feature validate` shows the diagnosis the library returns
 * (src/ops/FeatureDiagnosis.ts): the mark and the area of every finding, the
 * differences of the definitions under theirs, the summary, and the command
 * that repairs what can be repaired. The functional problems (findings of
 * severity `error`) are what makes the command exit 1; warnings never do.
 */
const {
  countFindings,
  diagnosisSummary,
  diagnosisText,
  findingLabel,
  hasFunctionalProblem,
} = await import('../../src/ops/FeatureDiagnosis');

// eslint-disable-next-line no-control-regex
const plain = (text) => text.replace(/\u001b\[[0-9;]*m/g, '');
const lines = (diagnosis, options) =>
  plain(diagnosisText(diagnosis, options)).split('\n');

describe('hasFunctionalProblem', () => {
  test('is true for a finding of severity error', () => {
    expect(hasFunctionalProblem(brokenDiagnosis)).toBe(true);
  });

  test('is false when there are only warnings and facts', () => {
    expect(
      hasFunctionalProblem({
        ...healthyDiagnosis,
        findings: [
          ...healthyDiagnosis.findings,
          finding('registry-unexplained', 'warning', 'Odd.'),
        ],
      })
    ).toBe(false);
  });

  test('is false for a feature the library does not judge', () => {
    expect(hasFunctionalProblem(unsupportedDiagnosis)).toBe(false);
  });
});

describe('countFindings', () => {
  test('counts the errors, the warnings and the errors a repair can fix', () => {
    expect(countFindings(brokenDiagnosis)).toEqual({
      functional: 4,
      warnings: 2,
      repairable: 3,
    });
  });

  test('a repairable warning is not counted as repairable: a warning is never repaired', () => {
    expect(
      countFindings({
        ...healthyDiagnosis,
        findings: [finding('check-failed', 'warning', 'x', true)],
      })
    ).toEqual({ functional: 0, warnings: 1, repairable: 0 });
  });
});

describe('diagnosisSummary', () => {
  test.each([
    [brokenDiagnosis, '4 functional problems, 2 warnings; 3 repairable.'],
    [healthyDiagnosis, 'No problem found.'],
    [
      {
        ...healthyDiagnosis,
        findings: [finding('check-failed', 'warning', 'x')],
      },
      'No functional problem, 1 warning.',
    ],
    [
      {
        ...healthyDiagnosis,
        findings: [finding('gate-closed', 'error', 'x')],
      },
      '1 functional problem, 0 warnings; 0 repairable.',
    ],
  ])('%#: says it in one line', (diagnosis, expected) => {
    expect(diagnosisSummary(diagnosis)).toBe(expected);
  });
});

describe('findingLabel', () => {
  test.each([
    ['registry-installed', 'Registry'],
    ['registry-not-installed', 'Registry'],
    ['registry-unexplained', 'Registry'],
    ['definitions-cosmetic-drift', 'Definitions'],
    ['definitions-structural-drift', 'Definitions'],
    ['definitions-differ-from-reference', 'Definitions'],
    ['provider-missing', 'Provider'],
    ['provider-auth-service-not-set', 'Provider'],
    ['provider-ai-agents-disabled', 'Provider'],
    ['gate-open', 'AM'],
    ['gate-closed', 'AM'],
    ['gate-check-failed', 'AM'],
    ['secret-mappings-dangling', 'Secrets'],
    ['agents-without-am-entry', 'Data'],
    ['check-failed', 'Check'],
    ['version-unsupported', 'Feature'],
    ['feature-not-installed', 'Feature'],
  ])('%s is shown as %s', (id, label) => {
    expect(findingLabel(id)).toBe(label);
  });

  test('an id the CLI does not know is still shown, as Other', () => {
    expect(findingLabel('something-new')).toBe('Other');
  });
});

describe('diagnosisText', () => {
  test('starts with the feature and puts a mark, an area and the sentence on every finding', () => {
    const text = lines(brokenDiagnosis);
    const all = text.join('\n');

    expect(text[0]).toBe('Diagnosis of feature "aiagent":');
    expect(text).toContain(
      '  ⚠ Registry     The registry reports no installed version.'
    );
    expect(all).toContain(
      '  ✖ Provider     The realm bravo has no OAuth 2.0 provider'
    );
    expect(all).toContain(
      '  ✖ AM           AM does not accept AI agents in the realm alpha'
    );
    expect(all).toContain('  ⚠ Data         IDM holds 4 AI agent object(s)');
  });

  test('a healthy part is a check mark, and a healthy tenant has no repair hint', () => {
    const text = lines(healthyDiagnosis).join('\n');

    expect(text).toContain(
      '✔ Registry     The registry reports version 1 installed.'
    );
    expect(text).toContain(
      '✔ AM           AM accepts AI agents in the realm alpha.'
    );
    expect(text).toContain('No problem found.');
    expect(text).not.toContain('--repair');
  });

  test('lists the differences of the definitions under their finding', () => {
    const text = lines(brokenDiagnosis).join('\n');

    expect(text).toMatch(
      /alpha_aiagent {2}onDelete\.source {2}trailing newline/
    );
    expect(text).toMatch(
      /bravo_aiagent {2}onDelete\.source {2}trailing newline/
    );
  });

  test('lists the first differences only and says how many more there are', () => {
    const many = {
      ...brokenDiagnosis,
      findings: [
        finding(
          'definitions-structural-drift',
          'error',
          'Many differ.',
          false,
          {
            differences: Array.from({ length: 11 }, (_, index) => ({
              object: `alpha_object${index}`,
              location: 'schema',
              kind: 'missing',
            })),
          }
        ),
      ],
    };

    const text = lines(many).join('\n');

    expect(text).toContain('alpha_object7  schema  missing');
    expect(text).not.toContain('alpha_object8');
    expect(text).toContain('... and 3 more');
  });

  test('ignores differences of a shape it does not know instead of failing', () => {
    const odd = {
      ...brokenDiagnosis,
      findings: [
        finding('definitions-structural-drift', 'error', 'Odd.', false, {
          differences: [null, 7, { foo: 'bar' }],
        }),
      ],
    };

    expect(() => diagnosisText(odd)).not.toThrow();
    expect(lines(odd).join('\n')).not.toContain('undefined');
  });

  test('ends with the summary and the command that repairs what can be repaired', () => {
    const text = lines(brokenDiagnosis);

    expect(text.at(-2)).toBe(
      '4 functional problems, 2 warnings; 3 repairable.'
    );
    expect(text.at(-1)).toBe(
      'Run "frodo feature validate -i aiagent --repair" to fix the repairable ones. A backup is written first.'
    );
  });

  test('says "them" when everything that is wrong can be repaired', () => {
    const allRepairable = {
      ...brokenDiagnosis,
      findings: [finding('provider-missing', 'error', 'x', true)],
    };

    expect(lines(allRepairable).at(-1)).toContain('to fix them.');
  });

  test('a repair itself leaves the hint out', () => {
    expect(lines(brokenDiagnosis, { hint: false }).join('\n')).not.toContain(
      '--repair'
    );
  });

  test('wraps a long sentence to the width and indents the continuation under it', () => {
    const text = lines(brokenDiagnosis, { width: 60 });

    const start = text.findIndex((line) => line.includes('Definitions'));
    expect(text[start].length).toBeLessThanOrEqual(60);
    expect(text[start + 1]).toMatch(/^ {17}\S/);
  });
});
