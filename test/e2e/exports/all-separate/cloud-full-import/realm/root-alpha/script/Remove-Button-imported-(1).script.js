/* Remove Button
 *
 * Author: volker.scheuber@forgerock.com
 * 
 * Hide buttons on the journey page.
 * 
 * This script does not need to be parametrized. It will work properly as is.
 * 
 * The Scripted Decision Node needs the following outcomes defined:
 * - true
 */
(function () {
    var script = "Array.prototype.slice.call(document.getElementsByTagName('button')).forEach(function (e) {e.style.display = 'none'})"
    var fr = JavaImporter(
        org.forgerock.openam.auth.node.api.Action,
        javax.security.auth.callback.TextOutputCallback,
        com.sun.identity.authentication.callbacks.ScriptTextOutputCallback
    )
    var message = " "
    if (callbacks.isEmpty()) {
        action = fr.Action.send(
            new fr.TextOutputCallback(
                fr.TextOutputCallback.INFORMATION,
                message
            ),
            new fr.ScriptTextOutputCallback(script)
        ).build()
    }
}());
