run();

function run() {
    var path = request.resourcePath;
    var body = request.content;
    var method = request.action;
    var params = request.additionalParameters;

    if (request.method !== 'action') {
        logger.warn('Method other than action received');
        throw {
            'code': 400,
            'message' : 'Only actions are supported'
        }
    }

    if (!path) {
        logger.warn('No path provided to call IGA API.')
        throw {
            'code': 400,
            'message' : 'No path provided to call IGA API'
        };
    }

    if (!method) {
        logger.warn('Must provide a request method as the 'action' when calling an IGA API.');
        throw {
            'code': 400,
            'message' : 'Must provide a request method as the "action" when calling an IGA API'
        };
    }
    else {
        method = method.toUpperCase();
    }

    return makeExternalCall(path, method, body, params)
}

function generateUrl(path, queryParams) {
    var url = 'http://iga-api.fr-auto.svc.cluster.local:3005/iga/' + path;
    if (queryParams != null && Object.keys(queryParams).length > 0) {
        var params = '';
        if (typeof queryParams === 'object') {
            var paramsList = [];
            Object.keys(queryParams).forEach(function(key) {
                paramsList.push(key + '=' + queryParams[key])
            })
            params = paramsList.join('&');
        }
        else {
            params = queryParams;
        }
        url = url + '?' + params;
    }
    return url;
}

function makeExternalCall(path, method, body, queryParams) {
    // Get authorization header to allow call to be made from IDM
    var url = generateUrl(path, queryParams);
    var date = new Date().toUTCString();
    var header = getAuthorizationHeaderForIGA(date);
    if (!header) {
        logger.warn('Could not generate authorization header.');
        return;
    }

    var requestBody = body.requestBody || body;

    var params = {
        url: url,
        method: method,
        headers : {
            Date : date,
            Authorization : header
        },
        contentType: 'application/json',
        body: JSON.stringify(requestBody),
    }
    var result = openidm.action('external/rest', 'call', params);
    return result;
}

function getAuthorizationHeaderForIGA(date) {
    const mac = javax.crypto.Mac.getInstance('HmacSHA256');
    var secret =java.lang.System.getenv('AUTONOMOUS_ACCESS_SIGNATURE_SECRET_KEY');
    var algorithm =java.lang.System.getenv('AUTONOMOUS_ACCESS_SIGNATURE_ALGORITHM');
    var secretBytes =  new java.lang.String(secret).getBytes(java.nio.charset.StandardCharsets.UTF_8);// convert to bytes
    var secretKeySpec = new javax.crypto.spec.SecretKeySpec(secretBytes, 'HmacSHA256');
    mac.init(secretKeySpec);
    const currentDateTimeString =  'date: ' + date + '
';

    var signedHash = mac.doFinal(new java.lang.String(currentDateTimeString).getBytes(java.nio.charset.StandardCharsets.UTF_8));
    var base64Hash = java.util.Base64.getEncoder().encodeToString(signedHash);
    const authorizationHeader = `Signature keyId='service1-hmac',algorithm='${algorithm}',headers='date ', signature='${base64Hash}'`;
    return authorizationHeader;
}
