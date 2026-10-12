/**
 * The command preview (docs/INTERACTIVE-COMMANDS.md): the
 * command being authored, rendered live inside the interactive prompts
 * as a footer line -- red + cursive while mandatory input is missing,
 * green/white upright when validated and ready. On the final `<enter>`
 * the resolver prints the full command once more, not cleaned away, so
 * it stays scrollable/copyable: the authoring-tool moment.
 *
 * Zero-import module (EditableOptions pattern): pure commander
 * serialization, importable from any prompt module without dragging
 * frodo-lib graphs into tests that mock frodo-lib wholesale. The
 * resolver computes the readiness input (it owns the mandatory/one-of
 * registries); this module only renders.
 */

import type { Command, Option } from 'commander';
import c from '../ColorTheme';

/**
 * frodo-lib's sentinel default for "no realm chosen yet" and its
 * per-deployment-type translations (the same mapping frodo-lib's
 * determineDefaultRealm applies during auth). Zero-import constraint:
 * the map is duplicated here rather than imported from frodo-lib --
 * if the lib map ever changes, this copy MUST change with it (the test
 * below pins the values).
 */
const DEFAULT_REALM_KEY = '__default__realm__';
const DEPLOYMENT_TYPE_REALM_MAP: Record<string, string> = {
  classic: '/',
  cloud: 'alpha',
  forgeops: '/',
};

/**
 * The deployment type the resolver knows for this process (set from the
 * CLI side via setDeploymentTypeForPreview -- the resolution pass and
 * profile loading may resolve it in either order relative to the first
 * prompt render). Undefined = not yet known.
 */
let previewDeploymentType: string | undefined;

/**
 * Records the deployment type for sentinel translation in the preview.
 * Called by the resolution pass when the deployment type is (or becomes)
 * known: CLI-provided (-m/--type), connection-profile-carried, or
 * persisted.
 */
export function setDeploymentTypeForPreview(type: string | undefined): void {
  previewDeploymentType = type;
}

/**
 * Translates a positional value for serialization. The realm sentinel
 * NEVER displays: with a known deployment type it becomes that type's
 * default realm (alpha on cloud, / on classic/forgeops -- the SAME
 * translation frodo-lib applies during auth, so the printed command is
 * exactly what the run will execute; printing the TRANSLATED value is
 * deliberate -- defaults can change between frodo versions, and a CI
 * pipeline that copy-pasted the printed command must keep reading and
 * writing the realm it was authored against, pinning the value now
 * beats a silent realm change on upgrade). Before the type is known
 * (e.g. the profile picker footer, where no host has been picked yet)
 * the positional is OMITTED entirely -- the sentinel is an
 * implementation detail no user ever typed or should ever see, and the
 * live footer is a status display, not a copy-paste surface; by the
 * final authoring print the type is always resolved, so the pipeline
 * guarantee is unaffected.
 */
function serializePositionalValue(argumentName: string, value: string): string {
  if (argumentName === 'password') return '********';
  if (argumentName === 'realm' && value === DEFAULT_REALM_KEY) {
    const translated =
      previewDeploymentType && DEPLOYMENT_TYPE_REALM_MAP[previewDeploymentType];
    return translated ?? '';
  }
  return value;
}

/** Options that are machinery, not configuration -- never serialized. */
const NON_SERIALIZABLE_OPTIONS = new Set([
  'help',
  'help-more',
  'help-all',
  'version',
  // The prompting switch is a dual option pair (--prompt + --no-prompt)
  // sharing the `prompt` attribute -- both name() spellings excluded.
  'prompt',
  'no-prompt',
  'edit',
  'save-defaults',
]);

/**
 * What the resolver knows about the command's completeness: labels of
 * mandatory options still without values, whether any registered one-of
 * group is unsatisfied, and whether the connection level is resolved
 * (env/profile/interactive all count -- the connection positionals can
 * legitimately stay empty while the connection is fully resolved, so the
 * resolver owns this truth; see isCommandReady).
 */
export type CommandReadiness = {
  missingMandatoryOptionLabels: string[];
  oneOfUnsatisfied: boolean;
  /**
   * Connection-level resolution per the resolver. Optional so ad-hoc
   * callers (tests, the final print) can omit it: omitted means "the
   * caller isn't tracking connection state" -- ready.
   */
  connectionResolved?: boolean;
};

/**
 * Serializes the command as it would be typed on the command line today
 * -- every valued option as its flag (value placeholder included),
 * valued positional arguments in order. Secrets (the password
 * positional) are masked; values are shell-safe by inspection but NOT
 * shell-quoted -- this is a preview, not an eval string.
 */
