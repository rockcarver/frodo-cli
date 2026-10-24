#!/usr/bin/env node
// Compares the core decision records of this repository (docs/decisions/core/)
// with the same folder of its sibling repository (frodo-lib: decisions/core/).
// A core record is one file kept identical in every repository it binds
// (docs/decisions/core/0018-core-decision-records-are-kept-in-each-repository.md),
// so any missing file or any difference in a file is drift.
//
// Run weekly by .github/workflows/core-records-drift.yml. It fails the run and
// opens no issue. The sibling is public: GITHUB_TOKEN is only used, when set,
// to stay clear of the unauthenticated rate limit.
//
//   node tools/check-core-records-drift.mjs
//
// Exit status: 0 identical, 1 drift, 2 the sibling could not be read.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SIBLING = { repo: 'rockcarver/frodo-lib', dir: 'decisions/core' };
export const LOCAL_DIR = 'docs/decisions/core';
const RECORD = /^\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

/** Name and text of every record file in a core folder of a checkout. */
export function readLocalRecords(root, dir = LOCAL_DIR) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs))
    throw new Error(`${dir} does not exist in this repository`);
  return new Map(
    fs
      .readdirSync(abs)
      .filter((f) => RECORD.test(f))
      .map((f) => [f, fs.readFileSync(path.join(abs, f), 'utf8')])
  );
}

/** Name and text of every record file in the sibling's core folder, through the contents API. */
export async function fetchSiblingRecords({
  repo = SIBLING.repo,
  dir = SIBLING.dir,
  token,
  fetchImpl = fetch,
} = {}) {
  const headers = {
    'User-Agent': 'frodo-core-records-drift',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const list = await fetchImpl(
    `https://api.github.com/repos/${repo}/contents/${dir}`,
    {
      headers: { ...headers, Accept: 'application/vnd.github+json' },
    }
  );
  if (list.status === 404) throw new Error(`${repo} has no ${dir} folder`);
  if (!list.ok)
    throw new Error(`listing ${repo}/${dir} failed: HTTP ${list.status}`);
  const entries = await list.json();
  const records = new Map();
  for (const entry of entries.filter(
    (e) => e.type === 'file' && RECORD.test(e.name)
  )) {
    const res = await fetchImpl(entry.url, {
      headers: { ...headers, Accept: 'application/vnd.github.raw+json' },
    });
    if (!res.ok)
      throw new Error(
        `reading ${repo}/${dir}/${entry.name} failed: HTTP ${res.status}`
      );
    records.set(entry.name, await res.text());
  }
  return records;
}

/** One line per file that is missing on one side or differs byte for byte; empty when identical. */
export function compareRecords(local, remote, sibling = SIBLING) {
  const problems = [];
  for (const name of [...new Set([...local.keys(), ...remote.keys()])].sort()) {
    if (!remote.has(name))
      problems.push(`${name} is missing in ${sibling.repo} (${sibling.dir})`);
    else if (!local.has(name))
      problems.push(
        `${name} is missing here (${LOCAL_DIR}) but exists in ${sibling.repo}`
      );
    else if (local.get(name) !== remote.get(name))
      problems.push(`${name} differs from the copy in ${sibling.repo}`);
  }
  return problems;
}

export async function main({
  root,
  env = process.env,
  fetchImpl = fetch,
  out = console,
} = {}) {
  const local = readLocalRecords(root);
  const remote = await fetchSiblingRecords({
    token: env.GITHUB_TOKEN,
    fetchImpl,
  });
  const problems = compareRecords(local, remote);
  for (const p of problems) out.error(`::error::${p}`);
  out.log(
    problems.length === 0
      ? `core records: ${local.size} identical in this repository and ${SIBLING.repo}`
      : `core records: ${problems.length} difference(s) between this repository and ${SIBLING.repo}`
  );
  return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  main({ root }).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`::error::${error.message}`);
      process.exit(2);
    }
  );
}
