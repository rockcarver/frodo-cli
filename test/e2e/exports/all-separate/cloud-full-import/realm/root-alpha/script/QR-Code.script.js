/* QR Code
 * 
 * Generate QR Code
 * 
 * This script needs to be parametrized. It will not work properly as is.
 * 
 * The Scripted Decision Node needs the following outcomes defined:
 * - true
 *
 * Author: volker.scheuber@forgerock.com
 */
(function () {
  outcome = "true";
  
  /**
   * Modify the qrCodeUrl variable to a static string or read from shared state. Must contain the URL you want the QR code to represent.
   */
  //var qrCodeUrl = 'https://www.forgerock.com/';
  var qrCodeUrl = nodeState.get("backchannel-redirectUri").toString();
  
  var fr = JavaImporter(
    org.forgerock.openam.auth.node.api,
    com.sun.identity.authentication.callbacks.ScriptTextOutputCallback
  );
  
  if (callbacks.isEmpty()) {
    var qrCallback = new fr.ScriptTextOutputCallback("window.QRCodeReader.createCode({\n    id: 'callback_0',\n    text: '"+qrCodeUrl+"',\n    version: '20',\n    code: 'L'\n});");
    action = fr.Action.send(qrCallback).build();
  } else {
    action = fr.Action.goTo(outcome).build();
  }
}());
