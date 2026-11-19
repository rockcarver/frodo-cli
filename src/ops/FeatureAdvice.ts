import type { FeatureActionResultShape } from './FeatureOutcome';

/**
 * What the failures of a validation say when every one of them reports that
 * configuration the feature would add is already in the tenant.
 */
export const CONFIGURATION_ALREADY_IN_TENANT_ADVICE =
  'All failures say that the configuration is already in the tenant: the feature is installed, or its content came with the tenant. Installing it again cannot work.';

/**
 * The wordings, as a real tenant sends them in the `failures` of a validation,
 * that say the configuration exists already:
 * `config/managed: /objects/-: value already present at /objects/14`,
 * `config/repo.ds: /resourceMapping/...: must not already exist` and
 * `...: is already present`.
 */
const ALREADY_IN_TENANT_WORDINGS = [
  'is already present',
  'must not already exist',
  'value already present',
];

/**
 * The advice for the failures of a validation, if it has any: one line that says
 * that the configuration is in the tenant already and installing the feature
 * again cannot work. It applies only when the result lists failures and every
 * one of them is a text that has one of the wordings above. A single failure
 * that is something else, an entry that is not a text, a `failures` that is not
 * an array and an empty list give no advice, because then the failures may name
 * a problem that this does not explain.
 * @param {FeatureActionResultShape} result the result of the validation
 * @returns {string | undefined} the advice, or undefined when there is none
 */
export function featureAdvice(
  result: FeatureActionResultShape
): string | undefined {
  const { failures } = result;
  if (!Array.isArray(failures) || failures.length === 0) return undefined;
  const allSayExists = failures.every(
    (failure: unknown) =>
      typeof failure === 'string' &&
      ALREADY_IN_TENANT_WORDINGS.some((wording) => failure.includes(wording))
  );
  return allSayExists ? CONFIGURATION_ALREADY_IN_TENANT_ADVICE : undefined;
}
