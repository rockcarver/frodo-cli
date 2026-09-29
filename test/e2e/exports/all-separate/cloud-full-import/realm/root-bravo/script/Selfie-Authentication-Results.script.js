/* Selfie Authentication Results
 *
 * Author: volker.scheuber@forgerock.com
 * 
 * Show selfie authentication results
 * 
 * This script needs to be parametrized. It may not work properly as is.
 * 
 * The Scripted Decision Node needs the following outcomes defined:
 * - true
 */
(function () {
  outcome = 'true';

  var p1UserIdAmAttr = 'fr-attr-istr1';
  var p1UserIdIdmAttr = 'frIndexedString1';
  var selfieAmAttr = 'fr-attr-str1';
  var selfieIdmAttr = 'frUnindexedString1';
  var firstNameAttr = 'givenName';
  var lastNameAttr = 'sn';
  
  var identity = idRepository.getIdentity(nodeState.get('_id'));
  var p1UserId = identity.getAttributeValues(p1UserIdAmAttr)[0];
  var selfie = getObjectAttribute(selfieIdmAttr) ? getObjectAttribute(selfieIdmAttr) : identity.getAttributeValues(selfieAmAttr)[0];
  var firstName = getObjectAttribute(firstNameAttr) ? getObjectAttribute(firstNameAttr) : identity.getAttributeValues(firstNameAttr)[0];
  var lastName = getObjectAttribute(lastNameAttr) ? getObjectAttribute(lastNameAttr) : identity.getAttributeValues(lastNameAttr)[0];

  var anchor = 'anchor-'.concat(generateNumericToken('xxx'));
  var halign = 'left';
  var referenceImage = '<img src="data:image/jpeg;base64, '+selfie+'" alt="Reference Image" style="height: auto; width: 100%; object-fit: cover" />';
  var identityTable = `\
      <table style="width: 100%; object-fit: contain">\
        <tr>\
          <td style="width: 49%; text-align: right;">First Name</td>\
          <td style="width: 2%;">:</td>\
          <td style="width: 49%; text-align: left;">${firstName}</td>\
        </tr>\
        <tr>\
          <td style="text-align: right;">Last Name</td>\
          <td>:</td>\
          <td>${lastName}</td>\
        </tr>\
      </table>`;
  var selfieTable = `\
      <table style="width: 100%; object-fit: contain">\
        <tr>\
          <td style="text-align: center;"><h4>Reference Image</h4></td>\
        </tr>\
        <tr style="vertical-align: top;">\
          <td>${referenceImage}</td>\
        </tr>\
      </table>`;
  var message = `\
      <p><h3 style="text-align: center;">Identity</h3></p>\
      ${identityTable}\
      <br/>${selfieTable}`;
  var script = "Array.prototype.slice.call(\n".concat(
    "document.getElementsByClassName('callback-component')).forEach(\n").concat(
    "function (e) {\n").concat(
    "  var message = e.firstElementChild;\n").concat(
    "  console.log('here!');\n").concat(
    "  if (message.firstChild && message.firstChild.nodeName == '#text' && message.firstChild.nodeValue.trim() == '").concat(anchor).concat("') {\n").concat(
    "    message.className = \"text-left\";\n").concat(
    "    message.align = \"").concat(halign).concat("\";\n").concat(
    "    message.innerHTML = '").concat(message).concat("';\n").concat(
    "  }\n").concat(
    "})")
  if (callbacks.isEmpty()) {
    callbacksBuilder.textOutputCallback(0, anchor);
    callbacksBuilder.scriptTextOutputCallback(script);
  } else {
    action = action.goTo('true');
  }
    
  function getResult(metaData, type) {
    var result = null;
    if (metaData && type) {
      metaData._embedded.metaData.forEach((it) => {
        if (it.type === type) {
          result = it; 
          return;
        }
      });
    }
    return result;
  }
    
  function getMitekResult(metaData, name) {
    var result = null;
    var mitekResults = getResult(metaData, 'DOCUMENT_AUTHENTICATION');
    if (mitekResults && name) {
      mitekResults.data.mitekVerifications.forEach((it) => {
        if (it.name === name) {
          result = it; 
          return;
        }
      });
    }
    return result;
  }

  /*
   * Generate a token in the desired format. All 'x' characters will be replaced with a random number 0-9.
   *
   * Example:
   * 'xxxxx' produces '28535'
   * 'xxx-xxx' produces '432-521'
   */
  function generateNumericToken(format) {
    return format.replace(/[x]/g, function (c) {
      var r = (Math.random() * 10) | 0;
      var v = r;
      return v.toString(10);
    });
  }

  /*
   * Read attributes in shared state for use with the Create/Patch Object nodes.
   */
  function getObjectAttribute(name) {
    var attributes = nodeState.get("objectAttributes");
    if (attributes) {
      if (attributes.get) {
        return attributes.get(name);
      }
      else {
        return attributes.name;
      }
    }
    return null;
  }

  /*
   * Store attributes in shared state for use with the Create/Patch Object nodes.
   */
  function setSharedObjectAttribute(name, value) {
    var attributes = nodeState.get("objectAttributes");
    if (attributes && value) {
      attributes.put(name, value);
      nodeState.putShared("objectAttributes", attributes);
    } else if (value) {
      nodeState.putShared("objectAttributes", { name: value } );
    }
  }
}());
