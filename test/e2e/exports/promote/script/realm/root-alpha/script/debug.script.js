/* debug
 *
 * Author: volker.scheuber@forgerock.com
 * 
 * Display sharedState, transientState, and headers.
 * 
 * This script does not need to be parametrized. It will work properly as is.
 * 
 * The Scripted Decision Node needs the following outcomes defined:
 * - true
 */
var anchor = "anchor-".concat(generateNumericToken('xxx'));
var halign = "left";
var message = "<p><b>Shared State</b>:<br/>".concat(
      sharedState.toString()).concat("</p>").concat(
    "<p><b>Transient State</b>:<br/>").concat(
      transientState.toString()).concat("</p>").concat(
    "<p><b>Request Headers</b>:<br/>").concat(
      requestHeaders.toString()).concat("</p>")
var script = "Array.prototype.slice.call(\n".concat(
  "document.getElementsByClassName('callback-component')).forEach(\n").concat(
  "function (e) {\n").concat(
  "  var message = e.firstElementChild;\n").concat(
  "  if (message.firstChild && message.firstChild.nodeName == '#text' && message.firstChild.nodeValue.trim() == '").concat(anchor).concat("') {\n").concat(
  "    message.className = \"text-left\";\n").concat(
  "    message.align = \"").concat(halign).concat("\";\n").concat(
  "    message.innerHTML = '").concat(message).concat("';\n").concat(
  "  }\n").concat(
  "})")
var fr = JavaImporter(
    org.forgerock.openam.auth.node.api.Action,
    javax.security.auth.callback.TextOutputCallback,
    com.sun.identity.authentication.callbacks.ScriptTextOutputCallback
)
if (message.length && callbacks.isEmpty()) {
    action = fr.Action.send(
        new fr.TextOutputCallback(
            fr.TextOutputCallback.INFORMATION,
            anchor
        ),
        new fr.ScriptTextOutputCallback(script)
    ).build()
}
else {
  action = fr.Action.goTo("true").build();
}

 /*
  * Generate a token in the desired format. All 'x' characters will be replaced with a random number 0-9.
  * 
  * Example:
  * 'xxxxx' produces '28535'
  * 'xxx-xxx' produces '432-521'
  */
function generateNumericToken(format) {
    return format.replace(/[x]/g, function(c) {
        var r = Math.random()*10|0;
        var v = r;
        return v.toString(10);
    });
}
