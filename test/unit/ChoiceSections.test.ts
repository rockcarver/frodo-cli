import { describe, expect, it } from '@jest/globals';
import {
  buildSectionRows,
  initialExpanded,
  rowIndexOf,
  type SectionChoice,
} from '../../src/utils/interactive/ChoiceSections';

/**
 * The grouped editor's row model (pure): own options flat, shared
 * groups behind collapsible headers, filters flatten, selection
 * auto-expands (the auto-expand itself lives in the prompt -- the model
 * just takes the expanded set).
 */
describe('buildSectionRows', () => {
  type C = SectionChoice<string>;
  const own = (value: string): C => ({ value, name: `--${value}` });
  const grouped = (value: string, group: string): C => ({
    value,
    name: `--${value}`,
    group,
  });
  const GROUPS = [
    { id: 'Authentication Options:', label: 'Authentication options' },
    { id: 'Connection Options:', label: 'Connection options' },
  ];

  it('no groups configured: the pre-grouping flat list', () => {
    const rows = buildSectionRows({
      choices: [own('a'), own('b')],
      expanded: new Set(),
    });
    expect(rows.map((row) => row.kind)).toEqual(['choice', 'choice']);
    expect(rows.every((row) => row.kind !== 'choice' || !row.indent)).toBe(
      true
    );
  });

  it('own choices first, then collapsed headers with counts', () => {
    const rows = buildSectionRows({
      choices: [
        own('long'),
        grouped('host', 'Connection Options:'),
        grouped('user', 'Authentication Options:'),
        grouped('pass', 'Authentication Options:'),
      ],
      groups: GROUPS,
      expanded: new Set(),
    });
    expect(
      rows.map((row) =>
        row.kind === 'header'
          ? `H ${row.group.label} (${row.count})`
          : row.choice.value
      )
    ).toEqual([
      'long',
      'H Authentication options (2)',
      'H Connection options (1)',
    ]);
    // A collapsed group renders no children.
    expect(rows.filter((row) => row.kind === 'choice')).toHaveLength(1);
  });

  it('expanded groups render their children indented, after the header', () => {
    const rows = buildSectionRows({
      choices: [
        own('long'),
        grouped('user', 'Authentication Options:'),
        grouped('pass', 'Authentication Options:'),
      ],
      groups: GROUPS,
      expanded: new Set(['Authentication Options:']),
    });
    const shapes = rows.map((row) =>
      row.kind === 'header'
        ? `H ${row.group.label}`
        : `C ${row.choice.value}${row.indent ? ' (indent)' : ''}`
    );
    expect(shapes).toEqual([
      'C long',
      'H Authentication options',
      'C user (indent)',
      'C pass (indent)',
    ]);
  });

  it('empty groups never render; unknown choice group ids still render (defensive)', () => {
    const rows = buildSectionRows({
      choices: [own('long'), grouped('host', 'Mystery Options:')],
      groups: GROUPS, // 'Mystery' not configured
      expanded: new Set(),
    });
    const headers = rows
      .filter((row) => row.kind === 'header')
      .map((row) => (row.kind === 'header' ? row.group.id : ''));
    expect(headers).toEqual(['Mystery Options:']);
  });

  it('a query flattens: headerless name matches across groups, unindented', () => {
    const rows = buildSectionRows({
      choices: [
        own('long'),
        grouped('debug', 'Output Options:'),
        grouped('user', 'Authentication Options:'),
      ],
      groups: [...GROUPS, { id: 'Output Options:', label: 'Output options' }],
      expanded: new Set(),
      query: 'de',
    });
    expect(
      rows.map((row) => (row.kind === 'choice' ? row.choice.value : 'HEADER!'))
    ).toEqual(['debug']);
    expect(rows.every((row) => row.kind !== 'choice' || !row.indent)).toBe(
      true
    );
  });

  it('selectedCount counts marked members (collapsed badge input)', () => {
    const rows = buildSectionRows({
      choices: [
        grouped('debug', 'Output Options:'),
        grouped('verbose', 'Output Options:'),
      ],
      groups: [{ id: 'Output Options:', label: 'Output options' }],
      expanded: new Set(),
      selected: new Set(['debug']),
    });
    const header = rows[0];
    expect(header.kind).toBe('header');
    if (header.kind === 'header') expect(header.selectedCount).toBe(1);
  });

  it('rowIndexOf finds a choice row and skips headers', () => {
    const rows = buildSectionRows({
      choices: [
        own('long'),
        grouped('user', 'Authentication Options:'),
        grouped('pass', 'Authentication Options:'),
      ],
      groups: GROUPS,
      expanded: new Set(['Authentication Options:']),
    });
    expect(rowIndexOf(rows, 'pass')).toBe(3);
    expect(rowIndexOf(rows, 'host')).toBe(-1); // collapsed group: no row
  });
});

describe('initialExpanded', () => {
  const GROUPS = [
    { id: 'Output Options:', label: 'Output options' },
    { id: 'Runtime Options:', label: 'Runtime options' },
  ];

  it('expands exactly the groups holding a default value', () => {
    const expanded = initialExpanded(
      GROUPS,
      [
        { value: 'long', name: '--long' },
        { value: 'debug', name: '--debug', group: 'Output Options:' },
        { value: 'retry', name: '--retry', group: 'Runtime Options:' },
      ],
      ['debug']
    );
    expect([...expanded]).toEqual(['Output Options:']);
  });

  it('own-option defaults expand nothing; unknown group ids are dropped', () => {
    const expanded = initialExpanded(
      GROUPS,
      [
        { value: 'long', name: '--long' },
        { value: 'ghost', name: '--ghost', group: 'Ghost Options:' },
      ],
      ['long', 'ghost']
    );
    expect(expanded.size).toBe(0);
  });
});
