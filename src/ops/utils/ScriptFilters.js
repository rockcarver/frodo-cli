/**
 * @typedef {import('@rockcarver/frodo-lib/types/ops/ScriptOps').ScriptFilter} LibScriptFilter
 * @typedef {import('@rockcarver/frodo-lib/types/ops/ScriptOps').ScriptFilterCondition} LibScriptFilterCondition
 * @typedef {import('@rockcarver/frodo-lib/types/ops/ScriptOps').ScriptFilterGroup} LibScriptFilterGroup
 */

function normalizeFilterValue(value) {
  const normalizedValue = value?.trim();
  return normalizedValue ? normalizedValue : undefined;
}

export function normalizeScriptFilters(filters = {}) {
  return {
    context: normalizeFilterValue(filters.context)
      ?.replace(/[\s-]+/g, '_')
      .toUpperCase(),
    evaluatorVersion: normalizeFilterValue(filters.evaluatorVersion),
    language: normalizeFilterValue(filters.language)?.toUpperCase(),
  };
}

export function hasScriptFilters(filters = {}) {
  return !!(filters.context || filters.evaluatorVersion || filters.language);
}

export function matchesScriptFilters(script, filters = {}) {
  const normalizedFilters = normalizeScriptFilters(filters);
  return (
    (!normalizedFilters.context ||
      script.context === normalizedFilters.context) &&
    (!normalizedFilters.evaluatorVersion ||
      script.evaluatorVersion === normalizedFilters.evaluatorVersion) &&
    (!normalizedFilters.language ||
      script.language === normalizedFilters.language)
  );
}

export function filterScripts(scripts, filters = {}) {
  if (!hasScriptFilters(filters)) return scripts;
  return scripts.filter((script) => matchesScriptFilters(script, filters));
}

/**
 * @param {{ context?: string, evaluatorVersion?: string, language?: string }} [filters={}]
 * @returns {LibScriptFilter | undefined}
 */
export function createScriptFilter(filters = {}) {
  const normalizedFilters = normalizeScriptFilters(filters);
  /** @type {LibScriptFilterCondition[]} */
  const filterConditions = [
    normalizedFilters.context && {
      field: 'context',
      value: normalizedFilters.context,
    },
    normalizedFilters.evaluatorVersion && {
      field: 'evaluatorVersion',
      value: normalizedFilters.evaluatorVersion,
    },
    normalizedFilters.language && {
      field: 'language',
      value: normalizedFilters.language,
    },
  ].filter(Boolean);
  if (filterConditions.length === 0) return undefined;
  if (filterConditions.length === 1) return filterConditions[0];
  return /** @type {LibScriptFilterGroup} */ ({
    operator: 'AND',
    filters: filterConditions,
  });
}

function getLibraryScriptNames(script) {
  if (!script.script) return [];
  const rawScript = Array.isArray(script.script)
    ? script.script.join('\n')
    : script.script;
  return Array.from(rawScript.matchAll(/require\((['"])(.+?)\1\)/g)).map(
    (match) => match[2]
  );
}

export function includeScriptDependencies(scripts, allScripts) {
  const scriptsByName = new Map(
    allScripts.map((script) => [script.name, script])
  );
  const includedScripts = new Map(
    scripts.map((script) => [script._id, script])
  );
  const queue = [...scripts];
  while (queue.length > 0) {
    const script = queue.shift();
    if (!script) continue;
    for (const libraryScriptName of getLibraryScriptNames(script)) {
      const libraryScript = scriptsByName.get(libraryScriptName);
      if (libraryScript && !includedScripts.has(libraryScript._id)) {
        includedScripts.set(libraryScript._id, libraryScript);
        queue.push(libraryScript);
      }
    }
  }
  return Array.from(includedScripts.values());
}

export function filterScriptExport(
  scriptExport,
  filters = {},
  includeDependencies = false
) {
  if (!hasScriptFilters(filters)) return scriptExport;
  const allScripts = Object.values(scriptExport.script);
  let filteredScripts = filterScripts(allScripts, filters);
  if (includeDependencies) {
    filteredScripts = includeScriptDependencies(filteredScripts, allScripts);
  }
  return {
    ...scriptExport,
    script: Object.fromEntries(
      filteredScripts.map((script) => [script._id, script])
    ),
  };
}
