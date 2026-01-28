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

const { getAccessTokenForServiceAccount } = frodo.login;
const { getConnectionProfilesPath, getConnectionProfileByHost } = frodo.conn;

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
          'Service Account',
          'Username',
          'Log API Key',
          'Authentication Service',
        ]);
        Object.keys(connectionsData).forEach((c) => {
          table.push([
            c,
            connectionsData[c].svcacctName || connectionsData[c].svcacctId,
            connectionsData[c].username,
            connectionsData[c].logApiKey,
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
        'Any unique substring of a saved host can be used as the value for host parameter in all commands',
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
      } catch (error) {
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
    const keyMap = {
      tenant: 'Host',
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
  } catch (error) {
    failSpinner(
      `Failed to validate service account ${serviceAccountId}: ${error}.`
    );
    printError(error);
  }
  return false;
}
