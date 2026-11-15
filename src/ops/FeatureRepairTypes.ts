import type { frodo } from '@rockcarver/frodo-lib';

type IdmFeatureModule = typeof frodo.cloud.idmFeature;

/** What a repair of an IDM feature would do (`planIdmFeatureRepair`); nothing has been written. */
export type FeatureRepairPlan = Awaited<
  ReturnType<IdmFeatureModule['planIdmFeatureRepair']>
>;

/** One step of a repair plan. */
export type FeatureRepairStep = FeatureRepairPlan['steps'][number];

/** What a repair did (`repairIdmFeature`). */
export type FeatureRepairResult = Awaited<
  ReturnType<IdmFeatureModule['repairIdmFeature']>
>;

/** The result of one step of a repair. */
export type FeatureRepairStepResult = FeatureRepairResult['results'][number];
