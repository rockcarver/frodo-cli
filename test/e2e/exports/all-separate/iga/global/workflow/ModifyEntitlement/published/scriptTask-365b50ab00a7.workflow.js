var content = execution.getVariables();
var requestId = content.get('id');
var context = null;
var certification = false;
var certifierId = null;
var isCertifierOwnerSame = false;
var entitlementOwnerId = null;
let isTenantAdmin = false;
try {
    // Read request object
    var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
    
    if (requestObj.request.common.context) {
        context = requestObj.request.common.context.type;
        if (context == 'certification') {
            certification = true;
            if(requestObj && requestObj.entitlementOwner && requestObj.entitlementOwner.length){
                entitlementOwnerId = requestObj.entitlementOwner[0].id
            }
            const campaignId = requestObj.request.common.context.campaignId;
            const lineItemId = requestObj.request.common.context.lineItemId;
            
            // Add a comment on the certification item denoting the request ID
            var commentResp = openidm.action('/iga/governance/certification/' + campaignId + '/items/comment', 'POST', { "ids": [lineItemId], "comment": "ID of modify entitlement request: " + requestId }, {});
           
            var lineItemRespObj = openidm.action('/iga/governance/certification/' + campaignId + '/items/' + lineItemId, 'GET', {}, {"isAdmin":true});
            if (lineItemRespObj.result[0]) {
                const decisionById = lineItemRespObj.result[0].decision.certification.decisionBy.id;
                const primaryReviewerId = lineItemRespObj.result[0].decision.certification.primaryReviewer.id
                let isTenantAdmin = false;

                if (decisionById === 'SYSTEM') {
                    isTenantAdmin = true;
                } else {
                    isTenantAdmin = decisionById.split('/')[1] === 'teammember';
                }

                if (isTenantAdmin) {
                    certifierId = primaryReviewerId.split('/')[2];
                } else {
                    certifierId = decisionById.split('/')[2];
                }
                isCertifierOwnerSame = entitlementOwnerId === certifierId;
            }
        }
    }
}
catch (e) {
    logger.info("Request Context Check failed " + e.message);
}

execution.setVariable("context", context);
execution.setVariable("certification", certification);
execution.setVariable("certifierId", certifierId);
execution.setVariable("isCertifierOwnerSame", isCertifierOwnerSame);
