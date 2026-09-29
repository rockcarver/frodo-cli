/* Prepare Account Update
 *
 * Author: volker.scheuber@forgerock.com
 * 
 * Move data from root of node state into objectAttributes for account update.
 * 
 * This script needs to be parametrized. It may not work properly as is.
 * 
 * The Scripted Decision Node needs the following outcomes defined:
 * - true
 */
(function () {
  outcome = 'true';

  /* Configure to fit your env */
  var p1UserIdAmAttr = 'fr-attr-istr1'; // this is what should be configured in your verify proofing node
  var p1UserIdIdmAttr = 'frIndexedString1';
  var selfieSource = 'selfieBase64';
  var selfieTarget = 'frUnindexedString1';
  var croppedPortraitSource = 'croppedPortraitBase64';
  var croppedPortraitTarget = 'frUnindexedString2';
  var metadataSource = 'VerifyMetadataResult';
  var metadataTarget = 'frUnindexedString3';
  var verifyStatusAttr = 'custom_verifyStatus';
  var verifyFailedReason = 'VerifedFailedReason';

  setSharedObjectAttribute(p1UserIdIdmAttr, sharedState.get(p1UserIdAmAttr))
  setSharedObjectAttribute(selfieTarget, sharedState.get(selfieSource));
  setSharedObjectAttribute(croppedPortraitTarget, sharedState.get(croppedPortraitSource));
  setSharedObjectAttribute(metadataTarget, JSON.stringify(transientState.get(metadataSource)));
  setSharedObjectAttribute(verifyStatusAttr, sharedState.get(verifyFailedReason) || 'Successfully verified');
    
  // remove source to minimize AuthId size
  sharedState.put(selfieSource, '');
  sharedState.put(croppedPortraitSource, '');

  /*
   * Store attributes in shared state for use with the Create/Patch Object nodes.
   */
  function setSharedObjectAttribute(name, value) {
       var storage = sharedState.get('objectAttributes');
      if (storage && value) {
          if (storage.put) {
                storage.put(name, value);
          }
          else {
              storage[name] = value;
          }
      }
      else if (value) {
          sharedState.put('objectAttributes', JSON.parse('{"'+name+'":"'+value+'"}'));
      }
  }
}());
