export type MethodHelpDoc = {
  typeName: string;
  methodName: string;
  signature: string;
  description: string;
  params: Array<{ name: string; type: string; description: string }>;
  returns: string;
};

export function getHelpMetadataFromInstance(
  frodoInstance: object
): MethodHelpDoc[] {
  const candidate = (frodoInstance as Record<string, unknown>)['utils'];
  if (!candidate || typeof candidate !== 'object') return [];
  const getHelpMetadata = (candidate as Record<string, unknown>)[
    'getHelpMetadata'
  ];
  if (typeof getHelpMetadata !== 'function') return [];
  const result = getHelpMetadata();
  return Array.isArray(result) ? (result as MethodHelpDoc[]) : [];
}

export function getValueAtPath(root: unknown, pathSegments: string[]): unknown {
  let current: unknown = root;
  for (const segment of pathSegments) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function findBestDoc(
  methodName: string,
  moduleSegments: string[],
  docsByMethod: Map<string, MethodHelpDoc[]>
): MethodHelpDoc | undefined {
  const docs = docsByMethod.get(methodName) ?? [];
  if (docs.length === 0) return undefined;
  const normalizedModuleSegments = moduleSegments.map(normalizeName);
  const exactMatch = docs.find((d) =>
    normalizedModuleSegments.includes(normalizeName(d.typeName))
  );
  return exactMatch ?? docs[0];
}

export function buildMethodScaffold(
  moduleSegments: string[],
  methodName: string,
  docsByMethod: Map<string, MethodHelpDoc[]>
): string {
  const doc = findBestDoc(methodName, moduleSegments, docsByMethod);
  if (!doc) return '()';
  const paramNames = (doc.params ?? [])
    .map((p) => p.name.trim())
    .filter((name) => name.length > 0);
  if (paramNames.length === 0) return '()';
  return `(${paramNames.join(', ')})`;
}

export function abbrevType(type: string): string {
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

export function buildHintLine(fullPath: string, doc: MethodHelpDoc): string {
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

export function createFrodoCompleter(
  rootBindings: Record<string, object>,
  docsByMethod: Map<string, MethodHelpDoc[]>,
  onMethodHint?: (hint: string) => void
): (line: string) => [string[], string] {
  return (line: string): [string[], string] => {
    const tokenMatch = line.match(
      /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.?$)/
    );
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
    const parentSegments = hasTrailingDot
      ? segments.slice(1, -1)
      : segments.slice(1, -1);
    const partial = hasTrailingDot ? '' : segments[segments.length - 1];

    const targetObj = getValueAtPath(root, parentSegments);
    if (!targetObj || typeof targetObj !== 'object') return [[], token];

    const completions = Object.keys(targetObj)
      .filter((k) => k.startsWith(partial))
      .sort((a, b) => a.localeCompare(b))
      .map((k) => {
        const value = (targetObj as Record<string, unknown>)[k];
        const prefix = `${rootName}.${[...parentSegments, k].join('.')}`;
        if (typeof value !== 'function') return prefix;
        return `${prefix}${buildMethodScaffold(parentSegments, k, docsByMethod)}`;
      });

    // Schedule a typed-signature hint when a single method completion is produced.
    if (onMethodHint && completions.length === 1) {
      const completion = completions[0];
      const parenIdx = completion.indexOf('(');
      if (parenIdx !== -1) {
        const dotIdx = completion.lastIndexOf('.', parenIdx);
        const resolvedMethodName = completion.slice(dotIdx + 1, parenIdx);
        const doc = findBestDoc(
          resolvedMethodName,
          parentSegments,
          docsByMethod
        );
        if (doc) {
          const fullPath = completion.slice(0, parenIdx);
          setImmediate(() => onMethodHint(buildHintLine(fullPath, doc)));
        }
      }
    }

    return [completions, token];
  };
}

export function buildDocsByMethod(
  frodoInstance: object
): Map<string, MethodHelpDoc[]> {
  const helpDocs = getHelpMetadataFromInstance(frodoInstance);
  const docsByMethod = new Map<string, MethodHelpDoc[]>();
  for (const doc of helpDocs) {
    if (!docsByMethod.has(doc.methodName)) docsByMethod.set(doc.methodName, []);
    docsByMethod.get(doc.methodName)!.push(doc);
  }
  return docsByMethod;
}

/**
 * Registers a keypress listener on process.stdin that prints a typed-signature
 * hint line above the prompt whenever the user manually types '(' after a known
 * frodo method path (e.g. `frodo.script.importScripts(`).
 */
export function registerOpenParenHint(
  replServer: {
    line: string;
    displayPrompt: (preserveCursor?: boolean) => void;
  },
  rootBindings: Record<string, object>,
  docsByMethod: Map<string, MethodHelpDoc[]>,
  onHint: (hint: string) => void
): void {
  process.stdin.on('keypress', (_char: unknown, key: { sequence?: string }) => {
    if (key?.sequence !== '(') return;
    // replServer.line holds the buffer *before* '(' is processed by readline.
    const currentLine =
      ((replServer as Record<string, unknown>)['line'] as string) ?? '';
    const match = currentLine.match(
      /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)$/
    );
    if (!match) return;
    const parts = match[1].split('.');
    if (!rootBindings[parts[0]]) return;
    const methodName = parts[parts.length - 1];
    const parentSegments = parts.slice(1, -1);
    const doc = findBestDoc(methodName, parentSegments, docsByMethod);
    if (doc) onHint(buildHintLine(match[1], doc));
  });
}
