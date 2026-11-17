// Stub of test/e2e/utils/TestUtils.js for the recording identity collector (see
// jest.config.mjs): records every command a test would run, with the
// FRODO_TEST_NAME of its env and whether the test is skipped, and does nothing
// else. Every export of TestUtils.js must exist here, which
// test/unit/E2eRecordingIdentity.test.js checks.
import fs from 'node:fs';

const OUT = process.env.COLLECT_OUT;

function record(kind, command, envWrapper) {
  if (!OUT) throw new Error('COLLECT_OUT is not set');
  const state = globalThis.expect?.getState?.() ?? {};
  fs.appendFileSync(
    OUT,
    JSON.stringify({
      kind,
      cmd: command,
      skipped: !!globalThis.__skipped,
      pin: envWrapper?.env?.FRODO_TEST_NAME ?? null,
      file: (state.testPath || '').split('/test/e2e/')[1] || state.testPath,
      test: state.currentTestName,
    }) + '\n'
  );
}

export const exec = async (command, options = {}) => {
  record('exec', command, options);
  return { stdout: '', stderr: '' };
};
export const testExport = async (command, env) => {
  record('testExport', command, env);
};
export const testSuccess = async (command, env) => {
  record('testSuccess', command, env);
};
export const testFail = async (command, env) => {
  record('testFail', command, env);
};
export const testPromote = async () => {};
export const getEnv = (connection) => ({
  env: {
    ...(connection?.type ? { FRODO_MOCK_DEPLOYMENT: connection.type } : {}),
    ...(connection?.host ? { FRODO_HOST: connection.host } : {}),
  },
});
export const getRecordingEnv = getEnv;
export const isRecordingMode = () => false;
export const logRecordingProgress = () => {};
export const execWithRecordingProgress = exec;
export const assertNoPollyReplayError = (text) => text;
export const removePollyRecordingNoise = (text) => text;
export const normalizeSnapshotText = (text) => text;
export const maskTransactionIds = (text) => text;
export const maskUserAgentVersions = (text) => text;
export const normalizeStackPaths = (text) => text;
export const removeExpiryNoise = (text) => text;
export const removeRecordModeNoise = (text) => text;
// The collector runs every test, skipped or not.
export const testif = () => test;
export const stageFixture = async (command, env) => {
  record('stageFixture', command, env);
};
export const stageFixtureAndVerify = async (stage, verify, env) => {
  record('stageFixture', stage, env);
  record('verify', verify, env);
};
export const clearFixture = async (command, env) => {
  record('clearFixture', command, env);
};
export const verifyAuth = async () => {};
