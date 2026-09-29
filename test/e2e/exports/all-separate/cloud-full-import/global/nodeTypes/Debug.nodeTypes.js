/* Debug
 *
 * Author: Ping SEs, volker.scheuber@pingidentity.com
 * 
 * Show current state values, request params, and headers. Note: does not separate transient, secure, shared state due to API limitations in NextGen scripts.
 */
(function () {
    outcome = "outcome";

    //// CONSTANTS
    var SCRIPT_NAME = "Debug";

    try {
        logger.info(`${SCRIPT_NAME}: start`); // beging of script main

        // build output html table that will be sent back to browser
        var output = createHtml();

        // issue callback to browser after output html is built from createHtml() function
        displayMessage(output);

        logger.info(`${SCRIPT_NAME}: end`); // end of script main
    } catch (error) {
        logger.error(`${SCRIPT_NAME}: Error generating debug output: "${error.message} - ${error.stack}"`);
        nodeState.putShared('errorMessage', error.message);
        nodeState.putShared('errorStack', error.stack);
    }

    /*
    * Put functions below here
    */
    function createHtml() {
        var html = '';
        if (properties.showNodeState) {
            html += "<table class=\"table table-striped\">";
            html += "<thead class=\"thead-dark\"><tr><th class=\"px-1 py-1\" colspan=\"2\">Node State</th></tr></thead>";
            // get all the keys in nodeState
            var iterator = nodeState.keys().iterator();
            var stateKeys = [];
            while (iterator.hasNext()) {
                stateKeys.push(iterator.next().toString());
            }
            stateKeys.forEach(function (stateKey) {
                if (nodeState.get(stateKey)
                    && nodeState.get(stateKey).toString() !== "null"
                    && nodeState.get(stateKey).toString() !== ""
                    && "" + stateKey !== "pageNodeCallbacks" //pageNodeCallbacks are internal to the Page Node and not needed/used  
                    && ("" + stateKey !== "objectAttributes" || !properties.showObjectAttributes) )

                {
                    html += "<tr><td class=\"px-1 py-1\">" + stateKey + "</td><td class=\"px-1 py-1\">" + JSON.stringify(nodeState.get(stateKey)) + "</td></tr>";
                }
            });
            html += "</table>";
        }
        if (properties.showObjectAttributes) {
            html += "<table class=\"table table-striped\">";
            if (nodeState.isDefined("objectAttributes")) {
                html += "<thead class=\"thead-dark\"><tr><th class=\"px-1 py-1\" colspan=\"2\">Object Attributes</th></tr></thead>";
                var keys = Object.keys(nodeState.getObject('objectAttributes'));
                logger.error(`${SCRIPT_NAME}: objectAttributes has ${keys.length} keys`);
                keys.forEach(function (key) { // showing how to use keySet(). Can use entrySet().
                    html += "<tr><td class=\"px-1 py-1\">" + key + "</td><td class=\"px-1 py-1\">" + JSON.stringify(JSON.parse(JSON.stringify(nodeState.getObject('objectAttributes')))[key]) + "</td></tr>";
                });
            }
            else {
                html += "<tr><td colspan=\"2\">EMPTY</td></tr>";
            }
            html += "</table>";
        }
        if (properties.showUserProfile) {
            html += "<table class=\"table table-striped\">";
            // looking for a way to build this AM User Profile list dynamically
            var objAMAttrs = [
                "uid",
                "fr-idm-uuid",
                "cn",
                "inetUserStatus",
                "givenName",
                "sn",
                "mail",
                "description",
                "telephoneNumber",
                "street",
                "l",
                "postalCode",
                "co",
                "st",
                "displayName",
                "fr-attr-istr1",
                "fr-attr-istr2",
                "fr-attr-istr3",
                "fr-attr-istr4",
                "fr-attr-istr5",
                "fr-attr-str1",
                "fr-attr-str2",
                "fr-attr-str3",
                "fr-attr-str4",
                "fr-attr-str5",
                "fr-attr-imulti1",
                "fr-attr-imulti2",
                "fr-attr-imulti3",
                "fr-attr-imulti4",
                "fr-attr-imulti5",
                "fr-attr-multi1",
                "fr-attr-multi2",
                "fr-attr-multi3",
                "fr-attr-multi4",
                "fr-attr-multi5",
                "fr-attr-idate1",
                "fr-attr-idate2",
                "fr-attr-idate3",
                "fr-attr-idate4",
                "fr-attr-idate5",
                "fr-attr-date1",
                "fr-attr-date2",
                "fr-attr-date3",
                "fr-attr-date4",
                "fr-attr-date5",
                "fr-attr-iint1",
                "fr-attr-iint2",
                "fr-attr-iint3",
                "fr-attr-iint4",
                "fr-attr-iint5",
                "fr-attr-int1",
                "fr-attr-int2",
                "fr-attr-int3",
                "fr-attr-int4",
                "fr-attr-int5"
            ];

            // Build the table of idRepository binding
            var identity = idRepository.getIdentity(nodeState.get("_id"));
            if (nodeState.isDefined("_id") && identity.getAttributeValues(nodeState.get("_id"))) {
                html += "<thead class=\"thead-dark\"><tr><th class=\"px-1 py-1\" colspan=\"2\">User Profile</th></tr></thead>";
                objAMAttrs.forEach(function (attr) {
                    var attrValues = identity.getAttributeValues(attr);
                    if (attrValues && "" + attrValues !== "null" && "" + attrValues !== "" && "" + attrValues.size() > 0) {
                        html += "<tr><td class=\"px-1 py-1\">" + attr + "</td><td class=\"px-1 py-1\">" + attrValues + "</td></tr>";
                    }
                });
            }
            html += "</table>";
        }
        if (properties.showRequestParams) {
            html += "<table class=\"table table-striped\">";
            html += "<thead class=\"thead-dark\"><tr><th class=\"px-1 py-1\" colspan=\"2\">Request Parameters</th></tr></thead>";
            var params = Object.keys(requestParameters);
            for (var index = 0; index < params.length; index++) {
                var paramName = params[index];
                var param = requestParameters.get(paramName);
                var paramValue = param.get(0);
                html += `<tr><td class="px-1 py-1">${paramName}</td><td class="px-1 py-1">${paramValue}</td></tr>`;
            }
            html += "</table>";
        }
        if (properties.showRequestHeaders) {

            html += "<table class=\"table table-striped\">";
            html += "<thead class=\"thead-dark\"><tr><th class=\"px-1 py-1\" colspan=\"2\">Request Headers</th></tr></thead>";
            var headerNames = Object.keys(requestHeaders);
            logger.error(`${SCRIPT_NAME}: ${headerNames.length} headers`);
            for (var index = 0; index < headerNames.length; index++) {
                var headerName = headerNames[index];
                var headerValue = requestHeaders.get(headerName).get(0);
                html += `<tr><td class="px-1 py-1">${headerName}</td><td class="px-1 py-1">${headerValue}</td></tr>`;
            }
            html += "</table>";
        }

        return html;
    }

    //builds the html to display the message in the browser on the callback
    //use view source in browser and look for class="callback-component" to see html response
    function displayMessage(message) {
        var anchor = "anchor-".concat(generateNumericToken('xxx'));
        var halign = "left";
        var script = "Array.prototype.slice.call(\n".concat(
            "document.getElementsByClassName('callback-component')).forEach(\n").concat(
                "function (e) {\n").concat(
                    "  var message = e.firstElementChild;\n").concat(
                        "  if (message.firstChild && message.firstChild.nodeName == '#text' && message.firstChild.nodeValue.trim() == '").concat(anchor).concat("') {\n").concat(
                            "    message.className = \"\";\n").concat(
                                "    message.style = \"\";\n").concat(
                                    "    message.align = \"").concat(halign).concat("\";\n").concat(
                                        "    message.innerHTML = '").concat(message).concat("';\n").concat(
                                            "  }\n").concat(
                                                "})")
        if (message.length && callbacks.isEmpty()) {
            callbacksBuilder.textOutputCallback(0, message);
            callbacksBuilder.scriptTextOutputCallback(script);
        }
    }

    /*
     * Generate a token in the desired format. All 'x' characters will be replaced with a random number 0-9.
     * This is needed to have a unique div(anchor-x) on the html callback that we can populate data
     * Example:
     * 'xxxxx' produces '28535'
     * 'xxx-xxx' produces '432-521'
     */
    function generateNumericToken(format) {
        return format.replace(/[x]/g, function (c) {
            var r = Math.random() * 10 | 0;
            var v = r;
            return v.toString(10);
        });
    }

}()); // self-invoking function
