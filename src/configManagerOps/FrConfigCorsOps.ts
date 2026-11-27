import { frodo, state, type FullService } from '@rockcarver/frodo-lib';
import { pulledFilePath } from '../utils/ConfigTreePath';
import { printError, printMessage } from '../utils/Console';
import { causeOf, isNotFoundError } from '../utils/ErrorCause';
import { OperationRun } from '../utils/OperationRun';
import {
  isPlainName,
  PLAIN_NAME_RULE,
  printable,
  shownIdInSingleQuotes,
} from '../utils/PlainName';

const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;
const { readConfigEntity, importConfigEntities, updateConfigEntity } =
  frodo.idm.config;
const {
  getFullServices,
  importServices,
  exportService,
  deleteServiceNextDescendent,
} = frodo.service;
const { CLASSIC_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

type CorsObject = { idmCorsConfig; corsServices; corsServiceGlobal };

/**
 * Export the global CORS configuration json in fr-config manager format
 * @returns True if file was successfully saved
 */
export async function configManagerExportCors(): Promise<boolean> {
  try {
    const services: FullService[] = await getFullServices(true);
    const corsServiceGlobal = services.find(
      (fullService) => fullService._type._id === 'CorsService'
    );
    if (!corsServiceGlobal) {
      printMessage('Global CORS service not found', 'error');
      return false;
    }
    const corsServices = corsServiceGlobal.nextDescendents;
    delete corsServiceGlobal.nextDescendents;
    const newCorsObject: CorsObject = {
      idmCorsConfig:
        state.getDeploymentType() === CLASSIC_DEPLOYMENT_TYPE_KEY
          ? {}
          : await readConfigEntity('servletfilter/cors'),
      corsServices,
      corsServiceGlobal,
    };

    saveJsonToFile(
      newCorsObject,
      getFilePath(pulledFilePath('cors/cors-config.json'), true),
      false,
      true
    );
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Import the global CORS configuration into forgeops
 * @returns {Promise<boolean>} True if file was successfully saved
 */
export async function configManagerImportCors(): Promise<boolean> {
  try {
    const importData = readJsonFile(
      getFilePath('cors/cors-config.json')
    ) as CorsObject;

    if (state.getDeploymentType() !== CLASSIC_DEPLOYMENT_TYPE_KEY) {
      const corsImport = {
        idm: {
          [importData.idmCorsConfig._id]: importData.idmCorsConfig,
        },
      };
      await importConfigEntities(corsImport);
    }
    const fullCorsService = {
      ...importData.corsServiceGlobal,
      nextDescendents: importData.corsServices,
    };

    const corsServiceImport = {
      service: { [fullCorsService._type._id]: fullCorsService },
    };
    await importServices(corsServiceImport, {
      global: true,
      clean: false,
      realm: false,
    });

    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * The values of the IDM CORS filter (`servletfilter/cors`) that `delete cors --deep` resets it to:
 * its `initParams` and its `urlPatterns`. Nothing in the product documentation states a default for
 * this configuration, so these are the values that a tenant answers with, taken from 51 reads of a
 * Cloud tenant (2024-08-09 to 2026-09-23) and 11 more from 2026-10-19, and from the Cloud and
 * ForgeOps fixtures of this repository: the parameters were the same in all of them, only the
 * header list grew once between 2023 and 2024. The filter class (`filterClass`) is NOT part of the
 * default, because the reads and the fixtures differ in it (some hold one, some do not): the reset
 * keeps whatever class the tenant has, and every other key too. A test
 * compares this constant with the fixtures (IdmCorsFilterDefaults.test.js), so that a fixture that
 * is re-recorded with other values fails it. Written 2026-11-24; it moves into the library with
 * the CORS code.
 */
export const IDM_CORS_FILTER_DEFAULTS = {
  initParams: {
    allowCredentials: false,
    allowedHeaders:
      'authorization,accept,content-type,origin,x-requested-with,cache-control,accept-api-version,if-match,if-none-match',
    allowedMethods: 'GET,POST,PUT,DELETE,PATCH',
    allowedOrigins: '*',
    chainPreflight: false,
    exposedHeaders: 'WWW-Authenticate',
  },
  urlPatterns: ['/*'],
} as const;

/** The id of the IDM configuration that holds the CORS filter. */
const IDM_CORS_FILTER_ID = 'servletfilter/cors';

/** The id of the global AM service that holds the CORS configurations. */
const CORS_SERVICE_ID = 'CorsService';

/** What the library lists for a CORS configuration: an id and a type (always `configuration`). */
type ListedCorsConfiguration = { _id?: string; _type?: { _id?: string } };

/** How the IDM CORS filter part of a run ended. */
type IdmFilterOutcome =
  'reset' | 'already' | 'classic' | 'not-found' | 'failed';

/**
 * The text in front of a line that says what a run would do: a dry run and the plan that is shown
 * before a question say the same things.
 * @param {boolean} plan true for the plan shown before a question
 * @returns {string} `Plan: ` or `Dry run: `
 */
const leadOf = (plan: boolean): string => (plan ? 'Plan: ' : 'Dry run: ');

/**
 * A JSON value as text, so that two values are the same when they hold the same data. No default of
 * the filter is an object, so the order of keys cannot make two values differ.
 * @param {unknown} value the value
 * @returns {string | undefined} the text, undefined for undefined
 */
function canonical(value: unknown): string | undefined {
  return JSON.stringify(value);
}

/**
 * The keys of `initParams` that differ from the defaults (a key that the tenant has and the default
 * has not counts: the reset removes it), and whether `urlPatterns` differs.
 * @param {Record<string, any>} entity the IDM CORS filter as the tenant has it
 * @returns {{ initParams: string[]; urlPatterns: boolean }} what differs, by name only
 */
function filterDifferences(entity: Record<string, any>): {
  initParams: string[];
  urlPatterns: boolean;
} {
  const defaults = IDM_CORS_FILTER_DEFAULTS.initParams as Record<
    string,
    unknown
  >;
  const have =
    entity.initParams &&
    typeof entity.initParams === 'object' &&
    !Array.isArray(entity.initParams)
      ? (entity.initParams as Record<string, unknown>)
      : {};
  const keys = [...new Set([...Object.keys(defaults), ...Object.keys(have)])];
  return {
    initParams: keys.filter(
      (key) => canonical(have[key]) !== canonical(defaults[key])
    ),
    urlPatterns:
      canonical(entity.urlPatterns) !==
      canonical(IDM_CORS_FILTER_DEFAULTS.urlPatterns),
  };
}

/**
 * The IDM CORS filter as a reset writes it: the entity that the tenant has, with `initParams` and
 * `urlPatterns` replaced by the defaults. Every other key stays (the filter class among them).
 * @param {Record<string, any>} entity the IDM CORS filter as the tenant has it
 * @returns {Record<string, any>} the entity to write
 */
function resetFilter(entity: Record<string, any>): Record<string, any> {
  return {
    ...entity,
    initParams: { ...IDM_CORS_FILTER_DEFAULTS.initParams },
    urlPatterns: [...IDM_CORS_FILTER_DEFAULTS.urlPatterns],
  };
}

/**
 * Resets the IDM CORS filter to its defaults, as one operation of the run: reads it, merges the
 * defaults into it and writes it only if that makes a difference. It is never deleted. A classic
 * deployment has no IDM, so the part is skipped there; a tenant that has no such configuration is
 * a warning, not a failure. Nothing is written in a dry run or for a plan.
 * @param {OperationRun} run the run that counts the operations
 * @param {boolean} dryRun true to only read and say what would be reset
 * @param {boolean} plan true for the plan shown before a question
 * @returns {Promise<IdmFilterOutcome>} how the part ended
 */
async function resetIdmCorsFilter(
  run: OperationRun,
  dryRun: boolean,
  plan: boolean
): Promise<IdmFilterOutcome> {
  if (state.getDeploymentType() === CLASSIC_DEPLOYMENT_TYPE_KEY) {
    printMessage(
      'IDM CORS filter: not applicable on a classic deployment, skipped'
    );
    return 'classic';
  }
  let entity: Record<string, any>;
  try {
    entity = await readConfigEntity(IDM_CORS_FILTER_ID);
  } catch (error) {
    if (isNotFoundError(error)) {
      printMessage('IDM CORS filter: not found, nothing to reset', 'warn');
      return 'not-found';
    }
    if (dryRun) {
      printMessage(
        'IDM CORS filter: cannot be read, so it is not known what would be reset',
        'error'
      );
    } else {
      printError(error, 'Error reading the IDM CORS filter');
    }
    run.recordFailure('IDM CORS filter', causeOf(error));
    return 'failed';
  }
  const differences = filterDifferences(entity);
  if (differences.initParams.length === 0 && !differences.urlPatterns) {
    run.recordSuccess();
    printMessage(
      'IDM CORS filter: already at the default values, nothing to write'
    );
    return 'already';
  }
  if (dryRun) {
    const parts = [
      ...(differences.initParams.length > 0
        ? [`initParams (${differences.initParams.join(', ')})`]
        : []),
      ...(differences.urlPatterns ? ['urlPatterns'] : []),
    ];
    run.recordSuccess();
    printMessage(
      `${leadOf(plan)}Resetting IDM CORS filter: ${parts.join(' and ')} would be set to the default values${'filterClass' in entity ? ', the filter class is kept' : ''}`
    );
    return 'reset';
  }
  try {
    await updateConfigEntity(IDM_CORS_FILTER_ID, resetFilter(entity));
    run.recordSuccess();
    printMessage(
      'Reset IDM CORS filter: initParams and urlPatterns are at the default values.'
    );
    return 'reset';
  } catch (error) {
    printError(error, 'Error resetting the IDM CORS filter');
    run.recordFailure('IDM CORS filter', causeOf(error));
    return 'failed';
  }
}

/** The closing line of the IDM part, so that nothing is left unsaid after `--deep`. */
const IDM_CLOSING: Record<IdmFilterOutcome, string> = {
  reset: 'IDM CORS filter: reset.',
  already: 'IDM CORS filter: already at the default values.',
  classic: 'IDM CORS filter: skipped (classic deployment).',
  'not-found': 'IDM CORS filter: not found.',
  failed: 'IDM CORS filter: not reset (failed, see above).',
};

/**
 * Delete the named configurations of the global CORS service: one, or all of them. The service
 * entry itself is never changed, and neither is the IDM CORS filter,
 * unless `deep` is true, which also resets the filter to its defaults and deletes nothing more.
 * The configurations are read first, and what is deleted is the id that the tenant LISTS for the
 * one that matches the typed id exactly: a typed id that is a path, or another case, is a
 * configuration that does not exist, and a listed id that is not a plain name is never sent.
 * Every configuration and the filter reset are operations of one {@link OperationRun}: one that
 * fails does not stop the others, one summary names it, and `--allow-failures` keeps the exit code
 * at 0 for it. A named configuration that is not there, a list that cannot be read and a blank id
 * end the command with failure whatever `--allow-failures` says. Nothing is written in a dry run.
 * @param {string} id the id (the name) of the one configuration to delete; undefined for all of them
 * @param {boolean} dryRun true to only say what would be deleted or reset. Default: false
 * @param {boolean} allowFailures true to report failed operations but still succeed. Default: false
 * @param {object} options more options
 * @param {boolean} options.deep true to also reset the IDM CORS filter to its defaults. Default: false
 * @param {boolean} options.plan true if the dry run is the plan shown before a question, so its lines say plan. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerDeleteCors(
  id?: string,
  dryRun: boolean = false,
  allowFailures: boolean = false,
  { deep = false, plan = false }: { deep?: boolean; plan?: boolean } = {}
): Promise<boolean> {
  // "not given" and "given but empty" are different: an empty id must never select every configuration
  const named = id !== undefined;
  if (named && id.trim() === '') {
    printMessage(
      'The CORS configuration id must not be empty. To delete all CORS configurations, leave out the id.',
      'error'
    );
    return false;
  }

  const run = new OperationRun({ unit: 'CORS operation', allowFailures });

  let listed: ListedCorsConfiguration[] = [];
  let listFailed = false;
  try {
    const exported = await exportService(CORS_SERVICE_ID, true);
    listed = (exported.service[CORS_SERVICE_ID]?.nextDescendents ??
      []) as ListedCorsConfiguration[];
  } catch (error) {
    printError(error, 'Error reading the CORS configurations');
    listFailed = true;
  }

  if (!listFailed) {
    const selected = named
      ? listed.filter((configuration) => configuration._id === id)
      : listed;
    if (named && selected.length === 0) {
      printMessage(
        `CORS configuration ${shownIdInSingleQuotes(id)} not found.`,
        'error'
      );
      return false;
    }
    if (!named && selected.length === 0) {
      printMessage('No CORS configurations found to delete.', 'warn');
    }
    for (const configuration of selected) {
      const listedId = configuration._id ?? '';
      const typeId = configuration._type?._id ?? '';
      const label = `CORS configuration ${printable(listedId)}`;
      if (!isPlainName(listedId) || !isPlainName(typeId)) {
        const problem = `CORS configuration ${shownIdInSingleQuotes(listedId)} is listed with a type or an id that is not a plain name (${PLAIN_NAME_RULE}): it is not deleted, and no request was sent for it.`;
        printMessage(problem, 'error');
        if (named) return false;
        run.recordFailure(label, 'its type or its id is not a plain name');
        continue;
      }
      if (dryRun) {
        run.recordSuccess();
        printMessage(
          `${leadOf(plan)}Deleting CORS configuration: ${printable(listedId)}`
        );
        continue;
      }
      try {
        await deleteServiceNextDescendent(CORS_SERVICE_ID, listedId, true);
        run.recordSuccess();
        printMessage(`Deleted CORS configuration: ${printable(listedId)}`);
      } catch (error) {
        printError(
          error,
          `Error deleting CORS configuration ${shownIdInSingleQuotes(listedId)}`
        );
        run.recordFailure(label, causeOf(error));
      }
    }
  }

  const idmOutcome = deep
    ? await resetIdmCorsFilter(run, dryRun, plan)
    : undefined;

  const succeeded = run.finish();
  if (deep && !dryRun) {
    printMessage(
      [
        IDM_CLOSING[idmOutcome as IdmFilterOutcome],
        'CORS service entry: not changed.',
      ].join('\n')
    );
  }
  // a list that could not be read ends the command whatever --allow-failures says
  return !listFailed && succeeded;
}
