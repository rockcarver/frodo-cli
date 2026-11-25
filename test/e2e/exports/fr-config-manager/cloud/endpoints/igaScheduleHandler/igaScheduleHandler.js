run();

function run() {

    if (request.method !== 'action') {
        logger.warn('IGA: method other than action received');
        throw {
            'code': 400,
            'message' : 'Only actions are supported'
        }
    }

    var scanType = request.action;

    if (!scanType) {
        logger.warn('IGA: action \"scanType\" is not defined.');
        return {};
    }
    else {
        logger.warn('IGA: Script execution of scan type ' + scanType);
    }

    // Get path of IGA API call
    var path = getApiPath(scanType);
    if (!path) {
        logger.warn('IGA: No path defined for scanType: ' + scanType);
        return {};
    }

    // Check contents of certain scans and make any adjustments
    if (scanType === 'recon') {
        let application = null;

        try {
            // Safety check on variable presence
            application = request.content.reconApplication;
        }
        catch (e) {
            logger.warn('IGA: Required application not provided for scanType: ' + scanType);
            return {};
        }
        path = path + '/' + application.id + '/reconcileAll';

        var isIncremental = false;
        try {
            isIncremental = incremental && incremental === true;
        }
        catch (e) {
            // If not provided treat as not-incremental
        }

        if (isIncremental) {
            path += '?incremental=true';
        }
    }

    // Get authorization header to allow call to be made from IDM
    var date = new Date().toUTCString();
    var header = getAuthorizationHeaderForSchedule(date);
    if (!header) {
        logger.warn('IGA: Could not generate authorization header.');
        return {};
    }

    // Get request body and make call
    var body = getRequestBody(scanType)
    makeExternalCall(path, body, date, header)
}

function makeExternalCall(path, body, date, authorizationHeader) {
    logger.warn('IGA: Calling endpoint ' + path);
    logger.info('IGA: Sending payload ' + JSON.stringify(body));
    var params = {
        url: 'http://iga-api.fr-auto.svc.cluster.local:3005/' + path,
        method: 'POST',
        headers : {
            Date : date,
            Authorization : authorizationHeader
        },
        contentType: 'application/json',
        body: JSON.stringify(body),
    };

    var result = openidm.action('external/rest', 'call', params);
    logger.info('IGA: Result of endpoint ' + path + ': ' + JSON.stringify(result));
    return result;
}

function getApiPath(type) {
    switch(type) {
    case 'creation':
        return 'iga/governance/certification/scan/creation';
    case 'refresh':
        return 'iga/governance/refreshAllItems';
    case 'recon':
        return 'iga/governance/applications';
    case 'decisionExpiration':
        return 'iga/governance/certification/items/scan/expiration';
    case 'decisionRemediation':
        return 'iga/governance/certification/items/scan/remediation';
    case 'escalationNotification':
        return 'iga/governance/certification/scan/escalationNotification';
    case 'expirationNotification':
        return 'iga/governance/certification/scan/expirationNotification';
    case 'reminderNotification':
        return 'iga/governance/certification/scan/reminderNotification';
    case 'scheduledCertification':
        return 'iga/governance/certification';
    case 'requestEscalation' :
        return 'iga/governance/requests/scan/escalation'
    case 'requestReminder' :
        return 'iga/governance/requests/scan/reminder'
    case 'requestExpiration' :
        return 'iga/governance/requests/scan/expiration'
    case 'scheduledPolicyScan':
        return 'iga/governance/policy/' + policyId + '/scan';
    case 'violationEscalation' :
        return 'iga/governance/violation/scan/escalation'
    case 'violationReminder' :
        return 'iga/governance/violation/scan/reminder'
    case 'violationExpiration' :
        return 'iga/governance/violation/scan/expiration'
    case 'violationExpiration' :
        return 'iga/governance/violation/scan/exception'
    case 'scheduledRecon':
        return '';
    default:
        return null;
    }
}

function getRequestBody(type) {
    switch(type) {
    case 'scheduledCertification':
        return {
            templateId: request.content.templateId
        }
    case 'recon':
        var mappings = {};
        // Check for passed in script var additional mappings, if present
        try {
            mappings = request.content.additionalMappings;
        }
        catch (e) {

        }
        return mappings;
    default:
        return {};
    }
}

function getAuthorizationHeaderForSchedule(date) {
    const mac = javax.crypto.Mac.getInstance('HmacSHA256');
    var secret = java.lang.System.getenv('AUTONOMOUS_ACCESS_SIGNATURE_SECRET_KEY');
    var algorithm = java.lang.System.getenv('AUTONOMOUS_ACCESS_SIGNATURE_ALGORITHM');
  	if(!secret || !algorithm) {
      throw {
        'code': 500,
        'message' : 'Environment variables for AUTONOMOUS_ACCESS_SIGNATURE_SECRET_KEY or AUTONOMOUS_ACCESS_SIGNATURE_ALGORITHM not set'
      }
    }
    var secretBytes = new java.lang.String(secret).getBytes(java.nio.charset.StandardCharsets.UTF_8);// convert to bytes
    var secretKeySpec = new javax.crypto.spec.SecretKeySpec(secretBytes, 'HmacSHA256');
    mac.init(secretKeySpec);
    const currentDateTimeString =  'date: ' + date + '\n';

    var signedHash = mac.doFinal(new java.lang.String(currentDateTimeString).getBytes(java.nio.charset.StandardCharsets.UTF_8));
    var base64Hash = java.util.Base64.getEncoder().encodeToString(signedHash);
    const authorizationHeader = `Signature keyId=\"service1-hmac\",algorithm=\"${algorithm}\",headers=\"date \", signature=\"${base64Hash}\"`;
    return authorizationHeader;
}
