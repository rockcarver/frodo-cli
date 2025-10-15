var patch = [{ "operation" : "replace", "field" : "/accountStatus", "value" : "inactive" }];

logger.debug("Performing Expire Account Task on {} ({})", input.mail, objectID);

openidm.patch(objectID, null, patch); true;