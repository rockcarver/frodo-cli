#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const TEST_DIR = path.join(ROOT, 'test/e2e');
const SNAP_DIR = path.join(ROOT, 'test/e2e/__snapshots__');
const MOCKS_DIR = path.join(ROOT, 'test/e2e/mocks');

const TEST_FILES = fs
    .readdirSync(TEST_DIR)
    .filter((f) => (f.includes('agent') || f === 'config-manager-export-oauth2-agents.e2e.test.js') && f.endsWith('.e2e.test.js'))
    .sort();

const ERROR_PATTERNS = [
    /\[Polly\].*Recording for the following request is not found/i,
    /Error getting tokens/i,
    /Command failed:/i,
    /TypeError:/,
    /ReferenceError:/,
    /SyntaxError:/,
    /ENOENT:/,
    /Error exporting/i,
];

function walkDirs(dir, predicate) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    const stack = [dir];
    while (stack.length) {
        const cur = stack.pop();
        for (const entry of fs.readdirSync(cur)) {
            const full = path.join(cur, entry);
            const st = fs.statSync(full);
            if (st.isDirectory()) {
                if (predicate(full, entry)) out.push(full);
                stack.push(full);
            }
        }
    }
    return out;
}

function countHarFiles(dir) {
    let count = 0;
    const stack = [dir];
    while (stack.length) {
        const cur = stack.pop();
        for (const entry of fs.readdirSync(cur)) {
            const full = path.join(cur, entry);
            const st = fs.statSync(full);
            if (st.isDirectory()) stack.push(full);
            else if (entry.endsWith('.har')) count += 1;
        }
    }
    return count;
}

function parseCommands(testText) {
    return [...testText.matchAll(/const\s+CMD\s*=\s*`([^`]+)`/g)].map((m) => m[1]);
}

function getSuiteStem(testFile) {
    return testFile.replace('.e2e.test.js', '');
}

function findMatchingMockDirs(stem, commands) {
    if (stem.startsWith('agent-')) {
        const agentRoot = walkDirs(MOCKS_DIR, (_, entry) => /^agent_\d+$/.test(entry))[0];
        if (!agentRoot) return [];
        const entries = fs.readdirSync(agentRoot).filter((d) => fs.statSync(path.join(agentRoot, d)).isDirectory());

        const op = stem.replace('agent-', '');
        if (!op.includes('-')) {
            return entries.filter((d) => d.startsWith(`${op}_`)).map((d) => path.join(agentRoot, d));
        }
        if (op.startsWith('web-')) return entries.filter((d) => d.startsWith(`web-${op.replace('web-', '')}`)).map((d) => path.join(agentRoot, d));
        if (op.startsWith('java-')) return entries.filter((d) => d.startsWith(`java-${op.replace('java-', '')}`)).map((d) => path.join(agentRoot, d));
        if (op.startsWith('gateway-')) return entries.filter((d) => d.startsWith(`gateway-${op.replace('gateway-', '')}`)).map((d) => path.join(agentRoot, d));
        if (op.startsWith('ai-')) return entries.filter((d) => d.startsWith(`ai-${op.replace('ai-', '')}`)).map((d) => path.join(agentRoot, d));
        return [];
    }

    const cmdLine = commands.join('\n');
    if (cmdLine.includes('config-manager pull oauth2-agents')) {
        return walkDirs(MOCKS_DIR, (_, entry) => /^oauth2-agents_\d+$/.test(entry));
    }

    return [];
}

function snapshotHealth(snapshotText) {
    const hits = [];
    for (const re of ERROR_PATTERNS) {
        if (re.test(snapshotText)) hits.push(re.source);
    }
    return hits;
}

function parseSnapshotEntries(snapshotText) {
    const entries = [];
    const re = /exports\[`([^`]+)`\]\s*=\s*`([\s\S]*?)`;/g;
    for (const m of snapshotText.matchAll(re)) {
        entries.push({
            name: m[1],
            body: m[2],
        });
    }
    return entries;
}

function findSuspiciousSnapshotTests(snapshotText) {
    const suspiciousTests = [];
    const entries = parseSnapshotEntries(snapshotText);
    for (const entry of entries) {
        const matchedPatterns = [];
        for (const pattern of ERROR_PATTERNS) {
            if (pattern.test(entry.body)) matchedPatterns.push(pattern.source);
        }
        if (matchedPatterns.length > 0) {
            suspiciousTests.push({
                testName: entry.name,
                matchedPatterns,
            });
        }
    }
    return suspiciousTests;
}

function classifySuite({ testFile, commands, snapshotPath, mockDirs }) {
    const reasons = [];
    let verdict = 'GOOD';

    if (!fs.existsSync(snapshotPath)) {
        verdict = 'BAD';
        reasons.push('missing snapshot file');
    }

    if (mockDirs.length === 0) {
        verdict = 'BAD';
        reasons.push('recording directory missing');
    }

    let snapshotCount = 0;
    let suspicious = [];
    let suspiciousTests = [];
    if (fs.existsSync(snapshotPath)) {
        const snapshotText = fs.readFileSync(snapshotPath, 'utf8');
        snapshotCount = (snapshotText.match(/exports\[`/g) || []).length;
        suspicious = snapshotHealth(snapshotText);
        suspiciousTests = findSuspiciousSnapshotTests(snapshotText);
        if (suspicious.length > 0) {
            verdict = 'BAD';
            reasons.push('snapshot contains explicit error signature');
        }
    }

    const harCount = mockDirs.reduce((sum, dir) => sum + countHarFiles(dir), 0);
    if (mockDirs.length > 0 && harCount === 0) {
        verdict = 'BAD';
        reasons.push('recording directory has no .har files');
    }

    return {
        suite: testFile,
        verdict,
        reasons,
        commands: commands.length,
        snapshots: snapshotCount,
        mockDirs: mockDirs.length,
        harFiles: harCount,
        suspicious,
        suspiciousTests,
    };
}

const results = [];
for (const testFile of TEST_FILES) {
    const testPath = path.join(TEST_DIR, testFile);
    const testText = fs.readFileSync(testPath, 'utf8');
    const commands = parseCommands(testText);
    const stem = getSuiteStem(testFile);
    const snapshotPath = path.join(SNAP_DIR, `${testFile}.snap`);
    const mockDirs = findMatchingMockDirs(stem, commands);

    results.push(
        classifySuite({
            testFile,
            commands,
            snapshotPath,
            mockDirs,
        }),
    );
}

const bad = results.filter((r) => r.verdict === 'BAD');
const good = results.length - bad.length;

console.log(`Audited suites: ${results.length}`);
console.log(`GOOD: ${good}`);
console.log(`BAD: ${bad.length}`);
console.log('');

for (const r of results) {
    const prefix = r.verdict === 'GOOD' ? '[GOOD]' : '[BAD] ';
    console.log(`${prefix} ${r.suite}`);
    if (r.reasons.length > 0) console.log(`  reasons: ${r.reasons.join('; ')}`);
    if (r.suspicious.length > 0) console.log(`  suspicious: ${r.suspicious.join(', ')}`);
    if (r.suspiciousTests.length > 0) {
        for (const t of r.suspiciousTests) {
            console.log(`  suspicious_test: ${t.testName}`);
            console.log(`    matched: ${t.matchedPatterns.join(', ')}`);
        }
    }
    console.log(`  cmds=${r.commands} snapshots=${r.snapshots} mockDirs=${r.mockDirs} harFiles=${r.harFiles}`);
}

process.exit(bad.length > 0 ? 1 : 0);
