import type { JourneyValidationFinding } from '@rockcarver/frodo-lib';

/**
 * The words of the output of `journey validate`: one line for a finding, one
 * heading for a journey, one summary for the run and one hint for each kind of
 * finding. The functions are pure (no library, no console), so that every
 * finding of every journey is written the same way.
 */

/** The findings of the library that say a journey names a node that is not there. */
const MISSING_NODE_FINDINGS = ['MISSING_NODE_DEFINITION', 'MISSING_INNER_NODE'];

/** The finding of the library that says a node cannot be reached from the entry node. */
const UNREACHABLE_NODE_FINDINGS = ['UNREACHABLE_NODE'];

/**
 * What to do about journeys that name nodes which are not there. The library
 * states the fact (the findings name each node); the advice is ours: it names
 * the commands of this command line.
 * @param {boolean} fromTenant true if the journeys were read from the tenant, false if from export files
 * @returns {string} one line of advice
 */
export function missingNodesHint(fromTenant: boolean): string {
  return fromTenant
    ? "These journeys name nodes that do not exist on the tenant, so 'frodo journey export' and 'frodo journey describe' cannot read them either. Import the journey again from an export that has the nodes ('frodo journey import'), or repair its Page Nodes in the journey editor."
    : 'These journeys name nodes that the export does not contain. Export them again from a tenant that has the nodes.';
}

/** What to do about nodes that no path reaches from the entry node: one line of advice. */
export const UNREACHABLE_NODES_HINT =
  'These journeys hold nodes that no path reaches from the entry node. Connect them to the journey, or delete them, in the journey editor.';

/** The hints, in the order they are printed: the codes that call for one and the text. */
const HINTS: {
  codes: string[];
  text: (fromTenant: boolean) => string;
}[] = [
  { codes: MISSING_NODE_FINDINGS, text: missingNodesHint },
  { codes: UNREACHABLE_NODE_FINDINGS, text: () => UNREACHABLE_NODES_HINT },
];

/**
 * The advice for the findings of a run: one line for each kind of finding that
 * has advice, however many findings of that kind there are.
 * @param {Iterable<string>} codes the codes of all findings of the run
 * @param {boolean} fromTenant true if the journeys were read from the tenant, false if from export files
 * @returns {string[]} the lines of advice, in a fixed order
 */
export function hintsFor(
  codes: Iterable<string>,
  fromTenant: boolean
): string[] {
  const found = new Set(codes);
  return HINTS.filter(({ codes: hinted }) =>
    hinted.some((code) => found.has(code))
  ).map(({ text }) => text(fromTenant));
}

/** How many findings of each severity. */
export interface SeverityCounts {
  errors: number;
  warnings: number;
}

/**
 * One finding as one line: the code in brackets, then the message of the library.
 * @param {JourneyValidationFinding} finding the finding
 * @returns {string} the line
 */
export function findingLine(finding: JourneyValidationFinding): string {
  return `  [${finding.code}] ${finding.message}`;
}

/**
 * Counts findings by their severity.
 * @param {JourneyValidationFinding[]} findings the findings
 * @returns {SeverityCounts} the number of errors and the number of warnings
 */
export function countBySeverity(
  findings: JourneyValidationFinding[]
): SeverityCounts {
  return {
    errors: findings.filter((finding) => finding.severity === 'error').length,
    warnings: findings.filter((finding) => finding.severity === 'warning')
      .length,
  };
}

/**
 * The counts as words: `1 error`, `2 warnings`, `1 error and 2 warnings`; empty when both are 0.
 * @param {SeverityCounts} counts the counts
 * @returns {string} the words
 */
export function describeCounts({ errors, warnings }: SeverityCounts): string {
  return [
    errors && `${errors} error${errors === 1 ? '' : 's'}`,
    warnings && `${warnings} warning${warnings === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' and ');
}

/**
 * The line that opens the findings of one journey.
 * @param {string} journeyId the journey
 * @param {SeverityCounts} counts the counts of its findings
 * @param {boolean} strict true if warnings fail the run
 * @returns {string} the heading; in strict mode a journey that has warnings only says that they fail it
 */
export function journeyHeading(
  journeyId: string,
  counts: SeverityCounts,
  strict: boolean
): string {
  const strictMessage =
    strict && counts.errors === 0 && counts.warnings > 0
      ? ' (strict mode treats warnings as errors)'
      : '';
  return `${describeCounts(counts)} in journey ${journeyId}${strictMessage}`;
}

/** The findings of one code. */
export interface CodeTally extends SeverityCounts {
  code: string;
  count: number;
}

/**
 * Counts the findings of each code.
 * @param {JourneyValidationFinding[]} findings the findings of all journeys
 * @returns {CodeTally[]} one entry per code, the code with the most findings first, then by code
 */
export function tallyByCode(findings: JourneyValidationFinding[]): CodeTally[] {
  const byCode = new Map<string, JourneyValidationFinding[]>();
  for (const finding of findings) {
    byCode.set(finding.code, [...(byCode.get(finding.code) ?? []), finding]);
  }
  return [...byCode.entries()]
    .map(([code, ofCode]) => ({
      code,
      count: ofCode.length,
      ...countBySeverity(ofCode),
    }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/**
 * The summary of a run: how many journeys were checked, how many of them have
 * findings and how many findings, then one line for each code.
 * @param {object} run what the run found
 * @param {number} run.checked the number of journeys that were validated
 * @param {JourneyValidationFinding[]} run.findings the findings of all of them
 * @returns {string[]} the lines; none when there are no findings
 */
export function summaryLines({
  checked,
  findings,
}: {
  checked: number;
  findings: JourneyValidationFinding[];
}): string[] {
  if (findings.length === 0) return [];
  const withFindings = new Set(findings.map((finding) => finding.journeyId))
    .size;
  return [
    `Checked ${checked} journey${checked === 1 ? '' : 's'}, ${withFindings} with findings: ${describeCounts(countBySeverity(findings))}.`,
    ...tallyByCode(findings).map(
      (tally) => `  ${tally.code}: ${describeCounts(tally)}`
    ),
  ];
}
