import { errorMessage, successMessage, warnMessage } from '../../utils/Console';
import {
  escapableSelect,
  ESCAPE,
} from '../../utils/interactive/EscapableSelectPrompt';
import {
  activatePersistedTheme,
  BACKGROUNDS,
  CONTRAST_TIERS,
  detectAndPersistTheme,
  getActiveBackground,
  getActiveContrast,
  setActiveBackground,
  setActiveContrast,
  themeName,
  type Background,
  type ContrastTier,
} from '../../utils/ThemeConfig';
import { FrodoStubCommand } from '../FrodoCommand';
import AutodetectCmd from './settings-theme-autodetect';
import BackgroundCmd from './settings-theme-background';
import ContrastCmd from './settings-theme-contrast';
import DetectCmd from './settings-theme-detect';
import ListCmd from './settings-theme-list';
import SetCmd from './settings-theme-set';
import ShowCmd from './settings-theme-show';

const BACKGROUND_DESCRIPTIONS: Record<Background, string> = {
  dark: 'For dark-background terminals.',
  light: 'For light-background terminals.',
  blue: "For pastel-blue terminal backgrounds, common from the '80s/'90s DOS-editor era and still seen today.",
  yellow: 'For pale-yellow terminal backgrounds.',
};

const CONTRAST_DESCRIPTIONS: Record<ContrastTier, string> = {
  'high-contrast':
    'Always clears strict WCAG AA -- the most conservative, guaranteed-readable option.',
  regular:
    'A relaxed contrast floor for a more colorful result, still reasonably legible.',
  vibrant: 'The most colorful option this background supports. Default.',
};

// Distinct from any real `Background` value so it can't collide with one.
const AUTO_DETECT = Symbol('runInteractiveThemePicker:autoDetect');

/**
 * Interactive picker for the two independent theme preferences -- pick a
 * background (or auto-detect it), then pick a contrast level, applying and
 * persisting each step immediately so escaping the contrast step still
 * keeps whatever background was just chosen. Escape at the background step
 * goes back up to the caller (the `settings` category menu, or exits if
 * invoked directly); escape at the contrast step loops back to the
 * background step instead of exiting outright, since there's a genuine
 * "previous step" to return to. Shared by the bare `frodo settings theme`
 * invocation and the `settings` category menu (see `settings.ts`).
 *
 * Returns `false` if the user pressed Escape all the way out without
 * finishing (or chose auto-detect and it couldn't detect anything on the
 * very first attempt), `true` once both preferences have been applied.
 */
export async function runInteractiveThemePicker(): Promise<boolean> {
  while (true) {
    const currentBackground = getActiveBackground();
    const backgroundChoice = await escapableSelect<
      Background | typeof AUTO_DETECT
    >({
      message: 'Choose a background:',
      choices: [
        {
          name: 'Auto-detect from my terminal',
          value: AUTO_DETECT,
          description: "Query this terminal's actual background color.",
        },
        ...BACKGROUNDS.map((background) => ({
          name: `${background}${background === currentBackground ? ' (active)' : ''}`,
          value: background,
          description: BACKGROUND_DESCRIPTIONS[background],
        })),
      ],
      default: currentBackground,
    });
    if (backgroundChoice === ESCAPE) return false;

    let background: Background;
    if (backgroundChoice === AUTO_DETECT) {
      const matched = await detectAndPersistTheme();
      if (!matched) {
        warnMessage(
          "Could not detect this terminal's background color (not an interactive terminal, or it didn't respond to the query in time)."
        );
        continue;
      }
      background = matched;
    } else {
      background = backgroundChoice;
      setActiveBackground(background);
    }
    activatePersistedTheme();

    const currentContrast = getActiveContrast();
    const contrastChoice = await escapableSelect<ContrastTier>({
      message: 'Choose a contrast level:',
      choices: CONTRAST_TIERS.map((tier) => ({
        name: `${tier}${tier === currentContrast ? ' (active)' : ''}`,
        value: tier,
        description: CONTRAST_DESCRIPTIONS[tier],
      })),
      default: currentContrast,
    });
    if (contrastChoice === ESCAPE) continue; // back to the background step

    setActiveContrast(contrastChoice);
    activatePersistedTheme();
    successMessage(
      `Background set to "${background}", contrast set to "${contrastChoice}" (theme: "${themeName(background, contrastChoice)}").`
    );
    return true;
  }
}

export default function setup() {
  const program = new FrodoStubCommand('theme').description(
    'Manage the CLI color theme.'
  );

  program.addCommand(ListCmd().name('list'));
  program.addCommand(ShowCmd().name('show'));
  program.addCommand(SetCmd().name('set'));
  program.addCommand(BackgroundCmd().name('background'));
  program.addCommand(ContrastCmd().name('contrast'));
  program.addCommand(DetectCmd().name('detect'));
  program.addCommand(AutodetectCmd().name('autodetect'));

  program.action(async () => {
    try {
      await runInteractiveThemePicker();
    } catch (error) {
      errorMessage(`${error}`);
      process.exitCode = 1;
    }
  });

  return program;
}
