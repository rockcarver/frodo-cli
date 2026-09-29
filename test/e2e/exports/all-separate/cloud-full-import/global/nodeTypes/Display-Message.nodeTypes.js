/**
 * Displays a TextOutputCallback based on what is provided in plaintext or in state
 * https://docs.pingidentity.com/pingoneaic/latest/am-authentication/callbacks-read-only.html#textoutputcallback
 * 
 * The scripted decision node needs the following outcomes defined:
 * - Success
 *
 * author: @gwizdala
 */

//// CONSTANTS
var CONSTANTS = {
    MESSAGE_TYPES: {
        INFORMATION: 0,
        WARNING: 1,
        ERROR: 2
    },
    OBJECT_DELIMITER: "/",
    HANDLEBAR_REGEX: /\{\{(.*?)}}/g,
    HANDLEBAR_OPENER: "{{",
    HANDLEBAR_CLOSER: "}}",
};

var NodeOutcome = {
    SUCCESS: "Success"
};

//// UTILITIES
/**
 * Traverse a nested object path within a base object
 * @param {object} baseObject The base object to traverse
 * @param {Array<string>} pathArray An array of strings representing the path to traverse
 * @returns {any} The value at the end of the path, or null if not found
 */
function getNestedValue(baseObject, pathArray) {
    if (pathArray.length === 0) {
        return baseObject;
    } else {
        // Check if the baseObject is a valid object and if not try to parse it as JSON
        if (typeof baseObject !== "object" && baseObject !== null && baseObject !== undefined) {
            try {
                baseObject = JSON.parse(baseObject);
            } catch (e) {
                return null;
            }
        }
        var currentKey = pathArray[0];
        if (baseObject && baseObject[currentKey] !== undefined) {
            return getNestedValue(baseObject[currentKey], pathArray.slice(1));
        } else {
            return null;
        }
    }
}

/**
 * Stringifies the element only if necessary
 * @param {any} element The element to stringify
 * @returns {string} The stringified element
 */
function stringifyIfNeeded(element) {
    var type = typeof element;

    if (type === 'string') {
        // Already a string, return as is
        return element;
    } else if (type === 'undefined' || type === 'function') {
        // Return null or an empty string as a consistent fallback for undefined or functions
        return null;
    } else {
        // 3. For everything else (objects, arrays, numbers, booleans, null), stringify.
        return JSON.stringify(element);
    }
}

function resolveHandlebars(element, replaceUnresolvedHandlebarsWithEmptyString) {
    if (element) {
        var newElement = element;
        var matches = element.match(CONSTANTS.HANDLEBAR_REGEX);

        if (matches && matches.length > 0) {
            // Check if the entire element is a single handlebars value
            var isSingleHandlebar = matches.length === 1 && element === matches[0];
            
            matches.forEach(function(match) {
                // Extract the key inside the handlebars
                var handlebarsKey = match.replace(CONSTANTS.HANDLEBAR_OPENER, "").replace(CONSTANTS.HANDLEBAR_CLOSER, "").trim();
                
                // First, check if the element exists as-is in state
                // This accounts for non-nested values with dots inside the key like "PingOneProtectEvaluationNode.RISK"
                var resolvedValue = nodeState.get(handlebarsKey);
                
                // If not, check if it's a nested object using JSON pointer notation
                if ((resolvedValue === null || resolvedValue === undefined) && handlebarsKey.indexOf(CONSTANTS.OBJECT_DELIMITER) === 0) {
                    var stateValuePath = handlebarsKey.split(CONSTANTS.OBJECT_DELIMITER);
                    if (stateValuePath.length > 1) {
                        var baseObject = nodeState.get(stateValuePath[1]);
                        if (stateValuePath.length > 2) {
                            // Traverse the nested object path
                            resolvedValue = getNestedValue(baseObject, stateValuePath.slice(2));
                        } else {
                            resolvedValue = baseObject;
                        }
                    }
                }

                if (resolvedValue !== null && resolvedValue !== undefined) {
                    if (isSingleHandlebar) {
                        // If the entire element is handlebars, return the value as-is without stringifying
                        newElement = resolvedValue;
                    } else {
                        newElement = newElement.replace(match, stringifyIfNeeded(resolvedValue));
                    }
                } else if (replaceUnresolvedHandlebarsWithEmptyString) {
                    newElement = newElement.replace(match, "");
                } else {
                    throw(`Unable to resolve value for key: ${handlebarsKey} within element: ${element}`);
                }
            });
        }
        return newElement;
    } else {
        throw('Element is null or undefined');
    }
}

//// MAIN
(function() {
    outcome = NodeOutcome.SUCCESS;
    try {
        var replaceUnresolvedHandlebarsWithEmptyString = !!properties.replaceUnresolvedHandlebarsWithEmptyString;
        var message = properties.message ? resolveHandlebars(properties.message, replaceUnresolvedHandlebarsWithEmptyString) : null;
        var stateValuesToRemove = properties.stateValuesToRemove ? properties.stateValuesToRemove.toArray() : [];
        var messageType = properties.messageType 
            && CONSTANTS.MESSAGE_TYPES[properties.messageType] 
            ? CONSTANTS.MESSAGE_TYPES[properties.messageType] 
            : CONSTANTS.MESSAGE_TYPES.INFORMATION;

        if (stateValuesToRemove && stateValuesToRemove.length > 0) {
            stateValuesToRemove.forEach(function(stateKey) {
                nodeState.putShared(stateKey, null);
                nodeState.putTransient(stateKey, null);
            });
        }
        
        if (message) {
            if (callbacks.isEmpty()) {
                callbacksBuilder.textOutputCallback(messageType, message);
            }
        } else {
            throw("No message to display after resolving handlebars.");
        }

    } catch(e) {
        logger.warn(`Error during message display: ${e}`);
    }
    action.goTo(outcome);
}());
