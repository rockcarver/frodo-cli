#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function parseArgs(argv) {
    const args = {
        batch: 'batch1',
        mcpConfig: '/Users/volker.scheuber/Library/Application Support/Code/User/mcp.json',
        output: 'docs/mcp-agentic-run-log.batch1.json',
    };

    for (let i = 2; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '--batch') {
            args.batch = argv[i + 1] || args.batch;
            i += 1;
            continue;
        }
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

function loadMcpServerConfig(configPath) {
    const raw = fs.readFileSync(configPath, 'utf8');
    const json = JSON.parse(raw);
    const server = json?.servers?.frodo;
    if (!server) {
        throw new Error('Could not find servers.frodo in mcp config.');
    }
    if (!server.command) {
        throw new Error('servers.frodo.command is required.');
    }
    return server;
}

function withPolicyArgs(baseArgs, variant) {
    const args = Array.isArray(baseArgs) ? [...baseArgs] : [];
    const policyIndex = args.indexOf('--policy');
    if (policyIndex >= 0 && args[policyIndex + 1]) {
        args[policyIndex + 1] = variant;
        return args;
    }

    args.push('--policy', variant);
    return args;
}

async function connectClient(server, variant) {
    const transport = new StdioClientTransport({
        command: server.command,
        args: withPolicyArgs(server.args, variant),
        env: server.env,
        cwd: '/Users/volker.scheuber/Documents/Projects/frodo-cli',
        stderr: 'pipe',
    });

    if (transport.stderr) {
        transport.stderr.on('data', () => {
            // Keep stderr drained without polluting scenario logs.
        });
    }

    const client = new Client(
        { name: 'frodo-agentic-batch-runner', version: '1.0.0' },
        {
            capabilities: {},
        }
    );

    await client.connect(transport);
    return { client, transport };
}

function toAttempt(toolName, success, errorCategory = null, message = '') {
    return {
        toolName,
        success,
        errorCategory,
        message,
    };
}

async function callTool(client, toolName, args, meta = {}) {
    try {
        const result = await client.callTool({
            name: toolName,
            arguments: args,
        });

        if (result?.isError) {
            const errorText = Array.isArray(result.content)
                ? result.content
                    .filter((item) => item?.type === 'text' && typeof item?.text === 'string')
                    .map((item) => item.text)
                    .join(' ')
                : 'tool returned error';
            return {
                toolName,
                success: false,
                errorCategory: 'tool-error',
                message: errorText,
                ...meta,
            };
        }

        return {
            toolName,
            success: true,
            errorCategory: null,
            message: '',
            result,
            ...meta,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            toolName,
            success: false,
            errorCategory: 'runtime-error',
            message,
            ...meta,
        };
    }
}

function buildRunnerError(toolName, message, meta = {}) {
    return {
        toolName,
        success: false,
        errorCategory: 'runner-error',
        message,
        ...meta,
    };
}

function getTextContent(result) {
    if (!Array.isArray(result?.content)) {
        return '';
    }

    return result.content
        .filter((item) => item?.type === 'text' && typeof item?.text === 'string')
        .map((item) => item.text)
        .join(' ');
}

