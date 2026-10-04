import fs from 'fs';
import path from 'path';
import {
  detectTerminalBackgroundRgb,
  FRODO_COLOR_THEME_ENV_KEY,
  matchBackgroundPreset,
  state,
  type BackgroundPreset,
} from '@rockcarver/frodo-lib';
import { applyCustomThemeOverrides, HUE_NAME_TO_FUNCTION } from './ColorTheme';
import { getConfigPath } from './Config';
import { printMessage } from './Console';

export const FRODO_THEME_ACTIVE_FILENAME = 'Theme.json';
export const FRODO_THEME_DEFINITIONS_DIRNAME = 'themes';

export type ThemeDefinition = {
  name: string;
  description: string;
  mode: 'dark' | 'light';
  colors: Record<string, string>;
};

/**
 * The two independent preferences a theme is built from.
 *
 * `Background` is frodo-cli's own concept -- which background color a
 * theme is tuned for (`dark`, `light`, and any number of specific hues
 * beyond that, like `blue`/`yellow`). It's deliberately a different idea
 * from frodo-lib's `mode`: frodo-lib only knows `'dark' | 'light'` (its
 * own small built-in palette, used by a handful of print calls inside
 * frodo-lib itself, e.g. `AuthenticateOps.ts`/`curlirize.ts`), so every
 * `Background` still carries a `mode` (see `ThemeDefinition` above) saying
 * which of frodo-lib's two palettes is the closer fit -- `blue` and
 * `yellow` both currently map to `mode: 'light'`. Widening frodo-lib's own
 * `mode` concept to match would be a change to that package's public API,
 * not something layered on from here.
 *
 * `ContrastTier` is how colorful a background's theme is willing to be:
 * `high-contrast` always clears strict WCAG AA (4.5:1 normal text / 3:1
 * bold), `regular` relaxes that floor for a more colorful (but still
 * reasonably legible) result, and `vibrant` goes further still, aiming to
 * be the most colorful option a background can support. Every background
 * gets all three -- see `themeName`/`parseThemeName` for how they combine
 * into one of the file names in `~/.frodo/themes/`.
 */
export type Background = 'dark' | 'light' | 'blue' | 'yellow';
export type ContrastTier = 'high-contrast' | 'regular' | 'vibrant';

export const BACKGROUNDS: Background[] = ['dark', 'light', 'blue', 'yellow'];
export const CONTRAST_TIERS: ContrastTier[] = [
  'high-contrast',
  'regular',
  'vibrant',
];

/**
 * The file/theme name for a (background, contrast) pair -- `high-contrast`
 * is unsuffixed (`dark`, `blue`, ...) since it's the baseline every
 * background starts from; `regular`/`vibrant` append their tier
 * (`dark-regular`, `blue-vibrant`, ...). Inverse of `parseThemeName`.
 */
export function themeName(
  background: Background,
  contrast: ContrastTier
): string {
  return contrast === 'high-contrast'
    ? background
    : `${background}-${contrast}`;
}

/**
 * Parses a theme name back into its (background, contrast) pair, or
 * `null` if it doesn't match the convention -- e.g. a hand-authored custom
 * theme with an arbitrary name. Inverse of `themeName`.
 */
export function parseThemeName(
  name: string
): { background: Background; contrast: ContrastTier } | null {
  for (const background of BACKGROUNDS) {
    for (const contrast of CONTRAST_TIERS) {
      if (themeName(background, contrast) === name)
        return { background, contrast };
    }
  }
  return null;
}

// Illustrative reference content only -- these are what gets written to
// disk so a user has a real, forkable starting point to copy and edit, not
// the live source of truth for the `dark`/`light` built-ins. Selecting
// `dark`/`light` always resolves via ColorTheme.ts's own code (guaranteed,
// via TerminalContrastFilter, to be readable), regardless of whether these
// files exist, were deleted, or were hand-edited -- only a *different*
// (genuinely custom) theme name is ever actually read from disk. This is
// the one asymmetry in an otherwise uniform (background, contrast) model:
// only `dark`/`light`'s high-contrast tier gets this "unbreakable"
// treatment, matching the two hardcoded defaults from before this session
// added any other backgrounds -- `blue`/`yellow` are fully file-driven at
// every tier, including their own high-contrast one.
const BUILT_IN_REFERENCE_DEFINITIONS: Record<
  'dark' | 'light',
  ThemeDefinition
