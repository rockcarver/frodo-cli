#!/usr/bin/env node

// Bulk-regenerates the cloud e2e recordings under test/e2e/mocks against a
// real, already-authenticated `frodo-dev`-style connection profile. Replaces
// the fully-manual, one-file-at-a-time process previously documented in
// test/e2e/RECORD-DELETE-TESTS.md and the comment block atop individual test
// files (e.g. test/e2e/conn-list.e2e.test.js): those still work standalone,
// this just runs the same `FRODO_MOCK=record FRODO_NO_CACHE=1 npm run
// test:update <file>` sequence across every cloud-targeted test file, one at
// a time (serial, not parallel -- concurrent RECORD-mode runs against the
// same tenant would race and produce inconsistent fixtures).
//
// "Cloud-targeted" means the file imports the `connection` or
// `iga_connection` fixture from test/e2e/utils/TestConfig.js -- classic,
// forgeops, and amster tests use their own connection fixtures and are out
// of scope for this tool.
//
// Usage:
//   node tools/record-cloud-e2e.mjs                        # record every cloud test file
//   node tools/record-cloud-e2e.mjs --pattern realm-        # only files matching a substring
//   node tools/record-cloud-e2e.mjs --dry-run                # list matching files, record nothing
//   node tools/record-cloud-e2e.mjs --refresh-shared-auth     # also refresh the shared login cassette
//
// By default, none of these recording passes touch the shared login cassette
// (test/e2e/mocks/shared_*/auth_*/ -- see test/e2e/README.md's "Shared login
// recording" section): each file's real auth exchange still happens live,
// but is captured into a disposable per-command bucket instead, since the
// shared cassette is order-indexed and shared across every cloud host's
// tests -- overwriting one entry in it during an unrelated recording pass
// can silently break every *other* test relying on a different entry at
// that same order position. Pass --refresh-shared-auth to deliberately
// update it (e.g. after a scope change): this script sets
// FRODO_MOCK_REFRESH_SHARED_AUTH=1 for the *first* file's recording pass
// only, letting that file's own real auth exchange (re)populate the shared
// cassette once, then leaves it alone for the rest of the run.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const E2E_DIR = path.resolve('test/e2e');
const CLOUD_FIXTURE_NAMES = ['connection', 'iga_connection'];
// Multi-phase destructive tests (FRODO_RECORD_PHASE=1, then =2, ...) can't be
// captured correctly by a single `FRODO_MOCK=record` pass -- each phase needs
// its own run with a different FRODO_RECORD_PHASE value. See the file's own
// header comment for the exact per-phase commands.
const MULTI_PHASE_MARKER = 'FRODO_RECORD_PHASE';

function parseArgs(argv) {
    const args = {
        pattern: null,
        dryRun: false,
        refreshSharedAuth: false,
    };

    for (let i = 2; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '--pattern') {
            args.pattern = argv[i + 1] || null;
            i += 1;
            continue;
        }
        if (token === '--dry-run') {
            args.dryRun = true;
            continue;
        }
        if (token === '--refresh-shared-auth') {
            args.refreshSharedAuth = true;
            continue;
        }
    }
    return args;
}

function findCloudTestFiles(pattern) {
    const allFiles = fs
        .readdirSync(E2E_DIR)
        .filter((f) => f.endsWith('.e2e.test.js'))
        .sort();

    const cloudFiles = [];
    const skippedMultiPhase = [];

    for (const file of allFiles) {
        if (pattern && !file.includes(pattern)) {
            continue;
        }
        const contents = fs.readFileSync(path.join(E2E_DIR, file), 'utf8');
        const isCloud = CLOUD_FIXTURE_NAMES.some((name) =>
            new RegExp(`\\b${name}\\b`).test(contents)
        );
        if (!isCloud) {
            continue;
        }
        if (contents.includes(MULTI_PHASE_MARKER)) {
            skippedMultiPhase.push(file);
            continue;
        }
        cloudFiles.push(file);
    }

    return { cloudFiles, skippedMultiPhase };
}

function recordFile(file, { refreshSharedAuth = false } = {}) {
    console.log(`\n=== Recording test/e2e/${file} ===`);
    const result = spawnSync('npm', ['run', 'test:update', '--', file], {
        stdio: 'inherit',
        env: {
            ...process.env,
            FRODO_MOCK: 'record',
            FRODO_NO_CACHE: '1',
            ...(refreshSharedAuth && { FRODO_MOCK_REFRESH_SHARED_AUTH: '1' }),
        },
    });
    return result.status === 0;
}

function main() {
    const args = parseArgs(process.argv);
    const { cloudFiles: files, skippedMultiPhase } = findCloudTestFiles(
        args.pattern
    );

    if (skippedMultiPhase.length > 0) {
        console.log(
            `Skipping ${skippedMultiPhase.length} multi-phase test file(s) -- record these manually per their own header comment:`
        );
        skippedMultiPhase.forEach((f) => console.log(`  - ${f}`));
    }

    if (files.length === 0) {
        console.log('No cloud-targeted e2e test files matched.');
        return;
    }

    console.log(`\nFound ${files.length} cloud-targeted e2e test file(s):`);
    files.forEach((f) => console.log(`  - ${f}`));

    if (args.dryRun) {
        console.log('\n--dry-run set, not recording anything.');
        return;
    }

    console.log(
        '\nRecording serially against whatever profile FRODO_CONNECTION resolves ' +
            'to for each host (see test/e2e/README.md). Wait for each Polly instance ' +
            'to fully shut down before the next file starts -- this script already ' +
            'waits for each `npm run test:update` to exit before moving on.'
    );
    console.log(
        args.refreshSharedAuth
            ? `The shared login cassette will be refreshed during ${files[0]}'s recording pass, then left alone for the rest of this run.`
            : 'The shared login cassette will not be touched this run (pass --refresh-shared-auth to update it deliberately).'
    );

    const failures = [];
    files.forEach((file, index) => {
        const ok = recordFile(file, {
            refreshSharedAuth: args.refreshSharedAuth && index === 0,
        });
        if (!ok) {
            failures.push(file);
        }
    });

    console.log('\n=== Recording summary ===');
    console.log(`${files.length - failures.length}/${files.length} succeeded.`);
    if (failures.length > 0) {
        console.log('Failed to record:');
        failures.forEach((f) => console.log(`  - ${f}`));
        process.exitCode = 1;
    } else {
        console.log(
            'Validate with a plain replay run before committing: npm run test:only'
        );
    }
}

main();
