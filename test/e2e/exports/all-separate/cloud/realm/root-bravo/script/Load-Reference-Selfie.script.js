/* Load Reference Selfie
 *
 * Author: volker.scheuber@forgerock.com
 * 
 * Load reference selfie into transient state
 * 
 * This script does not need to be parametrized. It will work properly as is.
 * 
 * The Scripted Decision Node needs the following outcomes defined:
 * - true
 */
(function () {
  outcome = 'true';

  var selfieAttr = 'fr-attr-str1';
  var identity = idRepository.getIdentity(nodeState.get('_id'));
  var selfie = identity.getAttributeValues(selfieAttr)[0];
  if (selfie) {
    setTransientObjectAttribute(selfieAttr, selfie);
  }

  /*
   * Store attributes in shared state for use with the Create/Patch Object nodes.
   */
  function setTransientObjectAttribute(name, value) {
    var attributes = nodeState.get("objectAttributes");
    if (attributes && value) {
      attributes.put(name, value);
      nodeState.putTransient("objectAttributes", attributes);
    } else if (value) {
      nodeState.putTransient("objectAttributes", { name: value } );
    }
  }
}());
