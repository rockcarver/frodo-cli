import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import c from '../../utils/ColorTheme';
import { printError, printMessage } from '../../utils/Console';
import type { CredentialOverrideType } from '../../utils/interactive/ConnectionProfilePickers';
import { FrodoCommand, preferredCredentialOption } from '../FrodoCommand';

const { loadConnectionProfileByHost, saveConnectionProfile } = frodo.conn;

/**
 * The field-editing verb behind `frodo conn set <host>` (user decision
 * 2026-10-12, market-validated: `set` is the dominant convention for
 * field writes -- `gh config set` / `aws configure set` / `gcloud config
 * set` / kubectl's `set` group; `edit` universally means "open
 * $EDITOR"). One verb forever: a new profile field is a new OPTION here,
 * never a new command. Bare `frodo conn set` (no host, no fields) lists
 * the settable fields (the `gh config` pattern).
 *
 * The load/apply/save flow mirrors conn-save's (load the profile into
 * state, apply only the given fields, validate the connection, save) --
 * without save's provisioning side effects (no service-account or
 * log-key creation): set EDITS an existing profile, save CREATES/UPDATES
 * with provisioning.
 */
export default function setup() {
  const program = new FrodoCommand('frodo conn set', ['realm']);

  program
    .description(
      "Set fields of an existing connection profile. Only the fields given on the command line change; everything else stays as-is. Run 'frodo conn set' without any field option to list the settable fields."
    )
    .addOption(new Option('--username [username]', 'Username to login with.'))
    .addOption(
      new Option(
        '--password [password]',
        'Password for the username. Given without a value, reads it from stdin non-interactively (echo off) when piped; prompts securely on an interactive terminal.'
      )
    )
    .addOption(
      new Option('--alias [name]', 'Alias name for this connection profile.')
    )
    // --idm-host comes from defaultOpts (FrodoCommand's shared option);
    // do NOT re-declare it here (commander throws on conflicting flags).
    .addOption(new Option('--log-api-key [key]', 'Log API key.'))
    .addOption(new Option('--log-api-secret [secret]', 'Log API secret.'))
    .addOption(
      new Option(
        '--authentication-service [service]',
        'Name of the authentication service/tree to use.'
      )
    )
    .addOption(
      new Option(
        '--authentication-header-overrides [headers]',
        'Map of headers: \'{"host":"am.example.com:8081"}\'. These headers are sent with all requests.'
      )
    )
    .addOption(
      new Option(
        '--configuration-header-overrides [headers]',
        'Map of headers: \'{"X-Configuration-Type":"mutable"}\'. These headers are sent with all configuration requests.'
      )
    )
    .addOption(preferredCredentialOption)
    .addOption(
      new Option(
        '--preferred-device-flow',
        'Persist a preference for the OAuth2 Device Authorization Grant over the default loopback-redirect flow (only meaningful with --preferred-credential browser).'
      )
    )
    .addOption(
      new Option(
        '--no-preferred-device-flow',
        'Explicitly persist a preference against device flow (loopback-redirect instead).'
      )
    )
    .addOption(
      new Option(
        '--allow-insecure',
        'Allow insecure connections when using SSL/TLS (persisted on the profile).'
      )
    )
    .addOption(
      new Option(
        '--no-validate',
        'Do not validate the connection after setting the fields.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  List the settable fields:\n` +
        `  $ frodo conn set\n` +
        `  Change a profile's stored password (validates the connection):\n` +
        c.command(
          `  $ frodo conn set ${s.connId} --password '${s.password}'\n`
        ) +
        `  Point a profile at a new username and validate:\n` +
        c.command(`  $ frodo conn set ${s.connId} --username ${s.username}\n`) +
        `  Set the preferred credential and an alias in one shot:\n` +
        c.command(
          `  $ frodo conn set ${s.connId} --preferred-credential user --alias prod\n`
        )
    )
    .action(async (host, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(host, user, password, options, command);

      // The fields actually named on this invocation, in registry
      // order. commander's attributeName() is the flag's camelCase name
      // (verified: --log-api-key -> logApiKey), which is also the
      // options-object key.
      const given = SETTABLE_FIELDS.filter(
        (field) => options[camelCase(field.flag)] !== undefined
      );
      // Bare invocation (no host, no field options): the settable-fields
      // reference (the `gh config` pattern).
      if (!host && given.length === 0) {
        printMessage('Settable connection profile fields:\n');
        for (const field of SETTABLE_FIELDS) {
          printMessage(
            `  ${field.flag}${field.valuePlaceholder ? ` <${field.valuePlaceholder}>` : ''}  ${field.description}`
          );
        }
        return;
      }

      // Load the existing profile into state (its decoded fields become
      // state's values; a load failure means no such profile -- set
      // EDITS, it never creates).
      try {
        await loadConnectionProfileByHost(host);
      } catch {
        printError(
          new Error(
            `No connection profile found for '${host}'. Create one first with 'frodo conn save'.`
          )
        );
        process.exitCode = 1;
        return;
      }

      // Apply ONLY the named fields (everything else keeps its loaded
      // value): the load populated state, so untouched fields round-trip
      // unchanged through saveConnectionProfile.
      for (const field of given) {
        field.apply(options[camelCase(field.flag)]);
      }

      const needValidate = options.validate !== false;
      if (
        (needValidate &&
          (await getTokens(false, true, [state.getDeploymentType()]))) ||
        !needValidate
      ) {
        try {
          await saveConnectionProfile(state.getHost());
          printMessage(`Saved connection profile ${state.getHost()}`);
        } catch (error) {
          printError(error);
          process.exitCode = 1;
        }
      } else {
        printMessage(
          'Validation failed; the profile was NOT changed.',
          'error'
        );
        process.exitCode = 1;
      }
    });

  return program;
}

/** commander's option-attribute convention: --log-api-key -> logApiKey. */
function camelCase(flag: string): string {
  return flag
    .replace(/^--/, '')
    .replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}

/** A settable profile field: its option, its help text, its state write. */
type SettableField = {
  /**
   * The option's FLAG as typed (with dashes) -- both the listing's
   * display and the camelCase lookup key are derived from it, so the
   * listing can never drift from the flags above.
   */
  flag: string;
  /** Placeholder shown in the fields listing (undefined = flag-only). */
  valuePlaceholder?: string;
  /** The listing/help text. */
  description: string;
  /** Writes the option's value into frodo-lib state. */
  apply: (value: any) => void;
};

/**
 * The registry of settable profile fields -- ONE list drives the
 * command's options, the bare-invocation listing, and the state writes,
 * so the three can never disagree. A new profile field is one entry
 * here (+ one Option in setup), never a new command.
 */
const SETTABLE_FIELDS: SettableField[] = [
  {
    flag: '--username',
    valuePlaceholder: 'username',
    description: 'Username to login with.',
    apply: (value) => state.setUsername(value),
  },
  {
    flag: '--password',
    valuePlaceholder: 'password',
    description: 'Password for the username.',
    apply: (value) => state.setPassword(value),
  },
  {
    flag: '--alias',
    valuePlaceholder: 'name',
    description: 'Alias name for this connection profile.',
    apply: (value) => state.setAlias(value),
  },
  {
    flag: '--idm-host',
    valuePlaceholder: 'host',
    description: 'IDM base URL.',
    apply: (value) => state.setIdmHost(value),
  },
  {
    flag: '--log-api-key',
    valuePlaceholder: 'key',
    description: 'Log API key.',
    apply: (value) => state.setLogApiKey(value),
  },
  {
    flag: '--log-api-secret',
    valuePlaceholder: 'secret',
    description: 'Log API secret.',
    apply: (value) => state.setLogApiSecret(value),
  },
  {
    flag: '--authentication-service',
    valuePlaceholder: 'service',
    description: 'Name of the authentication service/tree to use.',
    apply: (value) => state.setAuthenticationService(value),
  },
  {
    flag: '--authentication-header-overrides',
    valuePlaceholder: 'headers',
    description: 'Map of headers sent with all requests (JSON).',
    apply: (value) => state.setAuthenticationHeaderOverrides(JSON.parse(value)),
  },
  {
    flag: '--configuration-header-overrides',
    valuePlaceholder: 'headers',
    description: 'Map of headers sent with all configuration requests (JSON).',
    apply: (value) => state.setConfigurationHeaderOverrides(JSON.parse(value)),
  },
  {
    flag: '--preferred-credential',
    valuePlaceholder: 'type',
    description:
      "Persisted preference for which credential type later implicit commands use ('user' | 'svcacct' | 'amster' | 'browser').",
    apply: (value: CredentialOverrideType) =>
      state.setPreferredCredential(value),
  },
  {
    flag: '--preferred-device-flow',
    description:
      'Device-flow preference: --preferred-device-flow sets true, --no-preferred-device-flow sets false.',
    apply: (value) => state.setPreferredDeviceFlow(value),
  },
  {
    flag: '--allow-insecure',
    description:
      'Allow insecure connections when using SSL/TLS (persisted on the profile).',
    apply: (value) => state.setAllowInsecureConnection(value),
  },
];