> = {
  dark: {
    name: 'dark',
    description:
      'High-contrast, optimized for dark-background terminals. This file is a reference copy -- editing it has no effect; copy it to a new file with a different name to make a custom theme.',
    mode: 'dark',
    colors: {
      error: 'redBright',
      warning: 'yellowBright',
      command: 'cyanBright',
      emphasis: 'magentaBright',
      heading: 'blueBright',
      positive: 'greenBright',
      negative: 'redBright',
      muted: 'blackBright',
      debug: 'white',
    },
  },
  light: {
    name: 'light',
    description:
      'High-contrast, optimized for light-background terminals. This file is a reference copy -- editing it has no effect; copy it to a new file with a different name to make a custom theme.',
    mode: 'light',
    colors: {
      error: 'red',
      warning: 'magenta',
      command: 'blueBright',
      emphasis: 'blue',
      heading: 'magentaBright',
      negative: 'red',
      muted: 'blackBright',
      debug: 'magentaBright',
    },
  },
};

/**
 * Every other bundled theme -- all genuinely file-driven (see
 * `getActiveThemeDefinition`), materialized to `~/.frodo/themes/` on first
 * use and safe to hand-edit, at the same trust level as a theme a user
 * writes themselves.
 *
 * `dark-regular`/`light-regular` (renamed from `-relaxed`): a relaxed
 * contrast floor rather than strict WCAG AA, for a more colorful but still
 * reasonably legible result. `light-regular` exists because the light
 * background is the real casualty of strict AA: only 5 of the 16 standard
 * ANSI colors clear 4.5:1 on white at all, so `light`'s `positive` has no
 * color whatsoever. Relaxed to a ~2:1 floor, `green` (2.16:1) becomes
 * reachable -- nothing else does; yellow (1.70) and cyan (1.98) stay well
 * under 2:1 no matter how far the threshold is pushed, since their own
 * luminance is close to white's. `dark-regular` doesn't have a scarcity
 * problem to solve (`dark` already uses the full *Bright palette, all
 * comfortably clearing 4.5:1 on black) -- it exists for a different, more
 * muted aesthetic, using each intent's plain (non-Bright) counterpart
 * wherever that still clears a ~4:1 floor. `error` stays `redBright`:
 * plain `red` is only 3.60:1 on black, too low to use at any reasonable
 * floor.
 *
 * `dark-vibrant`/`light-vibrant`: the most colorful tier, built to be more
 * colorful than what's already bundled, not to chase a lower contrast
 * floor for its own sake. Each starts from the theme already closest to
 * "as colorful as it gets" (`dark` itself, and `light-regular` for light)
 * and fills in the one remaining flat spot each has: both previously
 * aliased `negative` to `error`'s exact color, which reads as "correct but
 * not actually distinct." `dark-vibrant` also gives `debug` a real hue
 * (plain `magenta`, 4.48:1) instead of leaving it plain `white`. `muted`
 * stays gray in both -- giving it a hue would defeat its actual job (quiet,
 * secondary content), so "more colorful" doesn't mean "everything is
 * colored."
 *
 * `blue` (reference RGB 34,78,189 -- macOS Terminal's built-in "Ocean"
 * profile, HSB 223°/82%/74%) is a fairly saturated, dark-leaning blue
 * (relative luminance ~0.095, far closer to black than white), so unlike
 * `yellow` below it needs a `mode: 'dark'` (bright-foreground) treatment,
 * not a light one -- an earlier version of this preset guessed a pale
 * pastel blue instead, which auto-detection then couldn't actually match
 * to real blue terminals at all (nearest neighbor preferred plain `dark`).
 * `blue` also turns out to be unusually constrained even as a dark
 * background: no red-family hue clears 4.5:1 at all against it (red and
 * blue sit close enough in luminance that even `redBright` only reaches
 * 1.82:1), and `white`/`whiteBright` (5.76:1 / 7.26:1) are the Ocean
 * profile's own default foreground -- numerically the best contrast, but
 * indistinguishable from unstyled text in practice, the same trap
 * `whiteBright` was on `dark` before that got fixed earlier this session.
 * That leaves only `yellowBright` (6.76:1), `cyanBright` (5.79:1), and
 * `greenBright` (5.29:1) as genuinely usable accents:
 * - `blue` (high-contrast): `warning: 'yellowBright'`, `command:
 *   'cyanBright'`, `positive: 'greenBright'` all cleanly clear AA.
 *   `error: 'redBright'` (1.82:1) is a deliberate, documented exception --
 *   abandoning red for "this is an error" felt like a worse outcome than
 *   a low-contrast red, given nothing red-family clears AA here at all.
 *   `emphasis` aliases `command`'s cyan (no 4th distinct AA hue survives);
 *   `muted`/`debug` use plain `black` (2.89:1) -- computed to actually
 *   beat `blackBright` (1.81:1) here, since this background is dark
 *   enough that true black stands out more than mid-gray. `heading` stays
 *   bold-only -- nothing clears even the relaxed bold threshold.
 * - `blue-regular`: same, but `emphasis` gets its own `magentaBright`
 *   (2.31:1) instead of aliasing `command`.
 * - `blue-vibrant`: same as regular, plus `debug` gets `blackBright`
 *   (1.81:1) instead of aliasing `muted`'s `black` -- the last bit of
 *   differentiation this background can support. `heading` still has no
 *   viable color at any tier -- an honest constraint of this specific
 *   background, not a gap left unaddressed.
 *
 * `yellow` (reference RGB 255,245,156 -- macOS Terminal's built-in "Man
 * Page" profile, HSB 54°/39%/100%) is a genuinely mustard-toned yellow,
 * not a pale pastel (an earlier version of this preset guessed the latter,
 * CSS "lightyellow" at 255,255,224 -- close enough to white that
 * auto-detection couldn't actually distinguish it from `light` in
 * practice). Its high relative luminance (~0.89) confirms `mode: 'light'`
 * is still the right direction (dark text, matching the real profile), but
 * it's meaningfully more constrained than pure white: `light`'s `warning`/
 * `command` picks (`magenta`/`blueBright`) fall just short of 4.5:1 here
 * (4.20:1 / 4.24:1 -- close enough that using them anyway is a minor,
 * documented exception, not the dramatic compromise `blue`'s `error`
 * needed), and `light`'s `heading` pick (`magentaBright`) drops to 2.81:1,
 * below even the relaxed bold threshold, so `heading` uses `blackBright`
 * (3.58:1) instead -- clearly distinct from this profile's own black
 * default foreground, unlike plain `black` would be.
 * - `yellow` (high-contrast): `error: 'red'` (5.23:1), `emphasis: 'blue'`
 *   (8.41:1), `warning: 'magenta'`, `command: 'blueBright'` (both ~4.2:1,
 *   the documented near-AA exception above), `heading: 'blackBright'`.
 *   `muted`/`debug` also use `blackBright` -- no room for further
 *   distinction at this floor.
 * - `yellow-regular`: adds `positive: 'green'` (1.93:1, a deliberately
 *   low-floor addition, matching the same aggressive relaxation
 *   `light-regular`'s own `positive: 'green'` (2.16:1) already accepts).
 * - `yellow-vibrant`: adds `negative: 'redBright'` (3.58:1) instead of
 *   aliasing `error`'s `red`.
 */