export function serializeCommand(command: Command): string {
  const parts: string[] = [commandPath(command)];

  const args: string[] = [];
  command.registeredArguments.forEach((argument, index) => {
    const value = command.processedArgs?.[index];
    if (typeof value !== 'string' || value.length === 0) return;
    const serialized = serializePositionalValue(argument.name(), value);
    // A positional the serializer declines (the realm sentinel before
    // the deployment type is known) drops out entirely -- never a bare
    // placeholder in the token stream.
    if (serialized.length === 0) return;
    args.push(serialized);
  });
  // Positionals come after the command word, before options -- but
  // commander's own usage puts them at the end of the token stream as
  // typed; keep argv order: positionals first (as typed), then options.
  parts.push(...args);

  for (const option of command.options as Option[]) {
    if (NON_SERIALIZABLE_OPTIONS.has(option.name())) continue;
    const value = command.getOptionValue(option.attributeName());
    // A `false` value means "unset" for a plain option -- but for a
    // negatable one (--no-cache) it's the user's authored negative form
    // and serializes as the flag itself.
    if (
      value === undefined ||
      value === '' ||
      (!option.negate && value === false)
    )
      continue;
    // Only what the USER provided this invocation: commander defaults
    // (--retry nothing, --no-cache...) are runtime detail, not authored
    // input -- the preview is a copy-paste source, so it shows exactly
    // the tokens a user would type.
    if (command.getOptionValueSource(option.attributeName()) === 'default')
      continue;
    if (value === true || option.negate) {
      // Boolean flags, and the user-typed negative form (--no-cache,
      // value false), serialize as the flag alone -- "--no-cache false"
      // is not a re-typable token.
      parts.push(option.flags.split(/[, ]+/)[0]);
    } else if (Array.isArray(value)) {
      // ListOption families collect repeats into an array -- copy-paste
      // fidelity needs the repeated-flag form, not String() joining
      // (--env a=1,b=2 is not a valid re-type).
      const longFlag = option.flags
        .split(/[, ]+/)
        .find((token) => token.startsWith('--'));
      for (const entry of value) {
        parts.push(`${longFlag ?? option.flags} ${String(entry)}`);
      }
    } else {
      const longFlag = option.flags
        .split(/[, ]+/)
        .find((token) => token.startsWith('--'));
      parts.push(`${longFlag ?? option.flags} ${String(value)}`);
    }
  }
  return parts.join(' ');
}

/**
 * The `frodo x y z` path of the command (root name + ancestors + this).
 */
function commandPath(command: Command): string {
  const names: string[] = [];
  for (
    let cursor: Command | undefined = command;
    cursor;
    cursor = cursor.parent
  ) {
    names.unshift(cursor.name());
  }
  return names.join(' ');
}

/**
 * Whether the command still has mandatory input to collect (red+cursive
 * in the preview) or is validated and ready (green/white): a deferred
 * mandatory option, an unsatisfied one-of group, or -- per the resolver's
 * readiness input -- an unresolved connection. Positional values are NOT
 * sniffed here: host/username/password can legitimately resolve from
 * env/profile without ever landing in the command object (the resolver's
 * own fallbacks), so only the resolver can say whether the connection
 * level is satisfied.
 */
export function isCommandReady(
  _command: Command,
  readiness: CommandReadiness
): boolean {
  if (readiness.missingMandatoryOptionLabels.length > 0) return false;
  if (readiness.oneOfUnsatisfied) return false;
  return readiness.connectionResolved !== false;
}

/**
 * The preview footer line for the prompts: colored per readiness state
 * (red + cursive = still missing mandatory input; green/white = ready).
 */
export function renderCommandPreview(
  command: Command,
  readiness: CommandReadiness
): string {
  const serialized = serializeCommand(command);
  if (isCommandReady(command, readiness)) {
    return c.positive(serialized);
  }
  return c.italic(c.negative(serialized));
}

/**
 * The default highlighted-value→option-value mapping: pass-through for
 * strings (value pickers), otherwise undefined (entity objects, the
 * "enter manually" sentinel -- the callback renders the committed state).
 */
function defaultToValue(highlighted: unknown): string | undefined {
  return typeof highlighted === 'string' ? highlighted : undefined;
}

/**
 * LIVE preview footer (the footer shows what the
 * user is INFLUENCING, not what they last committed). Returns a callback
 * for a prompt's `preview` config that re-renders on every highlight
 * change: the highlighted value is serialized into a SHADOW copy of the
 * command's positional (the real command object is untouched -- only
 * <enter> commits), so arrowing through e.g. a realm list moves the
 * footer's realm token in real time. When nothing is highlighted
 * (filtered to no matches) the callback falls back to the command's
 * committed state.
 *
 * Options picks pass `undefined` as the positional name and use the
 * option-name variant below instead; this helper is for positionals
 * (realm, host...).
 */
