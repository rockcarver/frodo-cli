/**
Define custom script which returns an array of actors in the following format
(function() {
    var content = execution.getVariables();
    var requestId = content.get('id');
    var requestIndex = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
    return [{
        id: "managed/user/" + requestIndex.applicationOwner[0].id,
        permissions: {
            approve: true,
            reject: true,
            reassign: true,
            modify: true,
            comment: true
        }
    }];
})()
**/
(
function(){
   return [];
}
)()
