/**
 * Usage examples that break a rule of UsageExampleOperands.test.js and have
 * not been fixed yet. Used only by that test.
 *
 * This list only ever shrinks:
 * - NEVER add an example here. Fix the example: it must run as written and
 *   must not open an interactive mode (see
 *   .github/instructions/cli-commands.instructions.md).
 * - When you fix an example listed here, delete its entry. The test fails
 *   until you do, so the list cannot go stale.
 *
 * `example` is the command line exactly as `-hhh` prints it; `rule` is the
 * rule it breaks (the test says what each rule means).
 */
export const LEGACY_EXAMPLE_VIOLATIONS = [
  {
    example: 'frodo app export -f ./allMyApplications.application.json matrix',
    rule: 'one-of-missing',
    reason:
      '`-f` alone does not select an application any more (requireOneOf: -a, -A, -i, -n), so a terminal opens the options editor. The sentence above it says "first application"; decide what the example should show.',
  },
  {
    example: 'frodo config export -sxAND . matrix',
    rule: 'unknown-option',
    reason:
      '`-s` is not an option of `config export` (commander rejects it). The note above the example still explains `-s`; decide what the example should show.',
  },
];
