import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
  compareRecords,
  fetchSiblingRecords,
  LOCAL_DIR,
  main,
  readLocalRecords,
  SIBLING,
} from '../../tools/check-core-records-drift.mjs';

/**
 * The weekly check that the core decision records of the two repositories stay
 * identical (tools/check-core-records-drift.mjs, .github/workflows/core-records-drift.yml).
 * The sibling is replaced by a fake GitHub contents API, so nothing here
 * touches the network.
 */

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const A = '0001-first-record.md';
const B = '0002-second-record.md';

/** A fetch that answers the contents API for one folder holding `files` (name -> text). */
function fakeFetch(files, { listStatus = 200, fileStatus = 200 } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const body = (data, status) => ({
      status,
      ok: status >= 200 && status < 300,
      json: async () => data,
      text: async () => data,
    });
    if (
      url ===
      `https://api.github.com/repos/${SIBLING.repo}/contents/${SIBLING.dir}`
    ) {
      return body(
        Object.keys(files).map((name) => ({
          name,
          type: 'file',
          url: `https://api.github.com/file/${name}`,
        })),
        listStatus
      );
    }
    const name = decodeURIComponent(url.split('/').pop());
    return body(files[name], fileStatus);
  };
  impl.calls = calls;
  return impl;
}

describe('core records drift check', () => {
  let root;
  const writeLocal = (files) => {
    const dir = path.join(root, LOCAL_DIR);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, text] of Object.entries(files))
      fs.writeFileSync(path.join(dir, name), text);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-drift-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  describe('readLocalRecords', () => {
    it('reads the record files and ignores everything else', () => {
      writeLocal({
        [B]: 'b',
        [A]: 'a',
        'README.md': 'x',
        'notes.txt': 'y',
        'core-1.md': 'z',
      });
      expect([...readLocalRecords(root)].sort()).toEqual([
        [A, 'a'],
        [B, 'b'],
      ]);
    });

    it('fails when the folder does not exist', () => {
      expect(() => readLocalRecords(root)).toThrow(/does not exist/);
    });

    it('reads this repository core folder', () => {
      const records = readLocalRecords(ROOT);
      expect(records.size).toBeGreaterThan(0);
      expect([...records.keys()][0]).toMatch(/^0001-/);
    });
  });

  describe('compareRecords', () => {
    it('finds no difference in identical folders', () => {
      expect(compareRecords(new Map([[A, 'a']]), new Map([[A, 'a']]))).toEqual(
        []
      );
    });

    it('reports a file that differs, even by one line ending', () => {
      expect(
        compareRecords(new Map([[A, 'a\n']]), new Map([[A, 'a\r\n']]))
      ).toEqual([expect.stringContaining(`${A} differs`)]);
    });

    it('reports a file missing in the sibling and one missing here', () => {
      const problems = compareRecords(new Map([[A, 'a']]), new Map([[B, 'b']]));
      expect(problems).toEqual([
        expect.stringContaining(`${A} is missing in ${SIBLING.repo}`),
        expect.stringContaining(`${B} is missing here`),
      ]);
    });
  });

  describe('fetchSiblingRecords', () => {
    it('reads every record file through the contents API and sends the token when there is one', async () => {
      const fetchImpl = fakeFetch({
        [A]: 'a',
        [B]: 'b',
        'README.md': 'ignored',
      });
      const records = await fetchSiblingRecords({ token: 'T', fetchImpl });
      expect([...records]).toEqual([
        [A, 'a'],
        [B, 'b'],
      ]);
      expect(
        fetchImpl.calls.every(
          (c) => c.init.headers.Authorization === 'Bearer T'
        )
      ).toBe(true);
      const anonymous = fakeFetch({ [A]: 'a' });
      await fetchSiblingRecords({ fetchImpl: anonymous });
      expect(
        anonymous.calls.every((c) => !('Authorization' in c.init.headers))
      ).toBe(true);
    });

    it('says so when the sibling has no core folder', async () => {
      await expect(
        fetchSiblingRecords({ fetchImpl: fakeFetch({}, { listStatus: 404 }) })
      ).rejects.toThrow(/has no decisions\/core folder/);
    });

    it('fails on any other API error, for the listing and for a file', async () => {
      await expect(
        fetchSiblingRecords({ fetchImpl: fakeFetch({}, { listStatus: 500 }) })
      ).rejects.toThrow(/HTTP 500/);
      await expect(
        fetchSiblingRecords({
          fetchImpl: fakeFetch({ [A]: 'a' }, { fileStatus: 403 }),
        })
      ).rejects.toThrow(/HTTP 403/);
    });
  });

  describe('main', () => {
    const run = (fetchImpl) => {
      const lines = { log: [], error: [] };
      const out = {
        log: (l) => lines.log.push(l),
        error: (l) => lines.error.push(l),
      };
      return main({ root, env: {}, fetchImpl, out }).then((code) => ({
        code,
        ...lines,
      }));
    };

    it('exits 0 and says so when the folders are identical', async () => {
      writeLocal({ [A]: 'a' });
      const result = await run(fakeFetch({ [A]: 'a' }));
      expect(result.code).toBe(0);
      expect(result.error).toEqual([]);
      expect(result.log[0]).toMatch(/1 identical/);
    });

    it('exits 1 with one annotation per difference and opens no issue', async () => {
      writeLocal({ [A]: 'a', [B]: 'b' });
      const fetchImpl = fakeFetch({ [A]: 'changed' });
      const result = await run(fetchImpl);
      expect(result.code).toBe(1);
      expect(result.error).toHaveLength(2);
      expect(result.error.every((l) => l.startsWith('::error::'))).toBe(true);
      expect(
        fetchImpl.calls.every((c) => !c.init.method || c.init.method === 'GET')
      ).toBe(true);
    });

    it('rejects when the sibling cannot be read', async () => {
      writeLocal({ [A]: 'a' });
      await expect(run(fakeFetch({}, { listStatus: 404 }))).rejects.toThrow(
        /has no/
      );
    });
  });
});