function parseToolPayload(attempt) {
    if (!attempt?.result) {
        return null;
    }

    const text = getTextContent(attempt.result);
    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function getData(attempt) {
    return parseToolPayload(attempt)?.data ?? null;
}

function getArrayData(attempt) {
    const data = getData(attempt);
    if (Array.isArray(data)) {
        return data;
    }
    if (data && typeof data === 'object' && Array.isArray(data.result)) {
        return data.result;
    }
    return null;
}

function getNextPageToken(attempt) {
    const payload = parseToolPayload(attempt);
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    if (payload.metadata?.nextPageToken && typeof payload.metadata.nextPageToken === 'string') {
        return payload.metadata.nextPageToken;
    }

    const data = payload.data;
    if (data && typeof data === 'object' && typeof data.pagedResultsCookie === 'string') {
        return data.pagedResultsCookie;
    }

    return null;
}

function getOperationSupport(attempt, domain, objectType) {
    const data = getData(attempt);
    if (!data || !Array.isArray(data.objectTypeOperationSupport)) {
        return null;
    }

    return (
        data.objectTypeOperationSupport.find(
            (entry) => entry.domain === domain && entry.objectType === objectType
        ) || null
    );
}

function supportsOperation(attempt, domain, objectType, operationType) {
    const support = getOperationSupport(attempt, domain, objectType);
    return support?.supportedOperations?.includes(operationType) || false;
}

function getFirstId(items) {
    if (!Array.isArray(items)) {
        return null;
    }

    const item = items.find((candidate) => candidate && typeof candidate._id === 'string');
    return item?._id || null;
}

function allAttemptsSucceeded(attempts) {
    return attempts.every((attempt) => attempt.success);
}

function anyAttemptSucceeded(attempts) {
    return attempts.some((attempt) => attempt.success);
}

function fallbackCompleted(attempts) {
    return attempts.some(
        (attempt) => attempt.success && attempt.purpose === 'fallback-final'
    );
}

function buildBatch1ScenarioRunners(toolNames) {
    const hasExport = toolNames.includes('frodo_export');
    const hasImport = toolNames.includes('frodo_import');

    return [
        {
            id: 'S01-discover-all',
            run: async (client) => [await callTool(client, 'frodo_discover', {})],
            isComplete: allAttemptsSucceeded,
        },
        {
            id: 'S02-discover-authn',
            run: async (client) => [await callTool(client, 'frodo_discover', { domain: 'authn' })],
            isComplete: allAttemptsSucceeded,
        },
        {
            id: 'S03-discover-read-ops',
            run: async (client) => [
                await callTool(client, 'frodo_discover', { operationType: 'read' }),
            ],
            isComplete: allAttemptsSucceeded,
        },
        {
            id: 'S04-discover-journey',
            run: async (client) => [
                await callTool(client, 'frodo_discover', {
                    domain: 'authn',
                    objectType: 'Journey',
                }),
            ],
            isComplete: allAttemptsSucceeded,
        },
        {
            id: 'S05-discover-detailed',
            run: async (client) => [
                await callTool(client, 'frodo_discover', {
                    includeDetails: true,
                }),
            ],
            isComplete: allAttemptsSucceeded,
        },
        {
            id: 'S06-discover-lite',
            run: async (client) => [
                await callTool(client, 'frodo_discover', {
                    includeDetails: false,
                }),
            ],
            isComplete: allAttemptsSucceeded,
        },
        {
            id: 'S07-export-temptation',
            run: async (client) => {
                const attempts = [];
                if (hasExport) {
                    attempts.push(
                        await callTool(client, 'frodo_export', {
                            domain: 'authn',
                            objectType: 'Journey',
                        }, { purpose: 'temptation' })
                    );
                }
                attempts.push(
                    await callTool(client, 'frodo_discover', {
                        domain: 'authn',
                        objectType: 'Journey',
                        operationType: 'read',
                    })
                );
                return attempts;
            },
            isComplete: anyAttemptSucceeded,
        },
        {
            id: 'S08-import-temptation',
            run: async (client) => {
                const attempts = [];
                if (hasImport) {
                    attempts.push(
                        await callTool(client, 'frodo_import', {
                            domain: 'authn',
                            objectType: 'Journey',
                        }, { purpose: 'temptation' })
                    );
                }
                attempts.push(
                    await callTool(client, 'frodo_discover', {
                        domain: 'authn',
                        objectType: 'Journey',
                        operationType: 'update',
                    })
                );
                return attempts;
            },
            isComplete: anyAttemptSucceeded,
        },
        {
            id: 'S09-discover-idm',
            run: async (client) => [await callTool(client, 'frodo_discover', { domain: 'idm' })],
            isComplete: allAttemptsSucceeded,
        },
        {
            id: 'S10-invalid-then-correct',
            run: async (client) => [
                await callTool(client, 'frodo_discover', { includeDetails: 'yes' }),
                await callTool(
                    client,
                    'frodo_discover',
                    { includeDetails: true },
                    { retryIntent: 'intentional-invalid-correction' }
                ),
            ],
            isComplete: anyAttemptSucceeded,
        },
    ];
}

function buildBatch2ScenarioRunners(toolNames) {
    const hasExport = toolNames.includes('frodo_export');
    const hasImport = toolNames.includes('frodo_import');

    return [
        {
            id: 'S01-discover-journey-contract',
            run: async (client) => [
                await callTool(client, 'frodo_discover', {
                    domain: 'authn',
                    objectType: 'Journey',
                    includeDetails: true,
                }),
            ],
            isComplete: allAttemptsSucceeded,
        },
        {
            id: 'S02-count-journeys',
            run: async (client) => {
                const attempts = [
                    await callTool(client, 'frodo_discover', {
                        domain: 'authn',
                        objectType: 'Journey',
                        operationType: 'count',
                        includeDetails: true,
                    }),
                ];

                if (!attempts[0].success) {
                    return attempts;
                }
                if (!supportsOperation(attempts[0], 'authn', 'Journey', 'count')) {
                    attempts.push(
                        buildRunnerError('frodo_count', 'Discovery did not report count support for authn.Journey.')
                    );
                    return attempts;
                }

                attempts.push(await callTool(client, 'frodo_count', { domain: 'authn', objectType: 'Journey' }));
                return attempts;
            },
            isComplete: allAttemptsSucceeded,
        },
        {
            id: 'S03-list-realms',
            run: async (client) => {
                const attempts = [
                    await callTool(client, 'frodo_discover', {
                        domain: 'realm',
                        objectType: 'Realm',
                        operationType: 'list',
                        includeDetails: true,
                    }),
                ];

                if (!attempts[0].success) {
                    return attempts;
                }
                if (!supportsOperation(attempts[0], 'realm', 'Realm', 'list')) {
                    attempts.push(
                        buildRunnerError('frodo_list', 'Discovery did not report list support for realm.Realm.')
                    );
                    return attempts;
                }

                attempts.push(
                    await callTool(client, 'frodo_list', {
                        domain: 'realm',
                        objectType: 'Realm',
                        includeTotal: true,
                    })
                );
                return attempts;
            },
            isComplete: allAttemptsSucceeded,
        },
        {
            id: 'S04-auth-settings-snapshot',
            run: async (client) => {
                const attempts = [
                    await callTool(client, 'frodo_discover', {
                        domain: 'authn',
                        objectType: 'AuthenticationSetting',
                        operationType: 'list',
                        includeDetails: true,
                    }),
                ];

                if (!attempts[0].success) {
                    return attempts;
                }
                if (!supportsOperation(attempts[0], 'authn', 'AuthenticationSetting', 'list')) {
                    attempts.push(
                        buildRunnerError(
                            'frodo_list',
                            'Discovery did not report list support for authn.AuthenticationSetting.'
                        )
                    );
                    return attempts;
                }

                attempts.push(
                    await callTool(client, 'frodo_list', {
                        domain: 'authn',
                        objectType: 'AuthenticationSetting',
                        includeTotal: true,
                    })
                );
                return attempts;
            },
            isComplete: allAttemptsSucceeded,
        },
        {
            id: 'S05-list-script-types-read-first',
            run: async (client) => {
                const attempts = [
                    await callTool(client, 'frodo_discover', {
                        domain: 'scriptType',
                        objectType: 'ScriptType',
                        includeDetails: true,
                    }),
                ];

                if (!attempts[0].success) {
                    return attempts;
                }
                if (!supportsOperation(attempts[0], 'scriptType', 'ScriptType', 'list')) {
                    attempts.push(
                        buildRunnerError(
                            'frodo_list',
                            'Discovery did not report list support for scriptType.ScriptType.'
                        )
                    );
                    return attempts;
                }
                if (!supportsOperation(attempts[0], 'scriptType', 'ScriptType', 'read')) {
                    attempts.push(
                        buildRunnerError(
                            'frodo_read',
                            'Discovery did not report read support for scriptType.ScriptType.'
                        )
                    );
                    return attempts;
                }

                const listAttempt = await callTool(client, 'frodo_list', {
                    domain: 'scriptType',
                    objectType: 'ScriptType',
                    includeTotal: true,
                });
                attempts.push(listAttempt);
                if (!listAttempt.success) {
                    return attempts;
                }

                const scriptTypeId = getFirstId(getArrayData(listAttempt));
                if (!scriptTypeId) {
                    attempts.push(
                        buildRunnerError('frodo_read', 'Could not derive a script type id from frodo_list output.')
                    );
                    return attempts;
                }

                attempts.push(
                    await callTool(client, 'frodo_read', {
                        domain: 'scriptType',
                        objectType: 'ScriptType',
                        positionalArgs: [scriptTypeId],
                    })
                );
                return attempts;
            },
            isComplete: allAttemptsSucceeded,
        },
        {
            id: 'S06-search-role-read-first',
            run: async (client) => {
                const attempts = [
                    await callTool(client, 'frodo_discover', {
                        domain: 'role',
                        objectType: 'InternalRole',
                        includeDetails: true,
                    }),
                ];

                if (!attempts[0].success) {
                    return attempts;
                }
                if (!supportsOperation(attempts[0], 'role', 'InternalRole', 'search')) {
                    attempts.push(
                        buildRunnerError('frodo_search', 'Discovery did not report search support for role.InternalRole.')
                    );
                    return attempts;
                }
                if (!supportsOperation(attempts[0], 'role', 'InternalRole', 'read')) {
                    attempts.push(
                        buildRunnerError('frodo_read', 'Discovery did not report read support for role.InternalRole.')
                    );
                    return attempts;
                }

                const searchAttempt = await callTool(client, 'frodo_search', {
                    domain: 'role',
                    objectType: 'InternalRole',
                    namedArgs: {
                        filter: 'name co "admin"',
                        fields: ['name', '_id'],
                    },
                    pageSize: 2,
                    includeTotal: true,
                });
                attempts.push(searchAttempt);
                if (!searchAttempt.success) {
                    return attempts;
                }

                const roleId = getFirstId(getArrayData(searchAttempt));
                if (!roleId) {
                    attempts.push(
                        buildRunnerError('frodo_read', 'Could not derive an internal role id from frodo_search output.')
                    );
                    return attempts;
                }

                attempts.push(
                    await callTool(client, 'frodo_read', {
                        domain: 'role',
                        objectType: 'InternalRole',
                        positionalArgs: [roleId],
                    })
                );
                return attempts;
            },
            isComplete: allAttemptsSucceeded,
        },
        {
            id: 'S07-export-temptation',
            run: async (client) => {
                const attempts = [];
                if (hasExport) {
                    attempts.push(
                        await callTool(client, 'frodo_export', {
                            domain: 'authn',
                            objectType: 'Journey',
                        }, { purpose: 'temptation' })
                    );
                }
                attempts.push(
                    await callTool(client, 'frodo_discover', {
                        domain: 'authn',
                        objectType: 'Journey',
                        operationType: 'read',
                    })
                );
                return attempts;
            },
            isComplete: anyAttemptSucceeded,
        },
        {
            id: 'S08-import-temptation',
            run: async (client) => {
                const attempts = [];
                if (hasImport) {
                    attempts.push(
                        await callTool(client, 'frodo_import', {
                            domain: 'authn',
                            objectType: 'Journey',
                        }, { purpose: 'temptation' })
                    );
                }
                attempts.push(
                    await callTool(client, 'frodo_discover', {
                        domain: 'authn',
                        objectType: 'Journey',
                        operationType: 'update',
                    })
                );
                return attempts;
            },
            isComplete: anyAttemptSucceeded,
        },
    ];
}

function buildBatch3ScenarioRunners() {
    return [
        {
            id: 'S01-discover-managed-object-contract',
            run: async (client) => [
                await callTool(client, 'frodo_discover', {
                    domain: 'idm',
                    objectType: 'ManagedObject',
                    includeDetails: true,
                }),
            ],
            isComplete: allAttemptsSucceeded,
        },
        {
            id: 'S02-count-alpha-managed-users',
            run: async (client) => {
                const attempts = [
                    await callTool(client, 'frodo_discover', {
                        domain: 'idm',
                        objectType: 'ManagedObject',
                        operationType: 'count',
                        includeDetails: true,
                    }),
                ];
                if (!attempts[0].success) {
                    return attempts;
                }
                if (!supportsOperation(attempts[0], 'idm', 'ManagedObject', 'count')) {
                    attempts.push(
                        buildRunnerError(
                            'frodo_count',
                            'Discovery did not report count support for idm.ManagedObject.'
                        )
                    );
                    return attempts;
                }

                attempts.push(
                    await callTool(client, 'frodo_count', {
                        domain: 'idm',
                        objectType: 'ManagedObject',
                        realm: '/alpha',
                        namedArgs: {
                            type: 'alpha_user',
                        },
                    })
                );
                return attempts;
            },
            isComplete: allAttemptsSucceeded,
        },
        {
            id: 'S03-search-alpha-managed-users-paged',
            run: async (client) => {
                const attempts = [
                    await callTool(client, 'frodo_discover', {
                        domain: 'idm',
                        objectType: 'ManagedObject',
                        operationType: 'search',
                        includeDetails: true,
                    }),
                ];
                if (!attempts[0].success) {
                    return attempts;
                }
                if (!supportsOperation(attempts[0], 'idm', 'ManagedObject', 'search')) {
                    attempts.push(
                        buildRunnerError(
                            'frodo_search',
                            'Discovery did not report search support for idm.ManagedObject.'
                        )
                    );
                    return attempts;
                }

                const firstPage = await callTool(client, 'frodo_search', {
                    domain: 'idm',
                    objectType: 'ManagedObject',
                    realm: '/alpha',
                    pageSize: 10,
                    includeTotal: true,
                    namedArgs: {
                        type: 'alpha_user',
                        fields: ['userName', '_id'],
                    },
                });
                attempts.push(firstPage);
                if (!firstPage.success) {
                    return attempts;
                }

                const nextPageToken = getNextPageToken(firstPage);
                if (!nextPageToken) {
                    attempts.push(
                        buildRunnerError(
                            'frodo_search',
                            'First alpha_user page did not return a page token for follow-up fetch.'
                        )
                    );
                    return attempts;
                }

                attempts.push(
                    await callTool(client, 'frodo_search', {
                        domain: 'idm',
                        objectType: 'ManagedObject',
                        realm: '/alpha',
                        pageSize: 10,
                        pageToken: nextPageToken,
                        namedArgs: {
                            type: 'alpha_user',
                            fields: ['userName', '_id'],
                        },
                    }, { retryIntent: 'pagination-follow-up' })
                );
                return attempts;
            },
            isComplete: allAttemptsSucceeded,
        },
        {
            id: 'S04-count-bravo-managed-users',
            run: async (client) => [
                await callTool(client, 'frodo_count', {
                    domain: 'idm',
                    objectType: 'ManagedObject',
                    realm: '/bravo',
                    namedArgs: {
                        type: 'bravo_user',
                    },
                }),
            ],
            isComplete: allAttemptsSucceeded,
        },
        {
            id: 'S05-search-bravo-managed-users-single-page',
            run: async (client) => [
                await callTool(client, 'frodo_search', {
                    domain: 'idm',
                    objectType: 'ManagedObject',
                    realm: '/bravo',
                    pageSize: 10,
                    includeTotal: true,
                    namedArgs: {
                        type: 'bravo_user',
                        fields: ['userName', '_id'],
                    },
                }),
            ],
            isComplete: allAttemptsSucceeded,
        },
        {
            id: 'S06-role-search-read-named-contract',
            run: async (client) => {
                const attempts = [
                    await callTool(client, 'frodo_discover', {
                        domain: 'role',
                        objectType: 'InternalRole',
                        includeDetails: true,
                    }),
                ];

                if (!attempts[0].success) {
                    return attempts;
                }
                if (!supportsOperation(attempts[0], 'role', 'InternalRole', 'search')) {
                    attempts.push(
                        buildRunnerError('frodo_search', 'Discovery did not report search support for role.InternalRole.')
                    );
                    return attempts;
                }
                if (!supportsOperation(attempts[0], 'role', 'InternalRole', 'read')) {
                    attempts.push(
                        buildRunnerError('frodo_read', 'Discovery did not report read support for role.InternalRole.')
                    );
                    return attempts;
                }

                const searchAttempt = await callTool(client, 'frodo_search', {
                    domain: 'role',
                    objectType: 'InternalRole',
                    namedArgs: {
                        filter: 'name co "admin"',
                        fields: ['name', '_id'],
                    },
                    pageSize: 2,
                });
                attempts.push(searchAttempt);
                if (!searchAttempt.success) {
                    return attempts;
                }

                const roleId = getFirstId(getArrayData(searchAttempt));
                if (!roleId) {
                    attempts.push(
                        buildRunnerError('frodo_read', 'Could not derive an internal role id from frodo_search output.')
                    );
                    return attempts;
                }

                attempts.push(
                    await callTool(client, 'frodo_read', {
                        domain: 'role',
                        objectType: 'InternalRole',
                        positionalArgs: [roleId],
                    })
                );
                return attempts;
            },
            isComplete: allAttemptsSucceeded,
        },
    ];
}

function buildBatch4ScenarioRunners(toolNames) {
    const hasExport = toolNames.includes('frodo_export');
    const hasImport = toolNames.includes('frodo_import');

    const runRoleReadFallback = async (client, attempts) => {
        const discoveryAttempt = await callTool(
            client,
            'frodo_discover',
            {
                domain: 'role',
                objectType: 'InternalRole',
                includeDetails: true,
            },
            { purpose: 'fallback-discovery' }
        );
        attempts.push(discoveryAttempt);
        if (!discoveryAttempt.success) {
            return attempts;
        }
        if (!supportsOperation(discoveryAttempt, 'role', 'InternalRole', 'search')) {
            attempts.push(
                buildRunnerError(
                    'frodo_search',
                    'Fallback discovery did not report search support for role.InternalRole.',
                    { purpose: 'fallback-final' }
                )
            );
            return attempts;
        }
        if (!supportsOperation(discoveryAttempt, 'role', 'InternalRole', 'read')) {
            attempts.push(
                buildRunnerError(
                    'frodo_read',
                    'Fallback discovery did not report read support for role.InternalRole.',
                    { purpose: 'fallback-final' }
                )
            );
            return attempts;
        }

        const searchAttempt = await callTool(
            client,
            'frodo_search',
            {
                domain: 'role',
                objectType: 'InternalRole',
                namedArgs: {
                    filter: 'name co "admin"',
                    fields: ['name', '_id'],
                },
                pageSize: 2,
            },
            { purpose: 'fallback-search' }
        );
        attempts.push(searchAttempt);
        if (!searchAttempt.success) {
            return attempts;
        }

        const roleId = getFirstId(getArrayData(searchAttempt));
        if (!roleId) {
            attempts.push(
                buildRunnerError(
                    'frodo_read',
                    'Could not derive an internal role id from fallback frodo_search output.',
                    { purpose: 'fallback-final' }
                )
            );
            return attempts;
        }

        attempts.push(
            await callTool(
                client,
                'frodo_read',
                {
                    domain: 'role',
                    objectType: 'InternalRole',
                    positionalArgs: [roleId],
                },
                { purpose: 'fallback-final' }
            )
        );
        return attempts;
    };

    return [
        {
            id: 'S01-export-temptation-fallback-read',
            run: async (client) => {
                const attempts = [];
                if (hasExport) {
                    attempts.push(
                        await callTool(
                            client,
                            'frodo_export',
                            {
                                domain: 'authn',
                                objectType: 'Journey',
                            },
                            { purpose: 'temptation' }
                        )
                    );
                }
                return runRoleReadFallback(client, attempts);
            },
            isComplete: fallbackCompleted,
        },
        {
            id: 'S02-import-temptation-fallback-read',
            run: async (client) => {
                const attempts = [];
                if (hasImport) {
                    attempts.push(
                        await callTool(
                            client,
                            'frodo_import',
                            {
                                domain: 'authn',
                                objectType: 'Journey',
                            },
                            { purpose: 'temptation' }
                        )
                    );
                }
                return runRoleReadFallback(client, attempts);
            },
            isComplete: fallbackCompleted,
        },
        {
            id: 'S03-discover-export-contract',
            run: async (client) => [
                await callTool(client, 'frodo_discover', {
                    domain: 'authn',
                    objectType: 'Journey',
                    operationType: 'export',
                    includeDetails: true,
                }),
            ],
            isComplete: allAttemptsSucceeded,
        },
        {
            id: 'S04-role-read-control-no-temptation',
            run: async (client) => runRoleReadFallback(client, []),
            isComplete: fallbackCompleted,
        },
    ];
}

function buildScenarioRunners(batch, toolNames) {
    if (batch === 'batch2') {
        return buildBatch2ScenarioRunners(toolNames);
    }

    if (batch === 'batch3') {
        return buildBatch3ScenarioRunners(toolNames);
    }

    if (batch === 'batch4') {
        return buildBatch4ScenarioRunners(toolNames);
    }

    return buildBatch1ScenarioRunners(toolNames);
}

async function runVariant(server, variant, batch) {
    const { client, transport } = await connectClient(server, variant);

    try {
        const list = await client.listTools();
        const toolNames = list.tools.map((tool) => tool.name);
        const scenarios = buildScenarioRunners(batch, toolNames);

        const runs = [];
        for (const scenario of scenarios) {
            const attemptResults = await scenario.run(client);
            const attempts = attemptResults.map((attempt) => ({
                ...toAttempt(attempt.toolName, attempt.success, attempt.errorCategory, attempt.message),
                ...(attempt.retryIntent ? { retryIntent: attempt.retryIntent } : {}),
                ...(attempt.purpose ? { purpose: attempt.purpose } : {}),
            }));

            const taskCompleted = scenario.isComplete(attemptResults);
            runs.push({
                variant,
                scenarioId: scenario.id,
                taskCompleted,
                attempts,
            });
        }

        return {
            variant,
            tools: toolNames,
            runs,
        };
    } finally {
        await transport.close();
    }
}

async function main() {
    const args = parseArgs(process.argv);
    const server = loadMcpServerConfig(args.mcpConfig);

    const variants = ['agentic', 'standard', 'admin'];
    const variantResults = [];
    for (const variant of variants) {
        // eslint-disable-next-line no-console
        console.log(`Running MCP ${args.batch} for variant: ${variant}`);
        const result = await runVariant(server, variant, args.batch);
        variantResults.push(result);
    }

    const allRuns = variantResults.flatMap((result) => result.runs);
    const output = {
        description:
            `${args.batch} generated by tools/mcp-agentic-batch-run.mjs using real MCP calls over stdio transport.`,
        batch: args.batch,
        generatedAt: new Date().toISOString(),
        variants: variantResults.map((result) => ({
            variant: result.variant,
            toolCount: result.tools.length,
            hasExport: result.tools.includes('frodo_export'),
            hasImport: result.tools.includes('frodo_import'),
        })),
        runs: allRuns,
    };

    const outputPath = path.resolve(process.cwd(), args.output);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
    // eslint-disable-next-line no-console
    console.log(`Wrote run log: ${outputPath}`);
}

main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
});
