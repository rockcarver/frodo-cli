import util from 'node:util';
import {
  buildRoot,
  collapsedPreview,
  collapseNode,
  expandNode,
  ExplorerNode,
} from './ShellExploreOps';

/**
 * How the web console sends a value to the browser.
 *
 * The browser never receives the value itself, only a description of one
 * node at a time. A container is described by a collapsed one-line summary
 * and an id; when the user opens it, the browser asks for its children by
 * id. That keeps a huge or circular result cheap to send, and it is the
 * same node model and the same summaries the terminal tree uses.
 */

export type RemoteKind =
  | 'string'
  | 'number'
  | 'bigint'
  | 'boolean'
  | 'null'
  | 'undefined'
  | 'symbol'
  | 'function'
  | 'date'
  | 'regexp'
  | 'error'
  | 'array'
  | 'map'
  | 'set'
  | 'object'
  | 'promise'
  | 'binary'
  | 'other';

export type RemoteNode = {
  id: number;
  /** Property name or array index; empty for a result's root. */
  key: string;
  kind: RemoteKind;
  /** One line of text; for containers a collapsed summary. */
  preview: string;
  expandable: boolean;
  /** Number of direct children, when expandable. */
  count?: number;
  /** Full text where the preview is cut or longer (error stack, long string). */
  text?: string;
  /** The text in `text` was itself cut at TEXT_LIMIT. */
  textTruncated?: boolean;
  circular?: boolean;
};

export type RemoteChildren = {
  total: number;
  offset: number;
  items: RemoteNode[];
};

/** Longest string shown inline before the rest moves to `text`. */
export const PREVIEW_LIMIT = 300;
/** Longest `text` ever sent. */
export const TEXT_LIMIT = 200_000;
/** Largest JSON document `json()` returns. */
export const JSON_LIMIT = 5_000_000;

function tag(value: unknown): string {
  return Object.prototype.toString.call(value).slice(8, -1);
}

function cut(text: string, limit: number): { text: string; cut: boolean } {
  return text.length > limit
    ? { text: text.slice(0, limit), cut: true }
    : { text, cut: false };
}

function containerKind(value: object): RemoteKind {
  if (Array.isArray(value)) return 'array';
  if (util.types.isMap(value)) return 'map';
  if (util.types.isSet(value)) return 'set';
  return 'object';
}

/** Describe one tree node. Registers nothing; the caller owns ids. */
export function describeNode(node: ExplorerNode, id: number): RemoteNode {
  const base = { id, key: node.key };
  if (node.circular) {
    return {
      ...base,
      kind: 'object',
      preview: '[Circular]',
      expandable: false,
      circular: true,
    };
  }
  if (node.error !== undefined) {
    return {
      ...base,
      kind: 'error',
      preview: `<throws: ${node.error}>`,
      expandable: false,
    };
  }
  const value = node.value;
  switch (typeof value) {
    case 'string': {
      const preview = cut(value, PREVIEW_LIMIT);
      const full = cut(value, TEXT_LIMIT);
      return {
        ...base,
        kind: 'string',
        preview: JSON.stringify(preview.text) + (preview.cut ? '…' : ''),
        expandable: false,
        ...(preview.cut ? { text: full.text, textTruncated: full.cut } : {}),
      };
    }
    case 'number':
    case 'boolean':
      return {
        ...base,
        kind: typeof value as RemoteKind,
        preview: String(value),
        expandable: false,
      };
    case 'bigint':
      return {
        ...base,
        kind: 'bigint',
        preview: `${value}n`,
        expandable: false,
      };
    case 'undefined':
      return {
        ...base,
        kind: 'undefined',
        preview: 'undefined',
        expandable: false,
      };
    case 'symbol':
      return {
        ...base,
        kind: 'symbol',
        preview: value.toString(),
        expandable: false,
      };
    case 'function':
      return {
        ...base,
        kind: 'function',
        preview: util.inspect(value, { depth: 0 }),
        expandable: false,
      };
    default:
      break;
  }
  if (value === null) {
    return { ...base, kind: 'null', preview: 'null', expandable: false };
  }
  // From here on `value` is an object. Realm-independent checks throughout:
  // user code runs in the REPL's vm context, whose classes are not ours.
  const object = value as object;
  if (util.types.isDate(object)) {
    const time = (object as Date).getTime();
    return {
      ...base,
      kind: 'date',
      preview: Number.isNaN(time)
        ? 'Invalid Date'
        : (object as Date).toISOString(),
      expandable: false,
    };
  }
  if (util.types.isRegExp(object)) {
    return {
      ...base,
      kind: 'regexp',
      preview: String(object),
      expandable: false,
    };
  }
  if (tag(object) === 'Error') {
    const error = object as Error;
    const stack = cut(String(error.stack ?? error.message), TEXT_LIMIT);
    return {
      ...base,
      kind: 'error',
      preview: `${error.name}: ${error.message}`,
      expandable: false,
      text: stack.text,
      ...(stack.cut ? { textTruncated: true } : {}),
    };
  }
  if (util.types.isPromise(object)) {
    return {
      ...base,
      kind: 'promise',
      preview: 'Promise {…}',
      expandable: false,
    };
  }
  if (ArrayBuffer.isView(object) || util.types.isAnyArrayBuffer(object)) {
    const length =
      'byteLength' in object
        ? (object as { byteLength: number }).byteLength
        : 0;
    return {
      ...base,
      kind: 'binary',
      preview: `${tag(object)}(${length})`,
      expandable: false,
    };
  }
  const kind = containerKind(object);
  const { text } = collapsedPreview(object, {
    maxKeys: 8,
    maxItems: 8,
    colors: false,
  });
  return {
    ...base,
    kind,
    preview: text,
    expandable: node.expandable,
    ...(node.expandable ? { count: childCount(object) } : {}),
  };
}

