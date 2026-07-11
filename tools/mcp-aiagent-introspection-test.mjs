#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function parseArgs(argv) {
    const args = {
        mcpConfig: '/Users/volker.scheuber/Library/Application Support/Code/User/mcp.json',
        output: 'docs/mcp-aiagent-introspection-report.json',
    };

    for (let i = 2; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '--mcp-config') {
            args.mcpConfig = argv[i + 1] || args.mcpConfig;
            i += 1;
            continue;
        }
        if (token === '--output') {
            args.output = argv[i + 1] || args.output;
            i += 1;
            continue;
        }
    }

    return args;
}

function loadServerConfig(configPath) {
    const raw = fs.readFileSync(configPath, 'utf8');
    const json = JSON.parse(raw);
    const server = json?.servers?.frodo;
    if (!server?.command) {
        throw new Error('Could not resolve servers.frodo.command from MCP config.');
    }
    return server;
}

async function connectClient(server) {
    const transport = new StdioClientTransport({
        command: server.command,
        args: server.args,
        env: server.env,
        cwd: '/Users/volker.scheuber/Documents/Projects/frodo-cli',
        stderr: 'pipe',
    });

    if (transport.stderr) {
        transport.stderr.on('data', () => {
            // Drain stderr without polluting report output.
        });
    }

    const client = new Client(
        { name: 'frodo-aiagent-introspection-test', version: '1.0.0' },
        { capabilities: {} }
    );
    await client.connect(transport);
    return { client, transport };
}

