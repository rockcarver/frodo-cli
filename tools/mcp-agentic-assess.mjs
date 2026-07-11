#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
    const args = {
        output: 'docs/mcp-agentic-assessment.json',
        scoreboards: [
            'docs/mcp-agentic-scoreboard.batch2.json',
            'docs/mcp-agentic-scoreboard.batch3.json',
            'docs/mcp-agentic-scoreboard.batch4.json',
        ],
    };

    for (let i = 2; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '--output') {
            args.output = argv[i + 1] || args.output;
            i += 1;
            continue;
        }
        if (token === '--scoreboard') {
            args.scoreboards.push(argv[i + 1]);
            i += 1;
        }
    }

    return args;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function round(value, decimals = 2) {
    const scale = 10 ** decimals;
    return Math.round(value * scale) / scale;
}

function normalizeMetrics(metrics) {
    return {
        runCount: metrics.runCount || 0,
        completedCount: metrics.completedCount || 0,
        completionRate: metrics.completionRate || 0,
        meanAttemptsPerTask: metrics.meanAttemptsPerTask || 0,
        firstAttemptSuccessRate: metrics.firstAttemptSuccessRate || 0,
        duplicateRetryRate: metrics.duplicateRetryRate || 0,
        intentionalFollowUpRate: metrics.intentionalFollowUpRate || 0,
        temptationFailureRate:
            typeof metrics.temptationFailureRate === 'number'
                ? metrics.temptationFailureRate
                : 0,
    };
}

function computeBatchWeightedScore(metrics) {
    const m = normalizeMetrics(metrics);

    // Heavier penalty for temptation failures, light penalty for intentional follow-ups.
    const weightedPenalty =
        (100 - m.completionRate) * 1.5 +
        (100 - m.firstAttemptSuccessRate) * 1.0 +
        m.meanAttemptsPerTask * 12 +
        m.duplicateRetryRate * 1.0 +
        m.intentionalFollowUpRate * 0.15 +
        m.temptationFailureRate * 1.8;

    return round(1000 - weightedPenalty, 3);
}

function aggregateVariant(variantName, batchEntries) {
    let runCount = 0;
    let weightedCompletion = 0;
    let weightedFirstAttempt = 0;
    let weightedMeanAttempts = 0;
    let weightedDuplicateRetries = 0;
    let weightedIntentionalFollowUps = 0;
    let weightedTemptationFailures = 0;
    let weightedScoreTotal = 0;

    const batchScores = {};

    for (const entry of batchEntries) {
        const metrics = normalizeMetrics(entry.metrics);
        const weight = Math.max(1, metrics.runCount);
        const batchScore = computeBatchWeightedScore(metrics);

        batchScores[entry.batch] = {
            ...metrics,
            weightedScore: batchScore,
        };

        runCount += weight;
        weightedCompletion += metrics.completionRate * weight;
        weightedFirstAttempt += metrics.firstAttemptSuccessRate * weight;
        weightedMeanAttempts += metrics.meanAttemptsPerTask * weight;
        weightedDuplicateRetries += metrics.duplicateRetryRate * weight;
        weightedIntentionalFollowUps += metrics.intentionalFollowUpRate * weight;
        weightedTemptationFailures += metrics.temptationFailureRate * weight;
        weightedScoreTotal += batchScore * weight;
    }

    const denominator = runCount || 1;

    return {
        variant: variantName,
        batches: batchScores,
        aggregate: {
            weightedCompletionRate: round(weightedCompletion / denominator),
            weightedFirstAttemptSuccessRate: round(weightedFirstAttempt / denominator),
            weightedMeanAttemptsPerTask: round(weightedMeanAttempts / denominator),
            weightedDuplicateRetryRate: round(weightedDuplicateRetries / denominator),
            weightedIntentionalFollowUpRate: round(weightedIntentionalFollowUps / denominator),
            weightedTemptationFailureRate: round(weightedTemptationFailures / denominator),
            weightedScore: round(weightedScoreTotal / denominator, 3),
        },
    };
}

function buildAssessment(scoreboards) {
    const byVariant = new Map();

    for (const scoreboardEntry of scoreboards) {
        const batch = scoreboardEntry.batch;
        const variants = scoreboardEntry.scoreboard.variants || {};
        for (const [variantName, metrics] of Object.entries(variants)) {
            const entries = byVariant.get(variantName) || [];
            entries.push({ batch, metrics });
            byVariant.set(variantName, entries);
        }
    }

    const variantAssessments = [...byVariant.entries()]
        .map(([variantName, entries]) => aggregateVariant(variantName, entries))
        .sort((left, right) => right.aggregate.weightedScore - left.aggregate.weightedScore);

    const recommended = variantAssessments[0]?.variant || null;

    return {
        generatedAt: new Date().toISOString(),
        batches: scoreboards.map((entry) => entry.batch),
        formula: {
            weightedScore:
                '1000 - ((100-completionRate)*1.5 + (100-firstAttemptSuccessRate)*1.0 + meanAttemptsPerTask*12 + duplicateRetryRate*1.0 + intentionalFollowUpRate*0.15 + temptationFailureRate*1.8)',
            notes: [
                'Temptation failures carry a heavier penalty than intentional follow-ups.',
                'Intentional pagination/chaining follow-ups are lightly penalized to avoid over-penalizing valid workflows.',
                'Higher weightedScore is better.',
            ],
        },
        ranking: variantAssessments,
        recommendation: {
            variant: recommended,
            rationale:
                recommended === 'agentic'
                    ? 'Best weighted score with strong completion/first-attempt rates and no import/export temptation failures.'
                    : 'Highest weighted score under the current batch evidence.',
        },
    };
}

function printAssessment(assessment) {
    console.log('MCP Agentic Assessment');
    console.log('======================');
    console.log(`Batches: ${assessment.batches.join(', ')}`);
    console.log(`Recommended variant: ${assessment.recommendation.variant}`);

    for (const entry of assessment.ranking) {
        console.log('');
        console.log(`Variant: ${entry.variant}`);
        console.log(`  Weighted score: ${entry.aggregate.weightedScore}`);
        console.log(`  Completion: ${entry.aggregate.weightedCompletionRate}%`);
        console.log(`  First-attempt success: ${entry.aggregate.weightedFirstAttemptSuccessRate}%`);
        console.log(`  Mean attempts/task: ${entry.aggregate.weightedMeanAttemptsPerTask}`);
        console.log(
            `  Temptation failure rate: ${entry.aggregate.weightedTemptationFailureRate}%`
        );
        console.log(
            `  Intentional follow-up rate: ${entry.aggregate.weightedIntentionalFollowUpRate}%`
        );
    }
}

function main() {
    const args = parseArgs(process.argv);
    const scoreboards = args.scoreboards.map((scoreboardPath) => {
        const resolved = path.resolve(process.cwd(), scoreboardPath);
        const scoreboard = readJson(resolved);
        const batchMatch = scoreboardPath.match(/batch\d+/i);
        const batch = batchMatch ? batchMatch[0].toLowerCase() : path.basename(scoreboardPath);
        return { batch, path: scoreboardPath, scoreboard };
    });

    const assessment = buildAssessment(scoreboards);
    printAssessment(assessment);

    const outputPath = path.resolve(process.cwd(), args.output);
    fs.writeFileSync(outputPath, JSON.stringify(assessment, null, 2), 'utf8');
    console.log('');
    console.log(`Wrote assessment JSON to: ${outputPath}`);
}

main();
