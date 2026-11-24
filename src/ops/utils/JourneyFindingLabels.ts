import type { JourneyValidationFinding } from '@rockcarver/frodo-lib';

/**
 * The words of the output of `journey validate`: one line for a finding, one
 * heading for a journey, one summary for the run and one hint for each finding
 * code that has advice. The functions are pure (no library, no console), so
 * that every finding of every journey is written the same way.
 */

/** The findings of the library that say a journey names a node that is not there. */
const MISSING_NODE_FINDINGS = ['MISSING_NODE_DEFINITION', 'MISSING_INNER_NODE'];

/** The finding of the library that says a node cannot be reached from the entry node. */
const UNREACHABLE_NODE_CODE = 'UNREACHABLE_NODE';

/** The finding of the library that says the entry node of a journey is not there. */
const MISSING_ENTRY_NODE_CODE = 'MISSING_ENTRY_NODE';

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

/**
 * What to do about nodes that no path reaches from the entry node. The advice
 * names the finding code, because it is printed after the summary of a whole
 * run, where "these journeys" would point at nothing. A journey without an entry
 * node has no node that is reachable, so for it the advice is to repair the
 * entry node first.
 * @param {boolean} fromTenant true if the journeys were read from the tenant, false if from export files
 * @param {boolean} entryNodeMissing true if a journey that has unreachable nodes also has no entry node
 * @returns {string} one line of advice
 */
export function unreachableNodesHint(
  fromTenant: boolean,
  entryNodeMissing: boolean
): string {
  const advice = fromTenant
    ? 'Connect them or delete them in the journey editor.'
    : 'Connect them or delete them on the tenant and export the journeys again.';
  const entryNode = entryNodeMissing
    ? ` In a journey that also has ${MISSING_ENTRY_NODE_CODE}, repair the entry node first: until then every node of it is unreachable.`
    : '';
  return `Journeys with ${UNREACHABLE_NODE_CODE} have nodes that cannot be reached from the entry node. ${advice}${entryNode}`;
}

/** The ids of the journeys that have a finding with this code. */
function journeysWith(
  findings: Pick<JourneyValidationFinding, 'code' | 'journeyId'>[],
  code: string
): Set<string> {
  return new Set(
    findings
      .filter((finding) => finding.code === code)
      .map((finding) => finding.journeyId)
  );
}

/** The hints, in the order they are printed: the codes that call for one and the text. */
const HINTS: {
  codes: string[];
  text: (
    fromTenant: boolean,
    findings: Pick<JourneyValidationFinding, 'code' | 'journeyId'>[]
  ) => string;
}[] = [
  { codes: MISSING_NODE_FINDINGS, text: missingNodesHint },
  {
    codes: [UNREACHABLE_NODE_CODE],
    text: (fromTenant, findings) => {
      const noEntryNode = journeysWith(findings, MISSING_ENTRY_NODE_CODE);
      return unreachableNodesHint(
        fromTenant,
        [...journeysWith(findings, UNREACHABLE_NODE_CODE)].some((journeyId) =>
          noEntryNode.has(journeyId)
        )
      );
    },
  },
];

/**
 * The advice for the findings of a run: one line for each finding code that
 * has advice (the two codes for nodes that are not there share one), however
 * many findings of that code there are.
 * @param {Pick<JourneyValidationFinding, 'code' | 'journeyId'>[]} findings the findings of all journeys of the run
 * @param {boolean} fromTenant true if the journeys were read from the tenant, false if from export files
 * @returns {string[]} the lines of advice, in a fixed order
 */
export function hintsFor(
  findings: Pick<JourneyValidationFinding, 'code' | 'journeyId'>[],
  fromTenant: boolean
): string[] {
  const found = new Set<string>(findings.map((finding) => finding.code));
  return HINTS.filter(({ codes }) => codes.some((code) => found.has(code))).map(
    ({ text }) => text(fromTenant, findings)
  );
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
 * @returns {CodeTally[]} one entry per code: the codes that have an error first, then the code with the most findings, then by code
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
    .sort(
      (a, b) =>
        Number(b.errors > 0) - Number(a.errors > 0) ||
        b.count - a.count ||
        a.code.localeCompare(b.code)
    );
}

/**
 * The summary of a run: how many journeys were checked (out of how many, when
 * some could not be), how many of them have findings and how many findings,
 * then one line for each code.
 * @param {object} run what the run found
 * @param {number} run.checked the number of journeys that were validated
 * @param {number} run.total the number of journeys that were to be validated
 * @param {JourneyValidationFinding[]} run.findings the findings of all of them
 * @returns {string[]} the lines; none when there are no findings
 */
export function summaryLines({
  checked,
  total,
  findings,
}: {
  checked: number;
  total: number;
  findings: JourneyValidationFinding[];
}): string[] {
  if (findings.length === 0) return [];
  const withFindings = new Set(findings.map((finding) => finding.journeyId))
    .size;
  const checkedOf = checked < total ? `${checked} of ${total}` : `${checked}`;
  const journeys = Math.max(checked, total) === 1 ? 'journey' : 'journeys';
  return [
    `Checked ${checkedOf} ${journeys}, ${withFindings} with findings: ${describeCounts(countBySeverity(findings))}.`,
    ...tallyByCode(findings).map(
      (tally) => `  ${tally.code}: ${describeCounts(tally)}`
    ),
  ];
}
