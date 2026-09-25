import { frodo, state } from '@rockcarver/frodo-lib';
import fs from 'fs';

import {
  createObjectTable,
  createTable,
  debugMessage,
  failSpinner,
  printError,
  printMessage,
  showSpinner,
  succeedSpinner,
} from '../utils/Console';
import {
  escapableSelect,
  type EscapableSelectChoice,
  ESCAPE,
} from '../utils/interactive/EscapableSelectPrompt';
import type { CredentialOverrideType } from './AuthenticateOps';

const { validateServiceAccount } = frodo.cloud.serviceAccount;
const {
  getConnectionProfilesPath,
  getConnectionProfileByHost,
  saveConnectionProfile,
} = frodo.conn;

/**
 * List connection profiles
 * @param {boolean} long Long list format with details
 * @returns {void} void
 */
export function listConnectionProfiles(long: boolean = false): void {
  const filename = getConnectionProfilesPath();
  try {
    const data = fs.readFileSync(filename, 'utf8');
    const connectionsData = JSON.parse(data);
    if (Object.keys(connectionsData).length < 1) {
      printMessage(`No connection profiles in ${filename}`, 'info');
    } else {
      if (long) {
        const table = createTable([
          'Host',
          'Alias',
          'Service Account',
          'Username',
          'Log API Key',
          'Authentication Service',
        ]);
        Object.keys(connectionsData).forEach((c) => {
          table.push([
            c,
            connectionsData[c].alias,
            connectionsData[c].svcacctName || connectionsData[c].svcacctId,
            connectionsData[c].username,
            connectionsData[c].logApiKey ? '[present]' : undefined,
            connectionsData[c].authenticationService,
          ]);
        });
        printMessage(table.toString(), 'data');
      } else {
        Object.keys(connectionsData).forEach((c) => {
          printMessage(`${c}`, 'data');
        });
        // getUniqueNames(5, Object.keys(connectionsData));
      }
      printMessage(
        'Any unique substring or alias of a saved host can be used as the value for host parameter in all commands',
        'info'
      );
    }
  } catch (error) {
    printMessage(`No connection profiles found in ${filename}`, 'error');
    printError(error);
  }
}

/**
 * Describe connection profile
 * @param {string} host Host URL, unique substring, or alias
 * @param {boolean} showSecrets Whether secrets should be shown in clear text or not
 */
