import fs from 'fs';
import { Authenticate, state } from '@rockcarver/frodo-lib';
import { failSpinner, showSpinner, succeedSpinner } from '../utils/Console';

const { getAccessTokenForServiceAccount } = Authenticate;

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
    state.default.session.setServiceAccountId(serviceAccountId);
    state.default.session.setServiceAccountJwk(jwk);
    return true;
  } catch (err) {
    failSpinner(
      `Failed to validate service account ${serviceAccountId}: ${err}.`
    );
    return false;
  }
  return false;
}
