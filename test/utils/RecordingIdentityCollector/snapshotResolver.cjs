// Sends the snapshot files of the collector run to a scratch directory, so that
// the run never touches the repository (Jest rewrites a snapshot file whose
// keys it did not check, even with --ci, and the stub checks none).
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '../../..');
const dir =
  process.env.COLLECT_SNAPSHOTS ||
  path.join(os.tmpdir(), 'frodo-recording-identity-snapshots');

module.exports = {
  resolveSnapshotPath: (testPath, ext) =>
    path.join(dir, path.basename(testPath) + ext),
  resolveTestPath: (snapshotPath, ext) =>
    path.join(root, 'test/e2e', path.basename(snapshotPath, ext)),
  testPathForConsistencyCheck: path.join(root, 'test/e2e/example.test.js'),
};
