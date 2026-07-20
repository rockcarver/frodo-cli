(function() {
    var content = execution.getVariables();
    return [{
        "id": content.get('roleOwner'),
        "permissions": {
            "approve": true,
            "reject": true,
            "reassign": true,
            "modify": true,
            "comment": true
        }
    }];
})()