export async function describeConnectionProfile(
  host: string,
  showSecrets: boolean
) {
  debugMessage(`ConnectionProfileOps.describeConnectionProfile: start`);
  const profile = await getConnectionProfileByHost(host);
  if (profile) {
    debugMessage(profile);
    const present = '[present]';
    const jwk = profile.svcacctJwk;
    const privateKey = profile.amsterPrivateKey;
    if (!showSecrets) {
      if (profile.password) profile.password = present;
      if (profile.logApiSecret) profile.logApiSecret = present;
      if (profile.svcacctJwk) (profile as unknown)['svcacctJwk'] = present;
      if (profile.amsterPrivateKey) profile.amsterPrivateKey = present;
    }
    if (!profile.idmHost) {
      delete profile.idmHost;
    }
    if (profile.allowInsecureConnection === undefined) {
      delete profile.allowInsecureConnection;
    }
    if (!profile.deploymentType) {
      delete profile.deploymentType;
    }
    if (profile.isIGA === undefined) {
      delete profile.isIGA;
    }
    if (!profile.adminClientId) {
      delete profile.adminClientId;
    }
    if (!profile.adminClientRedirectUri) {
      delete profile.adminClientRedirectUri;
    }
    if (!profile.username) {
      delete profile.username;
      delete profile.password;
    }
    if (!profile.logApiKey) {
      delete profile.logApiKey;
      delete profile.logApiSecret;
    }
    if (!profile.svcacctId) {
      delete profile.svcacctId;
      delete profile.svcacctJwk;
      delete profile.svcacctName;
      delete profile.svcacctScope;
    }
    if (!profile.svcacctScope) {
      delete profile.svcacctScope;
    } else {
      try {
        profile.svcacctScope = profile.svcacctScope
          .split(' ')
          .sort((a, b) => a.localeCompare(b))
          .join('\n');
      } catch {
        // do nothing
      }
    }
    if (!profile.amsterPrivateKey) {
      delete profile.amsterPrivateKey;
    }
    if (showSecrets && jwk) {
      (profile as unknown)['svcacctJwk'] = 'see below';
    }
    if (showSecrets && privateKey) {
      profile.amsterPrivateKey = 'see below';
    }
    if (!profile.authenticationService) {
      delete profile.authenticationService;
    }
    if (!profile.alias) {
      delete profile.alias;
    }
    if (!profile.defaultCredential) {
      delete profile.defaultCredential;
    }
    if (profile.preferredDeviceFlow === undefined) {
      delete profile.preferredDeviceFlow;
    }
    // Browser-login fields -- only ever written to a profile that's
    // actually completed a browser login at least once (see frodo-lib's
    // saveConnectionProfile(), which gates client id/scope behind
    // `preferredCredential === 'browser'`), so a plain username/password or
    // service-account profile will never have these keys at all. Omitted
    // here like every other optional field above, rather than shown as
    // permanently-blank rows for a feature the profile has never used.
    // authMode itself is frozen legacy-read-only (see saveConnectionProfile()'s
    // own remarks) -- still shown when present, since an old profile that
    // predates preferredCredential may still only have this to show.
    if (!profile.authMode) {
      delete profile.authMode;
    }
    if (!profile.browserLoginClientId) {
      delete profile.browserLoginClientId;
    }
    if (!profile.browserLoginScope) {
      delete profile.browserLoginScope;
    }
    const keyMap = {
      tenant: 'Host',
      alias: 'Alias',
      deploymentType: 'Deployment Type',
      username: 'Username',
      password: 'Password',
      logApiKey: 'Log API Key',
      logApiSecret: 'Log API Secret',
      authenticationService: 'Authentication Service',
      authenticationHeaderOverrides: 'Authentication Header Overrides',
      svcacctName: 'Service Account Name',
      svcacctId: 'Service Account Id',
      svcacctJwk: 'Service Account JWK',
      svcacctScope: 'Service Account Scope',
      amsterPrivateKey: 'Amster Private Key',
      defaultCredential: 'Preferred Credential',
      preferredDeviceFlow: 'Preferred Device Flow',
      authMode: 'Auth Mode (legacy)',
      browserLoginClientId: 'Browser Login Client Id',
      browserLoginScope: 'Browser Login Scope',
    };
    const table = createObjectTable(profile, keyMap);
    printMessage(table.toString(), 'data');
    if (showSecrets && jwk) {
      printMessage(JSON.stringify(jwk), 'data');
    }
    if (showSecrets && privateKey) {
      printMessage(privateKey, 'data');
    }
  } else {
    printMessage(`No connection profile ${host} found`);
  }
  debugMessage(`ConnectionProfileOps.describeConnectionProfile: end`);
}

export async function addExistingServiceAccount(
  serviceAccountId: string,
  privateKeyFile: string,
  validate: boolean
): Promise<boolean> {
  try {
    const data = fs.readFileSync(privateKeyFile);
    const jwk = JSON.parse(data.toString());
    if (validate) {
      showSpinner(`Validating service account ${serviceAccountId}...`);
      const token = await validateServiceAccount(serviceAccountId, jwk);
      if (token === null) {
        failSpinner(`Failed to validate service account ${serviceAccountId}.`);
        return false;
      } else {
        succeedSpinner(
          `Successfully validated service account ${serviceAccountId}.`
        );
      }
    }
    state.setServiceAccountId(serviceAccountId);
    state.setServiceAccountJwk(jwk);
    return true;
  } catch (error) {
    failSpinner(
      `Failed to validate service account ${serviceAccountId}: ${error}.`
    );
    printError(error);
  }
  return false;
}

