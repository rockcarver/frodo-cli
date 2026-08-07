#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_V2_PACKAGES = [
    '@modelcontextprotocol/client',
    '@modelcontextprotocol/server',
    '@modelcontextprotocol/node',
];
const LEGACY_V1_PACKAGE = '@modelcontextprotocol/sdk';
const SCAN_DIRECTORIES = ['src', 'tools', 'test'];
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getDeclaredVersion(manifest, packageName) {
    const sections = [
        manifest.dependencies,
        manifest.devDependencies,
        manifest.peerDependencies,
        manifest.optionalDependencies,
    ];

    for (const section of sections) {
        if (section && typeof section[packageName] === 'string') {
            return section[packageName];
        }
    }

    return null;
}

function collectFiles(rootDir) {
    const files = [];

    function walk(currentDir) {
        if (!fs.existsSync(currentDir)) {
            return;
        }

        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
                continue;
            }

            if (!entry.isFile()) {
                continue;
            }

            const extension = path.extname(entry.name);
            if (SCAN_EXTENSIONS.has(extension)) {
                files.push(fullPath);
            }
        }
    }

    walk(rootDir);
    return files;
}

function isLegacyImportLine(line) {
    if (!line.includes(LEGACY_V1_PACKAGE)) {
        return false;
    }

    return (
        /\bfrom\s+['"]/.test(line) ||
        /\brequire\s*\(/.test(line) ||
        /\bimport\s*\(/.test(line) ||
        /\bexport\b.*\bfrom\s+['"]/.test(line)
    );
}

function scanForLegacyImports(workspaceRoot) {
    const violations = [];

    for (const relativeDir of SCAN_DIRECTORIES) {
        const targetDir = path.join(workspaceRoot, relativeDir);
        const files = collectFiles(targetDir);
        for (const filePath of files) {
            const source = fs.readFileSync(filePath, 'utf8');
            const lines = source.split(/\r?\n/);
            for (let index = 0; index < lines.length; index += 1) {
                const line = lines[index];
                if (!isLegacyImportLine(line)) {
                    continue;
                }

                violations.push({
                    filePath,
                    lineNumber: index + 1,
                    snippet: line.trim(),
                });
            }
        }
    }

    return violations;
}

function assertMcpSdkTrack(manifest, lockManifest, workspaceRoot) {
    const failures = [];

    for (const requiredPackage of REQUIRED_V2_PACKAGES) {
        const declaredVersion = getDeclaredVersion(manifest, requiredPackage);
        if (!declaredVersion) {
            failures.push(
                `Missing required MCP v2 package in package.json: ${requiredPackage}`
            );
        }
    }

    const legacyDeclaredVersion = getDeclaredVersion(manifest, LEGACY_V1_PACKAGE);
    if (legacyDeclaredVersion) {
        failures.push(
            `Legacy MCP v1 monolith must not be declared in package.json: ${LEGACY_V1_PACKAGE}@${legacyDeclaredVersion}`
        );
    }

    const lockRootPackage = lockManifest?.packages?.[''] || {};
    for (const requiredPackage of REQUIRED_V2_PACKAGES) {
        const lockDeclaredVersion = getDeclaredVersion(lockRootPackage, requiredPackage);
        if (!lockDeclaredVersion) {
            failures.push(
                `Missing required MCP v2 package in package-lock root: ${requiredPackage}`
            );
        }
    }

    const lockLegacyVersion = getDeclaredVersion(lockRootPackage, LEGACY_V1_PACKAGE);
    if (lockLegacyVersion) {
        failures.push(
            `Legacy MCP v1 monolith must not be declared in package-lock root: ${LEGACY_V1_PACKAGE}@${lockLegacyVersion}`
        );
    }

    const importViolations = scanForLegacyImports(workspaceRoot);
    for (const violation of importViolations) {
        const relativePath = path.relative(workspaceRoot, violation.filePath);
        failures.push(
            `Legacy MCP v1 import usage found at ${relativePath}:${violation.lineNumber} -> ${violation.snippet}`
        );
    }

    if (failures.length > 0) {
        console.error('MCP SDK track check failed.');
        for (const failure of failures) {
            console.error(`- ${failure}`);
        }
        process.exit(1);
    }

    console.log('MCP SDK track check passed: v2 packages present and legacy v1 usage absent.');
}

function main() {
    const workspaceRoot = process.cwd();
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    const packageLockPath = path.join(workspaceRoot, 'package-lock.json');

    const manifest = readJson(packageJsonPath);
    const lockManifest = readJson(packageLockPath);
    assertMcpSdkTrack(manifest, lockManifest, workspaceRoot);
}

main();