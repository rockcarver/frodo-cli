/* Send EMAIL Message
 *
 * Author: volker.scheuber@pingidentity.com
 *
 * Send email message
 *
 * This script needs to be parametrized. It may not work properly as is.
 *
 * The Scripted Decision Node needs the following outcomes defined:
 * - sent
 * - failed
 * - error
 */
(function () {
  outcome = 'sent';
  var identity = idRepository.getIdentity(nodeState.get("_id") || nodeState.get("selectedUserId"));
  var mail;
  if ((nodeState.get("_id") || nodeState.get("selectedUserId")) && identity.getAttributeValues("mail") && identity.getAttributeValues("mail").length) {
      mail = identity.getAttributeValues("mail")[0];
  } else {
      logger.error("Send EMAIL Message: No user or email address found! Use 'Identify Existing User node before this script to populate the user's _id in shared state!'");
      logger.error("Send EMAIL Message: outcome = failed");
      action.goTo('failed');
  }
    
  try {
    var params = {
      "templateName": "bcaNotification",
      "to": mail,
      // "cc" : "ccUser1@example.com,ccUser2@example.com",
      // "bcc" : "bigBoss@example.com",
      "object": {
        bcaSubjectDisplayName: identity.getAttributeValues("givenName")[0] + " " + identity.getAttributeValues("sn")[0],
        bcaInitiatorUsername: "Customer Service",
        bcaUrl: nodeState.get("backchannel-redirectUri").asString()
      }
    }

    // send email
    try {
      openidm.action("external/email", "sendTemplate", params);
      logger.error("Send EMAIL Message: Backchannel authentication notification sent to {}", params.to);
    } catch (error) {
      outcome = 'failed';
      logger.error("Send EMAIL Message: Error notifying {}: {}", params.to, error);
    }
  } catch (error) {
      outcome = 'error';
      nodeState.putShared('error', error);
      logger.error('Send EMAIL Message: Error: {}', error);
  }
})();
