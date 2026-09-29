/* Collect Set Custom Cookie Node Config
 * 
 * Collect all the configuration items required for the Set Custom Cookie node to function properly.
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
        "name": "oreo",
        "value": "original",
        "domain": ".scheuber.io",
        "path": "/",
        "maxAge": 3600,
        "useHttpOnlyCookie": true,
        "useSecureCookie": true,
        "sameSite": "NONE"
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
            new fr.NameCallback("name"),
            new fr.NameCallback("value"),
            new fr.NameCallback("domain"),
            new fr.NameCallback("path"),
            new fr.NameCallback("maxAge"),
            new fr.NameCallback("useHttpOnlyCookie"),
            new fr.NameCallback("useSecureCookie"),
            new fr.NameCallback("sameSite"),
              new fr.ScriptTextOutputCallback(script)
        ).build();
    }
    else {
          config[callbacks.get(0).getPrompt()] = callbacks.get(0).getName();
          config[callbacks.get(1).getPrompt()] = callbacks.get(1).getName();
          config[callbacks.get(2).getPrompt()] = callbacks.get(2).getName();
          config[callbacks.get(3).getPrompt()] = callbacks.get(3).getName();
          config[callbacks.get(4).getPrompt()] = parseInt(callbacks.get(4).getName(), 10).toFixed();
          config[callbacks.get(5).getPrompt()] = (""+callbacks.get(5).getName() === 'true');
          config[callbacks.get(6).getPrompt()] = (""+callbacks.get(6).getName() === 'true');
          config[callbacks.get(7).getPrompt()] = callbacks.get(7).getName();
          nodeState.putShared("nodeConfig", config);
        action = fr.Action.goTo(outcome).build();
    }
}());