const BUNDLED_DEFINITIONS: Record<string, ThemeDefinition> = {
  'dark-regular': {
    name: 'dark-regular',
    description:
      'A more muted alternative to "dark" for dark-background terminals, at a relaxed (~4:1) contrast floor instead of strict WCAG AA -- same intents, plain (non-Bright) hues wherever that contrast allows. This file is a starting point: editing it changes this theme\'s colors; copy it to a new file with a different name instead to make a separate custom theme.',
    mode: 'dark',
    colors: {
      error: 'redBright',
      warning: 'yellow',
      command: 'cyan',
      emphasis: 'magenta',
      heading: 'bold',
      positive: 'green',
      negative: 'redBright',
      muted: 'blackBright',
      debug: 'white',
    },
  },
  'light-regular': {
    name: 'light-regular',
    description:
      'A relaxed-contrast (~2:1 floor) alternative to "light" for light-background terminals, adding a color for positive/active values that the stricter WCAG AA floor can\'t fit. This file is a starting point: editing it changes this theme\'s colors; copy it to a new file with a different name instead to make a separate custom theme.',
    mode: 'light',
    colors: {
      error: 'red',
      warning: 'magenta',
      command: 'blueBright',
      emphasis: 'blue',
      heading: 'magentaBright',
      positive: 'green',
      negative: 'red',
      muted: 'blackBright',
      debug: 'magentaBright',
    },
  },
  'dark-vibrant': {
    name: 'dark-vibrant',
    description:
      'The most colorful dark-background theme -- same as "dark", plus a genuinely distinct color for negative/inactive values and for debug output instead of leaving them uncolored or aliased to another intent. This file is a starting point: editing it changes this theme\'s colors; copy it to a new file with a different name instead to make a separate custom theme.',
    mode: 'dark',
    colors: {
      error: 'redBright',
      warning: 'yellowBright',
      command: 'cyanBright',
      emphasis: 'magentaBright',
      heading: 'blueBright',
      positive: 'greenBright',
      negative: 'red',
      muted: 'blackBright',
      debug: 'magenta',
    },
  },
  'light-vibrant': {
    name: 'light-vibrant',
    description:
      'The most colorful light-background theme -- same as "light-regular", plus a genuinely distinct color for negative/inactive values instead of aliasing "error". This file is a starting point: editing it changes this theme\'s colors; copy it to a new file with a different name instead to make a separate custom theme.',
    mode: 'light',
    colors: {
      error: 'red',
      warning: 'magenta',
      command: 'blueBright',
      emphasis: 'blue',
      heading: 'magentaBright',
      positive: 'green',
      negative: 'redBright',
      muted: 'blackBright',
      debug: 'magentaBright',
    },
  },
  blue: {
    name: 'blue',
    description:
      'High-contrast (strict WCAG AA), tuned for a saturated, dark-leaning blue terminal background (reference: macOS Terminal\'s built-in "Ocean" profile). `error` is the one deliberate exception to strict AA here -- no red-family hue clears it against this specific background at all, and a low-contrast red felt better than abandoning "red means error" outright. This file is a starting point: editing it changes this theme\'s colors; copy it to a new file with a different name instead to make a separate custom theme.',
    mode: 'dark',
    colors: {
      error: 'redBright',
      warning: 'yellowBright',
      command: 'cyanBright',
      emphasis: 'cyanBright',
      heading: 'bold',
      positive: 'greenBright',
      negative: 'redBright',
      muted: 'black',
      debug: 'black',
    },
  },
  'blue-regular': {
    name: 'blue-regular',
    description:
      'A relaxed-contrast alternative to "blue" for the same saturated blue terminal background, giving `emphasis` its own color instead of aliasing `command`. This file is a starting point: editing it changes this theme\'s colors; copy it to a new file with a different name instead to make a separate custom theme.',
    mode: 'dark',
    colors: {
      error: 'redBright',
      warning: 'yellowBright',
      command: 'cyanBright',
      emphasis: 'magentaBright',
      heading: 'bold',
      positive: 'greenBright',
      negative: 'redBright',
      muted: 'black',
      debug: 'black',
    },
  },
  'blue-vibrant': {
    name: 'blue-vibrant',
    description:
      'The most colorful theme for this saturated blue terminal background -- same as "blue-regular", plus a genuinely distinct color for debug output instead of aliasing `muted`. `heading` still has no viable color on this background at any tier -- an honest constraint, not a gap left unaddressed. This file is a starting point: editing it changes this theme\'s colors; copy it to a new file with a different name instead to make a separate custom theme.',
    mode: 'dark',
    colors: {
      error: 'redBright',
      warning: 'yellowBright',
      command: 'cyanBright',
      emphasis: 'magentaBright',
      heading: 'bold',
      positive: 'greenBright',
      negative: 'redBright',
      muted: 'black',
      debug: 'blackBright',
    },
  },
  yellow: {
    name: 'yellow',
    description:
      'High-contrast (strict WCAG AA), tuned for a mustard-toned yellow terminal background (reference: macOS Terminal\'s built-in "Man Page" profile). `warning`/`command` are a minor, documented near-AA exception here (~4.2:1 against this specific background, just short of 4.5:1) -- close enough that keeping "light"\'s intuitive hue choices felt better than reassigning them. This file is a starting point: editing it changes this theme\'s colors; copy it to a new file with a different name instead to make a separate custom theme.',
    mode: 'light',
    colors: {
      error: 'red',
      warning: 'magenta',
      command: 'blueBright',
      emphasis: 'blue',
      heading: 'blackBright',
      negative: 'red',
      muted: 'blackBright',
      debug: 'blackBright',
    },
  },
  'yellow-regular': {
    name: 'yellow-regular',
    description:
      'A relaxed-contrast alternative to "yellow" for the same mustard-toned yellow terminal background, adding a color for positive/active values that the stricter WCAG AA floor can\'t fit. This file is a starting point: editing it changes this theme\'s colors; copy it to a new file with a different name instead to make a separate custom theme.',
    mode: 'light',
    colors: {
      error: 'red',
      warning: 'magenta',
      command: 'blueBright',
      emphasis: 'blue',
      heading: 'blackBright',
      positive: 'green',
      negative: 'red',
      muted: 'blackBright',
      debug: 'blackBright',
    },
  },
  'yellow-vibrant': {
    name: 'yellow-vibrant',
    description:
      'The most colorful theme for this mustard-toned yellow terminal background -- same as "yellow-regular", plus a genuinely distinct color for negative/inactive values instead of aliasing "error". This file is a starting point: editing it changes this theme\'s colors; copy it to a new file with a different name instead to make a separate custom theme.',
    mode: 'light',
    colors: {
      error: 'red',
      warning: 'magenta',
      command: 'blueBright',
      emphasis: 'blue',
      heading: 'blackBright',
      positive: 'green',
      negative: 'redBright',
      muted: 'blackBright',
      debug: 'blackBright',
    },
  },
};

