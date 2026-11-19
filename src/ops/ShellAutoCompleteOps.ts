import { AM_DEVICE_TYPES } from './ShellAmOps';
import {
  actionSuggestions,
  IdmCatalog,
  paramKeySuggestions,
  queryParamSuggestions,
  resourceSuggestions,
} from './ShellIdmCatalogOps';

const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/**
 * What the IDM string scanner hands the completion builder: which function
 * and argument position the cursor sits in, and the raw string content so
 * far. Only calls whose first string argument is an IDM resource path get
 * completion: the `openidm.*` CRUD/actions family. Other quoted strings
 * (script names, filter literals in `frodo.*` calls) stay unsuggested,
 * because nothing finite is known about them.
 */
export type IdmStringContext = {
  /** The dotted call path the cursor is inside, e.g. `openidm.read`. */
  readonly fullPath: string;
  /** The function's short name: read, query, action, ... */
  readonly fnName: string;
  /** Zero-based argument position of the cursor's argument. */
  readonly argIndex: number;
  /** The raw content of the cursor's string so far (no quotes). */
  readonly content: string;
  /** The quote character the string is opened with. */
  readonly quoteChar: string;
  /** The call's first string argument (for openidm.action's filter). */
  readonly firstArg?: string;
};

/**
 * An object-literal context inside an `openidm.*` call: the cursor sits
 * in an argument that is (or should be) an object, most commonly the
 * `params` object whose keys are the CREST query parameters.
 */
export type IdmObjectContext = {
  /** The dotted call path the cursor is inside, e.g. `openidm.query`. */
  readonly fullPath: string;
  /** The function's short name. */
  readonly fnName: string;
  /** Zero-based argument position holding the object. */
  readonly argIndex: number;
  /** The object's keys typed so far (before the cursor's partial). */
  readonly typedKeys: string[];
  /** The partial key text at the cursor. */
  readonly partial: string;
  /** The call's first string argument (the resource, for family extras). */
  readonly firstArg?: string;
};

/**
 * Find an open object literal under the cursor that an `openidm.*` call
 * owns: the cursor inside `{...}` at a call-argument position, before the
 * closing brace. Collects the keys typed so far (top level of that object
 * only) and the partial key text at the cursor. Returns null when the
 * cursor is not in such an object, so string or name completion applies.
 */
