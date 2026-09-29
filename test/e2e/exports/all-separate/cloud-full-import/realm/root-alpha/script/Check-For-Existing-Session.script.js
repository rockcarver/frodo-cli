/* Check For Existing Session
 *
 * Author: volker.scheuber@forgerock.com
 * 
 * Check if there is an existing session.
 * Return "true" if yes, "false" otherwise.
 * 
 * This script does not need to be parametrized. It will work properly as is.
 * 
 * The Scripted Decision Node needs the following outcomes defined:
 * - true
 * - false
 */
(function () {
    outcome = "false";
    if (typeof existingSession !== 'undefined') {
        outcome = "true";
    }
}());
