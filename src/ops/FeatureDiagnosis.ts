import type { frodo } from '@rockcarver/frodo-lib';
import c from '../utils/ColorTheme';

type IdmFeatureModule = typeof frodo.cloud.idmFeature;

/** What the library says about the health of an IDM feature (`diagnoseIdmFeature`). */
export type FeatureDiagnosis = Awaited<
  ReturnType<IdmFeatureModule['diagnoseIdmFeature']>
>;

/** One thing the diagnosis found. */
export type FeatureFinding = FeatureDiagnosis['findings'][number];

/** The width the label of a finding is padded to. */
const LABEL_WIDTH = 12;

/** The most differences listed under a finding of the definitions. */
const MAX_DIFFERENCES_LISTED = 8;

/** The text width a message is wrapped to when the terminal does not say. */
const DEFAULT_WIDTH = 100;

/**
 * The area of a finding, as the first column of the diagnosis names it. The
 * ids are the library's stable ids; an id this does not know gets the label
 * `Other`, so a finding the library adds later is still shown.
 * @param {string} id the id of the finding
 * @returns {string} the label
 */
export function findingLabel(id: string): string {
  if (id.startsWith('registry-')) return 'Registry';
  if (id.startsWith('definitions-')) return 'Definitions';
  if (id.startsWith('provider-')) return 'Provider';
  if (id.startsWith('gate-')) return 'AM';
  if (id.startsWith('secret-')) return 'Secrets';
  if (id === 'agents-without-am-entry') return 'Data';
  if (id === 'check-failed') return 'Check';
  if (id === 'version-unsupported' || id === 'feature-not-installed') {
    return 'Feature';
  }
  return 'Other';
}

/**
 * Whether the diagnosis found something that keeps the feature from working:
 * a finding of severity `error`. Warnings are cosmetic or advisory and do not
 * count.
 * @param {FeatureDiagnosis} diagnosis the diagnosis
 * @returns {boolean} true if there is a functional problem
 */
export function hasFunctionalProblem(diagnosis: FeatureDiagnosis): boolean {
  return diagnosis.findings.some((finding) => finding.severity === 'error');
}

/**
 * How many findings of each kind the diagnosis has. `repairable` counts the
 * functional problems (errors) that a repair can fix: a warning is never
 * repaired.
 * @param {FeatureDiagnosis} diagnosis the diagnosis
 * @returns {{ functional: number, warnings: number, repairable: number }} the counts
 */
export function countFindings(diagnosis: FeatureDiagnosis): {
  functional: number;
  warnings: number;
  repairable: number;
} {
  const errors = diagnosis.findings.filter(
    (finding) => finding.severity === 'error'
  );
  return {
    functional: errors.length,
    warnings: diagnosis.findings.filter(
      (finding) => finding.severity === 'warning'
    ).length,
    repairable: errors.filter((finding) => finding.repairable).length,
  };
}

/**
 * Wraps a sentence to a width, the continuation lines indented.
 * @param {string} text the text
 * @param {number} width the width of the text column
 * @returns {string[]} the lines, without the indent of the first column
 */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The mark in front of a finding: a cross for a functional problem, a
 * warning sign for a warning, a check for a healthy part.
 * @param {FeatureFinding} finding the finding
 * @returns {string} the colored mark
 */
function mark(finding: FeatureFinding): string {
  if (finding.severity === 'error') return c.negative('✖');
  if (finding.severity === 'warning') return c.warning('⚠');
  return c.positive('✔');
}

/**
 * What a difference of a definition says, on one line: the object, the place
 * in it and what is different.
 * @param {unknown} difference one entry of `details.differences`
 * @returns {string | undefined} the line, undefined for an entry of another shape
 */
function differenceLine(difference: unknown): string | undefined {
  if (!difference || typeof difference !== 'object') return undefined;
  const entry = difference as Record<string, unknown>;
  if (typeof entry.object !== 'string') return undefined;
  const what =
    typeof entry.cosmeticClass === 'string'
      ? entry.cosmeticClass
      : typeof entry.kind === 'string'
        ? entry.kind
        : '';
  return [entry.object, entry.location, what]
    .filter((part) => typeof part === 'string' && part !== '')
    .join('  ');
}

/**
 * The lines under a finding of the definitions: one per difference, the
 * first few only.
 * @param {FeatureFinding} finding the finding
 * @returns {string[]} the lines, none for a finding that lists no differences
 */
function differenceLines(finding: FeatureFinding): string[] {
  if (!finding.id.startsWith('definitions-')) return [];
  const differences = finding.details?.differences;
  if (!Array.isArray(differences)) return [];
  const lines = differences
    .map(differenceLine)
    .filter((line): line is string => line !== undefined);
  const listed = lines.slice(0, MAX_DIFFERENCES_LISTED);
  if (lines.length > listed.length) {
    listed.push(`... and ${lines.length - listed.length} more`);
  }
  return listed;
}

/**
 * The one line that sums the diagnosis up.
 * @param {FeatureDiagnosis} diagnosis the diagnosis
 * @returns {string} the summary
 */
export function diagnosisSummary(diagnosis: FeatureDiagnosis): string {
  const { functional, warnings, repairable } = countFindings(diagnosis);
  if (functional === 0 && warnings === 0) {
    return 'No problem found.';
  }
  const plural = (count: number, word: string) =>
    `${count} ${word}${count === 1 ? '' : 's'}`;
  const parts = [
    functional === 0
      ? 'No functional problem'
      : plural(functional, 'functional problem'),
    plural(warnings, 'warning'),
  ];
  return `${parts.join(', ')}${functional > 0 ? `; ${repairable} repairable` : ''}.`;
}

/**
 * The diagnosis as text: a line for every finding with its mark and the
 * area it belongs to, the differences of the definitions under theirs, the
 * summary, and, when a repair can fix something, the command that does it.
 * @param {FeatureDiagnosis} diagnosis the diagnosis
 * @param {object} [options] options
 * @param {number} [options.width] the width of the terminal. Default: the width of stdout, else 100
 * @param {boolean} [options.hint=true] end with the command that repairs what can be repaired; a repair itself leaves it out
 * @returns {string} the text, without a trailing newline
 */
export function diagnosisText(
  diagnosis: FeatureDiagnosis,
  {
    width = process.stdout.columns || DEFAULT_WIDTH,
    hint = true,
  }: { width?: number; hint?: boolean } = {}
): string {
  const indent = 2 + 2 + LABEL_WIDTH + 1;
  const textWidth = Math.max(40, Math.min(width, 120) - indent);
  const pad = ' '.repeat(indent);
  const lines = [c.heading(`Diagnosis of feature "${diagnosis.featureId}":`)];
  for (const finding of diagnosis.findings) {
    const label = findingLabel(finding.id).padEnd(LABEL_WIDTH);
    const [first, ...rest] = wrap(finding.message, textWidth);
    lines.push(`  ${mark(finding)} ${label} ${first ?? ''}`);
    for (const line of rest) lines.push(`${pad}${line}`);
    for (const line of differenceLines(finding)) {
      lines.push(`${pad}  ${c.muted(line)}`);
    }
  }
  lines.push(diagnosisSummary(diagnosis));
  const { functional, repairable } = countFindings(diagnosis);
  if (hint && repairable > 0) {
    lines.push(
      `Run "${c.command(`frodo feature validate -i ${diagnosis.featureId} --repair`)}" to fix ${
        repairable === functional ? 'them' : 'the repairable ones'
      }. A backup is written first.`
    );
  }
  return lines.join('\n');
}