/**
 * The interactive picker behind bare `frodo conn [host]` -- lets the user
 * view and set one profile's preferred credential, mirroring `frodo
 * settings`'s bare-invocation pattern (see `settings.ts`/
 * `runInteractiveThemePicker` in `settings-theme.ts`). v1 scope only:
 * viewing/setting the preferred credential for one already-existing
 * profile -- no profile creation, deletion, or alias management here.
 * @param {string} host Optional host URL, unique substring, or alias. When
 * omitted, offers a picker across every saved profile (skipping straight to
 * it if there's only one), the same way `settings.ts` skips its own
 * category picker when there's only one category.
 * @returns {Promise<boolean>} true if a preference was actually set and
 * saved; false if the user escaped without choosing, or no profile could be
 * resolved.
 */
export async function runInteractivePreferredCredentialPicker(
  host?: string
): Promise<boolean> {
  let resolvedHost: string;
  if (host) {
    resolvedHost = host;
  } else {
    const filename = getConnectionProfilesPath();
    let connectionsData: Record<string, { alias?: string }>;
    try {
      connectionsData = JSON.parse(fs.readFileSync(filename, 'utf8'));
    } catch {
      connectionsData = {};
    }
    const hosts = Object.keys(connectionsData);
    if (hosts.length === 0) {
      printMessage(
        `No connection profiles found in ${filename}. Create one first with 'frodo conn save' or 'frodo login --save'.`,
        'info'
      );
      return false;
    }
    if (hosts.length === 1) {
      resolvedHost = hosts[0];
    } else {
      const choice = await escapableSelect<string>({
        message: 'Choose a connection profile:',
        choices: hosts.map((h) => ({
          value: h,
          name: connectionsData[h].alias
            ? `${h} (${connectionsData[h].alias})`
            : h,
        })),
      });
      if (choice === ESCAPE) return false;
      resolvedHost = choice;
    }
  }

  let profile;
  try {
    profile = await getConnectionProfileByHost(resolvedHost);
  } catch (error) {
    printError(error);
    return false;
  }

  // Only offer what's actually configured on this profile -- 'browser' is
  // always offerable, since any profile can do a fresh interactive login
  // regardless of what else is configured.
  const credentialChoices: EscapableSelectChoice<CredentialOverrideType>[] = [];
  if (profile.username && profile.password) {
    credentialChoices.push({
      value: 'user',
      name: 'user (plain username/password)',
    });
  }
  if (profile.svcacctId) {
    credentialChoices.push({
      value: 'svcacct',
      name: 'svcacct (service account)',
    });
  }
  if (profile.amsterPrivateKey) {
    credentialChoices.push({
      value: 'amster',
      name: 'amster (Amster private key)',
    });
  }
  credentialChoices.push({
    value: 'browser',
    name: 'browser (interactive login)',
  });

  // Default the cursor to whatever's already in effect -- the explicit
  // preferredCredential if this profile has one, else (for a profile that
  // predates that field) whatever its legacy authMode implies, else no
  // default at all.
  const currentPreference: CredentialOverrideType | undefined =
    profile.defaultCredential ??
    (profile.authMode === 'interactive' ? 'browser' : undefined);

  const selected = await escapableSelect<CredentialOverrideType>({
    message: `Preferred credential for ${profile.tenant}:`,
    choices: credentialChoices,
    default: currentPreference,
  });
  if (selected === ESCAPE) return false;

  state.setHost(profile.tenant);
  state.setPreferredCredential(selected);
  try {
    await saveConnectionProfile(profile.tenant);
  } catch (error) {
    printError(error);
    return false;
  }
  printMessage(`Saved connection profile ${state.getHost()}`);
  return true;
}
