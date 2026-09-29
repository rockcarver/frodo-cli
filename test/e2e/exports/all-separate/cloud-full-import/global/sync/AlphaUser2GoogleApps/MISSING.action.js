// Timing Constants
var ATTEMPT = 6; // Number of attempts to find the Google user.
var SLEEP_TIME = 500; // Milliseconds between retries.
var SYSTEM_ENDPOINT = "system/GoogleApps/__ACCOUNT__";
var MAPPING_NAME = "AlphaUser2GoogleApps";
var GOOGLE_DOMAIN = identityServer.getProperty("esv.gac.domain");
var googleEmail = source.userName + "@" + GOOGLE_DOMAIN;
var frUserGUID = source._id;
var resultingAction = "ASYNC";

// Get the Google GUID
var linkQueryParams = {'_queryFilter': 'firstId eq "' + frUserGUID + '" and linkType eq "' + MAPPING_NAME + '"'};
var linkResults = openidm.query("repo/link/", linkQueryParams, null);
var googleGUID;

if (linkResults.resultCount === 1) {
  googleGUID = linkResults.result[0].secondId;
}

var queryResults; // Resulting query from looking for the Google user.
var params = {'_queryFilter': '__UID__ eq "' + googleGUID + '"'};

for (var i = 1; i <= ATTEMPT; i++) {
    queryResults = openidm.query(SYSTEM_ENDPOINT, params);
    if (queryResults.result && queryResults.result.length > 0) {
        logger.info("idmlog: ---AlphaUser2GoogleApps - Missing->UPDATE - Result found in " + i + " attempts. Query result: " + JSON.stringify(queryResults));
        resultingAction = "UPDATE";
        break;
    }
    java.lang.Thread.sleep(SLEEP_TIME); // Wait before trying again.
}

if (!queryResults.result || queryResults.resultCount === 0) {
    logger.warn("idmlog: ---AlphaUser2GoogleApps - Missing->UNLINK - " + googleEmail + " not found after " + ATTEMPT + " attempts.");
    resultingAction = "UNLINK";
}
resultingAction;
