/*
 * Copyright 2022-2025 Ping Identity Corporation. All Rights Reserved
 *
 * This code is to be used exclusively in connection with Ping Identity
 * Corporation software or services. Ping Identity Corporation only offers
 * such software or services to legal entities who have entered into a
 * binding license agreement with Ping Identity Corporation.
 */

/*
 * This is an example library script with methods that can be used in other scripts.
 * To reference it, use the following:
 *
 * var library = require("Library Script");
 *
 * library.logError(logger, "Error message");
 * library.logDebug(logger, "Debug message");
 */

function logError(log, errorMessage) {
  log.error(errorMessage);
}

function logWarning(log, warningMessage) {
  log.warn(warningMessage);
}

exports.logError = logError;
exports.logWarning = logWarning;

// Alternatively, exports can be declared using an inline arrow function

exports.logInfo = (log, infoMessage) => log.info(infoMessage);
exports.logDebug = (log, debugMessage) => log.debug(debugMessage);
