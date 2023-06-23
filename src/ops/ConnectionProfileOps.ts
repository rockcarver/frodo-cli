import fs from 'fs';
import { frodo, state } from '@rockcarver/frodo-lib';
import {
  createObjectTable,
  createTable,
  debugMessage,
  failSpinner,
  printMessage,
  showSpinner,
  succeedSpinner,
} from '../utils/Console';

const { getAccessTokenForServiceAccount } = frodo.login;
const { getConnectionProfilesPath, getConnectionProfileByHost } = frodo.conn;

/**
 * List connection profiles
 * @param {boolean} long Long list format with details
 * @param {State} state library state
 */
export function listConnectionProfiles(long = false) {
  const filename = getConnectionProfilesPath();
  try {
    const data = fs.readFileSync(filename, 'utf8');
    const connectionsData = JSON.parse(data);
    if (Object.keys(connectionsData).length < 1) {
      printMessage(`No connections defined yet in ${filename}`, 'info');
    } else {
      if (long) {
        const table = createTable([
          'Host',
          'Service Account',
          'Username',
          'Log API Key',
        ]);
        Object.keys(connectionsData).forEach((c) => {
          table.push([
            c,
            connectionsData[c].svcacctName || connectionsData[c].svcacctId,
            connectionsData[c].username,
            connectionsData[c].logApiKey,
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
        'Any unique substring of a saved host can be used as the value for host parameter in all commands',
        'info'
      );
    }
  } catch (e) {
    printMessage(`No connections found in ${filename} (${e.message})`, 'error');
  }
}

/**
 * Describe connection profile
 * @param {string} host Host URL or unique substring
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
    if (!showSecrets) {
      if (profile.password) profile.password = present;
      if (profile.logApiSecret) profile.logApiSecret = present;
      if (profile.svcacctJwk) (profile as unknown)['svcacctJwk'] = present;
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
    }
    if (showSecrets && jwk) {
      (profile as unknown)['svcacctJwk'] = 'see below';
    }
    if (!profile.authenticationService) {
      delete profile.authenticationService;
    }
    const keyMap = {
      tenant: 'Host',
      username: 'Username',
      password: 'Password',
      logApiKey: 'Log API Key',
      logApiSecret: 'Log API Secret',
      authenticationService: 'Authentication Service',
      authenticationHeaderOverrides: 'Authentication Header Overrides',
      svcacctName: 'Service Account Name',
      svcacctId: 'Service Account Id',
      svcacctJwk: 'Service Account JWK',
    };
    const table = createObjectTable(profile, keyMap);
    printMessage(table.toString(), 'data');
    if (showSecrets && jwk) {
      printMessage(JSON.stringify(jwk), 'data');
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
      const token = await getAccessTokenForServiceAccount(
        serviceAccountId,
        jwk
      );
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
  } catch (err) {
    failSpinner(
      `Failed to validate service account ${serviceAccountId}: ${err}.`
    );
  }
  return false;
}
