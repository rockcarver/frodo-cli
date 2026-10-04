import {
  theme as libTheme,
  resolveThemeMode,
  state,
  type Intent as LibIntent,
} from '@rockcarver/frodo-lib';
import c from 'tinyrainbow';

/**
 * frodo-cli's own semantic intents, layered on top of frodo-lib's base set
 * (`error`, `warning`, `command`, `emphasis`) with the CLI-specific roles
 * the call-site audit surfaced:
 * - `heading` -- section/table-column labels. Always bold (unlike a hue,
 *   weight has no background-contrast concern), *plus* a hue: `blueBright`
 *   on dark, `magentaBright` on light. Both compute below the normal-text
 *   4.5:1 AA floor (4.43:1 and 3.14:1 respectively) but clear WCAG's own
 *   3:1 large-text/bold threshold -- headings are always bold, so they're
 *   entitled to that lower bar. Picked specifically because they're
 *   visually distinct from a plain, unstyled foreground: `whiteBright` was
 *   tried first and technically passed AA (21:1 on black), but most
 *   dark-terminal profiles already default their unstyled foreground to
 *   white/near-white, so bold+whiteBright rendered indistinguishably from
 *   plain bold text -- a color choice that passes contrast math but fails
 *   the actual point of adding a color.
 * - `positive` -- status values that are good/active/enabled/true-in-a-
 *   good-sense.
 * - `negative` -- status values that are bad/inactive/disabled/false-in-a-
 *   bad-sense. Distinct from frodo-lib's `error`, which reports that an
 *   operation actually failed -- a `disabled: true` field in a describe
 *   table isn't an error, so it shouldn't have to borrow that intent's
 *   name to get colored. On the strict `dark`/`light` themes, which have
 *   no spare AA-clean hue left, `negative` resolves to the same color as
 *   `error` (same "two intents, one color" reasoning already accepted
 *   below for `error` itself), but themes with more room can give it a
 *   genuinely distinct hue.
 * - `muted` -- table borders and other secondary decoration/text that's
 *   deliberately meant to look quiet -- not a status value at all (see
 *   `negative` above for status values that read as "off").
 * - `debug` -- frodo-cli's own debug-output type, distinct from `command`.
 *
 * This is the only file in frodo-cli allowed to reference `tinyrainbow`
 * directly (enforced by an ESLint rule), same as before.
 */
export type CliIntent =
  LibIntent | 'heading' | 'positive' | 'negative' | 'muted' | 'debug';

// `unknown` input, matching frodo-lib's base theme and tinyrainbow's own
// `Formatter` type -- callers routinely color values whose static type is
// wider than `string` (e.g. a status field typed as `string | number | ...`).
type CliOnlyColors = Record<
  'heading' | 'positive' | 'negative' | 'muted' | 'debug',
  (text: unknown) => string
>;

// Genuinely no color -- distinct from simply omitting an intent from a
// theme file's `colors` map, which falls through to that intent's
// dark/light default instead (untested against a background that isn't
// dark or light). Needed for a background this constrained: on `blue`'s
// high-contrast tier, only one hue clears strict AA at all, and forcing a
// second, semantically-wrong hue (or silently inheriting `light`'s
// defaults, unvalidated against blue) is worse than plain text.
const plain = (text: unknown) => String(text);

/**
 * Built the same way as frodo-lib's base palette -- via
 * TerminalContrastFilter's objective WCAG contrast check, not by eye. Every
 * dark-background color here clears 4.5:1 (WCAG AA normal text) against
 * black.
 */
// `heading`'s bold weight is applied unconditionally by its getter below,
// not baked into this hue function -- that keeps "heading is always bold"
// true even when a custom theme file supplies its own hue for `heading`
// via a plain, unwrapped hue name (see `HUE_NAME_TO_FUNCTION`).
const DARK_ADDITIONS: CliOnlyColors = {
  heading: c.blueBright,
  positive: c.greenBright,
  negative: c.redBright,
  muted: c.blackBright,
  debug: c.white,
};

/**
 * Same objective process for the light background -- and it runs into the
 * same scarcity frodo-lib's base palette did: only 5 of the 16 standard
 * ANSI colors clear 4.5:1 (normal-text AA) against white at all, and
 * frodo-lib's base theme already spends all 5 on
 * `error`/`warning`/`command`/`emphasis`. There is no 6th distinct
 * normal-text-AA color left, so `positive` falls back to plain (unstyled)
 * text rather than reusing another intent's color and risking a misleading
 * visual association. `heading` doesn't need the full 4.5:1 bar, though --
 * it's always bold, so WCAG's looser 3:1 large-text threshold applies
 * instead, which `magentaBright` clears (3.14:1); it collides with
 * `debug`'s color below, accepted for the same reason `negative` colliding
 * with `error` is accepted -- a debug line and a table header don't
 * practically co-occur. `muted`, `debug`, and `negative` are all checked
 * against that same looser 3:1 threshold -- appropriate, since none of
 * them is meant to be primary reading content on its own -- which
 * `blackBright` (gray), `magentaBright`, and `red` (4.00:1, actually
 * clears even the normal-text bar, but reused here to mirror `error`
 * exactly rather than introduce a distinct hue with no room to spare)
 * clear.
 */
