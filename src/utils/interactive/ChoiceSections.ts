/**
 * The grouped editor's row model: how a multiselect's flat choice list
 * becomes collapsible sections. Pure and zero-import -- the same
 * discipline as EditableOptions/NavigationMenu -- so the shape (what is
 * visible, what is folded, what a header advertises) is unit-testable
 * without rendering a prompt, and the prompt module only draws what
 * this computes.
 *
 * The model (user decision 2026-10-13): the command's own options
 * (choices without a `group`) always render flat at the top; every
 * shared group renders as one HEADER row, expanded or collapsed --
 * `[space]` on the header toggles it in place. Typing a filter
 * flattens the list to the cross-group name matches (headers drop
 * out): type-to-find must reach into collapsed groups.
 */

/** A choice that may fold under a collapsible group. */
export type SectionChoice<Value> = {
  value: Value;
  name: string;
  description?: string;
  /** The group id this choice belongs to; absent = the command's own. */
  group?: string;
};

/** One collapsible section (from EditableOptions' group helpers). */
export type SectionGroup = {
  /** The help-group heading this section folds (the grouping key). */
  id: string;
  /** The header label, e.g. 'Connection options'. */
  label: string;
};

/** One renderable row: a header, or a choice under one. */
export type SectionRow<Value> =
  | { kind: 'choice'; choice: SectionChoice<Value>; indent: boolean }
  | {
      kind: 'header';
      group: SectionGroup;
      /** Choices in the group (the header's always-shown count). */
      count: number;
      /** How many of them are marked (shown on a collapsed header). */
      selectedCount: number;
      expanded: boolean;
    };

/**
 * Builds the rows the prompt renders. With a query: the flat
 * case-insensitive name matches across ALL choices, no headers,
 * unindented (the pre-grouping behavior -- nothing hides from
 * type-to-find). Without: own choices, then per group (config order)
 * its header, and its choices -- indented -- only while expanded.
 * Empty groups never render.
 *
 * `groups` omitted/empty keeps the exact pre-grouping behavior for
 * every caller that has not adopted sections (choice `group` ids are
 * then ignored): one flat list.
 */
export function buildSectionRows<Value>(options: {
  choices: SectionChoice<Value>[];
  groups?: SectionGroup[];
  expanded: ReadonlySet<string>;
  query?: string;
  selected?: ReadonlySet<Value>;
}): SectionRow<Value>[] {
  const { choices, selected } = options;
  const query = options.query ?? '';
  if (query.length > 0) {
    const needle = query.toLowerCase();
    return choices
      .filter((choice) => choice.name.toLowerCase().includes(needle))
      .map((choice) => ({ kind: 'choice' as const, choice, indent: false }));
  }
  const groups = options.groups ?? [];
  if (groups.length === 0) {
    // No sections adopted: flat list, every choice a top-level row.
    return choices.map((choice) => ({
      kind: 'choice' as const,
      choice,
      indent: false,
    }));
  }
  // Section order: the config's, then any group ids the choices carry
  // that the config missed (defensive -- a choice must never vanish
  // because its group id fell out of the config), alphabetically.
  const known = new Set(groups.map((group) => group.id));
  const extra = [
    ...new Set(
      choices
        .map((choice) => choice.group)
        .filter(
          (group): group is string => group !== undefined && !known.has(group)
        )
    ),
  ].sort((a, b) => a.localeCompare(b));
  const ordered: SectionGroup[] = [
    ...groups,
    ...extra.map((id) => ({ id, label: id })),
  ];

  const byGroup = new Map<string, SectionChoice<Value>[]>();
  const own: SectionChoice<Value>[] = [];
  for (const choice of choices) {
    if (choice.group === undefined) own.push(choice);
    else {
      const bucket = byGroup.get(choice.group);
      if (bucket) bucket.push(choice);
      else byGroup.set(choice.group, [choice]);
    }
  }

  const rows: SectionRow<Value>[] = own.map((choice) => ({
    kind: 'choice' as const,
    choice,
    indent: false,
  }));
  for (const group of ordered) {
    const members = byGroup.get(group.id);
    if (!members || members.length === 0) continue; // empty group: silence
    const expanded = options.expanded.has(group.id);
    rows.push({
      kind: 'header',
      group,
      count: members.length,
      selectedCount: selected
        ? members.filter((choice) => selected.has(choice.value)).length
        : 0,
      expanded,
    });
    if (expanded) {
      for (const choice of members) {
        rows.push({ kind: 'choice', choice, indent: true });
      }
    }
  }
  return rows;
}

/**
 * The groups that start EXPANDED: every group holding a choice the
 * user has already set (the editor's `defaultValues` -- CLI/env/saved
 * default/previous commit). State must never hide behind a collapsed
 * header; own options need no expansion.
 */
export function initialExpanded<Value>(
  groups: SectionGroup[],
  choices: SectionChoice<Value>[],
  defaultValues: ReadonlyArray<Value>
): Set<string> {
  const valued = new Set(defaultValues);
  const expanded = new Set<string>();
  for (const choice of choices) {
    if (choice.group !== undefined && valued.has(choice.value)) {
      expanded.add(choice.group);
    }
  }
  // Only group ids the config actually knows -- an unknown id would
  // render no header to collapse again.
  const known = new Set(groups.map((group) => group.id));
  return new Set([...expanded].filter((id) => known.has(id)));
}

/** The row index of the choice with this value (-1 when absent). */
export function rowIndexOf<Value>(
  rows: SectionRow<Value>[],
  value: Value
): number {
  return rows.findIndex(
    (row) => row.kind === 'choice' && row.choice.value === value
  );
}