export function parseIdmObjectContext(line: string): IdmObjectContext | null {
  let inSingle = false;
  let inDouble = false;
  let callPath = '';
  let parenDepth = 0;
  // Depth of { relative to the innermost tracked call's args.
  let braceDepth = 0;
  let argIndex = 0;
  let firstArg: string | undefined;
  let strStart = -1;

  // State for collecting keys at the object's top level.
  let objStart = -1;
  let objArgIndex = -1;
  let objCallPath = '';
  let objFirstArg: string | undefined;
  let keyStart = -1;
  let atValue = false; // Past the ':' of the current key (in a value).
  let nestedValue = 0; // (), [], {} nesting inside a value.
  const keys: string[] = [];

  const flushKey = (end: number) => {
    if (keyStart >= 0 && !atValue) {
      const key = line
        .slice(keyStart, end)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      if (key) keys.push(key);
    }
    keyStart = -1;
    atValue = false;
  };

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inSingle || inDouble) {
      if (ch === '\\' && i + 1 < line.length) {
        i++;
        continue;
      }
      if ((inSingle && ch === "'") || (inDouble && ch === '"')) {
        if (callPath && argIndex === 0 && objStart === -1) {
          firstArg = line.slice(strStart + 1, i);
        }
        // A closed string inside the object was the value (or the key).
        inSingle = false;
        inDouble = false;
        strStart = -1;
        continue;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      inSingle = ch === "'";
      inDouble = ch === '"';
      strStart = i;
      if (objStart >= 0 && !atValue && keyStart === -1 && nestedValue === 0) {
        // A quoted key starts here.
        keyStart = i + 1;
      }
      continue;
    }
    if (ch === '(') {
      if (objStart === -1) {
        let start = i;
        while (start > 0 && /[\w$.]/.test(line[start - 1])) start--;
        const path = line.slice(start, i);
        if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(path)) {
          callPath = path;
          argIndex = 0;
        } else {
          callPath = '';
        }
      }
      if (objStart >= 0) nestedValue++;
      else parenDepth++;
      continue;
    }
    if (ch === ')') {
      if (objStart >= 0 && nestedValue > 0) {
        nestedValue--;
      } else if (parenDepth > 0) {
        parenDepth--;
        if (parenDepth === 0) {
          callPath = '';
          argIndex = 0;
          firstArg = undefined;
        }
      }
      continue;
    }

    if (objStart >= 0) {
      // Inside the tracked object literal.
      if (ch === '{' || ch === '[') {
        nestedValue++;
        continue;
      }
      if (ch === '}' || ch === ']') {
        if (nestedValue > 0) {
          nestedValue--;
        } else {
          // The object closed; stop tracking it.
          flushKey(i);
          objStart = -1;
          objArgIndex = -1;
          objCallPath = '';
          objFirstArg = undefined;
        }
        continue;
      }
      if (nestedValue > 0) continue;
      if (ch === ',') {
        flushKey(i);
        continue;
      }
      if (ch === ':') {
        // The key ended; its value follows.
        if (keyStart >= 0) {
          const key = line
            .slice(keyStart, i)
            .trim()
            .replace(/^['"]|['"]$/g, '');
          if (key && !keys.includes(key)) keys.push(key);
          keyStart = -1;
        }
        atValue = true;
        continue;
      }
      if (!atValue && /[\w$]/.test(ch)) {
        if (keyStart === -1) keyStart = i;
      } else if (!atValue && ch === ' ') {
        // Whitespace may separate the key from ':'; keep collecting.
      } else if (!atValue) {
        // Not a key character; reset.
        keyStart = -1;
      }
      continue;
    }

    if (ch === '{') {
      // An object literal opening at this call's argument position (or
      // nested deeper: only track call-arg-position objects).
      if (callPath && /^(openidm|am)\./.test(callPath) && parenDepth > 0) {
        objStart = i;
        objArgIndex = argIndex;
        objCallPath = callPath;
        objFirstArg = firstArg;
        keys.length = 0;
        keyStart = -1;
        atValue = false;
        nestedValue = 0;
      }
      continue;
    }
    if (ch === '[') {
      // An array at the arg position: not an object, not tracked.
      braceDepth++;
      continue;
    }
    if (ch === ']') {
      if (braceDepth > 0) braceDepth--;
      continue;
    }
    if (ch === ',' && callPath && braceDepth === 0) {
      // Outside the object: this comma advances the call's argument
      // position, so an object opening after it is captured at the
      // right index.
      argIndex++;
    }
  }

  if (objStart === -1 || !objCallPath) return null;
  // The partial key: from the last unflushed keyStart to the end.
  let partial = '';
  if (keyStart >= 0 && !atValue) {
    partial = line.slice(keyStart).trim().replace(/^['"]/, '');
    // Drop a trailing quote fragment (the key is still being quoted).
    partial = partial.replace(/['"]$/, '');
  }
  const fnName = objCallPath.split('.').pop()!;
  return {
    fullPath: objCallPath,
    fnName,
    argIndex: objArgIndex,
    typedKeys: keys,
    partial,
    firstArg: objFirstArg,
  };
}

/**
 * Find a quoted string under the cursor that an `openidm.*` call owns.
 *
 * Quote-aware and argument-aware: single-quoted or double-quoted, escapes
 * respected, and commas inside strings or nested braces do not count as
 * argument separators (a filter literal `userName eq "a,b"` is one
 * argument). Returns undefined when the cursor is not inside such a
 * string, so ordinary name completion applies.
 */
export function parseIdmStringContext(line: string): IdmStringContext | null {
  // Walk the line once, tracking quote state and paren/brace nesting.
  let inSingle = false;
  let inDouble = false;
  // The open paren of the innermost call whose string we are inside, with
  // the call path that precedes it and the argument index so far.
  let callPath = '';
  let parenDepth = 0;
  let braceDepth = 0;
  let argIndex = 0;
  let strStart = -1;
  let quoteChar = '';
  let firstArg: string | undefined;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inSingle || inDouble) {
      if (ch === '\\' && i + 1 < line.length) {
        i++; // Skip the escaped character.
        continue;
      }
      if ((inSingle && ch === "'") || (inDouble && ch === '"')) {
        // String closed: remember arg 0's full content for action filtering.
        if (callPath && argIndex === 0) {
          firstArg = line.slice(strStart + 1, i);
        }
        inSingle = false;
        inDouble = false;
        strStart = -1;
        continue;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      inSingle = ch === "'";
      inDouble = ch === '"';
      quoteChar = ch;
      strStart = i;
      continue;
    }
    if (ch === '(') {
      // The call path: identifier characters (and dots) immediately before.
      let start = i;
      while (start > 0 && /[\w$.]/.test(line[start - 1])) start--;
      const path = line.slice(start, i);
      if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(path)) {
        callPath = path;
        argIndex = 0;
      } else {
        callPath = '';
      }
      parenDepth++;
      continue;
    }
    if (ch === ')') {
      parenDepth--;
      if (parenDepth <= 0) {
        callPath = '';
        parenDepth = 0;
        argIndex = 0;
      }
      continue;
    }
    if (ch === '{' || ch === '[') braceDepth++;
    if (ch === '}' || ch === ']') braceDepth--;
    // A comma at brace depth 0 inside the tracked call starts a new arg.
    if (ch === ',' && callPath && braceDepth === 0) argIndex++;
  }

  if (!(inSingle || inDouble) || !callPath || parenDepth <= 0) return null;
  // The shell's own functions own their strings: openidm.* resource
  // paths and actions, am.devices' device-type strings. Other calls
  // (frodo.*) get nothing.
  if (!/^(openidm|am)(\.[A-Za-z_$][\w$]*)+$/.test(callPath)) return null;
  const fnName = callPath.split('.').pop()!;
  // The action name (arg 1 of openidm.action) completes from the action
  // map; the resource path (arg 0) from the catalog; the device type
  // (arg 1 of am.devices.*) from the fixed set. Other strings of other
  // functions get nothing.
  const content = line.slice(strStart + 1);
  return { fullPath: callPath, fnName, argIndex, content, quoteChar, firstArg };
}

/**
 * Build the completion result for an IDM string context. The contract is
 * readline's: the token is the part of the line the caller may replace
 * (the string content typed so far), and every candidate is the FULL
 * replacement text (the whole resource path), never the part past the
 * typed content. Readline's Tab inserts commonPrefix(candidates) at
 * line.length - token.length; the web page's replaceBefore(token.length,
 * choice) splices the same way. A delta candidate (aged/ for man) makes
 * both produce openidm.read('aged/' (the delta replaces the typed text,
 * destroying it). Full paths keep the splice inside the quotes: the
 * candidate begins with the typed content, so the splice rewrites the
 * content in place.
 */
function idmStringCompletions(
  ctx: IdmStringContext,
  catalog: IdmCatalog,
  docsByMethod: Map<string, MethodHelpDoc[]>,
  onMethodHint?: (hint: string) => void
): [string[], string] {
  const { content, argIndex } = ctx;
  const token = content; // The replaceable suffix: the string content.

  // The contextual argument hint for whatever position the string is in;
  // emitted alongside the candidates (and alone when there are none,
  // e.g. a _fields array: the hint still says what the argument wants).
  let entries: { path: string; description?: string }[] = [];

  if (ctx.fullPath.startsWith('am.devices.') && argIndex === 1) {
    // The device type: the fixed set AM serves under /users/<id>/devices.
    const typeHint: Record<string, string> = {
      binding: 'device binding (MFA)',
      oath: 'OATH devices (HOTP/TOTP)',
      push: 'push notification devices',
      webauthn: 'WebAuthn/FIDO2 devices',
      profile: 'profile devices',
      trusted: 'trusted devices',
    };
    entries = AM_DEVICE_TYPES.filter((t) => t.startsWith(content)).map((t) => ({
      path: t,
      description: typeHint[t],
    }));
  } else if (ctx.fnName === 'action' && argIndex === 1) {
    // The action name: filtered by the resource (arg 0), captured by the
    // scanner while it walked the line.
    const firstArg = extractFirstStringArg(ctx, content);
    entries = firstArg ? actionSuggestions(firstArg, content) : [];
  } else if (argIndex === 0 && ctx.fullPath.startsWith('openidm.')) {
    if (content.includes('?')) {
      // Query-parameter context: CREST params are name-only suggestions
      // whose full text extends the typed partial, so the same
      // full-replacement rule applies: candidate = partial + param part.
      const partial = /[^?&=]*$/.exec(content)[0];
      const params = queryParamSuggestions(content);
      return [
        params.map(
          (p) => `${content.slice(0, content.length - partial.length)}${p}`
        ),
        token,
      ];
    }
    entries = resourceSuggestions(content, catalog);
  } else if (argIndex === 0 && ctx.fullPath.startsWith('am.')) {
    // AM strings have no resource-path catalog (the wrappers compose the
    // realm base); the contextual arg hint covers these positions.
    return [[], token];
  } else {
    return [[], token];
  }

  if (entries.length === 0) {
    // Nothing to suggest at this string (a _fields array, an action
    // content...): the contextual arg hint still says what it wants.
    if (onMethodHint) {
      const doc = findBestDoc(
        ctx.fnName,
        [ctx.fullPath.split('.')[0]],
        docsByMethod
      );
      if (doc)
        setImmediate(() =>
          onMethodHint(argHintLine(ctx.fullPath, doc, ctx.argIndex))
        );
    }
    return [[], token];
  }

  // The candidates are the full resource paths (see the contract note).
  const completions = entries.map((e) => e.path);
  if (onMethodHint && entries.length > 0) {
    const shown = entries.slice(0, 3);
    const hint = shown
      .map((e) => `${e.path}${e.description ? ` — ${e.description}` : ''}`)
      .join('   ');
    setImmediate(() =>
      onMethodHint(
        `▸ ${DIM}${hint}${entries.length > 3 ? `   (+${entries.length - 3} more)` : ''}${RESET}`
      )
    );
  }
  return [completions, token];
}

/**
 * Build the completion result for an object context (the params object of
 * an openidm call): the keys are full replacement text per the readline
 * contract, with the replaceable token being the partial key text typed
 * so far. The key keeps its unquoted form; the user adds the value.
 */
function idmObjectCompletions(
  ctx: IdmObjectContext,
  _catalog: IdmCatalog,
  onMethodHint?: (hint: string) => void
): [string[], string] {
  void _catalog; // Reserved: per-family key sets when the catalog grows them.
  const keys = paramKeySuggestions(ctx.firstArg, ctx.typedKeys, ctx.partial);
  if (keys.length === 0) return [[], ctx.partial];
  // Full replacement: partial + the rest of the key.
  const completions = keys.map(
    (k) => `${ctx.partial}${k.slice(ctx.partial.length)}`
  );
  if (onMethodHint) {
    const which = ctx.argIndex === 1 ? 'params' : `arg ${ctx.argIndex + 1}`;
    setImmediate(() =>
      onMethodHint(
        `▸ ${DIM}${ctx.fullPath} ${which} keys — CREST query parameters${RESET}`
      )
    );
  }
  return [completions, ctx.partial];
}

/**
 * The first string argument of the call the cursor sits in (for
 * openidm.action's action suggestions to filter by the resource). Scans
 * the line from the call's open paren.
 */
function extractFirstStringArg(
  ctx: IdmStringContext,
  _content: string
): string | undefined {
  void _content;
  return ctx.firstArg;
}

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
 * One hop in a completion path, with the syntax the user chose for it:
 * dotted (c.result) or bracketed (c.result[0]). Bracket syntax is the
 * valid JavaScript for array indices; the dotted form only exists because
 * completion offered it.
 */
type PathSegment = { name: string; bracketed: boolean };

/**
 * Parse a completion token into hops. Accepts dotted paths (c.result.0),
 * bracketed ones (c.result[0]) and a mix (c.result[0].name). The token is
 * known to match the completer's grammar, so anything unparseable just
 * yields an empty path.
 */
function parsePath(token: string): PathSegment[] {
  const segments: PathSegment[] = [];
  let rest = token;
  // Leading root name.
  const rootMatch = rest.match(/^[A-Za-z_$][\w$]*/);
  if (!rootMatch) return [];
  segments.push({ name: rootMatch[0], bracketed: false });
  rest = rest.slice(rootMatch[0].length);
  while (rest.length > 0) {
    if (rest.startsWith('.')) {
      rest = rest.slice(1);
      const m = rest.match(/^[A-Za-z_$][\w$]*|\d+/);
      if (!m) break;
      segments.push({ name: m[0], bracketed: false });
      rest = rest.slice(m[0].length);
    } else if (rest.startsWith('[')) {
      rest = rest.slice(1);
      const m = rest.match(/^\d+/);
      if (!m) break;
      segments.push({ name: m[0], bracketed: true });
      rest = rest.slice(m[0].length);
      if (rest.startsWith(']')) rest = rest.slice(1);
    } else {
      break;
    }
  }
  return segments;
}

/** Render hops back to source text, preserving each hop's syntax. */
function renderPath(segments: PathSegment[]): string {
  let out = segments[0].name;
  for (let i = 1; i < segments.length; i++) {
    const s = segments[i];
    out += s.bracketed ? `[${s.name}]` : `.${s.name}`;
  }
  return out;
}

/** The object a path's hops resolve to, or undefined. */
function resolvePath(root: unknown, segments: PathSegment[]): unknown {
  let current: unknown = root;
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.bracketed && Array.isArray(current)) {
      current = current[Number(seg.name)];
      continue;
    }
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[seg.name];
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
  docsByMethod: Map<string, MethodHelpDoc[]>,
  parensOnly = false
): string {
  if (parensOnly) return '()';
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

/**
 * The contextual form of the hint line: one argument at a time, with its
 * description. `arg 2 of 5 · value: object — the replacement object`.
 * Falls back to the full signature when the doc carries no params.
 */
function argHintLine(
  fullPath: string,
  doc: MethodHelpDoc,
  argIndex: number
): string {
  const params = doc.params ?? [];
  if (params.length === 0) return buildHintLine(fullPath, doc);
  const p = params[Math.min(argIndex, params.length - 1)];
  const type = p?.type ? abbrevType(p.type) : '';
  const optional = p?.required === false ? ' (optional)' : '';
  const name = p?.name ?? `arg ${argIndex + 1}`;
  return (
    `▸ ${CYAN}${fullPath}${RESET} ${DIM}arg ${argIndex + 1} of ${params.length} · ` +
    `${name}${optional}${type ? `: ${type}` : ''}` +
    `${p?.description ? ` — ${p.description}` : ''}${RESET}`
  );
}

/**
 * An openidm call whose argument list the cursor sits in but which is
 * neither a quoted string nor an object literal (e.g. after a comma, or
 * past `null`): enough for the contextual argument hint.
 */
export type IdmArgPosition = {
  readonly fullPath: string;
  readonly fnName: string;
  readonly argIndex: number;
};

/**
 * Find the openidm call and argument index under the cursor, when the
 * cursor is inside the call's parens and not inside a string or object
 * (those have their own hint paths). Reuses the same walk as
 * parseIdmObjectContext's argument tracking.
 */
export function parseIdmArgContext(line: string): IdmArgPosition | null {
  const objectCtx = parseIdmObjectContext(line);
  if (objectCtx) return null; // Object contexts hint through their keys.
  const stringCtx = parseIdmStringContext(line);
  if (stringCtx) return null;
  let inSingle = false;
  let inDouble = false;
  let callPath = '';
  let parenDepth = 0;
  let braceDepth = 0;
  let argIndex = 0;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inSingle || inDouble) {
      if (ch === '\\' && i + 1 < line.length) {
        i++;
        continue;
      }
      if ((inSingle && ch === "'") || (inDouble && ch === '"')) {
        inSingle = false;
        inDouble = false;
        continue;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      inSingle = true;
      inDouble = ch === '"';
      continue;
    }
    if (ch === '(') {
      let start = i;
      while (start > 0 && /[\w$.]/.test(line[start - 1])) start--;
      const path = line.slice(start, i);
      if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(path)) {
        callPath = path;
        argIndex = 0;
      } else {
        callPath = '';
      }
      parenDepth++;
      continue;
    }
    if (ch === ')') {
      parenDepth--;
      if (parenDepth <= 0) {
        callPath = '';
        parenDepth = 0;
        argIndex = 0;
      }
      continue;
    }
    if (ch === '{' || ch === '[') braceDepth++;
    if (ch === '}' || ch === ']') braceDepth--;
    if (ch === ',' && callPath && braceDepth === 0) argIndex++;
  }
  if (!callPath || parenDepth <= 0) return null;
  if (!/^(openidm|am)(\.[A-Za-z_$][\w$]*)+$/.test(callPath)) return null;
  return { fullPath: callPath, fnName: callPath.split('.').pop()!, argIndex };
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
  liveContext?: () => Record<string, unknown> | undefined,
  /**
   * Terminal mode: complete a method to `name(`, never to a param
   * scaffold. Readline has no cursor placement, so a scaffold lands on
   * the line looking runnable, and Enter submits placeholder params (the
   * names, not values) to the call. A bare `(` is inert: Enter on it
   * gives the continuation prompt. The signature still shows, in the
   * hint line above the prompt. The web page completes to the full
   * scaffold by design (it places the cursor inside the parens).
   */
  terminalParensOnly?: boolean,
  /**
   * The IDM resource catalog, read at completion time: the live tenant
   * types, config instances and connectors that fill the quoted first
   * argument of the `openidm.*` functions. Undefined means the feature
   * is off.
   */
  idmCatalog?: () => IdmCatalog | undefined
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
    // IDM completion first: the cursor inside a quoted string (resource
    // path) or an object literal (params keys) that an `openidm.*` call
    // owns. These must win over name completion, whose dotted-path
    // branch would otherwise offer the string's characters as
    // identifiers.
    if (idmCatalog) {
      const catalog = idmCatalog();
      if (catalog) {
        const stringCtx = parseIdmStringContext(line);
        if (stringCtx) {
          return idmStringCompletions(
            stringCtx,
            catalog,
            docsByMethod,
            onMethodHint
          );
        }
        const objectCtx = parseIdmObjectContext(line);
        if (objectCtx) {
          return idmObjectCompletions(objectCtx, catalog, onMethodHint);
        }
      }
    }

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
        docsByMethod,
        terminalParensOnly
      )}`;

      if (onMethodHint) {
        const doc = findBestDoc(methodName, parentSegments, docsByMethod);
        if (doc) {
          // Contextual arg-0 hint for the openidm functions (whose
          // params are the point of the catalog work); other modules
          // keep the full-signature hint they always showed.
          const hint =
            rootName === 'openidm'
              ? argHintLine(fullPath, doc, 0)
              : buildHintLine(fullPath, doc);
          setImmediate(() => onMethodHint(hint));
        }
      }
      return [[completion], `${fullPath}(`];
    }

    // Contextual argument hint: the cursor inside an openidm call's
    // arguments, past the first (the string branch above already hints
    // arg 0 via its own suggestion hints). Point at the current arg's
    // name, type and description.
    const argCtx = parseIdmArgContext(line);
    if (argCtx && onMethodHint) {
      const doc = findBestDoc(
        argCtx.fnName,
        [argCtx.fullPath.split('.')[0]],
        docsByMethod
      );
      if (doc) {
        setImmediate(() =>
          onMethodHint(argHintLine(argCtx.fullPath, doc, argCtx.argIndex))
        );
      }
    }

    const tokenMatch = line.match(
      // A dotted path with optional bracketed array hops: c.result[0].na.
      // A trailing [ or . keeps completion open for what follows.
      /([A-Za-z_$][\w$]*(?:\.(?:[A-Za-z_$][\w$]*|\d+)|\[\d*\]|\[)*\.?)$/
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

    // Dotted or bracketed path: walk the hops the user chose, then offer
    // what the target holds in the same notation.
    const segments = parsePath(token);
    if (segments.length === 0) return [[], token];
    const rootName = segments[0].name;
    const root = resolveRoot(rootName);
    if (!root) return [[], token];

    const endsWithDot = token.endsWith('.');
    const endsWithOpenBracket = token.endsWith('[');
    // The hops that are fully typed: the object the next hop lands in.
    // A trailing . or [ leaves every hop complete; a partial last segment
    // (c.result[0].na) is a filter, not a hop to resolve. A complete
    // bracketed hop (c.result[0], closed) IS resolved: it stays in base.
    const lastHop = segments[segments.length - 1];
    const lastHopComplete =
      endsWithDot || endsWithOpenBracket || lastHop.bracketed;
    const base = lastHopComplete ? segments : segments.slice(0, -1);
    const targetObj = resolvePath(root, base);
    if (!targetObj || typeof targetObj !== 'object') return [[], token];

    const partial = lastHopComplete ? '' : lastHop.name;
    const completions: string[] = [];
    if (Array.isArray(targetObj) && (endsWithOpenBracket || endsWithDot)) {
      // The next hop is an index: offer 0], 1], ... in bracket notation
      // (indices sort numerically, nearest first, newest of long arrays).
      const count = targetObj.length;
      const shown = Math.min(count, 50);
      for (let i = 0; i < shown; i++)
        completions.push(`${base ? renderPath(base) : rootName}[${i}]`);
    } else {
      const keys = Object.keys(targetObj)
        .filter((k) => k.startsWith(partial))
        .sort((a, b) => a.localeCompare(b));
      for (const k of keys) {
        const value = (targetObj as Record<string, unknown>)[k];
        const segments2 = [...base, { name: k, bracketed: false }];
        const prefix = renderPath(segments2);
        if (typeof value !== 'function') {
          completions.push(prefix);
        } else {
          completions.push(
            `${prefix}${buildMethodScaffold(
              segments2.slice(1).map((s) => s.name),
              k,
              docsByMethod,
              terminalParensOnly
            )}`
          );
        }
      }
    }

    // Schedule a typed-signature hint when a single method completion is produced.
    if (onMethodHint && completions.length === 1) {
      const completion = completions[0];
      const parenIdx = completion.indexOf('(');
      if (parenIdx !== -1) {
        const dotIdx = completion.lastIndexOf('.', parenIdx);
        const resolvedMethodName = completion.slice(dotIdx + 1, parenIdx);
        const doc = findBestDoc(
          resolvedMethodName,
          segments.slice(1, -1).map((s) => s.name),
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