/**
 * Reference backgrounds `ensureThemeDetectedIfNeeded` matches a detected
 * terminal background RGB against (see `matchBackgroundPreset`). Plain
 * black/white are included as real candidates here, not just as the
 * distance-based fallback -- without them, a genuinely near-white
 * background had nothing closer to compete against `yellow` (only ~31 RGB
 * units away from pure white) and matched it by default, even though it's
 * a poor match. With black/white in the running, a near-white background
 * correctly matches `light` (distance ~0) instead.
 */
const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { themeName: 'dark', referenceRgb: [0, 0, 0] },
  { themeName: 'light', referenceRgb: [255, 255, 255] },
  { themeName: 'blue', referenceRgb: [34, 78, 189] },
  { themeName: 'yellow', referenceRgb: [255, 245, 156] },
];

function getThemesDir(): string {
  return path.join(getConfigPath(), FRODO_THEME_DEFINITIONS_DIRNAME);
}

function getActiveThemeFilePath(): string {
  return path.join(getConfigPath(), FRODO_THEME_ACTIVE_FILENAME);
}

/**
 * Writes the built-in themes' reference files to ~/.frodo/themes/ if they
 * aren't already there, so `frodo settings theme list`/`show` (and anyone
 * browsing the directory directly) have something real to discover, copy,
 * and edit into a custom theme -- per "keep settings in separate,
 * discoverable files" rather than a single opaque settings blob.
 */
