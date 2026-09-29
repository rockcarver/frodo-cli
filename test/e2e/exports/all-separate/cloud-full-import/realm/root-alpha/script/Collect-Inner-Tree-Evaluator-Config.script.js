/* Collect Inner Tree Evaluator Config
 * 
 * Collect all the configuration items required for the Inner Tree Evaluator to function properly.
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
        "tree": "Login",
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
            new fr.NameCallback("tree", config.tree),
              new fr.ScriptTextOutputCallback(script)
        ).build();
    }
    else {
          config[callbacks.get(0).getPrompt()] = callbacks.get(0).getName();
          nodeState.putShared("nodeConfig", config);
        action = fr.Action.goTo(outcome).build();
    }
}());
