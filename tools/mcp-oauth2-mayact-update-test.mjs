#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function parseArgs(argv) {
    const args = {
        realm: '/alpha',
        mcpConfig: '/Users/volker.scheuber/Library/Application Support/Code/User/mcp.json',
        output: 'docs/mcp-oauth2-mayact-update-report.json',
        baselineClientId: undefined,
    };

    for (let i = 2; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '--realm') {
            args.realm = argv[i + 1] || args.realm;
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
        if (token === '--baseline-client-id') {
            args.baselineClientId = argv[i + 1] || args.baselineClientId;
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
            // Drain stderr without polluting test output.
        });
    }

    const client = new Client(
        { name: 'frodo-oauth2-mayact-update-test', version: '1.0.0' },
        { capabilities: {} }
    );

    await client.connect(transport);
    return { client, transport };
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

function parsePayload(result) {
    const text = getTextContent(result);
    if (!text) {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function getArrayData(payload) {
    const data = payload?.data;
    if (Array.isArray(data)) {
        return data;
    }
    if (data && typeof data === 'object' && Array.isArray(data.result)) {
        return data.result;
    }
    return [];
}

async function callTool(client, toolName, args, extra = {}) {
    try {
        const result = await client.callTool({ name: toolName, arguments: args });
        const text = getTextContent(result);
        const payload = parsePayload(result);
        return {
            toolName,
            args,
            isError: !!result?.isError,
            message: result?.isError ? text : '',
            payload,
            ...extra,
        };
    } catch (error) {
        return {
            toolName,
            args,
            isError: true,
            message: error instanceof Error ? error.message : String(error),
            payload: null,
            ...extra,
        };
    }
}

function buildMayActScriptSource() {
    // Fictional test values only. These are not real subjects or client ids.
    return [
        '(function () {',
        '  var mayAct = {',
        "    subject: 'fictional-subject-001',",
        "    client_ids: ['fictional-client-alpha', 'fictional-client-beta']",
        '  };',
        '  return mayAct;',
        '}());',
    ].join('\n');
}

function ensureGrantTypeTokenExchange(clientData) {
    const value = clientData?.advancedOAuth2ClientConfig?.grantTypes?.value;
    if (!Array.isArray(value)) {
        return;
    }
    if (!value.includes('urn:ietf:params:oauth:grant-type:token-exchange')) {
        value.push('urn:ietf:params:oauth:grant-type:token-exchange');
    }
}

function setTokenExchangeAuthLevel(clientData, level) {
    const tx = clientData?.advancedOAuth2ClientConfig?.tokenExchangeAuthLevel;
    if (tx && typeof tx === 'object' && 'value' in tx) {
        tx.value = level;
        return;
    }
    if (clientData?.advancedOAuth2ClientConfig) {
        clientData.advancedOAuth2ClientConfig.tokenExchangeAuthLevel = level;
    }
}

function setClientName(clientData, clientId) {
    const wrapper = clientData?.coreOAuth2ClientConfig?.clientName;
    if (wrapper && typeof wrapper === 'object' && Array.isArray(wrapper.value)) {
        wrapper.value = [clientId];
        return;
    }
    if (clientData?.coreOAuth2ClientConfig) {
        clientData.coreOAuth2ClientConfig.clientName = [clientId];
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function run() {
    const args = parseArgs(process.argv);
    const server = loadServerConfig(args.mcpConfig);
    const { client, transport } = await connectClient(server);

    const stamp = Date.now();
    const scriptId = `mcp-mayact-script-${stamp}`;
    const clientId = `mcp-mayact-client-${stamp}`;

    const report = {
        generatedAt: new Date().toISOString(),
        status: 'unknown',
        summary: '',
        input: {
            realm: args.realm,
            baselineClientId: args.baselineClientId || null,
        },
        resources: {
            scriptId,
            clientId,
            baselineClientId: null,
        },
        attempts: [],
        verification: {
            scriptCreated: false,
            clientCreated: false,
            clientUpdated: false,
            mayActScriptAssigned: false,
            tokenExchangeEnabled: false,
            tokenExchangeAuthLevel: null,
            grantTypes: [],
        },
    };

    try {
        const scriptSource = buildMayActScriptSource();
        const scriptData = {
            _id: scriptId,
            name: scriptId,
            context: 'OAUTH2_MAY_ACT',
            language: 'JAVASCRIPT',
            script: Buffer.from(scriptSource, 'utf8').toString('base64'),
        };

        const createScriptAttempt = await callTool(
            client,
            'frodo_create',
            {
                domain: 'script',
                objectType: 'Script',
                realm: args.realm,
                namedArgs: {
                    scriptId,
                    scriptData,
                },
            },
            { step: 'create-script-via-create' }
        );
        report.attempts.push(createScriptAttempt);
        assert(!createScriptAttempt.isError, `Script create/upsert failed: ${createScriptAttempt.message}`);

        const readScriptAttempt = await callTool(
            client,
            'frodo_read',
            {
                domain: 'script',
                objectType: 'Script',
                realm: args.realm,
                namedArgs: { scriptId },
            },
            { step: 'verify-script' }
        );
        report.attempts.push(readScriptAttempt);
        assert(!readScriptAttempt.isError, `Script read-back failed: ${readScriptAttempt.message}`);
        report.verification.scriptCreated = true;

        let baselineClientId = args.baselineClientId;
        if (!baselineClientId) {
            const listAttempt = await callTool(
                client,
                'frodo_list',
                {
                    domain: 'oauth2oidc',
                    objectType: 'OAuth2Client',
                    realm: args.realm,
                    pageSize: 1,
                },
                { step: 'find-baseline-client' }
            );
            report.attempts.push(listAttempt);
            assert(!listAttempt.isError, `OAuth2 client list failed: ${listAttempt.message}`);
            const listData = getArrayData(listAttempt.payload);
            baselineClientId = listData[0]?._id;
            assert(typeof baselineClientId === 'string' && baselineClientId.length > 0, 'No baseline OAuth2 client available to clone.');
        }

        report.resources.baselineClientId = baselineClientId;

        const readBaselineAttempt = await callTool(
            client,
            'frodo_read',
            {
                domain: 'oauth2oidc',
                objectType: 'OAuth2Client',
                realm: args.realm,
                positionalArgs: [baselineClientId],
            },
            { step: 'read-baseline-client' }
        );
        report.attempts.push(readBaselineAttempt);
        assert(!readBaselineAttempt.isError, `Baseline OAuth2 client read failed: ${readBaselineAttempt.message}`);

        const baselineData = readBaselineAttempt.payload?.data;
        assert(baselineData && typeof baselineData === 'object', 'Baseline OAuth2 client payload missing data object.');

        const newClientData = JSON.parse(JSON.stringify(baselineData));
        delete newClientData._rev;
        newClientData._id = clientId;
        setClientName(newClientData, clientId);

        const createClientAttempt = await callTool(
            client,
            'frodo_create',
            {
                domain: 'oauth2oidc',
                objectType: 'OAuth2Client',
                realm: args.realm,
                namedArgs: {
                    clientId,
                    clientData: newClientData,
                },
            },
            { step: 'create-client' }
        );
        report.attempts.push(createClientAttempt);
        assert(!createClientAttempt.isError, `OAuth2 client create failed: ${createClientAttempt.message}`);
        report.verification.clientCreated = true;

        const readNewClientAttempt = await callTool(
            client,
            'frodo_read',
            {
                domain: 'oauth2oidc',
                objectType: 'OAuth2Client',
                realm: args.realm,
                positionalArgs: [clientId],
            },
            { step: 'read-new-client-before-update' }
        );
        report.attempts.push(readNewClientAttempt);
        assert(!readNewClientAttempt.isError, `New OAuth2 client read failed: ${readNewClientAttempt.message}`);

        const updateData = readNewClientAttempt.payload?.data;
        assert(updateData && typeof updateData === 'object', 'New OAuth2 client update payload missing data object.');

        ensureGrantTypeTokenExchange(updateData);
        setTokenExchangeAuthLevel(updateData, 1);
        updateData.overrideOAuth2ClientConfig.oidcMayActScript = scriptId;

        const updateClientAttempt = await callTool(
            client,
            'frodo_update',
            {
                domain: 'oauth2oidc',
                objectType: 'OAuth2Client',
                realm: args.realm,
                namedArgs: {
                    clientId,
                    clientData: updateData,
                },
            },
            { step: 'update-client-may-act-token-exchange' }
        );
        report.attempts.push(updateClientAttempt);
        assert(!updateClientAttempt.isError, `OAuth2 client update failed: ${updateClientAttempt.message}`);
        report.verification.clientUpdated = true;

        const verifyClientAttempt = await callTool(
            client,
            'frodo_read',
            {
                domain: 'oauth2oidc',
                objectType: 'OAuth2Client',
                realm: args.realm,
                positionalArgs: [clientId],
            },
            { step: 'verify-client-after-update' }
        );
        report.attempts.push(verifyClientAttempt);
        assert(!verifyClientAttempt.isError, `Final OAuth2 client read failed: ${verifyClientAttempt.message}`);

        const verified = verifyClientAttempt.payload?.data || {};
        const mayActScript = verified?.overrideOAuth2ClientConfig?.oidcMayActScript;
        const grantTypes = verified?.advancedOAuth2ClientConfig?.grantTypes?.value || [];
        const txLevel = verified?.advancedOAuth2ClientConfig?.tokenExchangeAuthLevel?.value;

        report.verification.mayActScriptAssigned = mayActScript === scriptId;
        report.verification.tokenExchangeEnabled = Array.isArray(grantTypes)
            ? grantTypes.includes('urn:ietf:params:oauth:grant-type:token-exchange')
            : false;
        report.verification.tokenExchangeAuthLevel = txLevel;
        report.verification.grantTypes = Array.isArray(grantTypes) ? grantTypes : [];

        assert(report.verification.mayActScriptAssigned, 'May-act script id was not applied to the new client.');
        assert(report.verification.tokenExchangeEnabled, 'Token exchange grant type was not enabled on the new client.');

        report.status = 'passed';
        report.summary = 'Created a distinct OAuth2 client, created a distinct OAUTH2_MAY_ACT script, and updated the new client for token exchange + oidcMayActScript using MCP only.';
    } catch (error) {
        report.status = 'failed';
        report.summary = error instanceof Error ? error.message : String(error);
    } finally {
        const outputPath = path.isAbsolute(args.output)
            ? args.output
            : path.join('/Users/volker.scheuber/Documents/Projects/frodo-cli', args.output);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
        console.log(JSON.stringify(report, null, 2));

        try {
            await client.close();
        } catch {
            // Ignore shutdown errors.
        }
        try {
            if (transport.close) {
                await transport.close();
            }
        } catch {
            // Ignore transport shutdown errors.
        }

        if (report.status === 'failed') {
            process.exitCode = 1;
        }
    }
}

run().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
});
