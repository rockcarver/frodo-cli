#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
    const args = { input: '', output: '' };
    for (let i = 2; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '--input') {
            args.input = argv[i + 1] || '';
            i += 1;
            continue;
        }
        if (token === '--output') {
            args.output = argv[i + 1] || '';
            i += 1;
            continue;
        }
    }
    return args;
}

function readJson(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
}

function round(value, decimals = 2) {
    const scale = 10 ** decimals;
    return Math.round(value * scale) / scale;
}

function computeRunMetrics(run) {
    const attempts = Array.isArray(run.attempts) ? run.attempts : [];
    const totalAttempts = attempts.length;
    const firstAttemptSuccess = attempts.length > 0 && attempts[0].success === true;

    let duplicateRetryCount = 0;
    let intentionalFollowUpCount = 0;
    let temptationAttemptCount = 0;
    let temptationFailureCount = 0;
    const firstSeen = new Set();
    for (const attempt of attempts) {
        const toolName = attempt?.toolName;
        if (!toolName) {
            continue;
        }

        if (attempt?.purpose === 'temptation') {
            temptationAttemptCount += 1;
            if (attempt.success !== true) {
                temptationFailureCount += 1;
            }
        }

        if (firstSeen.has(toolName)) {
            if (attempt?.retryIntent) {
                intentionalFollowUpCount += 1;
                continue;
            }
            duplicateRetryCount += 1;
            continue;
        }
        firstSeen.add(toolName);
    }

    return {
        totalAttempts,
        firstAttemptSuccess,
        duplicateRetryCount,
        intentionalFollowUpCount,
        temptationAttemptCount,
        temptationFailureCount,
        taskCompleted: run.taskCompleted === true,
    };
}

function aggregateVariant(runs) {
    const totals = {
        runCount: runs.length,
        completedCount: 0,
        totalAttempts: 0,
        firstAttemptSuccessCount: 0,
        duplicateRetryCount: 0,
        intentionalFollowUpCount: 0,
        temptationAttemptCount: 0,
        temptationFailureCount: 0,
    };

    for (const run of runs) {
        const m = computeRunMetrics(run);
        totals.completedCount += m.taskCompleted ? 1 : 0;
        totals.totalAttempts += m.totalAttempts;
        totals.firstAttemptSuccessCount += m.firstAttemptSuccess ? 1 : 0;
        totals.duplicateRetryCount += m.duplicateRetryCount;
        totals.intentionalFollowUpCount += m.intentionalFollowUpCount;
        totals.temptationAttemptCount += m.temptationAttemptCount;
        totals.temptationFailureCount += m.temptationFailureCount;
    }

    const denominator = totals.runCount || 1;
    const temptationDenominator = totals.temptationAttemptCount || 1;
    return {
        runCount: totals.runCount,
        completedCount: totals.completedCount,
        completionRate: round((totals.completedCount / denominator) * 100),
        meanAttemptsPerTask: round(totals.totalAttempts / denominator),
        firstAttemptSuccessRate: round(
            (totals.firstAttemptSuccessCount / denominator) * 100
        ),
        duplicateRetryRate: round((totals.duplicateRetryCount / denominator) * 100),
        intentionalFollowUpRate: round(
            (totals.intentionalFollowUpCount / denominator) * 100
        ),
        temptationFailureRate:
            totals.temptationAttemptCount > 0
                ? round((totals.temptationFailureCount / temptationDenominator) * 100)
                : null,
        totalAttempts: totals.totalAttempts,
        duplicateRetryCount: totals.duplicateRetryCount,
        intentionalFollowUpCount: totals.intentionalFollowUpCount,
        temptationAttemptCount: totals.temptationAttemptCount,
        temptationFailureCount: totals.temptationFailureCount,
    };
}

function buildScoreboard(runLog) {
    const runs = Array.isArray(runLog.runs) ? runLog.runs : [];
    const byVariant = new Map();

    for (const run of runs) {
        const variant = run?.variant || 'unknown';
        if (!byVariant.has(variant)) {
            byVariant.set(variant, []);
        }
        byVariant.get(variant).push(run);
    }

    const variants = {};
    for (const [variant, variantRuns] of byVariant.entries()) {
        variants[variant] = aggregateVariant(variantRuns);
    }

    return {
        generatedAt: new Date().toISOString(),
        runCount: runs.length,
        variants,
    };
}

function printScoreboard(scoreboard) {
    console.log('MCP Agentic Scoreboard');
    console.log('======================');
    console.log(`Runs: ${scoreboard.runCount}`);

    const variantNames = Object.keys(scoreboard.variants).sort();
    for (const name of variantNames) {
        const metrics = scoreboard.variants[name];
        console.log('');
        console.log(`Variant: ${name}`);
        console.log(`  Runs: ${metrics.runCount}`);
        console.log(`  Completion rate: ${metrics.completionRate}%`);
        console.log(`  Mean attempts/task: ${metrics.meanAttemptsPerTask}`);
        console.log(`  First-attempt success rate: ${metrics.firstAttemptSuccessRate}%`);
        console.log(`  Duplicate retry rate (unplanned): ${metrics.duplicateRetryRate}%`);
        console.log(`  Intentional follow-up rate: ${metrics.intentionalFollowUpRate}%`);
        if (metrics.temptationFailureRate !== null) {
            console.log(`  Import/export temptation failure rate: ${metrics.temptationFailureRate}%`);
        }
        console.log(`  Total attempts: ${metrics.totalAttempts}`);
        console.log(`  Duplicate retries (unplanned): ${metrics.duplicateRetryCount}`);
        console.log(`  Intentional follow-ups: ${metrics.intentionalFollowUpCount}`);
        console.log(`  Import/export temptation attempts: ${metrics.temptationAttemptCount}`);
        console.log(`  Import/export temptation failures: ${metrics.temptationFailureCount}`);
    }
}

function main() {
    const args = parseArgs(process.argv);
    if (!args.input) {
        console.error('Missing required --input <path> argument.');
        process.exit(1);
    }

    const inputPath = path.resolve(process.cwd(), args.input);
    const runLog = readJson(inputPath);
    const scoreboard = buildScoreboard(runLog);

    printScoreboard(scoreboard);

    if (args.output) {
        const outputPath = path.resolve(process.cwd(), args.output);
        fs.writeFileSync(outputPath, JSON.stringify(scoreboard, null, 2), 'utf8');
        console.log('');
        console.log(`Wrote scoreboard JSON to: ${outputPath}`);
    }
}

main();
