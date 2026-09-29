/* Twilio SMS Sender
 *
 * Author: volker.scheuber@pingidentity.com
 * 
 * This script will send an SMS to the phone number in the user's profile.
 * 
 * This script needs to be parametrized. It will not work properly as is. 
 * It requires the Identify Existing User node and HOTP Generator node before it is being called.
 * 
 * The Scripted Decision Node needs the following outcomes defined:
 * - sent
 * - failed
 * - error
 *
 * The Scripted Decision Node needs the following script inputs and outputs
 * defined:
 * - *
 * - selectedUserDisplayName
 * - selectedUserId
 * - BCAURI
 */
(function () {
  try {
    logger.warn("Twilio SMS Sender: start");

    var identity = idRepository.getIdentity(nodeState.get("_id") || nodeState.get("selectedUserId"));
    if ((nodeState.get("_id") || nodeState.get("selectedUserId")) && identity.getAttributeValues("telephoneNumber") && identity.getAttributeValues("telephoneNumber").length) {
      /* BEGIN SCRIPT CONFIGURATION
     *
     * REPLACE WITH YOUR OWN AZURE AD SETTINGS
     */
      var TWILIO_API_SID = systemEnv.getProperty("esv.twilio.account.sid");
      var TWILIO_API_TOKEN = systemEnv.getProperty("esv.twilio.auth.token");
      var TWILIO_API_FROM = systemEnv.getProperty("esv.twilio.phone.number");
      // var TWILIO_API_FROM = 'MGa0ca9941d0685a1cf67bd6f4a410bdfa';
      /*
       * END SCRIPT CONFIGURATION
       */

      // Twilio SMS Message API Configuration
      var TWILIO_API_URI = "https://api.twilio.com/2010-04-01/Accounts/".concat(TWILIO_API_SID).concat("/Messages.json");
      var TWILIO_API_TO = identity.getAttributeValues("telephoneNumber")[0];
      var TWILIO_API_BODY = "Hello " + identity.getAttributeValues("givenName")[0] + ", please authenticate out-of-band: " + nodeState.get("backchannel-redirectUri");
      var AUTHZ = utils.base64.encode(TWILIO_API_SID + ':' + TWILIO_API_TOKEN);

      var requestOptions = {
        method: "POST",
        headers: {
          "Authorization": String("Basic " + AUTHZ)
        },
        form: {
          "From": String(TWILIO_API_FROM),
          // "MessagingServiceSid": String(TWILIO_API_FROM),
          "Body": String(TWILIO_API_BODY),
          "To": String(TWILIO_API_TO)
        }
      }

      var response = httpClient.send(TWILIO_API_URI, requestOptions).get();
      logger.warn("Twilio SMS Sender: Request sent");
        
      var result = response.json();
      logger.warn("Twilio SMS Sender: Response: {}", response.text());

      if (result["error_code"]) {
        outcome = "failed";
        logger.error("Twilio SMS Sender: error_code = ".concat(result["error_code"]));
        logger.error("Twilio SMS Sender: error_message = ".concat(result["error_message"]));
        logger.error("Twilio SMS Sender: outcome = failed");
      } else if (result["code"]) {
        outcome = "failed";
        logger.error("Twilio SMS Sender: code = ".concat(result["code"]));
        logger.error("Twilio SMS Sender: message = ".concat(result["message"]));
      } else {
        outcome = "sent";
        logger.warn("Twilio SMS Sender: outcome = sent");
      }
    } else {
      outcome = "failed";
      logger.error("Twilio SMS Sender: No user or phone number found! Use 'Identify Existing User node before this script to populate the user's _id in shared state!'");
      logger.error("Twilio SMS Sender: outcome = failed");
    }
  } catch (error) {
    logger.error('Twilio SMS Sender: Error: {}', error.message);
    logger.error(error.stack);
    nodeState.putShared('error', error.message);
    action.goTo('error');
  }
}());
