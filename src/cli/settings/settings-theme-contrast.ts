import { errorMessage, successMessage } from '../../utils/Console';
import {
  activatePersistedTheme,
  CONTRAST_TIERS,
  type ContrastTier,
  setActiveContrast,
} from '../../utils/ThemeConfig';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo settings theme contrast',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description(
      'Set the contrast preference (your background preference is unaffected). "vibrant" is the default -- the most colorful option each background supports; "high-contrast" always clears strict WCAG AA.'
    )
    .argument(
      'tier',
      `Contrast level to use. One of: ${CONTRAST_TIERS.join(', ')}.`
    )
    .action(async (tier, options, command) => {
      command.handleDefaultArgsAndOpts(tier, options, command);
      if (!CONTRAST_TIERS.includes(tier as ContrastTier)) {
        errorMessage(
          `Unknown contrast level "${tier}". Known levels: ${CONTRAST_TIERS.join(', ')}.`
        );
        process.exitCode = 1;
        return;
      }
      setActiveContrast(tier as ContrastTier);
      activatePersistedTheme();
      successMessage(`Contrast set to "${tier}".`);
    });

  return program;
}
