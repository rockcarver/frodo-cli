import { frodo, state } from '@rockcarver/frodo-lib';
import { Writable } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import { OAuth2ClientSkeleton } from '@rockcarver/frodo-lib/types/api/OAuth2ClientApi';
import { AccessTokenResponseType } from '@rockcarver/frodo-lib/types/api/OAuth2OIDCApi';
import { OAuth2TrustedJwtIssuerSkeleton } from '@rockcarver/frodo-lib/types/api/OAuth2TrustedJwtIssuerApi';
import { JwkRsa, JwksInterface } from '@rockcarver/frodo-lib/types/ops/JoseOps';
import fs from 'fs';

import {
  cleanupProgressIndicators,
  createKeyValueTable,
  createProgressIndicator,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';

const { getTypedFilename, saveJsonToFile, getFilePath } = frodo.utils;
const {
  generateRfc7523AuthZGrantArtefacts: _generateRfc7523AuthZGrantArtefacts,
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

export async function generateRfc7523AuthZGrantArtefacts(
  clientId: string,
  iss: string,
  jwk?: JwkRsa,
  sub?: string,
  scope?: string[],
  options?: { save: boolean },
  json?: boolean
): Promise<boolean> {
  let artefacts: {
    jwk: JwkRsa;
    jwks: JwksInterface;
    client: OAuth2ClientSkeleton;
    issuer: OAuth2TrustedJwtIssuerSkeleton;
  };
  try {
    const barId = createProgressIndicator(
      'determinate',
      options.save ? 3 : 1,
      'Generating artefacts...'
    );
    artefacts = await _generateRfc7523AuthZGrantArtefacts(
      clientId,
      iss,
      jwk,
      sub,
      scope,
      options
    );
    updateProgressIndicator(barId, 'Successfully generated artefacts.');
    let jwkFile: string;
    let jwksFile: string;
    if (options.save) {
      const jwkBarId = createProgressIndicator(
        'determinate',
        1,
        'Saving JWK (private key)...'
      );
      jwkFile = getJwkFilePath(clientId);
      saveJsonToFile(artefacts.jwk, jwkFile, false);
      updateProgressIndicator(jwkBarId, `Saved JWK to ${jwkFile}.`);
      updateProgressIndicator(barId, 'Successfully saved JWK (private key).');
      stopProgressIndicator(jwkBarId);
      const jwksBarId = createProgressIndicator(
        'determinate',
        1,
        'Saving JWKS (public key)...'
      );
      jwksFile = getJwksFilePath(clientId);
      saveJsonToFile(artefacts.jwks, jwksFile, false);
      updateProgressIndicator(jwksBarId, `Saved JWKS to ${jwksFile}.`);
      stopProgressIndicator(jwksBarId);
      updateProgressIndicator(barId, 'Successfully saved JWKS (public key).');
    }
    stopProgressIndicator(
      barId,
      `Successfully generated ${
        options.save ? 'and saved artefacts' : 'artefacts'
      }.`
    );
    cleanupProgressIndicators();

    if (json) {
      printMessage(artefacts, 'data');
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
          artefacts.client.coreOAuth2ClientConfig.scopes as Writable<string[]>
        ).value.join(', '),
      ]);
      client.push([
        'Client Type'['brightCyan'],
        (artefacts.client.coreOAuth2ClientConfig.clientType as Writable<string>)
          .value,
      ]);
      client.push([
        'Grant Types'['brightCyan'],
        (
          artefacts.client.advancedOAuth2ClientConfig.grantTypes as Writable<
            string[]
          >
        ).value.join(', '),
      ]);
      client.push([
        'Implied Consent'['brightCyan'],
        (
          artefacts.client.advancedOAuth2ClientConfig
            .isConsentImplied as Writable<boolean>
        ).value,
      ]);
      client.push([
        'Token Endpoint Authentication '['brightCyan'],
        (
          artefacts.client.advancedOAuth2ClientConfig
            .tokenEndpointAuthMethod as Writable<string>
        ).value,
      ]);
      client.push([
        'Public Key Selector'['brightCyan'],
        (
          artefacts.client.signEncOAuth2ClientConfig
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
      issuer.push(['Name'['brightCyan'], artefacts.issuer._id]);
      issuer.push([
        'JWT Issuer'['brightCyan'],
        (artefacts.issuer.issuer as Writable<string>).value,
      ]);
      issuer.push([
        'Allowed Subjects              '['brightCyan'],
        (artefacts.issuer.allowedSubjects as Writable<string[]>)?.value.length
          ? (
              artefacts.issuer.allowedSubjects as Writable<string[]>
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
        printMessage(stringify(artefacts.jwk));
        printMessage('\nJWKS (Public Key)'['brightCyan']);
        printMessage(stringify(artefacts.jwks));
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
