import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, test } from '@jest/globals';

/**
 * The defaults that `config-manager delete cors --deep` resets the IDM CORS
 * filter to (`IDM_CORS_FILTER_DEFAULTS` in src/configManagerOps/FrConfigCorsOps.ts)
 * are the `initParams` and the `urlPatterns` that the Cloud and ForgeOps
 * fixtures of this repository hold. The fixtures are exports of a tenant: one
 * that is re-recorded with other values fails this test, so that the constant is
 * looked at again (what the fixtures show is the only evidence for the values,
 * no document states them). The filter class is NOT part of the defaults: the
 * fixtures differ in it, and a reset keeps whatever class the tenant has.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const read = (file) =>
  JSON.parse(
    fs.readFileSync(path.join(root, 'test/e2e/exports', file), 'utf8')
  );

const { IDM_CORS_FILTER_DEFAULTS } =
  await import('../../src/configManagerOps/FrConfigCorsOps');

/** The IDM CORS filter of each fixture, by where it comes from. */
const FIXTURES = {
  'a Cloud export': () =>
    read('all-separate/cloud/global/idm/servletfilter/cors.idm.json').idm[
      'servletfilter/cors'
    ],
  'a Cloud export that is imported in a full import': () =>
    read(
      'all-separate/cloud-full-import/global/idm/servletfilter/cors.idm.json'
    ).idm['servletfilter/cors'],
  'a full export': () =>
    read('full-export-separate/global/idm/servletfilter/cors.idm.json').idm[
      'servletfilter/cors'
    ],
  'a ForgeOps export': () =>
    read('all-separate/forgeops/global/idm/servletfilter/cors.idm.json').idm[
      'servletfilter/cors'
    ],
  'the ForgeOps files of the fr-config-manager format': () =>
    read('fr-config-manager/forgeops/cors/cors-config.json').idmCorsConfig,
};

describe('IDM_CORS_FILTER_DEFAULTS', () => {
  test.each(Object.keys(FIXTURES))(
    'has the initParams and the urlPatterns of %s',
    (name) => {
      const entity = FIXTURES[name]();

      expect(entity.initParams).toEqual(IDM_CORS_FILTER_DEFAULTS.initParams);
      expect(entity.urlPatterns).toEqual(IDM_CORS_FILTER_DEFAULTS.urlPatterns);
    }
  );

  test('has the values that the product shows and nothing but initParams and urlPatterns: no filter class, no id', () => {
    expect(Object.keys(IDM_CORS_FILTER_DEFAULTS).sort()).toEqual([
      'initParams',
      'urlPatterns',
    ]);
    expect(IDM_CORS_FILTER_DEFAULTS.initParams).toEqual({
      allowCredentials: false,
      allowedHeaders:
        'authorization,accept,content-type,origin,x-requested-with,cache-control,accept-api-version,if-match,if-none-match',
      allowedMethods: 'GET,POST,PUT,DELETE,PATCH',
      allowedOrigins: '*',
      chainPreflight: false,
      exposedHeaders: 'WWW-Authenticate',
    });
    expect(IDM_CORS_FILTER_DEFAULTS.urlPatterns).toEqual(['/*']);
  });

  test('the fixtures differ in the filter class only, which the defaults leave out', () => {
    const classes = Object.values(FIXTURES).map(
      (entity) => entity().filterClass
    );

    expect(new Set(classes).size).toBeGreaterThan(1);
    expect(classes).toContain(undefined);
  });
});
