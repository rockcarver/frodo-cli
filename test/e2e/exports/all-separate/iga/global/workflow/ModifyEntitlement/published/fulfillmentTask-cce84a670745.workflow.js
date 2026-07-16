// Returns the certifier
(function() {
    var content = execution.getVariables();
    var certifierId = content.get('certifierId');
    
    return [{
        "id": "managed/user/" + certifierId,
        "permissions": {
            "fulfill": true,
            "deny": true,
            "reassign": true,
            "modify": true,
            "comment": true
        }
    }];
})()
