module.exports = {
  resolveSnapshotPath: (testPath, snapshotExtension) => {
    let snapshotFilePath = '';
    if (testPath.indexOf('cjs') !== -1) {
      snapshotFilePath = testPath
        .replace('cjs', 'src')
        .concat(snapshotExtension);
    } else {
      snapshotFilePath = testPath
        .replace('esm', 'src')
        .concat(snapshotExtension);
    }
    // console.log(`testPath=${testPath}, snapshotExtension=${snapshotExtension}`);
    // console.log(`snapshotFilePath=${snapshotFilePath}`);
    return snapshotFilePath;
  },

  // resolves from snapshot to test path
  resolveTestPath: (snapshotFilePath, snapshotExtension) => {
    let testFilePath = '';
    if (snapshotFilePath.indexOf('cjs') !== -1) {
      testFilePath = snapshotFilePath.replace('src', 'cjs');
    } else {
      testFilePath = snapshotFilePath.replace('src', 'esm');
    }
    testFilePath = testFilePath.substring(
      0,
      testFilePath.indexOf(snapshotExtension)
    );

    return testFilePath;
  },

  // Example test path, used for preflight consistency check of the implementation above
  testPathForConsistencyCheck: 'some/__tests__/example.test.js',
};