function parseToolPayload(result) {
    const text = Array.isArray(result?.content)
        ? result.content
            .filter((item) => item?.type === 'text' && typeof item?.text === 'string')
            .map((item) => item.text)
            .join(' ')
        : '';

    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

async function callTool(client, toolName, args) {
    try {
        const result = await client.callTool({ name: toolName, arguments: args });
        if (result?.isError) {
            const text = Array.isArray(result.content)
                ? result.content
                    .filter((item) => item?.type === 'text' && typeof item?.text === 'string')
                    .map((item) => item.text)
                    .join(' ')
                : 'tool returned error';
            return {
                toolName,
                success: false,
                message: text,
                payload: null,
            };
        }

        return {
            toolName,
            success: true,
            message: '',
            payload: parseToolPayload(result),
        };
    } catch (error) {
        return {
            toolName,
            success: false,
            message: error instanceof Error ? error.message : String(error),
            payload: null,
        };
    }
}

function getDiscoverData(discoverAttempt) {
    return discoverAttempt?.payload?.data ?? null;
}

function getOperationDetails(discoverData, operationType) {
    return Array.isArray(discoverData?.operationDetailsByType?.[operationType])
        ? discoverData.operationDetailsByType[operationType]
        : [];
}

function matchesAiAgent(entry) {
    const re = /ai.?agent/i;
    return re.test(entry.objectType || '') || re.test(entry.methodName || '') || re.test(entry.sourcePath || '');
}

function toArrayData(toolAttempt) {
    const data = toolAttempt?.payload?.data;
    if (Array.isArray(data)) {
        return data;
    }
    if (data && typeof data === 'object' && Array.isArray(data.result)) {
        return data.result;
    }
    return [];
}

function pickAiAgentRecords(records) {
    return records.filter((record) => {
        const serialized = JSON.stringify(record || {});
        return /ai.?agent/i.test(serialized);
    });
}

function getRecordId(record) {
    if (!record || typeof record !== 'object') {
        return null;
    }

    if (typeof record._id === 'string') {
        return record._id;
    }
    if (typeof record.id === 'string') {
        return record.id;
    }
    return null;
}

async function run() {
    const args = parseArgs(process.argv);
    const server = loadServerConfig(args.mcpConfig);
    const { client, transport } = await connectClient(server);

    const report = {
        generatedAt: new Date().toISOString(),
        status: 'unknown',
        summary: '',
        discovery: {},
        attempts: [],
        findings: {
            aiCapabilityObjectTypes: [],
            aiRecordsFound: 0,
            introspectionSucceeded: false,
        },
    };

    try {
        const discoverAttempt = await callTool(client, 'frodo_discover', {
            domain: 'agent',
            includeDetails: true,
        });
        report.attempts.push({
            toolName: discoverAttempt.toolName,
            success: discoverAttempt.success,
            message: discoverAttempt.message,
        });

        if (!discoverAttempt.success) {
            report.status = 'error';
            report.summary = 'frodo_discover failed for domain agent.';
            return report;
        }

        const discoverData = getDiscoverData(discoverAttempt);
        const readDetails = getOperationDetails(discoverData, 'read').filter((entry) => entry.domain === 'agent');
        const listDetails = getOperationDetails(discoverData, 'list').filter((entry) => entry.domain === 'agent');
        const searchDetails = getOperationDetails(discoverData, 'search').filter((entry) => entry.domain === 'agent');

        const aiCapabilityEntries = [...readDetails, ...listDetails, ...searchDetails].filter(matchesAiAgent);
        const aiObjectTypeSet = new Set(aiCapabilityEntries.map((entry) => entry.objectType));
        const aiCapabilityObjectTypes = [...aiObjectTypeSet].sort();
        report.findings.aiCapabilityObjectTypes = aiCapabilityObjectTypes;

        report.discovery = {
            agentObjectTypes: discoverData?.objectTypesByDomain?.agent || [],
            agentReadObjectTypes: readDetails.map((entry) => entry.objectType),
            agentListObjectTypes: listDetails.map((entry) => entry.objectType),
            agentSearchObjectTypes: searchDetails.map((entry) => entry.objectType),
            aiCapabilityEntries: aiCapabilityEntries.map((entry) => ({
                operationType: entry.operationType,
                objectType: entry.objectType,
                methodName: entry.methodName,
                sourcePath: entry.sourcePath,
                toolName: entry.toolName,
            })),
        };

        // Determine object types to probe for AI agents. Prefer explicit AIAgent-like types.
        const probeObjectTypes = aiCapabilityObjectTypes.length
            ? aiCapabilityObjectTypes
            : (discoverData?.objectTypesByDomain?.agent || []).filter((objectType) =>
                /agent/i.test(objectType)
            );

        const aiRecords = [];
        for (const objectType of probeObjectTypes) {
            const listAttempt = await callTool(client, 'frodo_list', {
                domain: 'agent',
                objectType,
                includeTotal: true,
            });
            report.attempts.push({
                toolName: listAttempt.toolName,
                success: listAttempt.success,
                message: listAttempt.message,
                objectType,
            });

            if (!listAttempt.success) {
                continue;
            }

            const records = toArrayData(listAttempt);
            const aiMatches = pickAiAgentRecords(records);
            aiRecords.push(...aiMatches.map((record) => ({ objectType, record })));

            // If search is supported for this object type, try a targeted AI-agent query.
            const supportsSearch = searchDetails.some((entry) => entry.objectType === objectType);
            if (supportsSearch) {
                const searchAttempt = await callTool(client, 'frodo_search', {
                    domain: 'agent',
                    objectType,
                    namedArgs: {
                        filter: '_type co "AIAgent"',
                        fields: ['_id', '_type', 'name'],
                    },
                    pageSize: 10,
                    includeTotal: true,
                });
                report.attempts.push({
                    toolName: searchAttempt.toolName,
                    success: searchAttempt.success,
                    message: searchAttempt.message,
                    objectType,
                });

                if (searchAttempt.success) {
                    const searched = toArrayData(searchAttempt);
                    const searchedAiMatches = pickAiAgentRecords(searched);
                    aiRecords.push(...searchedAiMatches.map((record) => ({ objectType, record })));
                }
            }
        }

        const dedupedById = new Map();
        for (const item of aiRecords) {
            const id = getRecordId(item.record);
            if (!id) {
                continue;
            }
            if (!dedupedById.has(id)) {
                dedupedById.set(id, item);
            }
        }

        report.findings.aiRecordsFound = dedupedById.size;

        if (dedupedById.size > 0) {
            const first = [...dedupedById.values()][0];
            const agentId = getRecordId(first.record);
            const readAttempt = await callTool(client, 'frodo_read', {
                domain: 'agent',
                objectType: first.objectType,
                positionalArgs: [agentId],
            });

            report.attempts.push({
                toolName: readAttempt.toolName,
                success: readAttempt.success,
                message: readAttempt.message,
                objectType: first.objectType,
                agentId,
            });

            report.findings.introspectionSucceeded = readAttempt.success;
            report.findings.introspectionSample = readAttempt.success
                ? readAttempt.payload?.data || null
                : null;
        }

        if (aiCapabilityObjectTypes.length === 0) {
            report.status = 'not-exposed';
            report.summary =
                'No AIAgent-like capability signatures were discovered under MCP domain agent. Automatic exposure for the new agent type was not observed in discovery.';
        } else if (report.findings.aiRecordsFound === 0) {
            report.status = 'exposed-no-data';
            report.summary =
                'AIAgent-like capability signatures are exposed in discovery, but no AI agent records were found in current tenant data.';
        } else if (report.findings.introspectionSucceeded) {
            report.status = 'passed';
            report.summary =
                'AIAgent capabilities are exposed and at least one AI agent record was discovered and introspected successfully.';
        } else {
            report.status = 'partial';
            report.summary =
                'AI agent records were found, but introspection read call failed.';
        }

        return report;
    } finally {
        await transport.close();
    }
}

run()
    .then((report) => {
        const args = parseArgs(process.argv);
        const outputPath = path.resolve(process.cwd(), args.output);
        fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
        console.log(JSON.stringify(report, null, 2));
        console.log(`Wrote report: ${outputPath}`);
        process.exit(report.status === 'error' ? 1 : 0);
    })
    .catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
