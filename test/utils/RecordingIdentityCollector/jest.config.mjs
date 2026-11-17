// Jest config of the recording identity collector, run by
// test/unit/E2eRecordingIdentity.test.js as a child process over the e2e test
// files that carry a pin (the files are passed as paths, so this config names
// no test glob). It runs the real test files with a stub in place of
// test/e2e/utils/TestUtils.js, so that no frodo binary starts and nothing is
// replayed: every command a test would run is appended, with the
// FRODO_TEST_NAME of its env, to the JSON lines file named by COLLECT_OUT.
// COLLECT_SNAPSHOTS and COLLECT_CACHE name scratch directories, so the run
// writes nothing into the repository.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default {
  rootDir: path.resolve(here, '../../..'),
  // The recordings and exports are thousands of files that no test file
  // imports; crawling them doubles the time of a cold run.
  roots: ['<rootDir>/test/e2e', '<rootDir>/test/utils'],
  modulePathIgnorePatterns: [
    '<rootDir>/test/e2e/mocks/',
    '<rootDir>/test/e2e/exports/',
    '<rootDir>/test/e2e/__snapshots__/',
  ],
  moduleNameMapper: {
    '^\\./utils/TestUtils(\\.js)?$': path.join(here, 'TestUtilsStub.mjs'),
  },
  transform: {},
  setupFilesAfterEnv: [path.join(here, 'unskip.cjs')],
  snapshotResolver: path.join(here, 'snapshotResolver.cjs'),
  testTimeout: 20000,
  cacheDirectory:
    process.env.COLLECT_CACHE ||
    path.join(os.tmpdir(), 'frodo-recording-identity-cache'),
};