const LIGHT_ADDITIONS: CliOnlyColors = {
  heading: c.magentaBright,
  positive: plain,
  negative: c.red,
  muted: c.blackBright,
  debug: c.magentaBright,
};

const CLI_ADDITIONS: Record<'dark' | 'light', CliOnlyColors> = {
  dark: DARK_ADDITIONS,
  light: LIGHT_ADDITIONS,
};

type CliThemeApi = Record<CliIntent, (text: unknown) => string> &
  ((strings: TemplateStringsArray, ...values: unknown[]) => string);

/**
 * Every named ANSI color a custom theme file (see `ThemeConfig.ts`) can
 * reference by name. Exported so `ThemeConfig.ts` can validate a theme
 * file's `colors` mapping without itself needing to import `tinyrainbow`.
 */
export const HUE_NAME_TO_FUNCTION: Record<string, (text: unknown) => string> = {
  black: c.black,
  red: c.red,
  green: c.green,
  yellow: c.yellow,
  blue: c.blue,
  magenta: c.magenta,
  cyan: c.cyan,
  white: c.white,
  blackBright: c.blackBright,
  redBright: c.redBright,
  greenBright: c.greenBright,
  yellowBright: c.yellowBright,
  blueBright: c.blueBright,
  magentaBright: c.magentaBright,
  cyanBright: c.cyanBright,
  whiteBright: c.whiteBright,
  bold: c.bold,
  dim: c.dim,
  none: plain,
};

// A custom theme's per-intent color overrides, applied on top of the
// resolved base (dark/light) theme -- set once at startup via
// `applyCustomThemeOverrides` (see `app.ts`/`shell.ts`, fed by
// `ThemeConfig.getActiveThemeDefinition()`), consulted by every getter
// below before falling through to the base/CLI-default color. A custom
// theme therefore only needs to specify the intents it wants to change.
let customOverrides: Partial<Record<CliIntent, (text: unknown) => string>> = {};

export function applyCustomThemeOverrides(
  colors: Partial<Record<CliIntent, string>>
): void {
  customOverrides = {};
  for (const [intent, hueName] of Object.entries(colors)) {
    const fn = HUE_NAME_TO_FUNCTION[hueName];
    if (fn) customOverrides[intent as CliIntent] = fn;
  }
}

function currentCliAdditions(): CliOnlyColors {
  return CLI_ADDITIONS[resolveThemeMode(state)];
}

/**
 * The CLI's theme API -- frodo-lib's base intents plus this file's own
 * additions, all resolved against the CLI process's single `state`
 * instance. Deliberately does not expose raw `tinyrainbow` hue methods,
 * same reasoning as frodo-lib's `ColorTheme.ts`. The tagged-template form
 * delegates to frodo-lib's parser for `{name ...}` blocks, which only
 * knows the base intents -- CLI-only intents used inline in a message
 * should use the function-call form (`c.heading(...)`) instead.
 */
const themeTag = (strings: TemplateStringsArray, ...values: unknown[]) =>
  libTheme(state)(strings, ...values);

// Object.assign would invoke these getters immediately and copy the
// resulting *value* instead of the getter, freezing the theme at module
// load time -- defineProperties keeps them live, re-resolved on every read
// (matching frodo-lib's own ColorTheme.ts, which has the same requirement).
function intent(
  name: CliIntent,
  fallback: () => (text: unknown) => string
): { get: () => (text: unknown) => string; enumerable: true } {
  return { get: () => customOverrides[name] ?? fallback(), enumerable: true };
}

// `heading` is always bold, regardless of whether its hue comes from the
// built-in fallback or a custom theme file's override -- a theme only ever
// supplies the hue (see DARK_ADDITIONS/LIGHT_ADDITIONS above and
// HUE_NAME_TO_FUNCTION), never the weight, so this can't be expressed via
// the generic `intent()` helper, which would let an override silently drop
// the bold wrapping.
function boldHeadingIntent(): {
  get: () => (text: unknown) => string;
  enumerable: true;
} {
  return {
    get: () => {
      const hue = customOverrides.heading ?? currentCliAdditions().heading;
      return (text: unknown) => c.bold(hue(text));
    },
    enumerable: true,
  };
}

const theme = themeTag as CliThemeApi;
Object.defineProperties(theme, {
  error: intent('error', () => libTheme(state).error),
  warning: intent('warning', () => libTheme(state).warning),
  command: intent('command', () => libTheme(state).command),
  emphasis: intent('emphasis', () => libTheme(state).emphasis),
  heading: boldHeadingIntent(),
  positive: intent('positive', () => currentCliAdditions().positive),
  negative: intent('negative', () => currentCliAdditions().negative),
  muted: intent('muted', () => currentCliAdditions().muted),
  debug: intent('debug', () => currentCliAdditions().debug),
});

export default theme;