export function ensureBuiltInThemeFiles(): void {
  const dir = getThemesDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    const allBundled = [
      ...Object.values(BUILT_IN_REFERENCE_DEFINITIONS),
      ...Object.values(BUNDLED_DEFINITIONS),
    ];
    for (const def of allBundled) {
      const filePath = path.join(dir, `${def.name}.json`);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(def, null, 2));
      }
    }
  } catch (e) {
    printMessage(
      `Error creating default theme files in ${dir} (${e.message})`,
      'error'
    );
  }
}

function isValidThemeDefinition(value: unknown): value is ThemeDefinition {
  if (!value || typeof value !== 'object') return false;
  const def = value as Partial<ThemeDefinition>;
  if (typeof def.name !== 'string') return false;
  if (def.mode !== 'dark' && def.mode !== 'light') return false;
  if (!def.colors || typeof def.colors !== 'object') return false;
  return Object.values(def.colors).every(
    (hueName) => typeof hueName === 'string' && hueName in HUE_NAME_TO_FUNCTION
  );
}

/**
 * Every theme definition found in ~/.frodo/themes/ -- both the built-in
 * reference files and any custom ones a user has added. Malformed files
 * are skipped with a warning rather than failing the whole listing.
 *
 * Results are cached and revalidated against each file's mtime+size, so
 * repeated calls within one process (the FrodoStubCommand constructor
 * calls activatePersistedTheme, and every color resolution re-reads
 * settings) don't re-read the whole directory -- ~5,600 redundant file
 * reads / ~200 ms of startup on the first `frodo -v` without this.
 * Editing a theme file still takes effect immediately (mtime changes).
 */
