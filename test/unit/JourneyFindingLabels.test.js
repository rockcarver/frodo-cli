import {
  countBySeverity,
  describeCounts,
  findingLine,
  hintsFor,
  journeyHeading,
  missingNodesHint,
  summaryLines,
  tallyByCode,
  UNREACHABLE_NODES_HINT,
} from '../../src/ops/utils/JourneyFindingLabels.ts';

// The words of the output of `journey validate`: one line for a finding, one
// heading for a journey, one summary for the run, one hint for each kind of
// finding. Pure functions: no library, no console.

const finding = (
  code,
  severity,
  journeyId = 'login',
  message = `${code} text`
) => ({
  code,
  severity,
  journeyId,
  message,
});

describe('findingLine', () => {
  test('writes the code in brackets and then the message of the library, as it always did', () => {
    expect(
      findingLine(
        finding(
          'UNREACHABLE_NODE',
          'warning',
          'login',
          "Tree node 'n1' is not reachable"
        )
      )
    ).toBe("  [UNREACHABLE_NODE] Tree node 'n1' is not reachable");
  });
});

describe('countBySeverity and describeCounts', () => {
  test('count errors and warnings by their severity', () => {
    expect(
      countBySeverity([
        finding('MISSING_ENTRY_NODE', 'error'),
        finding('UNREACHABLE_NODE', 'warning'),
        finding('UNCONNECTED_OUTCOME', 'warning'),
      ])
    ).toEqual({ errors: 1, warnings: 2 });
  });

  test('a finding of another severity is neither an error nor a warning', () => {
    expect(
      countBySeverity([
        finding('UNREACHABLE_NODE', 'warning'),
        finding('SOMETHING', 'info'),
      ])
    ).toEqual({ errors: 0, warnings: 1 });
  });

  test.each([
    [{ errors: 1, warnings: 0 }, '1 error'],
    [{ errors: 2, warnings: 0 }, '2 errors'],
    [{ errors: 0, warnings: 1 }, '1 warning'],
    [{ errors: 0, warnings: 3 }, '3 warnings'],
    [{ errors: 1, warnings: 1 }, '1 error and 1 warning'],
    [{ errors: 2, warnings: 5 }, '2 errors and 5 warnings'],
    [{ errors: 0, warnings: 0 }, ''],
  ])('%j is written as "%s"', (counts, text) => {
    expect(describeCounts(counts)).toBe(text);
  });
});

describe('journeyHeading', () => {
  test('names the counts and the journey', () => {
    expect(journeyHeading('login', { errors: 1, warnings: 1 }, false)).toBe(
      '1 error and 1 warning in journey login'
    );
  });

  test('says in strict mode that warnings alone fail the journey', () => {
    expect(journeyHeading('login', { errors: 0, warnings: 1 }, true)).toBe(
      '1 warning in journey login (strict mode treats warnings as errors)'
    );
  });

  test('says nothing of strict mode when the journey has an error anyway, or when it is not strict', () => {
    expect(journeyHeading('login', { errors: 1, warnings: 1 }, true)).toBe(
      '1 error and 1 warning in journey login'
    );
    expect(journeyHeading('login', { errors: 0, warnings: 2 }, false)).toBe(
      '2 warnings in journey login'
    );
  });
});

describe('tallyByCode', () => {
  test('counts the findings of each code, the most frequent first and then by code', () => {
    const tally = tallyByCode([
      finding('UNREACHABLE_NODE', 'warning', 'a'),
      finding('MISSING_INNER_NODE', 'error', 'b'),
      finding('UNREACHABLE_NODE', 'warning', 'b'),
      finding('UNCONNECTED_OUTCOME', 'warning', 'a'),
      finding('UNREACHABLE_NODE', 'warning', 'c'),
      finding('MISSING_INNER_NODE', 'error', 'c'),
    ]);

    expect(tally.map(({ code, count }) => [code, count])).toEqual([
      ['UNREACHABLE_NODE', 3],
      ['MISSING_INNER_NODE', 2],
      ['UNCONNECTED_OUTCOME', 1],
    ]);
  });

  test('keeps the severities of one code apart', () => {
    const [entry] = tallyByCode([
      finding('SOME_CODE', 'error'),
      finding('SOME_CODE', 'warning'),
      finding('SOME_CODE', 'warning'),
    ]);

    expect(entry).toMatchObject({
      code: 'SOME_CODE',
      count: 3,
      errors: 1,
      warnings: 2,
    });
  });
});

