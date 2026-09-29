/* Collect SAML2 Node Config
 * 
 * Collect all the configuration items required for the SAML2 Node to function properly.
 * 
 * This script does not need to be parametrized. It will work properly as is.
 * 
 * The Scripted Decision Node needs the following outcomes defined:
 * - true
 *
 * Author: volker.scheuber@forgerock.com
 */
(function () {
    outcome = "true";
      var config = {
        "metaAlias": "/iSPAzure",
        "allowCreate": false,
        "sloEnabled": false,
        "authnContextClassRef": [],
        "authnContextDeclRef": [],
        "authComparison": "EXACT",
        "nameIdFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified",
        "requestBinding": "HTTP_REDIRECT",
        "binding": "HTTP_POST",
        "forceAuthn": false,
        "idpEntityId": "https://sts.windows.net/711ffa9c-5972-4713-ace3-688c9732614a/",
        "isPassive": false,
        "sloRelayState": ""
    };
      var script = "";
    script += "Array.prototype.slice.call(";
    script += "    document.getElementsByTagName('input')";
    script += ").forEach(";
    script += "    function (input,i) {";
    script += "        console.log('input '+i);"
    script += "        var config = JSON.parse('"+JSON.stringify(config)+"');";
    script += "        var keys = Object.keys(config);";
    script += "        if (input.type === 'text') {";
    script += "            input.setAttribute('value', config[keys[i]]);";
    script += "            input.dispatchEvent(new KeyboardEvent( 'input' , {'key':'Enter'} ));";
    script += "        }";
    script += "    }";
    script += ");";
    var fr = JavaImporter(
        org.forgerock.openam.auth.node.api.Action,
          javax.security.auth.callback.NameCallback,
        com.sun.identity.authentication.callbacks.ScriptTextOutputCallback
    )
    if (callbacks.isEmpty()) {
        action = fr.Action.send(
            new fr.NameCallback("metaAlias"),
            new fr.NameCallback("allowCreate"),
            new fr.NameCallback("sloEnabled"),
            new fr.NameCallback("authnContextClassRef"),
            new fr.NameCallback("authnContextDeclRef"),
            new fr.NameCallback("authComparison"),
            new fr.NameCallback("nameIdFormat"),
            new fr.NameCallback("requestBinding"),
            new fr.NameCallback("binding"),
            new fr.NameCallback("forceAuthn"),
            new fr.NameCallback("idpEntityId"),
            new fr.NameCallback("isPassive"),
            new fr.NameCallback("sloRelayState"),
              new fr.ScriptTextOutputCallback(script)
        ).build();
    }
    else {
          config[callbacks.get(0).getPrompt()] = callbacks.get(0).getName();
          config[callbacks.get(1).getPrompt()] = (callbacks.get(1).getName() === 'true');
          config[callbacks.get(2).getPrompt()] = (callbacks.get(2).getName() === 'true');
          config[callbacks.get(3).getPrompt()] = [callbacks.get(3).getName()];
          config[callbacks.get(4).getPrompt()] = [callbacks.get(4).getName()];
          config[callbacks.get(5).getPrompt()] = callbacks.get(5).getName();
          config[callbacks.get(6).getPrompt()] = callbacks.get(6).getName();
          config[callbacks.get(7).getPrompt()] = callbacks.get(7).getName();
          config[callbacks.get(8).getPrompt()] = callbacks.get(8).getName();
          config[callbacks.get(9).getPrompt()] = (callbacks.get(9).getName() === 'true');
          config[callbacks.get(10).getPrompt()] = callbacks.get(10).getName();
          config[callbacks.get(11).getPrompt()] = (callbacks.get(11).getName() === 'true');
          config[callbacks.get(12).getPrompt()] = callbacks.get(12).getName();
          nodeState.putShared("nodeConfig", config);
        action = fr.Action.goTo(outcome).build();
    }
}());