type DirCacheEntry = {
  signature: Map<string, { mtimeMs: number; size: number }>;
  definitions: ThemeDefinition[];
};
let dirCache: DirCacheEntry | undefined;

function currentDirSignature(
  dir: string,
  filenames: string[]
): Map<string, { mtimeMs: number; size: number }> {
  const signature = new Map<string, { mtimeMs: number; size: number }>();
  for (const filename of filenames) {
    try {
      const st = fs.statSync(path.join(dir, filename));
      signature.set(filename, { mtimeMs: st.mtimeMs, size: st.size });
    } catch {
      // unreadable/ vanished between readdir and stat -- treated as absent
    }
  }
  return signature;
}

function sameSignature(
  a: Map<string, { mtimeMs: number; size: number }>,
  b: Map<string, { mtimeMs: number; size: number }>
): boolean {
  if (a.size !== b.size) return false;
  for (const [name, stat] of a) {
    const other = b.get(name);
    if (!other || other.mtimeMs !== stat.mtimeMs || other.size !== stat.size) {
      return false;
    }
  }
  return true;
}

export function listThemeDefinitions(): ThemeDefinition[] {
  const dir = getThemesDir();
  let filenames: string[];
  try {
    filenames = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    dirCache = undefined;
    return [];
  }
  const signature = currentDirSignature(dir, filenames);
  if (dirCache && sameSignature(dirCache.signature, signature)) {
    return dirCache.definitions;
  }
  const definitions: ThemeDefinition[] = [];
  for (const filename of filenames) {
    try {
      const raw = fs.readFileSync(path.join(dir, filename), 'utf8');
      const parsed = JSON.parse(raw);
      if (isValidThemeDefinition(parsed)) {
        definitions.push(parsed);
      } else {
        printMessage(
          `Skipping malformed theme file ${filename}: doesn't match the expected {name, mode, colors} shape.`,
          'warn'
        );
      }
    } catch (e) {
      printMessage(
        `Skipping unreadable theme file ${filename} (${e.message})`,
        'warn'
      );
    }
  }
  dirCache = { signature, definitions };
  return definitions;
}

type ThemeSettings = {
  background?: Background;
  contrast?: ContrastTier;
  // A literal, unparsed theme name -- used only when `set <name>` is given
  // something that isn't a recognized (background, contrast) combination
  // (e.g. a hand-authored custom theme). Takes precedence over
  // `background`/`contrast` whenever present; cleared by
  // `setActiveBackground`/`setActiveContrast`/a `set` that does parse.
  customActive?: string;
  autoDetect?: boolean;
};

// Old shape, from before background/contrast became two separate
// preferences -- `active` was a single flat theme name. Migrated
// in-memory on read (see `readThemeSettings`); the next write upgrades the
// file on disk to the new shape naturally, no separate migration step.
type LegacyThemeSettings = { active?: string; autoDetect?: boolean };

// Cache for `readThemeSettings`, revalidated against Theme.json's mtime+size.
// The color getters resolve live on every access by design (theme edits take
// effect immediately), but resolution must not cost three sync file reads per
// access -- `getActiveThemeName` alone reads it three times.
let settingsCache:
  { mtimeMs: number; size: number; settings: ThemeSettings } | undefined;

function readThemeSettings(): ThemeSettings {
  const file = getActiveThemeFilePath();
  try {
    const st = fs.statSync(file);
    if (
      settingsCache &&
      settingsCache.mtimeMs === st.mtimeMs &&
      settingsCache.size === st.size
    ) {
      return settingsCache.settings;
    }
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof parsed !== 'object' || !parsed) return {};
    const settings = parsed as ThemeSettings & LegacyThemeSettings;
    let result: ThemeSettings;
    if (settings.background || settings.customActive) {
      result = settings;
    } else if (typeof settings.active === 'string') {
      const legacyParsed = parseThemeName(settings.active);
      result = legacyParsed
        ? { ...legacyParsed, autoDetect: settings.autoDetect }
        : { customActive: settings.active, autoDetect: settings.autoDetect };
    } else {
      result = settings;
    }
    settingsCache = { mtimeMs: st.mtimeMs, size: st.size, settings: result };
    return result;
  } catch {
    return {};
  }
}

