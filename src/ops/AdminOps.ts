import { frodo, state } from '@rockcarver/frodo-lib';
import { Writable } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import { OAuth2ClientSkeleton } from '@rockcarver/frodo-lib/types/api/OAuth2ClientApi';
import { AccessTokenResponseType } from '@rockcarver/frodo-lib/types/api/OAuth2OIDCApi';
import { OAuth2TrustedJwtIssuerSkeleton } from '@rockcarver/frodo-lib/types/api/OAuth2TrustedJwtIssuerApi';
import {
  FullExportInterface,
  FullExportOptions,
} from '@rockcarver/frodo-lib/types/ops/AdminOps';
import { JwkRsa, JwksInterface } from '@rockcarver/frodo-lib/types/ops/JoseOps';
import { ScriptExportInterface } from '@rockcarver/frodo-lib/types/ops/ScriptOps';
import fs from 'fs';

import {
  cleanupProgressIndicators,
  createKeyValueTable,
  createProgressIndicator,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { extractScriptToFile } from './ScriptOps';

const {
  getRealmName,
  getTypedFilename,
  titleCase,
  saveJsonToFile,
  getFilePath,
  getWorkingDirectory,
} = frodo.utils;
const {
  exportFullConfiguration,
  generateRfc7523AuthZGrantArtifacts: _generateRfc7523AuthZGrantArtifacts,
  executeRfc7523AuthZGrantFlow: _executeRfc7523AuthZGrantFlow,
} = frodo.admin;
const { stringify } = frodo.utils.json;
const { readOAuth2TrustedJwtIssuer } = frodo.oauth2oidc.issuer;

function getJwkFilePath(clientId: string): string {
  return getFilePath(getTypedFilename(clientId + '_private', 'jwk'), true);
}

function getJwksFilePath(clientId: string): string {
  return getFilePath(getTypedFilename(clientId + '_public', 'jwks'), true);
}

export async function generateRfc7523AuthZGrantArtifacts(
  clientId: string,
  iss: string,
  jwk?: JwkRsa,
  sub?: string,
  scope?: string[],
  options?: { save: boolean },
  json?: boolean
): Promise<boolean> {
  let artifacts: {
    jwk: JwkRsa;
    jwks: JwksInterface;
    client: OAuth2ClientSkeleton;
    issuer: OAuth2TrustedJwtIssuerSkeleton;
  };
  try {
    const barId = createProgressIndicator(
      'determinate',
      options.save ? 3 : 1,
      'Generating artifacts...'
    );
    artifacts = await _generateRfc7523AuthZGrantArtifacts(
      clientId,
      iss,
      jwk,
      sub,
      scope,
      options
    );
    updateProgressIndicator(barId, 'Successfully generated artifacts.');
    let jwkFile: string;
    let jwksFile: string;
    if (options.save) {
      const jwkBarId = createProgressIndicator(
        'determinate',
        1,
        'Saving JWK (private key)...'
      );
      jwkFile = getJwkFilePath(clientId);
      saveJsonToFile(artifacts.jwk, jwkFile, false);
      updateProgressIndicator(jwkBarId, `Saved JWK to ${jwkFile}.`);
      updateProgressIndicator(barId, 'Successfully saved JWK (private key).');
      stopProgressIndicator(jwkBarId);
      const jwksBarId = createProgressIndicator(
        'determinate',
        1,
        'Saving JWKS (public key)...'
      );
      jwksFile = getJwksFilePath(clientId);
      saveJsonToFile(artifacts.jwks, jwksFile, false);
      updateProgressIndicator(jwksBarId, `Saved JWKS to ${jwksFile}.`);
      stopProgressIndicator(jwksBarId);
      updateProgressIndicator(barId, 'Successfully saved JWKS (public key).');
    }
    stopProgressIndicator(
      barId,
      `Successfully generated ${
        options.save ? 'and saved artifacts' : 'artifacts'
      }.`
    );
    cleanupProgressIndicators();

    if (json) {
      printMessage(artifacts, 'data');
    } else {
      printMessage(
        options.save
          ? `\nCreated oauth2 client in the ${state.getRealm()} realm:`
          : `\nIn AM, create an OAuth2 client in the ${state.getRealm()} realm with the following information:`
      );
      const client = createKeyValueTable();
      client.push(['Client ID'['brightCyan'], clientId]);
      client.push(['Client Name'['brightCyan'], clientId]);
      client.push([
        'Scopes'['brightCyan'],
        (
          artifacts.client.coreOAuth2ClientConfig.scopes as Writable<string[]>
        ).value.join(', '),
      ]);
      client.push([
        'Client Type'['brightCyan'],
        (artifacts.client.coreOAuth2ClientConfig.clientType as Writable<string>)
          .value,
      ]);
      client.push([
        'Grant Types'['brightCyan'],
        (
          artifacts.client.advancedOAuth2ClientConfig.grantTypes as Writable<
            string[]
          >
        ).value.join(', '),
      ]);
      client.push([
        'Implied Consent'['brightCyan'],
        (
          artifacts.client.advancedOAuth2ClientConfig
            .isConsentImplied as Writable<boolean>
        ).value,
      ]);
      client.push([
        'Token Endpoint Authentication '['brightCyan'],
        (
          artifacts.client.advancedOAuth2ClientConfig
            .tokenEndpointAuthMethod as Writable<string>
        ).value,
      ]);
      client.push([
        'Public Key Selector'['brightCyan'],
        (
          artifacts.client.signEncOAuth2ClientConfig
            .publicKeyLocation as Writable<string>
        ).value,
      ]);
      client.push([
        'JWKS (Public Key)'['brightCyan'],
        options.save ? `${jwksFile}` : 'See below',
      ]);
      printMessage(`\n${client.toString()}`);

      printMessage(
        options.save
          ? `\nCreated oauth2 trusted issuer in the ${state.getRealm()} realm:`
          : `\nIn AM, create a trusted issuer in the ${state.getRealm()} realm with the following information:`
      );
      const issuer = createKeyValueTable();
      issuer.push(['Name'['brightCyan'], artifacts.issuer._id]);
      issuer.push([
        'JWT Issuer'['brightCyan'],
        (artifacts.issuer.issuer as Writable<string>).value,
      ]);
      issuer.push([
        'Allowed Subjects              '['brightCyan'],
        (artifacts.issuer.allowedSubjects as Writable<string[]>)?.value.length
          ? (
              artifacts.issuer.allowedSubjects as Writable<string[]>
            )?.value.join(', ')
          : `Any ${state.getRealm()} realm user`,
      ]);
      issuer.push([
        'JWKS (Public Key)'['brightCyan'],
        options.save ? `${jwksFile}` : 'See below',
      ]);
      printMessage(`\n${issuer.toString()}`);
      if (!options.save) {
        printMessage('\nJWK (Private Key)'['brightCyan']);
        printMessage(stringify(artifacts.jwk));
        printMessage('\nJWKS (Public Key)'['brightCyan']);
        printMessage(stringify(artifacts.jwks));
      }
    }
    return true;
  } catch (error) {
    printMessage(error, 'error');
    return false;
  }
}

export async function executeRfc7523AuthZGrantFlow(
  clientId: string,
  iss?: string,
  jwk?: JwkRsa,
  sub?: string,
  scope?: string[],
  json?: boolean
): Promise<boolean> {
  let tokenResponse: AccessTokenResponseType;
  let spinnerId: string;
  try {
    let issuer: OAuth2TrustedJwtIssuerSkeleton;
    // make sure we have an issuer
    if (!iss) {
      let issSpinnerId: string;
      try {
        issSpinnerId = createProgressIndicator(
          'indeterminate',
          0,
          'No issuer provided, attempting to find suitable issuer...'
        );
        if (!issuer)
          issuer = await readOAuth2TrustedJwtIssuer(clientId + '-issuer');
        iss = (issuer.issuer as Writable<string>).value;
        stopProgressIndicator(
          issSpinnerId,
          `Found suitable issuer: ${clientId + '-issuer'} - ${iss}`,
          'success'
        );
      } catch (error) {
        stopProgressIndicator(
          issSpinnerId,
          `No issuer provided and no suitable issuer could be found: ${error.message}`,
          'fail'
        );
      }
    }
    // make sure we have a JWK
    if (!jwk) {
      let jwkSpinnerId: string;
      try {
        jwkSpinnerId = createProgressIndicator(
          'indeterminate',
          0,
          'No JWK provided, attempting to locate a suitable JWK...'
        );
        jwk = JSON.parse(fs.readFileSync(getJwkFilePath(clientId), 'utf8'));
        stopProgressIndicator(
          jwkSpinnerId,
          `Loaded private key JWK from: ${getJwkFilePath(clientId)}`,
          'success'
        );
      } catch (error) {
        stopProgressIndicator(
          jwkSpinnerId,
          `No JWK provided and no suitable JWK could be loaded from file: ${error.message}`,
          'fail'
        );
      }
    }
    // make sure we have a subject
    if (!sub) {
      let subSpinnerId: string;
      try {
        subSpinnerId = createProgressIndicator(
          'indeterminate',
          0,
          'Executing rfc7523 authz grant flow...'
        );
        if (!issuer)
          issuer = await frodo.oauth2oidc.issuer.readOAuth2TrustedJwtIssuer(
            clientId + '-issuer'
          );
        if (
          (issuer.allowedSubjects as Writable<string[]>).value &&
          (issuer.allowedSubjects as Writable<string[]>).value.length
        )
          sub = (issuer.allowedSubjects as Writable<string[]>).value[0];
      } catch (error) {
        stopProgressIndicator(
          subSpinnerId,
          `No subject provided and no suitable subject could be extracted from the trusted issuer configuration: ${error.message}`,
          'fail'
        );
      }
      if (sub) {
        stopProgressIndicator(
          subSpinnerId,
          `Using first subject from issuer's allowed subjects: ${sub}`,
          'success'
        );
      } else {
        stopProgressIndicator(
          subSpinnerId,
          `No subject provided and no suitable subject could be extracted from the trusted issuer's list of allowed subjects.`,
          'success'
        );
      }
    }
    // we got everything we need, let's get that token
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      'Executing rfc7523 authz grant flow...'
    );
    tokenResponse = await _executeRfc7523AuthZGrantFlow(
      clientId,
      iss,
      jwk,
      sub,
      scope
    );
    stopProgressIndicator(
      spinnerId,
      'Successfully executed rfc7523 authz grant flow.',
      'success'
    );
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error executing rfc7523 authz grant flow: ${stringify(
        error.response?.data || error.message
      )}`,
      'fail'
    );
    return false;
  }
  cleanupProgressIndicators();

  if (json) {
    printMessage(tokenResponse, 'data');
  } else {
    printMessage('\nAccess Token'['brightCyan']);
    printMessage(tokenResponse.access_token);
    if (tokenResponse.id_token) {
      printMessage('\nIdentity Token'['brightCyan']);
      printMessage(tokenResponse.id_token);
    }
  }
  return true;
}

/**
 * Export everything to separate files
 * @param file file name
 * @param {FullExportOptions} options export options
 */
export async function exportEverythingToFile(
  file,
  options: FullExportOptions = {
    useStringArrays: true,
    noDecode: false,
  }
): Promise<void> {
  const exportData = await exportFullConfiguration(options);
  let fileName = getTypedFilename(
    `${titleCase(getRealmName(state.getRealm()))}`,
    `everything`
  );
  if (file) {
    fileName = file;
  }
  saveJsonToFile(exportData, getFilePath(fileName, true));
}

/**
 * Export everything to separate files
 * @param extract Extracts the scripts from the exports into separate files if true
 * @param {FullExportOptions} options export options
 */
export async function exportEverythingToFiles(
  extract = false,
  options: FullExportOptions = {
    useStringArrays: true,
    noDecode: false,
  }
): Promise<void> {
  const exportData: FullExportInterface =
    await exportFullConfiguration(options);
  delete exportData.meta;
  const baseDirectory = getWorkingDirectory(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Object.entries(exportData).forEach(([type, obj]: [string, any]) => {
    if (obj) {
      if (!fs.existsSync(`${baseDirectory}/${type}`)) {
        fs.mkdirSync(`${baseDirectory}/${type}`);
      }
      if (type == 'saml') {
        const samlData = {
          saml: {
            cot: {},
            hosted: {},
            metadata: {},
            remote: {},
          },
        };
        if (obj.cot) {
          if (!fs.existsSync(`${baseDirectory}/cot`)) {
            fs.mkdirSync(`${baseDirectory}/cot`);
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Object.entries(obj.cot).forEach(([id, value]: [string, any]) => {
            samlData.saml.cot = {
              [id]: value,
            };
            saveJsonToFile(
              samlData,
              `${baseDirectory}/cot/${getTypedFilename(id, 'cot.saml')}`
            );
          });
          samlData.saml.cot = {};
        }
        Object.entries(obj.hosted)
          .concat(Object.entries(obj.remote))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .forEach(([id, value]: [string, any]) => {
            const filename = getTypedFilename(
              value.entityId ? value.entityId : id,
              type
            );
            const samlType = obj.hosted[id] ? 'hosted' : 'remote';
            samlData.saml[samlType][id] = value;
            samlData.saml.metadata = {
              [id]: obj.metadata[id],
            };
            saveJsonToFile(samlData, `${baseDirectory}/${type}/${filename}`);
            samlData.saml[samlType] = {};
          });
      } else if (type == 'authentication') {
        const fileName = getTypedFilename(
          `${frodo.utils.getRealmName(state.getRealm())}Realm`,
          'authentication.settings'
        );
        saveJsonToFile(
          {
            authentication: obj,
          },
          `${baseDirectory}/${type}/${fileName}`
        );
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Object.entries(obj).forEach(([id, value]: [string, any]) => {
          const filename =
            type == 'config'
              ? `${id}.json`
              : getTypedFilename(value.name ? value.name : id, type);
          if (type == 'config' && filename.includes('/')) {
            fs.mkdirSync(
              `${baseDirectory}/${type}/${filename.slice(
                0,
                filename.lastIndexOf('/')
              )}`,
              {
                recursive: true,
              }
            );
          }
          if (extract && type == 'script') {
            extractScriptToFile(exportData as ScriptExportInterface, id, type);
          }
          saveJsonToFile(
            {
              [type]: {
                [id]: value,
              },
            },
            `${baseDirectory}/${type}/${filename}`
          );
        });
      }
    }
  });
}
