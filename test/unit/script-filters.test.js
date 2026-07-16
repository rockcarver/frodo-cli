import {
  createScriptFilter,
  filterScriptExport,
  filterScripts,
  normalizeScriptFilters,
} from '../../src/ops/utils/ScriptFilters.js';

const scripts = [
  {
    _id: 'app-script',
    context: 'AUTHENTICATION_TREE_DECISION_NODE',
    evaluatorVersion: '1.0',
    language: 'JAVASCRIPT',
    name: 'App Script',
    script: [`require('Library Script')`, `require("Nested Library")`],
  },
  {
    _id: 'library-script',
    context: 'LIBRARY',
    evaluatorVersion: '1.0',
    language: 'JAVASCRIPT',
    name: 'Library Script',
    script: [`require('Nested Library')`],
  },
  {
    _id: 'nested-library',
    context: 'LIBRARY',
    evaluatorVersion: '1.0',
    language: 'JAVASCRIPT',
    name: 'Nested Library',
    script: [],
  },
  {
    _id: 'groovy-script',
    context: 'SOCIAL_IDP_PROFILE_TRANSFORMATION',
    evaluatorVersion: '2.0',
    language: 'GROOVY',
    name: 'Groovy Script',
    script: [],
  },
];

describe('script filter helpers', () => {
  test('normalizeScriptFilters accepts CLI-friendly values', () => {
    expect(
      normalizeScriptFilters({
        context: 'authentication-tree-decision-node',
        evaluatorVersion: ' 2.0 ',
        language: 'groovy',
      })
    ).toEqual({
      context: 'AUTHENTICATION_TREE_DECISION_NODE',
      evaluatorVersion: '2.0',
      language: 'GROOVY',
    });
  });

  test('normalizeScriptFilters drops blank filter values', () => {
    expect(
      normalizeScriptFilters({
        context: '   ',
        evaluatorVersion: ' ',
        language: '\t',
      })
    ).toEqual({
      context: undefined,
      evaluatorVersion: undefined,
      language: undefined,
    });
  });

  test('createScriptFilter converts flattened filters to frodo-lib filter syntax', () => {
    expect(
      createScriptFilter({
        context: 'authentication-tree-decision-node',
        evaluatorVersion: '1.0',
        language: 'javascript',
      })
    ).toEqual({
      operator: 'AND',
      filters: [
        { field: 'context', value: 'AUTHENTICATION_TREE_DECISION_NODE' },
        { field: 'evaluatorVersion', value: '1.0' },
        { field: 'language', value: 'JAVASCRIPT' },
      ],
    });
  });

  test('filterScripts combines filters with AND semantics', () => {
    expect(
      filterScripts(scripts, {
        context: 'library',
        evaluatorVersion: '1.0',
        language: 'javascript',
      }).map((script) => script.name)
    ).toEqual(['Library Script', 'Nested Library']);
  });

  test('filterScriptExport preserves library dependencies for matching scripts', () => {
    expect(
      Object.keys(
        filterScriptExport(
          {
            script: Object.fromEntries(
              scripts.map((script) => [script._id, script])
            ),
          },
          {
            context: 'authentication-tree-decision-node',
            evaluatorVersion: '1.0',
            language: 'javascript',
          },
          true
        ).script
      )
    ).toEqual(['app-script', 'library-script', 'nested-library']);
  });
});
