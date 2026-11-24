import {
  countBySeverity,
  describeCounts,
  findingLine,
  hintsFor,
  journeyHeading,
  missingNodesHint,
  summaryLines,
  tallyByCode,
  unreachableNodesHint,
} from '../../src/ops/utils/JourneyFindingLabels.ts';

// The words of the output of `journey validate`: one line for a finding, one
// heading for a journey, one summary for the run, one hint for each finding
// code that has advice. Pure functions: no library, no console.

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
      finding('UNREACHABLE_NODE', 'warning', 'b'),
      finding('UNCONNECTED_OUTCOME', 'warning', 'a'),
      finding('UNREACHABLE_NODE', 'warning', 'c'),
      finding('UNCONNECTED_OUTCOME', 'warning', 'c'),
      finding('NO_REACHABLE_TERMINAL', 'warning', 'c'),
    ]);

    expect(tally.map(({ code, count }) => [code, count])).toEqual([
      ['UNREACHABLE_NODE', 3],
      ['UNCONNECTED_OUTCOME', 2],
      ['NO_REACHABLE_TERMINAL', 1],
    ]);
  });

  test('puts codes with the same error status and the same count in the order of the code, whatever the order of the findings', () => {
    const inOrder = [
      finding('NO_REACHABLE_TERMINAL', 'warning', 'a'),
      finding('UNCONNECTED_OUTCOME', 'warning', 'a'),
      finding('UNREACHABLE_NODE', 'warning', 'a'),
      finding('MISSING_INNER_NODE', 'error', 'a'),
      finding('MISSING_CONNECTION_TARGET', 'error', 'a'),
    ];
    const expected = [
      'MISSING_CONNECTION_TARGET',
      'MISSING_INNER_NODE',
      'NO_REACHABLE_TERMINAL',
      'UNCONNECTED_OUTCOME',
      'UNREACHABLE_NODE',
    ];

    expect(tallyByCode(inOrder).map(({ code }) => code)).toEqual(expected);
    expect(tallyByCode([...inOrder].reverse()).map(({ code }) => code)).toEqual(
      expected
    );
  });

  test('puts the codes that have errors first, however few errors there are, then the rest by count', () => {
    const tally = tallyByCode([
      finding('UNREACHABLE_NODE', 'warning', 'a'),
      finding('UNREACHABLE_NODE', 'warning', 'b'),
      finding('UNREACHABLE_NODE', 'warning', 'c'),
      finding('UNCONNECTED_OUTCOME', 'warning', 'a'),
      finding('UNCONNECTED_OUTCOME', 'warning', 'b'),
      finding('MISSING_ENTRY_NODE', 'error', 'c'),
      finding('MISSING_INNER_NODE', 'error', 'a'),
      finding('MISSING_INNER_NODE', 'error', 'b'),
      finding('NO_REACHABLE_TERMINAL', 'warning', 'c'),
    ]);

    expect(tally.map(({ code }) => code)).toEqual([
      'MISSING_INNER_NODE',
      'MISSING_ENTRY_NODE',
      'UNREACHABLE_NODE',
      'UNCONNECTED_OUTCOME',
      'NO_REACHABLE_TERMINAL',
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

  test('says how many journeys were checked, how many have findings and how many findings of each code there are, the code with an error first', () => {
    expect(summaryLines({ checked: 5, total: 5, findings })).toEqual([
      'Checked 5 journeys, 2 with findings: 1 error and 2 warnings.',
      '  MISSING_INNER_NODE: 1 error',
      '  UNREACHABLE_NODE: 2 warnings',
    ]);
  });

  test('says how many of the journeys could be checked when some could not', () => {
    expect(summaryLines({ checked: 20, total: 21, findings })[0]).toBe(
      'Checked 20 of 21 journeys, 2 with findings: 1 error and 2 warnings.'
    );
    expect(summaryLines({ checked: 1, total: 2, findings })[0]).toBe(
      'Checked 1 of 2 journeys, 2 with findings: 1 error and 2 warnings.'
    );
  });

  test('counts a journey once however many findings it has', () => {
    const [first] = summaryLines({
      checked: 3,
      total: 3,
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
        total: 1,
        findings: [finding('UNREACHABLE_NODE', 'warning')],
      })[0]
    ).toBe('Checked 1 journey, 1 with findings: 1 warning.');
  });

  test('has one line for each code and the codes the findings have', () => {
    expect(summaryLines({ checked: 5, total: 5, findings })).toHaveLength(3);
    expect(summaryLines({ checked: 5, total: 5, findings: [] })).toEqual([]);
  });
});

describe('hintsFor', () => {
  const missingEntry = (journeyId) =>
    finding('MISSING_ENTRY_NODE', 'error', journeyId);
  const unreachable = (journeyId) =>
    finding('UNREACHABLE_NODE', 'warning', journeyId);
  const missingInner = (journeyId) =>
    finding('MISSING_INNER_NODE', 'error', journeyId);

  test('gives no hint for findings that need none', () => {
    expect(
      hintsFor(
        [missingEntry('a'), finding('UNCONNECTED_OUTCOME', 'warning', 'a')],
        true
      )
    ).toEqual([]);
    expect(hintsFor([], true)).toEqual([]);
  });

  test('gives the hint for nodes that are not there once, whichever of the two codes (or both) are found', () => {
    expect(hintsFor([missingInner('a')], true)).toEqual([
      missingNodesHint(true),
    ]);
    expect(
      hintsFor([finding('MISSING_NODE_DEFINITION', 'error', 'a')], true)
    ).toEqual([missingNodesHint(true)]);
    expect(
      hintsFor(
        [
          finding('MISSING_NODE_DEFINITION', 'error', 'a'),
          missingInner('a'),
          missingInner('b'),
        ],
        false
      )
    ).toEqual([missingNodesHint(false)]);
  });

  test('gives the hint for unreachable nodes once, in the words of where the journeys are', () => {
    expect(hintsFor([unreachable('a'), unreachable('b')], true)).toEqual([
      'Journeys with UNREACHABLE_NODE have nodes that cannot be reached from the entry node. Connect them or delete them in the journey editor.',
    ]);
    expect(hintsFor([unreachable('a'), unreachable('b')], false)).toEqual([
      'Journeys with UNREACHABLE_NODE have nodes that cannot be reached from the entry node. Connect them or delete them on the tenant and export the journeys again.',
    ]);
  });

  test('names the code that it is about, so that it still says what it points at after a run over a realm', () => {
    expect(unreachableNodesHint(true, false)).toContain('UNREACHABLE_NODE');
    expect(unreachableNodesHint(false, false)).toContain('UNREACHABLE_NODE');
  });

  test('says to repair the entry node first when a journey that has unreachable nodes has no entry node', () => {
    const repairFirst =
      ' In a journey that also has MISSING_ENTRY_NODE, repair the entry node first: until then every node of it is unreachable.';

    expect(hintsFor([unreachable('a'), missingEntry('a')], true)).toEqual([
      'Journeys with UNREACHABLE_NODE have nodes that cannot be reached from the entry node. Connect them or delete them in the journey editor.' +
        repairFirst,
    ]);
    expect(hintsFor([unreachable('a'), missingEntry('a')], false)).toEqual([
      'Journeys with UNREACHABLE_NODE have nodes that cannot be reached from the entry node. Connect them or delete them on the tenant and export the journeys again.' +
        repairFirst,
    ]);
  });

  test('says nothing of the entry node when the journey without one is another journey than the one with unreachable nodes', () => {
    expect(hintsFor([unreachable('a'), missingEntry('b')], true)).toEqual([
      unreachableNodesHint(true, false),
    ]);
    expect(unreachableNodesHint(true, false)).not.toContain(
      'MISSING_ENTRY_NODE'
    );
  });

  test('gives the hints in a fixed order, whatever the order of the findings', () => {
    const findings = [unreachable('a'), missingInner('b')];

    expect(hintsFor(findings, true)).toEqual(
      hintsFor([...findings].reverse(), true)
    );
    expect(hintsFor(findings, true)).toEqual([
      missingNodesHint(true),
      unreachableNodesHint(true, false),
    ]);
  });

  test('every hint is one line', () => {
    for (const hint of [
      missingNodesHint(true),
      missingNodesHint(false),
      unreachableNodesHint(true, false),
      unreachableNodesHint(false, true),
    ]) {
      expect(hint).not.toContain('\n');
    }
  });
});
