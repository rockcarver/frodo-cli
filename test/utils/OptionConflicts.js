import { getOneOfGroups } from '../../src/cli/ResolveInteractiveInputs.ts';

/**
 * Checks one command's `.conflicts()` declarations against its option
 * requirements (requireOneOf, requireAllOf, makeOptionMandatory) and returns
 * the violations (empty when the command is sound).
 *
 * Commander checks conflicts at parse time, before the requirement groups are
 * evaluated, so a conflict can make a requirement unsatisfiable: if `-a`
 * conflicts with a forced `-i`, no invocation can ever use `-a`. The rules:
 *
 * - dangling-conflict: `.conflicts('x')` must name the attribute name of an
 *   option of the same command. The attribute name of a negatable `--no-x`
 *   option is `x`, not `noX`; a name that matches nothing never fires.
 * - unknown-group-member: a requireOneOf / requireAllOf member must be an
 *   option of the command.
 * - forced-conflict: options that must all be present (requireAllOf members,
 *   mandatory options) must not conflict with each other.
 * - unusable-option: every option must be usable in at least one valid
 *   invocation, that is one that satisfies every requireOneOf group and
 *   requireAllOf group, honours every mandatory option and trips no conflict.
 *   This covers a requireOneOf member that a conflict makes unselectable and
 *   an option that conflicts with a forced one.
 * - unsatisfiable: some valid invocation must exist at all.
 *
 * A conflict is symmetric: commander raises it when either side declares it.
 */
export function conflictViolations(command) {
  const violations = [];
  const options = command.options;
  const attrs = new Set(options.map((option) => option.attributeName()));
  const flagsOf = new Map(
    options.map((option) => [option.attributeName(), option.flags])
  );

  const edges = new Set();
  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const option of options) {
    for (const target of option.conflictsWith ?? []) {
      if (!attrs.has(target)) {
        violations.push({
          rule: 'dangling-conflict',
          message: `'${option.flags}' declares .conflicts('${target}'), which is not an option of this command (a negatable --no-x option has the attribute name 'x', not 'noX').`,
        });
      } else {
        edges.add(key(option.attributeName(), target));
      }
    }
  }
  const conflicts = (a, b) => edges.has(key(a, b));

  const groups = getOneOfGroups(command);
  for (const group of groups) {
    for (const member of group.options) {
      if (!attrs.has(member)) {
        violations.push({
          rule: 'unknown-group-member',
          message: `${group.all ? 'requireAllOf' : 'requireOneOf'} lists '${member}', which is not an option of this command.`,
        });
      }
    }
  }

  const forced = new Set(
    options.filter((option) => option.mandatory).map((o) => o.attributeName())
  );
  for (const group of groups.filter((g) => g.all)) {
    group.options.filter((m) => attrs.has(m)).forEach((m) => forced.add(m));
  }
  const oneOfGroups = groups.filter((g) => !g.all);

  const forcedList = [...forced];
  for (let i = 0; i < forcedList.length; i++) {
    for (let j = i + 1; j < forcedList.length; j++) {
      if (conflicts(forcedList[i], forcedList[j])) {
        violations.push({
          rule: 'forced-conflict',
          message: `'${flagsOf.get(forcedList[i])}' and '${flagsOf.get(forcedList[j])}' must both be present (requireAllOf / mandatory) but conflict.`,
        });
      }
    }
  }

  /** Whether a conflict-free invocation exists that includes `base` and satisfies every requireOneOf group. */
  const satisfiable = (base) => {
    const clashes = (current, candidate) =>
      [...current].some((x) => x !== candidate && conflicts(candidate, x));
    for (const x of base) if (clashes(base, x)) return false;
    const search = (index, current) => {
      if (index === oneOfGroups.length) return true;
      const members = oneOfGroups[index].options.filter((m) => attrs.has(m));
      if (members.some((m) => current.has(m)))
        return search(index + 1, current);
      return members.some(
        (m) =>
          !clashes(current, m) && search(index + 1, new Set(current).add(m))
      );
    };
    return search(0, new Set(base));
  };

  if (!satisfiable(forced)) {
    violations.push({
      rule: 'unsatisfiable',
      message:
        'no conflict-free invocation satisfies every requireOneOf / requireAllOf / mandatory requirement.',
    });
  } else {
    for (const option of options) {
      const attr = option.attributeName();
      if (forced.has(attr)) continue;
      if (!satisfiable(new Set([...forced, attr]))) {
        const blockers = [...forced].filter((f) => conflicts(attr, f));
        violations.push({
          rule: 'unusable-option',
          message:
            `'${option.flags}' can never be part of a valid invocation` +
            (blockers.length
              ? ` (it conflicts with required ${blockers.map((b) => `'${flagsOf.get(b)}'`).join(', ')}).`
              : ' (every way to satisfy the requireOneOf groups conflicts with it).'),
        });
      }
    }
  }
  return violations;
}
