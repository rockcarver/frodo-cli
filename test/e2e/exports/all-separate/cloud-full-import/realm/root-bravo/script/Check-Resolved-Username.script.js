/* Resolve Username
 *
 * Author: volker.scheuber@forgerock.com
 * 
 * Check if username has already been resolved to _id.
 * Return "true" if resolved, "false" otherwise.
 * 
 * This script does not need to be parametrized. It will work properly as is.
 * 
 * The Scripted Decision Node needs the following outcomes defined:
 * - true
 * - false
 */
(function () {
    if (nodeState.get("_id")) {
        outcome = "true";
    }
    else {
        outcome = "false";
    }
}());
