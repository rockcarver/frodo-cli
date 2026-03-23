const repl = require('node:repl');
const { frodo } = require('@rockcarver/frodo-lib');

function getHelpMetadataFromInstance(frodoInstance) {
    const candidate = frodoInstance['utils'];
    if (!candidate || typeof candidate !== 'object') return [];
    const getHelpMetadata = candidate['getHelpMetadata'];
    if (typeof getHelpMetadata !== 'function') return [];
    const result = getHelpMetadata();
    return Array.isArray(result) ? result : [];
}

function getValueAtPath(root, pathSegments) {
    let current = root;
    for (const segment of pathSegments) {
        if (!current || typeof current !== 'object') return undefined;
        current = current[segment];
    }
    return current;
}

function normalizeName(value) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findBestDoc(methodName, moduleSegments, docsByMethod) {
    const docs = docsByMethod.get(methodName) ?? [];
    if (docs.length === 0) return undefined;
    const normalizedModuleSegments = moduleSegments.map(normalizeName);
    const exactMatch = docs.find((d) =>
        normalizedModuleSegments.includes(normalizeName(d.typeName))
    );
    return exactMatch ?? docs[0];
}

function buildMethodScaffold(moduleSegments, methodName, docsByMethod) {
    const doc = findBestDoc(methodName, moduleSegments, docsByMethod);
    if (!doc) return '()';
    const paramNames = (doc.params ?? [])
        .map((p) => p.name.trim())
        .filter((name) => name.length > 0);
    if (paramNames.length === 0) return '()';
    return `(${paramNames.join(', ')})`;
}

function abbrevType(type) {
    const t = type.trim();
    if (!t) return t;
    if (t.includes('=>') || t.startsWith('(')) return 'fn';
    if (t.endsWith('[]')) return abbrevType(t.slice(0, -2)) + '[]';
    switch (t) {
        case 'string':
            return 'str';
        case 'boolean':
            return 'bool';
        case 'number':
            return 'num';
        default:
            return t;
    }
}

function buildHintLine(fullPath, doc) {
    const params = (doc.params ?? [])
        .map((p) => {
            const name = p.name.trim();
            const type = abbrevType(p.type);
            return name && type ? `${name}: ${type}` : name;
        })
        .filter((s) => s.length > 0)
        .join(', ');
    return `// ${fullPath}(${params})`;
}

function buildDocsByMethod(frodoInstance) {
    const helpDocs = getHelpMetadataFromInstance(frodoInstance);
    const docsByMethod = new Map();
    for (const doc of helpDocs) {
        if (!docsByMethod.has(doc.methodName)) docsByMethod.set(doc.methodName, []);
        docsByMethod.get(doc.methodName).push(doc);
    }
    return docsByMethod;
}

function createFrodoCompleter(rootBindings, docsByMethod, onMethodHint) {
    return (line) => {
        const tokenMatch = line.match(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.?$)/);
        const token = tokenMatch?.[1] ?? '';
        if (!token) return [[], line];

        const rootCandidates = Object.keys(rootBindings).filter((rootName) =>
            rootName.startsWith(token)
        );
        if (!token.includes('.')) {
            const rootCompletions = rootCandidates.sort((a, b) => a.localeCompare(b));
            return [rootCompletions, token];
        }

        const segments = token.split('.');
        const rootName = segments[0];
        const root = rootBindings[rootName];
        if (!root) return [[], token];

        const hasTrailingDot = token.endsWith('.');
        const parentSegments = hasTrailingDot ? segments.slice(1, -1) : segments.slice(1, -1);
        const partial = hasTrailingDot ? '' : segments[segments.length - 1];

        const targetObj = getValueAtPath(root, parentSegments);
        if (!targetObj || typeof targetObj !== 'object') return [[], token];

        const completions = Object.keys(targetObj)
            .filter((k) => k.startsWith(partial))
            .sort((a, b) => a.localeCompare(b))
            .map((k) => {
                const value = targetObj[k];
                const prefix = `${rootName}.${[...parentSegments, k].join('.')}`;
                if (typeof value !== 'function') return prefix;
                return `${prefix}${buildMethodScaffold(parentSegments, k, docsByMethod)}`;
            });

        if (onMethodHint && completions.length === 1) {
            const completion = completions[0];
            const parenIdx = completion.indexOf('(');
            if (parenIdx !== -1) {
                const dotIdx = completion.lastIndexOf('.', parenIdx);
                const resolvedMethodName = completion.slice(dotIdx + 1, parenIdx);
                const doc = findBestDoc(resolvedMethodName, parentSegments, docsByMethod);
                if (doc) {
                    const fullPath = completion.slice(0, parenIdx);
                    setImmediate(() => onMethodHint(buildHintLine(fullPath, doc)));
                }
            }
        }

        return [completions, token];
    };
}

function printHintAbovePrompt(replServer, hint) {
    if (!replServer) return;
    setImmediate(() => {
        process.stdout.write(`\n${hint}\n`);
        const refreshLine = replServer._refreshLine;
        if (typeof refreshLine === 'function') {
            refreshLine.call(replServer);
            return;
        }
        replServer.displayPrompt(true);
    });
}

const docsByMethod = buildDocsByMethod(frodo);
const rootBindings = { frodo, frodoLib: frodo };
let rs;
const completer = createFrodoCompleter(rootBindings, docsByMethod, (hint) => {
    printHintAbovePrompt(rs, hint);
});
rs = repl.start({ prompt: '> ', completer, useGlobal: true });
rs.context.frodo = frodo;
rs.context.frodoLib = frodo;
