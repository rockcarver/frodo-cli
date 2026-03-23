/* eslint-disable no-console */
type MethodHelpDoc = {
  typeName: string;
  methodName: string;
  signature: string;
  description: string;
  params: Array<{ name: string; type: string; description: string }>;
  returns: string;
};

export type MethodIndex = Map<string, MethodHelpDoc[]>;

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';

let cachedIndex: MethodIndex | null = null;

function getHelpMetadataFromInstance(frodoInstance: object): MethodHelpDoc[] {
  const candidate = (frodoInstance as Record<string, unknown>)['utils'];
  if (!candidate || typeof candidate !== 'object') return [];
  const getHelpMetadata = (candidate as Record<string, unknown>)[
    'getHelpMetadata'
  ];
  if (typeof getHelpMetadata !== 'function') return [];
  const result = getHelpMetadata();
  return Array.isArray(result) ? (result as MethodHelpDoc[]) : [];
}

function getMethodIndex(helpDocs: MethodHelpDoc[]): MethodIndex {
  if (cachedIndex) return cachedIndex;
  cachedIndex = new Map<string, MethodHelpDoc[]>();
  for (const doc of helpDocs) {
    if (!cachedIndex.has(doc.methodName)) cachedIndex.set(doc.methodName, []);
    cachedIndex.get(doc.methodName)!.push(doc);
  }
  return cachedIndex;
}

function formatMethodDoc(doc: MethodHelpDoc, verbose: boolean): string {
  const lines: string[] = [];
  lines.push(`${YELLOW}${doc.typeName}.${doc.methodName}${RESET}`);
  lines.push(`  ${CYAN}Signature :${RESET} ${doc.signature}`);
  if (doc.description) {
    lines.push(`  ${CYAN}Description:${RESET} ${doc.description}`);
  }
  if (verbose) {
    if (doc.params.length > 0) {
      lines.push(`  ${CYAN}Parameters :${RESET}`);
      for (const p of doc.params) {
        const typePart = p.type ? `{${p.type}} ` : '';
        const desc = p.description ? `: ${p.description}` : '';
        lines.push(`    ${typePart}${GREEN}${p.name}${RESET}${desc}`);
      }
    }
    if (doc.returns) {
      lines.push(`  ${CYAN}Returns    :${RESET} ${doc.returns}`);
    }
  }
  return lines.join('\n');
}

function findModulePath(
  root: object,
  target: object,
  prefix: string = 'frodo'
): string | null {
  for (const key of Object.keys(root)) {
    const val = (root as Record<string, unknown>)[key];
    if (val === target) return `${prefix}.${key}`;
    if (typeof val === 'object' && val !== null && val !== root) {
      const found = findModulePath(val as object, target, `${prefix}.${key}`);
      if (found) return found;
    }
  }
  return null;
}

