/* Check Username
 *
 * Author: volker.scheuber@forgerock.com
 * 
 * Check if username has already been collected.
 * Return "known" if yes, "unknown" otherwise.
 * 
 * This script does not need to be parametrized. It will work properly as is.
 * 
 * The Scripted Decision Node needs the following outcomes defined:
 * - known
 * - unknown
 */
(function () {
    if (null != sharedState.get("username")) {
        outcome = "known";
    }
    else {
        outcome = "unknown";
    }
}());