describe('summaryLines', () => {
  const findings = [
    finding('UNREACHABLE_NODE', 'warning', 'a'),
    finding('UNREACHABLE_NODE', 'warning', 'b'),
    finding('MISSING_INNER_NODE', 'error', 'b'),
  ];

  test('says how many journeys were checked, how many have findings and how many findings of each code there are', () => {
    expect(summaryLines({ checked: 5, findings })).toEqual([
      'Checked 5 journeys, 2 with findings: 1 error and 2 warnings.',
      '  UNREACHABLE_NODE: 2 warnings',
      '  MISSING_INNER_NODE: 1 error',
    ]);
  });

  test('counts a journey once however many findings it has', () => {
    const [first] = summaryLines({
      checked: 3,
      findings: [
        finding('UNREACHABLE_NODE', 'warning', 'a'),
        finding('UNCONNECTED_OUTCOME', 'warning', 'a'),
        finding('UNREACHABLE_NODE', 'warning', 'a'),
      ],
    });

    expect(first).toBe('Checked 3 journeys, 1 with findings: 3 warnings.');
  });

  test('says one journey in the singular', () => {
    expect(
      summaryLines({
        checked: 1,
        findings: [finding('UNREACHABLE_NODE', 'warning')],
      })[0]
    ).toBe('Checked 1 journey, 1 with findings: 1 warning.');
  });

  test('has one line for each code and the codes the findings have', () => {
    expect(summaryLines({ checked: 5, findings })).toHaveLength(3);
    expect(summaryLines({ checked: 5, findings: [] })).toEqual([]);
  });
});

describe('hintsFor', () => {
  test('gives no hint for findings that need none', () => {
    expect(
      hintsFor(['MISSING_ENTRY_NODE', 'UNCONNECTED_OUTCOME'], true)
    ).toEqual([]);
    expect(hintsFor([], true)).toEqual([]);
  });

  test('gives the hint for nodes that are not there once, whichever of the two codes (or both) are found', () => {
    expect(hintsFor(['MISSING_INNER_NODE'], true)).toEqual([
      missingNodesHint(true),
    ]);
    expect(hintsFor(['MISSING_NODE_DEFINITION'], true)).toEqual([
      missingNodesHint(true),
    ]);
    expect(
      hintsFor(
        ['MISSING_NODE_DEFINITION', 'MISSING_INNER_NODE', 'MISSING_INNER_NODE'],
        false
      )
    ).toEqual([missingNodesHint(false)]);
  });

  test('gives the hint for unreachable nodes once', () => {
    expect(hintsFor(['UNREACHABLE_NODE', 'UNREACHABLE_NODE'], true)).toEqual([
      UNREACHABLE_NODES_HINT,
    ]);
    expect(hintsFor(['UNREACHABLE_NODE'], false)).toEqual([
      UNREACHABLE_NODES_HINT,
    ]);
  });

  test('gives the hints in a fixed order, whatever the order of the findings', () => {
    expect(hintsFor(['UNREACHABLE_NODE', 'MISSING_INNER_NODE'], true)).toEqual(
      hintsFor(['MISSING_INNER_NODE', 'UNREACHABLE_NODE'], true)
    );
    expect(hintsFor(['UNREACHABLE_NODE', 'MISSING_INNER_NODE'], true)).toEqual([
      missingNodesHint(true),
      UNREACHABLE_NODES_HINT,
    ]);
  });

  test('every hint is one line, and says what to do', () => {
    for (const hint of [
      missingNodesHint(true),
      missingNodesHint(false),
      UNREACHABLE_NODES_HINT,
    ]) {
      expect(hint).not.toContain('\n');
    }
    expect(UNREACHABLE_NODES_HINT).toContain('journey editor');
  });
});
