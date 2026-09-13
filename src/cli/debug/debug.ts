import { FrodoStubCommand } from '../FrodoCommand';
import AllCmd from './debug-all';
import JourneyCmd from './debug-journey';
import OAuthCmd from './debug-oauth';
import SamlCmd from './debug-saml';
import SyncCmd from './debug-sync';

export default function setup() {
  const program = new FrodoStubCommand('debug')
    .summary('Interactively debug Identity Cloud activity')
    .description(
      'Interactively debug Identity Cloud activity for one functional area — for journeys, this launches a live, self-updating list of in-flight/recent journey executions (detected from the log stream) to drill into; other topics print a smart-filtered log tail instead.'
    )
    // Declared once, here, rather than on each subcommand below --
    // FrodoCommand's stability resolution walks the parent chain (see
    // getEffectiveCommandStabilityMetadata's own remarks), so every
    // `debug <topic>` subcommand inherits this without repeating it.
    .withStability('experimental');

  program.addCommand(JourneyCmd().name('journey'));
  program.addCommand(OAuthCmd().name('oauth'));
  program.addCommand(SamlCmd().name('saml'));
  program.addCommand(SyncCmd().name('sync'));
  program.addCommand(AllCmd().name('all'));

  return program;
}
