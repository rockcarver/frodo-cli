const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export type MethodHelpDoc = {
  typeName: string;
  methodName: string;
  signature: string;
  description: string;
  params: Array<{
    name: string;
    type: string;
    description: string;
    required?: boolean;
  }>;
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
    // A numeric segment indexes an array (c.result.0 names the first
    // element), so REST payloads complete the same way the console's own
    // completion offers them.
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
      continue;
    }
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Names a fresh REPL context carries that are machinery, not the user's:
 * offering them as completions would drown the useful candidates. The
 * globals a context shares with any script (fetch, crypto, ...) are still
 * offered: they are callable, so completing them is useful.
 */
const RESERVED_CONTEXT = new Set([
  'global',
  'module',
  'exports',
  '__filename',
  '__dirname',
  'require',
  'sessionStorage',
]);

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
    .map((p) => {
      const name = p.name.trim();
      if (!name) return '';
      return p.required === false ? `${name}?` : name;
    })
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
      const optionalMarker = p.required === false ? '?' : '';
      return name && type
        ? `${name}${optionalMarker}: ${type}`
        : `${name}${optionalMarker}`;
    })
    .filter((s) => s.length > 0)
    .join(', ');
  return `\u25b8 ${CYAN}${fullPath}${RESET}(${DIM}${params}${RESET})`;
}

export function createFrodoCompleter(
  rootBindings: Record<string, object>,
  docsByMethod: Map<string, MethodHelpDoc[]>,
  onMethodHint?: (hint: string) => void,
  /**
   * The live REPL context, read at completion time: everything the user has
   * defined (vars, functions, imports) completes too. Static rootBindings
   * stay first so their doc scaffolding wins; the context fills the rest.
   */
  liveContext?: () => Record<string, unknown> | undefined
): (line: string) => [string[], string] {
  // One lookup for both root-name and dotted-path completion: static roots
  // win, the live context fills in what they lack (user variables).
  const resolveRoot = (name: string): object | undefined => {
    const staticRoot = rootBindings[name];
    if (staticRoot !== undefined) return staticRoot;
    try {
      const live = liveContext?.();
      return live ? (live[name] as object | undefined) : undefined;
    } catch {
      return undefined;
    }
  };

  return (line: string): [string[], string] => {
    const invocationMatch = line.match(
      /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\(\s*$/
    );
    if (invocationMatch) {
      const fullPath = invocationMatch[1];
      const parts = fullPath.split('.');
      const rootName = parts[0];
      const root = resolveRoot(rootName);
      if (!root) return [[], line];

      const methodName = parts[parts.length - 1];
      const parentSegments = parts.slice(1, -1);
      const completion = `${fullPath}${buildMethodScaffold(
        parentSegments,
        methodName,
        docsByMethod
      )}`;

      if (onMethodHint) {
        const doc = findBestDoc(methodName, parentSegments, docsByMethod);
        if (doc) {
          setImmediate(() => onMethodHint(buildHintLine(fullPath, doc)));
        }
      }
      return [[completion], `${fullPath}(`];
    }

    const tokenMatch = line.match(
      // Numeric segments index arrays (c.result.0), so they participate
      // in dotted paths like any property name.
      /([A-Za-z_$][\w$]*(?:\.(?:[A-Za-z_$][\w$]*|\d+))*\.?)$/
    );
    const token = tokenMatch?.[1] ?? '';
    if (!token) return [[], line];

    const rootCandidates = Object.keys(rootBindings).filter((rootName) =>
      rootName.startsWith(token)
    );
    // User-defined names join the static roots at top level.
    let liveNames: string[] = [];
    try {
      const live = liveContext?.();
      if (live) {
        liveNames = Object.keys(live).filter(
          (n) =>
            !rootBindings[n] &&
            n.startsWith(token) &&
            !RESERVED_CONTEXT.has(n) &&
            Object.getOwnPropertyDescriptor(live, n)
        );
      }
    } catch {
      // A poisoned context must not break completion.
    }
    if (!token.includes('.')) {
      const rootCompletions = Array.from(
        new Set([...rootCandidates, ...liveNames])
      ).sort((a, b) => a.localeCompare(b));
      return [rootCompletions, token];
    }

    const segments = token.split('.');
    const rootName = segments[0];
    const root = resolveRoot(rootName);
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
    const char = typeof _char === 'string' ? _char : '';
    const sequence = key?.sequence ?? '';
    if (sequence !== '(' && char !== '(') return;
    // replServer.line holds the buffer *before* '(' is processed by readline.
    const currentLine =
      ((replServer as Record<string, unknown>)['line'] as string) ?? '';
    const match = currentLine.match(
      /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\s*$/
    );
    if (!match) return;
    const parts = match[1].split('.');
    if (!rootBindings[parts[0]]) return;
    const methodName = parts[parts.length - 1];
    const parentSegments = parts.slice(1, -1);
    const doc = findBestDoc(methodName, parentSegments, docsByMethod);
    if (doc) {
      setImmediate(() => onHint(buildHintLine(match[1], doc)));
    }
  });
}
