/* Full Verification Results
 *
 * Author: volker.scheuber@forgerock.com
 * 
 * Show full identity verification results
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
  var portraitAmAttr = 'fr-attr-str2';
  var portraitIdmAttr = 'frUnindexedString2';
  var firstNameAttr = 'givenName';
  var lastNameAttr = 'sn';
  var metaDataAmAttr = 'fr-attr-str3';
  var metaDataIdmAttr = 'frUnindexedString3';
  var customIdmAttrs = 'fr-idm-custom-attrs';
  var verifiedFirstNameAttr = 'custom_verifiedFirstName';
  var verifiedLastNameAttr = 'custom_verifiedLastName';
  var verifyStatusAttr = 'custom_verifyStatus';
  
  var identity = idRepository.getIdentity(nodeState.get('_id'));
  var p1UserId = identity.getAttributeValues(p1UserIdAmAttr)[0];
  var selfie = identity.getAttributeValues(selfieAmAttr)[0];
  var portrait = identity.getAttributeValues(portraitAmAttr)[0];
  var firstName = identity.getAttributeValues(firstNameAttr)[0];
  var lastName = identity.getAttributeValues(lastNameAttr)[0];
  var metaData = JSON.parse(identity.getAttributeValues(metaDataAmAttr)[0]);
  var customAttrs = JSON.parse(identity.getAttributeValues(customIdmAttrs)[0]);

  var anchor = 'anchor-'.concat(generateNumericToken('xxx'));
  var halign = 'left';
  var referenceImage = '<img src="data:image/jpeg;base64, '+portrait+'" alt="Reference Image" style="height: auto; width: 100%; object-fit: cover" />';
  var freshSelfieImg = '<img src="data:image/jpeg;base64, '+selfie+'" alt="Fresh Selfie" style="height: auto; width: 100%; object-fit: cover" />';
  var firstNameMatch = getBiographicMatchResult(metaData, 'given_name');
  var lastNameMatch = getBiographicMatchResult(metaData, 'family_name');
  var identityTable = `\
      <table style="width: 100%; object-fit: contain">\
        <tr>\
          <td style="width: 25%; text-align: right;">Identifier</td>\
          <td style="width: 2%;"></td>\
          <td style="width: 25%; text-align: left;">Application</td>\
          <td style="width: 30%; text-align: left;">Government ID</td>\
          <td style="width: 18%; text-align: left;">Match</td>\
        </tr>\
        <tr>\
          <td style="text-align: right;">First Name</td>\
          <td>:</td>\
          <td style="text-align: left;">${firstName}</td>\
          <td style="text-align: left;">${customAttrs[verifiedFirstNameAttr]}</td>\
          <td style="text-align: left; ${colorize(firstNameMatch)}">${firstNameMatch}</td>\
        </tr>\
        <tr>\
          <td style="text-align: right;">Last Name</td>\
          <td>:</td>\
          <td>${lastName}</td>\
          <td>${customAttrs[verifiedLastNameAttr]}</td>\
          <td style="text-align: left; ${colorize(lastNameMatch)}">${lastNameMatch}</td>\
        </tr>\
      </table>`;
  var docStructJdgmnt = getMitekResult(metaData, 'Document Structure').judgement;
  var docDataCompJdgmnt = getMitekResult(metaData, 'Document Data Comparison').judgement;
  var humanFaceJdgmnt = getMitekResult(metaData, 'Human Face Presence').judgement
  var fieldValidJdgmnt = getMitekResult(metaData, 'Field Validation').judgement;
  var blacklistJdgmnt = getMitekResult(metaData, 'ID Document Blacklist').judgement;
  var barcodeJdgmnt = getMitekResult(metaData, 'Barcode Analysis').judgement;
  var govDocTable = `\
      <table style="width: 100%; object-fit: contain">\
        <tr>\
          <td style="width: 49%; text-align: right;">Document Structure</td>\
          <td style="width: 2%;">:</td>\
          <td style="width: 49%; text-align: left; ${colorize(docStructJdgmnt)}">${docStructJdgmnt}</td>\
        </tr>\
        <tr>\
          <td style="text-align: right;">Document Data Comparison</td>\
          <td>:</td>\
          <td style="${colorize(docDataCompJdgmnt)}">${docDataCompJdgmnt}</td>\
        </tr>\
        <tr>\
          <td style="text-align: right;">Human Face Presence</td>\
          <td>:</td>\
          <td style="${colorize(humanFaceJdgmnt)}">${humanFaceJdgmnt}</td>\
        </tr>\
        <tr>\
          <td style="text-align: right;">Field Validation</td>\
          <td>:</td>\
          <td style="${colorize(fieldValidJdgmnt)}">${fieldValidJdgmnt}</td>\
        </tr>\
        <tr>\
          <td style="text-align: right;">ID Document Blacklist</td>\
          <td>:</td>\
          <td style="${colorize(blacklistJdgmnt)}">${blacklistJdgmnt}</td>\
        </tr>\
        <tr>\
          <td style="text-align: right;">Barcode Analysis</td>\
          <td>:</td>\
          <td style="${colorize(barcodeJdgmnt)}">${barcodeJdgmnt}</td>\
        </tr>\
      </table>`;
  var similarity = getSimilarity(getResult(metaData, 'FACIAL_COMPARISON').data.similarity);
  var liveness = getLiveness(getResult(metaData, 'LIVENESS').data.probability);
  var facialTable = `\
      <table style="width: 100%; object-fit: contain">\
        <tr>\
          <td style="width: 49%; text-align: right;">Facial Comparison</td>\
          <td style="width: 2%;">:</td>\
          <td style="width: 49%; text-align: left; ${colorize(similarity)}">${similarity}</td>\
        </tr>\
        <tr>\
          <td style="text-align: right;">Liveness</td>\
          <td>:</td>\
          <td style="${colorize(liveness)}">${liveness}</td>\
        </tr>\
      </table>`;
  var selfieTable = `\
      <table style="width: 100%; object-fit: contain">\
        <tr>\
          <td style="text-align: center;"><h4>Government ID Picture</h4></td>\
          <td style="text-align: center;"><h4>Fresh Selfie</h4></td>\
        </tr>\
        <tr style="vertical-align: top;">\
          <td style="width: 50%;">${referenceImage}</td>\
          <td style="width: 50%;">${freshSelfieImg}</td>\
        </tr>\
      </table>`;
  var message = `\
      <p><h3 style="text-align: center;">Status</h3></p>\
      <p style="text-align: center; ${colorize(customAttrs[verifyStatusAttr])}">${customAttrs[verifyStatusAttr]}</p>\
      <p><h3 style="text-align: center;">Identity</h3></p>\
      ${identityTable}\
      <p><h3 style="text-align: center;">Government ID Authentication</h3></p>\
      ${govDocTable}\
      <p><h3 style="text-align: center;">Facial Comparison & Liveness</h3></p>\
      ${facialTable}\
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

  function getSimilarity(num) {
    if (num >= 85) return 'High';
    if (num >= 65) return 'Medium';
    return 'Low';
  }

  function getLiveness(num) {
    if (num >= 0.5) return 'Live';
    return 'Spoofed'
  }

  function colorize(text) {
    var color = '';
    var success = 'green';
    var soso = 'yellow';
    var failure = 'red';
    var colors = {
        'not_authentic': `color:${failure};`,
        'success': `color:${success};`,
        'authentic': `color:${success};`,
        'live': `color:${success};`,
        'high': `color:${success};`,
        'medium': `color:${soso};`,
        'fail': `color:${failure};`,
        'low': `color:${failure};`,
        'spoofed': `color:${failure};`,
    };
    Object.keys(colors).forEach((it) => {
        if (text.toLowerCase().indexOf(it) >= 0) color = colors[it];
        return;
    });
    return color;
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
    
  function getBiographicMatchResult(metaData, field) {
    var result = null;
    var biographicMatchResult = getResult(metaData, 'BIOGRAPHIC_MATCH');
    if (biographicMatchResult && field) {
      biographicMatchResult.data.biographic_match_results.forEach((it) => {
        if (it.identifier === field) {
          result = it.match; 
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
