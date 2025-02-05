/* Prepare Account Creation
 *
 * Author: volker.scheuber@forgerock.com
 * 
 * Set username from email and copy first and last name to applicant attributes.
 * 
 * This script does not need to be parametrized. It will work properly as is.
 * 
 * The Scripted Decision Node needs the following outcomes defined:
 * - true
 */
(function () {
  outcome = "true";

  sharedState.put("username", getSharedObjectAttribute("mail"))
  setSharedObjectAttribute("userName", getSharedObjectAttribute("mail"))
  setSharedObjectAttribute("custom_verifiedFirstName", getSharedObjectAttribute("givenName"))
  setSharedObjectAttribute("custom_verifiedLastName", getSharedObjectAttribute("sn"))
  setSharedObjectAttribute("custom_verifyStatus", 'Not verified')

  /*
   * Store attributes in shared state for use with the Create/Patch Object nodes.
   */
  function setSharedObjectAttribute(name, value) {
       var storage = sharedState.get("objectAttributes");
      if (storage && value) {
          if (storage.put) {
                storage.put(name, value);
          }
          else {
              storage[name] = value;
          }
      }
      else if (value) {
          sharedState.put("objectAttributes", JSON.parse("{\""+name+"\":\""+value+"\"}"));
      }
  }

  /*
   * Read attributes in shared state for use with the Create/Patch Object nodes.
   */
  function getSharedObjectAttribute(name) {
      var storage = sharedState.get("objectAttributes");
      if (storage) {
          if (storage.get) {
              return sharedState.get("objectAttributes").get(name);
          }
          else {
              return storage.name;
          }
      }
      return null;
  }
}());