export function createHelpContext(frodoInstance: object): {
  help: (target?: unknown) => void;
} {
  const alphaSort = (a: string, b: string): number => a.localeCompare(b);

  const metadata = getHelpMetadataFromInstance(frodoInstance);
  cachedIndex = null;

  function getMethodNames(obj: object): string[] {
    return Object.keys(obj).filter(
      (k) => typeof (obj as Record<string, unknown>)[k] === 'function'
    );
  }

  function getSubModuleNames(obj: object): string[] {
    return Object.keys(obj).filter((k) => {
      const value = (obj as Record<string, unknown>)[k];
      return typeof value === 'object' && value !== null;
    });
  }

  function getCountParts(
    methodCount: number,
    subModuleCount: number
  ): string[] {
    const parts: string[] = [];
    if (methodCount > 0)
      parts.push(`${methodCount} ${methodCount === 1 ? 'method' : 'methods'}`);
    if (subModuleCount > 0)
      parts.push(
        `${subModuleCount} ${subModuleCount === 1 ? 'module' : 'modules'}`
      );
    return parts;
  }

  function formatCountSuffix(
    methodCount: number,
    subModuleCount: number
  ): string {
    const parts = getCountParts(methodCount, subModuleCount);
    return parts.length > 0 ? ` (${parts.join(', ')})` : '';
  }

  function formatCountLabel(
    methodCount: number,
    subModuleCount: number
  ): string {
    const parts = getCountParts(methodCount, subModuleCount);
    return parts.length > 0 ? ` - ${parts.join(', ')}` : '';
  }

  function help(target?: unknown): void {
    const idx = getMethodIndex(metadata);

    if (target === undefined) {
      const allKeys = Object.keys(frodoInstance as object);
      const fns = allKeys.filter(
        (k) =>
          typeof (frodoInstance as Record<string, unknown>)[k] === 'function'
      );
      const mods = allKeys.filter(
        (k) =>
          typeof (frodoInstance as Record<string, unknown>)[k] !== 'function'
      );
      const sortedFns = [...fns].sort(alphaSort);
      const sortedMods = [...mods].sort(alphaSort);

      console.log(`${BOLD}${CYAN}Frodo Shell - Help System${RESET}`);
      console.log('');
      console.log(`  ${GREEN}help()${RESET}  ${DIM}this overview${RESET}`);
      console.log(
        `  ${GREEN}help(frodo.<module>)${RESET}  ${DIM}list all methods and modules in <module>${RESET}`
      );
      console.log(
        `  ${GREEN}help(frodo.<module>.<method>)${RESET}  ${DIM}full signature + docs for a method${RESET}`
      );
      console.log(
        `  ${GREEN}help("methodName")${RESET}  ${DIM}search for a method across all modules${RESET}`
      );
      console.log('');
      const modulesCountLabel =
        sortedMods.length > 0
          ? ` (${sortedMods.length} ${sortedMods.length === 1 ? 'module' : 'modules'})`
          : '';
      console.log(`${BOLD}Modules${modulesCountLabel}:${RESET}`);
      for (const k of sortedMods) {
        const val = (frodoInstance as Record<string, unknown>)[k];
        if (typeof val === 'object' && val !== null) {
          const methodCount = getMethodNames(val as object).length;
          const subModuleCount = getSubModuleNames(val as object).length;
          const countSuffix = formatCountSuffix(methodCount, subModuleCount);
          console.log(
            `  frodo.${GREEN}${k}${RESET}${countSuffix ? `  ${DIM}${countSuffix}${RESET}` : ''}`
          );
        }
      }
      if (sortedFns.length > 0) {
        console.log('');
        console.log(`${BOLD}Factory helpers:${RESET}`);
        for (const fn of sortedFns) {
          const docs = idx.get(fn);
          const sigHint = docs?.length
            ? `  ${DIM}${docs[0].signature}${RESET}`
            : '';
          console.log(`  frodo.${GREEN}${fn}${RESET}${sigHint}`);
        }
      }
      return;
    }

    if (typeof target === 'string') {
      const parts = (target as string).replace(/^frodo\./, '').split('.');
      const methodName = parts[parts.length - 1];

      const matches = idx.get(methodName);
      if (!matches || matches.length === 0) {
        console.log(
          `${YELLOW}No documentation found for "${methodName}".${RESET}`
        );
        return;
      }
      for (const doc of matches) {
        console.log('');
        console.log(formatMethodDoc(doc, true));
      }
      return;
    }

    if (typeof target === 'function') {
      const fnName = (target as { name?: string }).name;
      if (!fnName) {
        console.log(
          `${YELLOW}Cannot determine function name from this reference.${RESET}`
        );
        return;
      }
      const matches = idx.get(fnName);
      if (!matches || matches.length === 0) {
        console.log(`${YELLOW}No documentation found for "${fnName}".${RESET}`);
        return;
      }
      if (matches.length === 1) {
        console.log(formatMethodDoc(matches[0], true));
      } else {
        console.log(
          `${YELLOW}Found "${fnName}" in ${matches.length} module types:${RESET}`
        );
        for (const doc of matches) {
          console.log('');
          console.log(formatMethodDoc(doc, true));
        }
      }
      return;
    }

    if (typeof target === 'object' && target !== null) {
      const methods = getMethodNames(target as object);
      const subMods = getSubModuleNames(target as object);
      const sortedMethods = [...methods].sort(alphaSort);
      const sortedSubMods = [...subMods].sort(alphaSort);
      const methodCount = sortedMethods.length;
      const subModuleCount = sortedSubMods.length;

      const moduleType =
        findModulePath(frodoInstance, target as object)?.replace(
          /^frodo\./,
          ''
        ) || 'Module';

      console.log(
        `${BOLD}${CYAN}${moduleType}${formatCountLabel(methodCount, subModuleCount)}${RESET}`
      );
      console.log('');

      if (sortedMethods.length === 0) {
        if (sortedSubMods.length > 0) {
          console.log(
            `${BOLD}Modules (${subModuleCount} ${subModuleCount === 1 ? 'module' : 'modules'}):${RESET}`
          );
          for (const subModule of sortedSubMods) {
            const subModuleObj = (target as Record<string, unknown>)[subModule];
            const subMethods =
              typeof subModuleObj === 'object' && subModuleObj !== null
                ? getMethodNames(subModuleObj as object).length
                : 0;
            const nestedSubMods =
              typeof subModuleObj === 'object' && subModuleObj !== null
                ? getSubModuleNames(subModuleObj as object).length
                : 0;
            const countSuffix = formatCountSuffix(subMethods, nestedSubMods);
            console.log(
              `  ${GREEN}${subModule}${RESET}${countSuffix ? `  ${DIM}${countSuffix}${RESET}` : ''}`
            );
          }
          const subModPath =
            findModulePath(frodoInstance, target as object) ?? 'frodo.X';
          console.log(
            `Use ${GREEN}help(${subModPath}.<module>)${RESET} to explore further.`
          );
        } else {
          console.log(`${YELLOW}No methods found on this object.${RESET}`);
        }
        return;
      }

      const typeCounts = new Map<string, number>();
      for (const m of sortedMethods) {
        for (const d of idx.get(m) ?? []) {
          typeCounts.set(d.typeName, (typeCounts.get(d.typeName) ?? 0) + 1);
        }
      }
      let bestType = '';
      let bestCount = 0;
      for (const [t, c] of typeCounts) {
        if (c > bestCount) {
          bestCount = c;
          bestType = t;
        }
      }

      if (sortedSubMods.length > 0) {
        console.log(
          `${BOLD}Modules (${subModuleCount} ${subModuleCount === 1 ? 'module' : 'modules'}):${RESET}`
        );
        for (const subModule of sortedSubMods) {
          const subModuleObj = (target as Record<string, unknown>)[subModule];
          const subMethods =
            typeof subModuleObj === 'object' && subModuleObj !== null
              ? getMethodNames(subModuleObj as object).length
              : 0;
          const nestedSubMods =
            typeof subModuleObj === 'object' && subModuleObj !== null
              ? getSubModuleNames(subModuleObj as object).length
              : 0;
          const countSuffix = formatCountSuffix(subMethods, nestedSubMods);
          console.log(
            `  ${GREEN}${subModule}${RESET}${countSuffix ? `  ${DIM}${countSuffix}${RESET}` : ''}`
          );
        }
        console.log('');
      }
      console.log(
        `${BOLD}${CYAN}${bestType || moduleType}${formatCountLabel(methodCount, subModuleCount)}:${RESET}`
      );
      console.log('');
      for (const methodName of sortedMethods) {
        const docs = idx.get(methodName);
        const doc = docs?.find((d) => d.typeName === bestType) ?? docs?.[0];
        if (doc) {
          const sig =
            doc.signature.length > 100
              ? doc.signature.slice(0, 97) + '...'
              : doc.signature;
          console.log(`  ${YELLOW}${sig}${RESET}`);
          if (doc.description) {
            const desc =
              doc.description.length > 110
                ? doc.description.slice(0, 107) + '...'
                : doc.description;
            console.log(`    ${DIM}${desc}${RESET}`);
          }
        } else {
          console.log(`  ${YELLOW}${methodName}(...)${RESET}`);
        }
        console.log('');
      }
      const modPath =
        findModulePath(frodoInstance, target as object) ?? 'frodo.X';
      console.log(
        `Tip: ${GREEN}help(${modPath}.<method name>)${RESET} shows full parameter documentation.`
      );
      return;
    }

    console.log(
      `${YELLOW}Usage: help() | help(frodo.<module>) | help(frodo.<module>.<method name>) | help("methodName")${RESET}`
    );
  }

  return { help };
}
