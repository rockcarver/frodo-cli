import { describe, expect, it } from '@jest/globals';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * No private key in a test source (core 0013: none are committed, fixtures
 * included). The e2e suites replay recordings and never log in for real, so
 * test/e2e/utils/TestConfig.js makes a throwaway key pair when a test process
 * starts and takes anything real from FRODO_TEST_* variables (test/e2e/README.md).
 * A key pasted into a test, a header comment or a helper is found here, before
 * it is committed. Passwords and the like have no shape to look for.
 *
 * It looks at the JavaScript and TypeScript sources under test/ and tools/. The
 * recordings, exports, snapshots and test data are data, not sources: what a
 * recording may hold is for the review in the create-test-recordings skill.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = /\.(js|cjs|mjs|ts)$/;
// Data directories (thousands of files), generated output and scratch files.
const SKIPPED = [
  'test/e2e/mocks',
  'test/e2e/exports',
  'test/e2e/__snapshots__',
  'test/e2e/test-data',
  'test/fs_tmp',
];

/** Shapes of key material, each with the name used in a failure message. */
const SECRET_SHAPES = [
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/, 'a PEM private key'],
  [
    // The private members of an RSA JWK (RFC 7518 section 6.3.2), as JSON, as
    // JSON inside a string, or as an object literal. The shortest real value
    // is hundreds of characters long.
    /(?:\\?["']|\b)(?:d|p|q|dp|dq|qi)(?:\\?["'])?\s*:\s*\\?["'`][A-Za-z0-9_-]{40,}/,
    'a private member of a JWK',
  ],
];

/**
 * @param {string} text source text
 * @returns {string[]} the names of the secret shapes the text contains
 */
function secretShapesIn(text) {
  return SECRET_SHAPES.filter(([shape]) => shape.test(text)).map(
    ([, name]) => name
  );
}

/**
 * @param {string} dir absolute directory
 * @returns {string[]} the source files below it, as repository paths
 */
function sourcesBelow(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    const relative = path.relative(ROOT, file).split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !SKIPPED.includes(relative)) {
        found.push(...sourcesBelow(file));
      }
    } else if (SOURCE.test(entry.name)) {
      found.push(relative);
    }
  }
  return found;
}

describe('no private key in test sources', () => {
  it('finds a private key and the private members of a JWK', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const jwk = JSON.stringify(privateKey.export({ format: 'jwk' }));
    expect(secretShapesIn(`const pk = ${JSON.stringify(pem)};`)).toEqual([
      'a PEM private key',
    ]);
    expect(secretShapesIn(`saJwk: '${jwk}',`)).toEqual([
      'a private member of a JWK',
    ]);
    expect(secretShapesIn(`FRODO_SA_JWK='${jwk}' frodo info`)).toEqual([
      'a private member of a JWK',
    ]);
    expect(secretShapesIn(`const key = { d: '${'A'.repeat(342)}' };`)).toEqual(
      ['a private member of a JWK']
    );
  });

  it('leaves public keys and short values alone', () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = JSON.stringify(publicKey.export({ format: 'jwk' }));
    expect(secretShapesIn(`const jwks = ${jwk};`)).toEqual([]);
    expect(
      secretShapesIn(
        `${publicKey.export({ type: 'spki', format: 'pem' })} { d: 'x', q: 'y' }`
      )
    ).toEqual([]);
  });

  it('holds none in the test and tool sources', () => {
    const files = [
      ...sourcesBelow(path.join(ROOT, 'test')),
      ...sourcesBelow(path.join(ROOT, 'tools')),
    ];
    // Guard against a path change that makes the walk look at nothing.
    expect(files).toContain('test/e2e/utils/TestConfig.js');
    const found = files.flatMap((file) =>
      secretShapesIn(fs.readFileSync(path.join(ROOT, file), 'utf8')).map(
        (name) => `${file}: ${name}`
      )
    );
    expect(found).toEqual([]);
  });
});
