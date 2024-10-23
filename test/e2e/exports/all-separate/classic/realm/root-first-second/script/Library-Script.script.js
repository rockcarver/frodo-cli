/*
 * Copyright 2022-2023 ForgeRock AS. All Rights Reserved
 *
 * Use of this code requires a commercial software license with ForgeRock AS.
 * or with one of its affiliates. All use shall be exclusively subject
 * to such license between the licensee and ForgeRock AS.
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
