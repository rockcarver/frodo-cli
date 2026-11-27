export default async () => {
  process.env.TZ = 'UTC';
  process.env.LANG = 'en-US';
  process.env.FRODO_NO_CACHE = 'true';
  // Every CLI the tests start (the children inherit this) runs without Node's
  // compile cache: a start with a fresh HOME would pay for filling a cache that
  // nothing uses again, and write it into the HOME. The tests of the cache itself
  // (test/unit/LauncherCompileCache.test.js) set up their own environment.
  process.env.FRODO_NO_COMPILE_CACHE = '1';
};
