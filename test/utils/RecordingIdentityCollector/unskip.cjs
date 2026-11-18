// Runs the tests that the files skip (test.skip, it.skip, describe.skip,
// testif(false)) too, and marks their commands "skipped" in the collected
// file: a skipped test has no replay today, but its recording may exist on disk
// and must keep its identity. It patches Jest globals; a Jest upgrade that
// changes them makes the completeness check of
// test/unit/E2eRecordingIdentity.test.js fail, not pass.
const realTest = globalThis.test;
const realIt = globalThis.it;
const realDescribe = globalThis.describe;

const mark =
  (fn) =>
  async (...args) => {
    globalThis.__skipped = true;
    try {
      return await fn(...args);
    } finally {
      globalThis.__skipped = false;
    }
  };

const skipTest = (name, fn, timeout) =>
  realTest(name, fn ? mark(fn) : fn, timeout);
realTest.skip = skipTest;
realIt.skip = skipTest;

realDescribe.skip = (name, fn) =>
  realDescribe(name, () => {
    const saved = [globalThis.test, globalThis.it];
    globalThis.test = globalThis.it = Object.assign(
      (n, f, timeout) => realTest(n, f ? mark(f) : f, timeout),
      { skip: skipTest }
    );
    try {
      fn();
    } finally {
      [globalThis.test, globalThis.it] = saved;
    }
  });
