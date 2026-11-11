import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Guard for two frozen September fixtures of test/e2e/config-export.e2e.test.js.
 *
 * The recordings of `frodo config export -RAD <dir> --include-active-values` and of
 * `frodo config export --all-separate ... --no-extract` hold the AI agents of the
 * development tenant (four in realm alpha, two in realm bravo) and the snapshots of
 * twelve exported AI agent files depend on them. The tenant no longer lists the
 * AIAgent type among its agent types, so a new recording of either file would ask a
 * list without it, never ask for the AI agents, and silently lose all twelve files.
 * Both files therefore stay as they were recorded in September, with one exception:
 * the bravo agent types response is a copy of the alpha one of the same file (frodo-lib
 * 5.0.0-34 asks every realm for its own types, and the response the tenant gives today
 * has no AIAgent).
 *
 * This test reads the two files from disk (no tenant, no mocks) and fails when the
 * agent types response of realm alpha or of realm bravo in either file does not list
 * AIAgent any more, when that entry is missing or doubled, or when the AIAgent agents
 * of a realm are no longer in the file.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = 'test/e2e/mocks/config_603940551/export_4211608755';
const CASSETTES = [
  {
    test: 'frodo config export -RAD exportAllTestDir5 --include-active-values',
    file: `${DIR}/0_RAD_include-active-values_1341669850/am_1076162899/recording.har`,
  },
  {
    test: 'frodo config export --all-separate --read-only --no-metadata --default --directory exportAllTestDir3 --use-string-arrays --no-decode --no-coords --no-extract',
    file: `${DIR}/0_all-separate_read-only_no-metadata_default_directory_use-string-arrays_no-decode_no-coor_322803806/am_1076162899/recording.har`,
  },
];
const REALMS = ['alpha', 'bravo'];
const TYPES_PATH = (realm) =>
  `/am/json/realms/root/realms/${realm}/realm-config/agents?_action=getAllTypes`;
const AI_AGENTS_PATH = (realm) =>
  `/am/json/realms/root/realms/${realm}/realm-config/agents/AIAgent?_queryFilter=true`;

const pathOf = (url) => url.replace(/^https?:\/\/[^/]+/, '');

const explanation = (cassette, what) =>
  `${cassette.file}: ${what}\n` +
  `This file is a frozen September fixture of the config-export tests in test/e2e/config-export.e2e.test.js ("${cassette.test}"). ` +
  `The tenant no longer lists the AIAgent type among its agent types, so a re-record would silently drop the AI agents ` +
  `and the twelve AI agent snapshots of those tests with them. Do not re-record it. If a re-record cannot be avoided, ` +
  `splice the AI agent entries of the September recording back in and keep AIAgent in the alpha and bravo agent types ` +
  `responses (test/e2e/README.md, "Re-recording individual tests").`;

const loaded = new Map();
function load(cassette) {
  if (!loaded.has(cassette.file)) {
    const file = path.join(ROOT, cassette.file);
    if (!fs.existsSync(file)) {
      throw new Error(explanation(cassette, 'the file does not exist (renamed, moved or re-recorded under another name).'));
    }
    let har;
    try {
      har = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      throw new Error(explanation(cassette, `the file is not valid JSON (${error.message}).`));
    }
    loaded.set(cassette.file, har.log?.entries ?? []);
  }
  return loaded.get(cassette.file);
}

describe('frozen September config export recordings keep the AIAgent type', () => {
  for (const cassette of CASSETTES) {
    describe(cassette.test, () => {
      for (const realm of REALMS) {
        it(`lists AIAgent in the agent types response of realm ${realm}`, () => {
          const entries = load(cassette).filter(
            (e) => e.request.method === 'POST' && pathOf(e.request.url) === TYPES_PATH(realm)
          );
          if (entries.length !== 1) {
            throw new Error(
              explanation(cassette, `expected exactly one POST ${TYPES_PATH(realm)} entry, found ${entries.length}.`)
            );
          }
          const { response } = entries[0];
          if (response.status !== 200) {
            throw new Error(explanation(cassette, `the ${realm} agent types response has status ${response.status}, expected 200.`));
          }
          let ids;
          try {
            ids = JSON.parse(response.content.text).result.map((type) => type._id);
          } catch (error) {
            throw new Error(explanation(cassette, `the ${realm} agent types response has no readable result list (${error.message}).`));
          }
          if (!ids.includes('AIAgent')) {
            throw new Error(
              explanation(cassette, `the ${realm} agent types response lists ${ids.join(', ')} but not AIAgent.`)
            );
          }
          expect(ids).toContain('AIAgent');
        });

        it(`still holds the AI agents of realm ${realm}`, () => {
          const entries = load(cassette).filter(
            (e) => e.request.method === 'GET' && pathOf(e.request.url) === AI_AGENTS_PATH(realm)
          );
          if (entries.length !== 1) {
            throw new Error(
              explanation(cassette, `expected exactly one GET ${AI_AGENTS_PATH(realm)} entry, found ${entries.length}.`)
            );
          }
          let count;
          try {
            count = JSON.parse(entries[0].response.content.text).resultCount;
          } catch (error) {
            throw new Error(explanation(cassette, `the ${realm} AI agents response is not readable (${error.message}).`));
          }
          if (!(count > 0)) {
            throw new Error(explanation(cassette, `the ${realm} AI agents response holds ${count} agents, expected at least one.`));
          }
          expect(count).toBeGreaterThan(0);
        });
      }
    });
  }
});
