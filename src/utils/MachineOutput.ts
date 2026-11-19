/**
 * Whether this invocation prints for a machine: the command was given `--json`
 * (or `--scriptFriendly`), so what it prints on stdout is read by a program.
 *
 * Notes that are meant for a person at a terminal (the access notice after an
 * interactive login) stay silent then. Set once per process from the options
 * of the command that runs (`FrodoCommand`), read by the ops code that prints.
 * A module without imports, so that any layer can read it.
 */

let machineOutput = false;

/**
 * Records that the command prints for a machine.
 * @param value true when the command was given `--json` or `--scriptFriendly`
 */
export function setMachineOutput(value: boolean): void {
  machineOutput = value;
}

/**
 * Whether the command prints for a machine.
 * @returns true when the command was given `--json` or `--scriptFriendly`
 */
export function isMachineOutput(): boolean {
  return machineOutput;
}
