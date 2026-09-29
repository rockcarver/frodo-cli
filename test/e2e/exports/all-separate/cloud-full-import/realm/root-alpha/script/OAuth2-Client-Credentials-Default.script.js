/*
 * Copyright 2025 Ping Identity Corporation. All Rights Reserved
 *
 * This code is to be used exclusively in connection with Ping Identity
 * Corporation software or services. Ping Identity Corporation only offers
 * such software or services to legal entities who have entered into a
 * binding license agreement with Ping Identity Corporation.
 */

/**
 * Example cache loader script for performing an OAuth2 client credential flow
 * to retrieve an access token. This script is called when a cache entry is
 * requested that has not yet been loaded. The script returns the `value`
 * in the <code>key</code> object.
 *
 * To utilise this cache loader in a scripted decision node, consider the following:
 * <code>
 * var accessToken = cacheManager.named("oauth2_client_credentials").get({
 *      url: "http://somewhere.com/.../access_token",
 *      clientId: "some-client",
 *      clientSecretLabel: "esv.secret.label",
 *      scope: "scope1 scope2"
 * }).access_token;
 *
 * ...
 * </code>
 *
 * @param key {object} of string to string
 * @returns json response {object}
 */
function load(key) {
    var url = key.url;
    var clientId = key.clientId;
    var clientSecret = systemEnv.getProperty(key.clientSecretLabel);
    var scope = key.scope;

    var options = {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        form: {
            grant_type: "client_credentials",
            client_id: clientId,
            client_secret: clientSecret,
            scope: scope
        }
    }

    var response = httpClient.send(url, options).get();
    if (!response || response.status != 200) {
        logger.error("Bad response from " + url);
        throw Error("Bad response from " + url);
    }
    return response.json();
}
