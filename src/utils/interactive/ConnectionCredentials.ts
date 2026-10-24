import type { Command } from 'commander';

/**
 * Read parsed options, not frodo-lib state: handleDefaultArgsAndOpts applies
 * these credential sources inside the action, after interactive resolution.
 */
export function hasExplicitCredentialSource(command: Command): boolean {
  return ['browser', 'device', 'saId', 'saJwkFile', 'privateKey'].some(
    (name) => !!command.getOptionValue(name)
  );
}
