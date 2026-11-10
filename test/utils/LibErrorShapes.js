/**
 * Errors shaped like the ones frodo-lib reports for a journey that cannot be
 * exported because some of its nodes cannot be read (frodo-lib 5.0.0-31,
 * `exportSingleJourney` in src/ops/JourneyOps.ts, `readNode` in src/ops/NodeOps.ts,
 * `getResult` in src/utils/ExportImportUtils.ts, `FrodoError` in src/ops/FrodoError.ts).
 *
 * The test cannot load the library under jest, so this module repeats the parts of
 * `FrodoError` that decide what the error looks like: the nested errors, the http
 * fields taken from the first nested error, and `getCombinedMessage` (which is also
 * `toString`). Keep it in step with the library; the first test of
 * JourneyExportErrors.test.js prints one of these errors and compares it with what
 * the command printed on a real tenant.
 */

export class FrodoError extends Error {
  constructor(message, originalErrors = null) {
    super(message);
    this.name = 'FrodoError';
    this.originalErrors = [];
    this.isHttpError = false;
    if (originalErrors && Array.isArray(originalErrors)) {
      this.originalErrors = originalErrors;
    } else if (originalErrors) {
      this.originalErrors = [originalErrors];
    }
    if (originalErrors) {
      const original = this.originalErrors[0];
      const data = original.response?.data;
      this.isHttpError = original.name === 'AxiosError';
      this.httpCode = original.code;
      this.httpStatus = original.response ? original.response.status : null;
      this.httpMessage = data ? data.message : null;
      this.httpDetail = data ? data.detail : null;
      this.httpErrorText = data ? data.error : null;
      this.httpErrorReason = data ? data.reason : null;
      this.httpDescription = data ? data.error_description : null;
    }
  }

  getCombinedMessage(level = 1) {
    const indent = '  '.repeat(level);
    let combined = this.message || '';
    for (const original of this.originalErrors) {
      if (original.name === 'FrodoError') {
        combined += `\n${indent}${original.getCombinedMessage(level + 1)}`;
      } else if (original.name === 'AxiosError') {
        combined += `\n${indent}Network error:`;
        if (original.config?.url)
          combined += `\n${indent}  URL: ${original.config.url}`;
        if (original.response?.status)
          combined += `\n${indent}  Status: ${original.response.status}`;
        if (original.code) combined += `\n${indent}  Code: ${original.code}`;
        const data = original.response?.data;
        if (data?.error) combined += `\n${indent}  Error: ${data.error}`;
        if (data?.reason) combined += `\n${indent}  Reason: ${data.reason}`;
        if (data?.message) combined += `\n${indent}  Message: ${data.message}`;
        if (data?.detail)
          combined += `\n${indent}  Detail: ${
            typeof data.detail === 'object'
              ? JSON.stringify(data.detail)
              : data.detail
          }`;
        if (data?.error_description)
          combined += `\n${indent}  Description: ${data.error_description}`;
      } else {
        combined += `\n${indent}${original.message}`;
      }
    }
    return combined;
  }

  toString() {
    return this.getCombinedMessage();
  }
}

/** The axios error of a node read that the tenant answered with `status`. */
export function httpError(url, status = 404, data) {
  const body = data ?? {
    code: status,
    reason: 'Not Found',
    message: 'Not Found',
  };
  const error = new Error(`Request failed with status code ${status}`);
  error.name = 'AxiosError';
  error.code = status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST';
  error.config = { url };
  error.response = { status, data: body };
  return error;
}

const nodeUrl = (type, id) =>
  `https://matrix.example.com/am/json/realms/root/realms/alpha/realm-config/authentication/authenticationtrees/nodes/${type}/1.0/${id}`;

/** What `readNode` throws: one error named after the node, caused by the http error. */
export function readNodeError(type, id, status = 404, data) {
  return new FrodoError(
    `Error reading ${type} node ${id}`,
    httpError(nodeUrl(type, id), status, data)
  );
}

/**
 * What `exportSingleJourney` collects for a node inside a page node
 * (`new FrodoError(settledPromise.reason)`): the library hands the error itself
 * to the constructor as the message, so the message of the new error is the
 * whole multi-line text of the original and the new error has no causes.
 */
export function innerNodeError(type, id, status = 404, data) {
  return new FrodoError(readNodeError(type, id, status, data));
}

/**
 * The error of one journey as the result callback of `exportJourneys` receives
 * it: `getResult` wraps what `exportSingleJourney` throws, and that is a
 * wrapper around the list of errors collected.
 */
export function journeyError(journeyId, items, realm = 'alpha') {
  return new FrodoError(
    `Error exporting the ${realm} realm journey ${journeyId}`,
    new FrodoError(`Error exporting ${realm} realm journey ${journeyId}`, items)
  );
}

/** The error of the journey in the report that led to this change. */
export function passwordBreachDetectionError() {
  return journeyError('PasswordBreachDetection', [
    innerNodeError(
      'ValidatedPasswordNode',
      '53bbcda5-0f75-4f95-bafe-6208020e9d8f'
    ),
    innerNodeError('MessageNode', '84a508f5-7f31-44ec-981f-a64dcfe8ffdd'),
    innerNodeError('MessageNode', 'e90307e7-8e1a-4b08-bc23-8810f9308758'),
    innerNodeError('MessageNode', 'd0b058da-3d5a-41e0-92d5-5dfc3892ee6c'),
  ]);
}