function writeThemeSettings(settings: ThemeSettings): void {
  try {
    // A fresh system has no ~/.frodo yet, and this can be its first write
    // (first-run auto-detection persists a background before anything else
    // creates the directory -- app.ts runs detection before
    // `activatePersistedTheme`/`ensureBuiltInThemeFiles` and long before
    // frodo-lib's own `initConnectionProfiles`/`initTokenCache`). Create the
    // directory so a first-ever write can't crash with a raw ENOENT.
    fs.mkdirSync(getConfigPath(), { recursive: true });
    fs.writeFileSync(
      getActiveThemeFilePath(),
      JSON.stringify(settings, null, 2)
    );
    settingsCache = undefined;
  } catch (e) {
    // Losing a theme preference is not fatal: report it and let startup
    // continue with the defaults (matching `ensureBuiltInThemeFiles`).
    printMessage(
      `Error saving theme settings to ${getActiveThemeFilePath()} (${e.message})`,
      'error'
    );
  }
}

export function getActiveBackground(): Background {
  const { background } = readThemeSettings();
  return background && BACKGROUNDS.includes(background) ? background : 'dark';
}

export function getActiveContrast(): ContrastTier {
  const { contrast } = readThemeSettings();
  return contrast && CONTRAST_TIERS.includes(contrast) ? contrast : 'vibrant';
}

export function setActiveBackground(background: Background): void {
  writeThemeSettings({
    ...readThemeSettings(),
    background,
    customActive: undefined,
  });
}

export function setActiveContrast(contrast: ContrastTier): void {
  writeThemeSettings({
    ...readThemeSettings(),
    contrast,
    customActive: undefined,
  });
}

/**
 * The name of the resolved active theme. Normally derived from the
 * `background`/`contrast` preferences (see `themeName`); a `customActive`
 * literal (set by `set <name>` for a name that isn't a recognized
 * (background, contrast) combination) takes precedence when present.
 * Does not consider the `FRODO_COLOR_THEME` env var -- that's a separate,
 * higher-precedence override handled by frodo-lib's own `resolveThemeMode`.
 */
export function getActiveThemeName(): string {
  const { customActive } = readThemeSettings();
  if (typeof customActive === 'string') return customActive;
  return themeName(getActiveBackground(), getActiveContrast());
}

/**
 * Sets the active theme by name. A name matching the (background,
 * contrast) convention (see `parseThemeName`) updates those two
 * preferences directly, keeping them and the active theme in sync; any
 * other name (a hand-authored custom theme) is stored as a literal
 * `customActive` override instead.
 */
export function setActiveThemeName(name: string): void {
  const parsed = parseThemeName(name);
  if (parsed) {
    writeThemeSettings({
      ...readThemeSettings(),
      background: parsed.background,
      contrast: parsed.contrast,
      customActive: undefined,
    });
  } else {
    writeThemeSettings({ ...readThemeSettings(), customActive: name });
  }
}

/**
 * Whether a theme has ever actually been chosen -- manually, or by a
 * previous successful auto-detection -- as opposed to `getActiveThemeName`
 * quietly deriving one from defaults. Used to gate `ensureThemeDetectedIfNeeded`
 * so detection only ever runs before the first real choice exists, never
 * overriding one.
 */
function hasPersistedThemeChoice(): boolean {
  const { background, customActive } = readThemeSettings();
  return typeof background === 'string' || typeof customActive === 'string';
}

/**
 * Whether terminal-background auto-detection is allowed to run at all.
 * Defaults to enabled -- a user who's never touched this setting still
 * benefits from a one-time detection on first run (see
 * `ensureThemeDetectedIfNeeded`), but can turn it off entirely via
 * `frodo settings theme autodetect off` to always fall through to the
 * `dark` default instead.
 */
export function isAutoDetectEnabled(): boolean {
  const { autoDetect } = readThemeSettings();
  return autoDetect !== false;
}

export function setAutoDetectEnabled(enabled: boolean): void {
  writeThemeSettings({ ...readThemeSettings(), autoDetect: enabled });
}

/**
 * Resolves the active theme's full definition. `dark`/`light` always
 * resolve to the code-driven built-in (never read from disk, even if a
 * same-named file exists or was edited) -- anything else is looked up
 * among the discovered files, falling back to `dark` if not found.
 */