export function livePositionalPreview(
  command: Command,
  positionalName: string,
  readiness: CommandReadiness
): (highlighted: unknown) => string {
  const index = command.registeredArguments.findIndex(
    (argument) => argument.name() === positionalName
  );
  return (highlighted) => {
    const value = defaultToValue(highlighted);
    if (index !== -1 && command.processedArgs && value) {
      // Shadow the positional for THIS render only. The committed value
      // is restored implicitly: the next render re-invokes with the new
      // highlight, and the command object itself is never written.
      const committed = command.processedArgs[index];
      command.processedArgs[index] = value;
      try {
        return renderCommandPreview(command, readiness);
      } finally {
        command.processedArgs[index] = committed;
      }
    }
    return renderCommandPreview(command, readiness);
  };
}

/**
 * LIVE preview for an entity/option/value picker: the highlighted
 * choice's value (after `toValue`) is serialized into a SHADOW copy of
 * the named OPTION (source 'cli', the same source the real apply uses)
 * for this render only. Restoring writes the previous value+source back
 * verbatim: for a never-set option that is (undefined, undefined), which
 * is exactly commander's pristine state (getOptionValue -> undefined,
 * serializer skips it). `toValue` maps the highlighted choice to the
 * option's value form -- identity for value pickers, the entity's label
 * for entity pickers (whose choice values are the raw entities, exactly
 * what the real apply writes); a mapping to undefined/empty renders the
 * committed state.
 */
export function liveOptionPreview(
  command: Command,
  optionName: string,
  readiness: CommandReadiness,
  toValue: (highlighted: unknown) => string | undefined = defaultToValue
): (highlighted: unknown) => string {
  return (highlighted) => {
    const value = toValue(highlighted);
    if (value && value.length > 0) {
      const committed = command.getOptionValue(optionName);
      const committedSource = command.getOptionValueSource(optionName);
      command.setOptionValueWithSource(optionName, value, 'cli');
      try {
        return renderCommandPreview(command, readiness);
      } finally {
        command.setOptionValueWithSource(
          optionName,
          committed as never,
          committedSource as never
        );
      }
    }
    return renderCommandPreview(command, readiness);
  };
}

/**
 * LIVE preview for the invocation editor (a MULTI-select): the callback
 * receives the currently SELECTED attribute names (the space-toggled
 * set), and the footer renders each as its flag -- booleans commit `true`
 * on the editor's pick, valued options still need their value step, so
 * they serialize as the flag with the value placeholder the user is
 * about to fill ("--type <type>"). The real command object is never
 * written here: every shadow is applied for THIS render and restored in
 * the finally. An empty selection renders the committed state.
 */
export function liveMultiOptionPreview(
  command: Command,
  readiness: CommandReadiness
): (selectedAttributeNames: unknown[]) => string {
  return (selectedAttributeNames) => {
    if (!Array.isArray(selectedAttributeNames)) {
      return renderCommandPreview(command, readiness);
    }
    const shadows: {
      optionName: string;
      committed: unknown;
      committedSource: string | undefined;
    }[] = [];
    for (const attributeName of selectedAttributeNames) {
      if (typeof attributeName !== 'string') continue;
      const option = command.options.find(
        (candidate) => candidate.attributeName() === attributeName
      );
      if (!option) continue;
      // Booleans serialize as the flag alone; valued options as the
      // flag + placeholder -- but ONLY while no user value stands: an
      // option whose value IS committed this invocation (source 'cli',
      // inline editor or the command line) serializes its REAL value --
      // the footer must not un-see a value the user already gave (it
      // would render `--retry <strategy>` beside a committed `network`).
      const boolean = !/<[^>]+>|\[[^\]]+\]/.test(option.flags);
      const committed = command.getOptionValue(attributeName);
      const committedSource = command.getOptionValueSource(attributeName);
      const hasUserValue =
        committedSource === 'cli' &&
        committed !== undefined &&
        (!Array.isArray(committed) || committed.length > 0);
      shadows.push({
        optionName: attributeName,
        committed,
        committedSource,
      });
      // A valued option with a real user value: leave it as-is (the
      // serializer renders the value, arrays as repeated flags).
      if (!boolean && hasUserValue) continue;
      // The placeholder token straight from the flags spec ("<type>",
      // "[file]") -- the serializer emits `${longFlag} ${value}`, so a
      // value of "<type>" renders "--type <type>": the flag with the
      // value slot the user is about to fill.
      // value slot the user is about to fill.
      const placeholder =
        option.flags
          .split(/[, ]+/)
          .filter((token) => /^[<[].*>?\]?$/.test(token))
          .join(' ') || 'value';
      command.setOptionValueWithSource(
        attributeName,
        boolean ? true : placeholder,
        'cli'
      );
    }
    try {
      return renderCommandPreview(command, readiness);
    } finally {
      for (const shadow of shadows.reverse()) {
        command.setOptionValueWithSource(
          shadow.optionName,
          shadow.committed as never,
          shadow.committedSource as never
        );
      }
    }
  };
}