function childCount(object: object): number {
  if (Array.isArray(object)) return object.length;
  if (util.types.isMap(object) || util.types.isSet(object)) {
    return (object as Map<unknown, unknown>).size;
  }
  return Object.keys(object).length;
}

/**
 * A JSON rendering of a value for copy and download. Handles what plain
 * JSON.stringify refuses: cycles (replaced by "[Circular]"), BigInt (as a
 * string), Map and Set (as entries and arrays).
 */
export function toJson(value: unknown): { text: string; truncated: boolean } {
  const ancestors: object[] = [];
  const text =
    JSON.stringify(
      value,
      function replacer(this: unknown, _key: string, item: unknown) {
        if (typeof item === 'bigint') return `${item}n`;
        if (typeof item === 'function' || typeof item === 'symbol') {
          return undefined;
        }
        if (item === null || typeof item !== 'object') return item;
        // `this` is the object holding `item`; drop ancestors we have left.
        while (
          ancestors.length > 0 &&
          ancestors[ancestors.length - 1] !== this
        ) {
          ancestors.pop();
        }
        if (ancestors.includes(item)) return '[Circular]';
        ancestors.push(item);
        if (util.types.isMap(item)) {
          return Object.fromEntries(
            [...(item as Map<unknown, unknown>).entries()].map(([k, v]) => [
              String(k),
              v,
            ])
          );
        }
        if (util.types.isSet(item)) return [...(item as Set<unknown>)];
        return item;
      },
      2
    ) ?? 'undefined';
  return text.length > JSON_LIMIT
    ? { text: text.slice(0, JSON_LIMIT), truncated: true }
    : { text, truncated: false };
}

export type RemoteRegistry = {
  /** Register a result and describe its root node. */
  describeResult(value: unknown): RemoteNode;
  /** The children of a registered container, one page at a time. */
  children(
    id: number,
    offset?: number,
    limit?: number
  ): RemoteChildren | undefined;
  /** The value of a registered node as JSON text. */
  json(id: number): { text: string; truncated: boolean } | undefined;
  /** Number of nodes currently held (for tests and diagnostics). */
  size(): number;
};

/**
 * Holds the nodes the browser may still ask about. A registered node keeps
 * its value alive, so the registry forgets the oldest results beyond
 * `maxResults`; asking about a forgotten id answers `undefined`.
 */
export function createRemoteRegistry(maxResults = 100): RemoteRegistry {
  let nextId = 1;
  const nodes = new Map<number, ExplorerNode>();
  const ids = new WeakMap<ExplorerNode, number>();
  // Every id created under each result, so a result can be forgotten whole.
  const owners = new Map<number, number[]>();
  const results: number[][] = [];

  function register(node: ExplorerNode, owned: number[]): number {
    const known = ids.get(node);
    if (known !== undefined) return known;
    const id = nextId++;
    nodes.set(id, node);
    ids.set(node, id);
    owners.set(id, owned);
    owned.push(id);
    return id;
  }

  return {
    describeResult(value) {
      const owned: number[] = [];
      const root = buildRoot(value);
      const id = register(root, owned);
      results.push(owned);
      while (results.length > maxResults) {
        for (const forgotten of results.shift() ?? []) {
          nodes.delete(forgotten);
          owners.delete(forgotten);
        }
      }
      return describeNode(root, id);
    },

    children(id, offset = 0, limit = 200) {
      const node = nodes.get(id);
      const owned = owners.get(id);
      if (!node || !owned || !node.expandable) return undefined;
      // Opening again re-reads the value, so changes made since show up.
      if (node.expanded) collapseNode(node);
      expandNode(node);
      const all = node.children ?? [];
      const start = Math.max(0, offset);
      const items = all
        .slice(start, start + Math.max(1, limit))
        .map((child) => describeNode(child, register(child, owned)));
      return { total: all.length, offset: start, items };
    },

    json(id) {
      const node = nodes.get(id);
      return node ? toJson(node.value) : undefined;
    },

    size: () => nodes.size,
  };
}