export function getActiveThemeDefinition(): ThemeDefinition {
  const activeName = getActiveThemeName();
  if (activeName === 'dark' || activeName === 'light') {
    return BUILT_IN_REFERENCE_DEFINITIONS[activeName];
  }
  const found = listThemeDefinitions().find((def) => def.name === activeName);
  return found ?? BUILT_IN_REFERENCE_DEFINITIONS.dark;
}

/**
 * Applies the persisted active theme at process startup: sets the base
 * dark/light mode, and, only for a genuinely custom (non-built-in) theme,
 * layers its color overrides on top. Built-in `dark`/`light` deliberately
 * never touch the override path, even though their reference files'
 * `colors` would (today) produce the same result -- going through
 * ColorTheme.ts's own code keeps the built-ins correct-by-construction if
 * that code ever changes, rather than silently drifting from a stale copy
 * on disk. Call once, before any output happens (see `app.ts`/`shell.ts`).
 *
 * `FRODO_COLOR_THEME`, if set, wins over anything persisted here -- this
 * function leaves `state`'s override unset in that case, so frodo-lib's own
 * `resolveThemeMode` falls through to the env var exactly as it would with
 * no persisted preference at all. A custom (non-built-in) theme's *color*
 * overrides, however, aren't a mode choice the env var has any way to
 * express, so those still apply even when the env var is picking the mode.
 */
export function activatePersistedTheme(): void {
  ensureBuiltInThemeFiles();
  const activeName = getActiveThemeName();
  const envMode = process.env[FRODO_COLOR_THEME_ENV_KEY];
  const envOverridesMode = envMode === 'dark' || envMode === 'light';

  if (activeName === 'dark' || activeName === 'light') {
    if (!envOverridesMode) state.setColorTheme(activeName);
    return;
  }
  const def = listThemeDefinitions().find((d) => d.name === activeName);
  if (def) {
    if (!envOverridesMode) state.setColorTheme(def.mode);
    applyCustomThemeOverrides(def.colors);
  } else if (!envOverridesMode) {
    state.setColorTheme('dark');
  }
}

/**
 * Queries the terminal's actual background color and, if it responds,
 * matches it against `BACKGROUND_PRESETS` and persists the result as the
 * `background` preference -- unconditionally, regardless of whether a
 * background was already chosen, and without touching the separate
 * `contrast` preference at all. Returns the background it persisted, or
 * `null` if the terminal never responded (non-TTY, or an interactive
 * terminal that doesn't support the query). Exported for
 * `frodo settings theme detect`'s explicit, user-triggered re-detection;
 * `ensureThemeDetectedIfNeeded` below is the gated, automatic-on-first-run
 * caller most code should use instead.
 */
export async function detectAndPersistTheme(): Promise<Background | null> {
  const rgb = await detectTerminalBackgroundRgb();
  if (!rgb) return null;
  const matched = matchBackgroundPreset(
    rgb,
    BACKGROUND_PRESETS,
    'dark',
    'light'
  ) as Background;
  setActiveBackground(matched);
  return matched;
}

let detectionAttemptedThisProcess = false;

/**
 * Best-effort, one-time terminal-background auto-detection: if no theme
 * has ever actually been chosen yet (see `hasPersistedThemeChoice`) and
 * auto-detection isn't disabled, runs `detectAndPersistTheme` -- so every
 * future invocation, this process included, skips detection entirely from
 * then on.
 *
 * Deliberately does *not* run on every invocation: `detectTerminalBackgroundRgb`
 * already resolves instantly with no query attempted on a non-TTY (piped/
 * scripted/CI) invocation, but a genuine interactive terminal that simply
 * doesn't respond still costs up to its ~500ms timeout, which a persisted
 * choice (successful or explicit) avoids paying again. Guarded by an
 * in-process flag too, since `activatePersistedTheme` is called multiple
 * times per process (once per command in the interactive shell) -- this
 * only ever attempts the query once per process, not once per call.
 *
 * Call explicitly, awaited, from a genuine top-level entry point (see
 * `app.ts`) -- unlike `activatePersistedTheme`, this is async (the OSC 11
 * query is inherently a round-trip) and must run, and settle, before that
 * synchronous call so a freshly-detected theme takes effect immediately
 * rather than one command late.
 */
export async function ensureThemeDetectedIfNeeded(): Promise<void> {
  if (detectionAttemptedThisProcess) return;
  detectionAttemptedThisProcess = true;
  if (hasPersistedThemeChoice() || !isAutoDetectEnabled()) return;
  await detectAndPersistTheme();
}
