var patch = [{ "operation" : "replace", "field" : "/accountStatus", "value" : "active" }];

logger.debug("Performing Activate Account Task on {} ({})", input.mail, objectID);

openidm.patch(objectID, null, patch); true;