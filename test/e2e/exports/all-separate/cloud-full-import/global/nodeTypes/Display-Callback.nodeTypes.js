var SCRIPT_OUTCOMES = {
    OUTCOME: 'outcome'
};

var CALLBACKS = {
	BOOLEAN_ATTRIBUTE_INPUT_CALLBACK: "BOOLEAN_ATTRIBUTE_INPUT_CALLBACK",
	CHOICE_CALLBACK: "CHOICE_CALLBACK",
	CONFIRMATION_CALLBACK: "CONFIRMATION_CALLBACK",
	CONSENT_MAPPING_CALLBACK: "CONSENT_MAPPING_CALLBACK",
	DEVICE_PROFILE_CALLBACK: "DEVICE_PROFILE_CALLBACK",
	HIDDEN_VALUE_CALLBACK: "HIDDEN_VALUE_CALLBACK",
	HTTP_CALLBACK: "HTTP_CALLBACK",
	IDP_CALLBACK: "IDP_CALLBACK",
	KBA_CREATE_CALLBACK: "KBA_CREATE_CALLBACK",
	LANGUAGE_CALLBACK: "LANGUAGE_CALLBACK",
	METADATA_CALLBACK: "METADATA_CALLBACK",
	NAME_CALLBACK: "NAME_CALLBACK",
	NUMBER_ATTRIBUTE_INPUT_CALLBACK: "NUMBER_ATTRIBUTE_INPUT_CALLBACK",
	PASSWORD_CALLBACK: "PASSWORD_CALLBACK",
	POLLING_WAIT_CALLBACK: "POLLING_WAIT_CALLBACK",
    REDIRECT_CALLBACK: "REDIRECT_CALLBACK",
	SCRIPT_TEXT_OUTPUT_CALLBACK: "SCRIPT_TEXT_OUTPUT_CALLBACK",
	SELECT_IDP_CALLBACK: "SELECT_IDP_CALLBACK",
	STRING_ATTRIBUTE_INPUT_CALLBACK: "STRING_ATTRIBUTE_INPUT_CALLBACK",
	SUSPENDED_TEXT_OUTPUT_CALLBACK: "SUSPENDED_TEXT_OUTPUT_CALLBACK",
	TERMS_AND_CONDITIONS_CALLBACK: "TERMS_AND_CONDITIONS_CALLBACK",
	TEXT_INPUT_CALLBACK: "TEXT_INPUT_CALLBACK",
	TEXT_OUTPUT_CALLBACK: "TEXT_OUTPUT_CALLBACK",
	VALIDATED_PASSWORD_CALLBACK: "VALIDATED_PASSWORD_CALLBACK",
	VALIDATED_USERNAME_CALLBACK: "VALIDATED_USERNAME_CALLBACK",
	X509_CERTIFICATE_CALLBACK: "X509_CERTIFICATE_CALLBACK"
}

function isStringPresent(value) {
    return value;
}

function getString(value) {
    return value || '';
}

function isArrayPresent(value) {
    return value;
}

function getArray(value) {
    return value ? JSON.parse(value) : [];
}

function isObjectPresent(value) {
    return value;
}

function getObject(value) {
    return value ? JSON.parse(value) : {};
}

function isIntPresent(value) {
    return value;
}

function getInt(value) {
    return value ? parseInt(value) : 0;
}

function isDoublePresent(value) {
    return value;
}

function getDouble(value) {
    return value ? parseFloat(value) : 0.0;
}

function isBooleanPresent(value) {
    return value;
}

function getBoolean(value) {
    return value ? value.toLowerCase() === 'true' : false;
}

function setProperty(value) {
    if (properties.sharedProperty) nodeState.putShared(properties.sharedProperty, value);
    if (properties.transientProperty) nodeState.putTransient(properties.transientProperty, value);
    if (properties.objectSharedProperty) {
        var attributes = {};
        attributes[properties.objectSharedProperty] = value;
        nodeState.mergeShared({
            objectAttributes: attributes
        });
    }
    if (properties.objectTransientProperty) {
        var attributes = {};
        attributes[properties.objectTransientProperty] = value;
        nodeState.mergeTransient({
            objectAttributes: attributes
        });
    }
}

function booleanAttributeInputCallback() {
    var name = getString(properties.options.name);
    var prompt = getString(properties.options.prompt);
    var value = getBoolean(properties.options.value);
    var required = getBoolean(properties.options.required);
    var policies = getObject(properties.options.policies);
    var validateOnly = getBoolean(properties.options.validateOnly);
    var failedPolicies = getArray(properties.options.failedPolicies);
    if (isBooleanPresent(properties.options.validateOnly) || isObjectPresent(properties.options.policies)) {
        if (isArrayPresent(failedPolicies)) {
            callbacksBuilder.booleanAttributeInputCallback(name, prompt, value, required, policies, validateOnly, failedPolicies);
        } else {
            callbacksBuilder.booleanAttributeInputCallback(name, prompt, value, required, policies, validateOnly);
        }
    } else if (isArrayPresent(failedPolicies)) {
        callbacksBuilder.booleanAttributeInputCallback(name, prompt, value, required, failedPolicies);
    } else {
        callbacksBuilder.booleanAttributeInputCallback(name, prompt, value, required);
    }
}

function choiceCallback() {
    var prompt = getString(properties.options.prompt);
    var choices = getArray(properties.options.choices);
    var defaultChoice = getInt(properties.options.defaultChoice);
    var multipleSelectionsAllowed = getBoolean(properties.options.multipleSelectionsAllowed);
    callbacksBuilder.choiceCallback(prompt, choices, defaultChoice, multipleSelectionsAllowed);
}

function confirmationCallback() {
    var prompt = getString(properties.options.prompt);
    var messageType = getInt(properties.options.messageType);
    var options = getArray(properties.options.options);
    var optionType = getInt(properties.options.optionType);
    var defaultOption = getInt(properties.options.defaultOption);
    if (isStringPresent(properties.options.prompt)) {
        if (isIntPresent(properties.options.optionType)) {
            callbacksBuilder.confirmationCallback(prompt, messageType, optionType, defaultOption);
        } else {
            callbacksBuilder.confirmationCallback(prompt, messageType, options, defaultOption);
        }
    } else {
        if (isIntPresent(properties.options.optionType)) {
            callbacksBuilder.confirmationCallback(messageType, optionType, defaultOption);
        } else {
            callbacksBuilder.confirmationCallback(messageType, options, defaultOption);
        }
    }
}

function consentMappingCallback() {
    var config = getObject(properties.options.config);
    var message = getString(properties.options.message);
    var isRequired = getBoolean(properties.options.isRequired);
    var name = getString(properties.options.name);
    var displayName = getString(properties.options.displayName);
    var icon = getString(properties.options.icon);
    var accessLevel = getString(properties.options.accessLevel);
    var titles = getArray(properties.options.titles);
    if (isObjectPresent(properties.options.prompt)) {
        callbacksBuilder.consentMappingCallback(config, message, isRequired);
    } else {
        callbacksBuilder.consentMappingCallback(name, displayName, icon, accessLevel, titles, message, isRequired);
    }
}

function deviceProfileCallback() {
    var metadata = getBoolean(properties.options.metadata);
    var location = getBoolean(properties.options.location);
    var message = getString(properties.options.message);
    callbacksBuilder.deviceProfileCallback(metadata, location, message);
}

function hiddenValueCallback() {
    var id = getString(properties.options.id);
    var value = getString(properties.options.value);
    callbacksBuilder.hiddenValueCallback(id, value);
}

function httpCallback() {
    var authorizationHeader = getString(properties.options.authorizationHeader);
    var negotiationHeader = getString(properties.options.negotiationHeader);
    var authRHeader = getString(properties.options.authRHeader);
    var negoName = getString(properties.options.negoName);
    var negoValue = getString(properties.options.negoValue);
    if (isStringPresent(properties.options.authorizationHeader) || isStringPresent(properties.options.negotiationHeader)) {
        var errorCode = getString(properties.options.errorCode);
        callbacksBuilder.httpCallback(authorizationHeader, negotiationHeader, errorCode);
    } else {
        var errorCode = getInt(properties.options.errorCode);
        callbacksBuilder.httpCallback(authRHeader, negoName, negoValue, errorCode);
    }
}

function idPCallback() {
    var provider = getString(properties.options.provider);
    var clientId = getString(properties.options.clientId);
    var redirectUri = getString(properties.options.redirectUri);
    var scope = getArray(properties.options.scope);
    var nonce = getString(properties.options.nonce);
    var request = getString(properties.options.request);
    var requestUri = getString(properties.options.requestUri);
    var acrValues = getArray(properties.options.acrValues);
    var requestNativeAppForUserInfo = getBoolean(properties.options.requestNativeAppForUserInfo);
    var token = getString(properties.options.token);
    var tokenType = getString(properties.options.tokenType);
    if (isStringPresent(properties.options.token) || isStringPresent(properties.options.tokenType)) {
        callbacksBuilder.idPCallback(provider, clientId, redirectUri, scope, nonce, request, requestUri, acrValues, requestNativeAppForUserInfo, token, tokenType);
    } else {
        callbacksBuilder.idPCallback(provider, clientId, redirectUri, scope, nonce, request, requestUri, acrValues, requestNativeAppForUserInfo);
    }
}

function kbaCreateCallback() {
    var prompt = getString(properties.options.prompt);
    var predefinedQuestions = getArray(properties.options.predefinedQuestions);
    var allowUserDefinedQuestions = getBoolean(properties.options.allowUserDefinedQuestions);
    callbacksBuilder.kbaCreateCallback(prompt, predefinedQuestions, allowUserDefinedQuestions);
}

function languageCallback() {
    var language = getString(properties.options.language);
    var country = getString(properties.options.country);
    callbacksBuilder.languageCallback(language, country);
}

function metadataCallback() {
    var outputValue = getObject(properties.options.outputValue);
    callbacksBuilder.metadataCallback(outputValue);
}

function nameCallback() {
    var prompt = getString(properties.options.prompt);
    var defaultName = getString(properties.options.defaultName);
    if (isStringPresent(properties.options.defaultName)) {
        callbacksBuilder.nameCallback(prompt, defaultName);
    } else {
        callbacksBuilder.nameCallback(prompt);
    }
}

function numberAttributeInputCallback() {
    var name = getString(properties.options.name);
    var prompt = getString(properties.options.prompt);
    var value = getDouble(properties.options.value);
    var required = getBoolean(properties.options.required);
    var policies = getObject(properties.options.policies);
    var validateOnly = getBoolean(properties.options.validateOnly);
    var failedPolicies = getArray(properties.options.failedPolicies);
    if (isBooleanPresent(properties.options.validateOnly) || isObjectPresent(properties.options.policies)) {
        if (isArrayPresent(failedPolicies)) {
            callbacksBuilder.numberAttributeInputCallback(name, prompt, value, required, policies, validateOnly, failedPolicies);
        } else {
            callbacksBuilder.numberAttributeInputCallback(name, prompt, value, required, policies, validateOnly);
        }
    } else if (isArrayPresent(failedPolicies)) {
        callbacksBuilder.numberAttributeInputCallback(name, prompt, value, required, failedPolicies);
    } else {
        callbacksBuilder.numberAttributeInputCallback(name, prompt, value, required);
    }
}

function passwordCallback() {
    var prompt = getString(properties.options.prompt);
    var echoOn = getBoolean(properties.options.echoOn);
    callbacksBuilder.passwordCallback(prompt, echoOn);
}

function pollingWaitCallback() {
    var waitTime = getString(properties.options.waitTime);
    var message = getString(properties.options.message);
    callbacksBuilder.pollingWaitCallback(waitTime, message);
}

function redirectCallback() {
    throw new Error('Not Implemented');
}

function scriptTextOutputCallback() {
    var message = getString(properties.options.message);
    callbacksBuilder.scriptTextOutputCallback(message);
}

function selectIdPCallback() {
    var providers = getObject(properties.options.providers);
    callbacksBuilder.selectIdPCallback(providers);
}

function stringAttributeInputCallback() {
    var name = getString(properties.options.name);
    var prompt = getString(properties.options.prompt);
    var value = getString(properties.options.value);
    var required = getBoolean(properties.options.required);
    var policies = getObject(properties.options.policies);
    var validateOnly = getBoolean(properties.options.validateOnly);
    var failedPolicies = getArray(properties.options.failedPolicies);
    if (isBooleanPresent(properties.options.validateOnly) || isObjectPresent(properties.options.policies)) {
        if (isArrayPresent(failedPolicies)) {
            callbacksBuilder.stringAttributeInputCallback(name, prompt, value, required, policies, validateOnly, failedPolicies);
        } else {
            callbacksBuilder.stringAttributeInputCallback(name, prompt, value, required, policies, validateOnly);
        }
    } else if (isArrayPresent(failedPolicies)) {
        callbacksBuilder.stringAttributeInputCallback(name, prompt, value, required, failedPolicies);
    } else {
        callbacksBuilder.stringAttributeInputCallback(name, prompt, value, required);
    }
}

function suspendedTextOutputCallback() {
    var messageType = getInt(properties.options.messageType);
    var message = getString(properties.options.message);
    callbacksBuilder.suspendedTextOutputCallback(messageType, message);
}

function termsAndConditionsCallback() {
    var version = getString(properties.options.version);
    var terms = getString(properties.options.terms);
    var createDate = getString(properties.options.createDate);
    callbacksBuilder.termsAndConditionsCallback(version, terms, createDate);
}

function textInputCallback() {
    var prompt = getString(properties.options.prompt);
    var defaultText = getString(properties.options.defaultText);
    if (isStringPresent(properties.options.defaultText)) {
        callbacksBuilder.textInputCallback(prompt, defaultText);
    } else {
        callbacksBuilder.textInputCallback(prompt);
    }
}

function textOutputCallback() {
    var messageType = getString(properties.options.messageType);
    var message = getString(properties.options.message);
    callbacksBuilder.textOutputCallback(messageType, message);
}

function validatedPasswordCallback() {
    var prompt = getString(properties.options.prompt);
    var echoOn = getBoolean(properties.options.echoOn);
    var policies = getObject(properties.options.policies);
    var validateOnly = getBoolean(properties.options.validateOnly);
    var failedPolicies = getArray(properties.options.failedPolicies);
    if (isArrayPresent(properties.options.failedPolicies)) {
        callbacksBuilder.validatedPasswordCallback(prompt, echoOn, policies, validateOnly, failedPolicies);
    } else {
        callbacksBuilder.validatedPasswordCallback(prompt, echoOn, policies, validateOnly);
    }
}

function validatedUsernameCallback() {
    var prompt = getString(properties.options.prompt);
    var policies = getObject(properties.options.policies);
    var validateOnly = getBoolean(properties.options.validateOnly);
    var failedPolicies = getArray(properties.options.failedPolicies);
    if (isArrayPresent(properties.options.failedPolicies)) {
        callbacksBuilder.validatedUsernameCallback(prompt, policies, validateOnly, failedPolicies);
    } else {
        callbacksBuilder.validatedUsernameCallback(prompt, policies, validateOnly);
    }
}

function x509CertificateCallback() {
    throw new Error('Not Implemented');
}

function getBooleanAttributeInputCallback() {
    setProperty(callbacks.getBooleanAttributeInputCallbacks().get(0));
}

function getChoiceCallback() {
    var multipleSelectionsAllowed = getBoolean(properties.options.multipleSelectionsAllowed);
    var selections = callbacks.getChoiceCallbacks().get(0);
    setProperty(multipleSelectionsAllowed ? selections : selections[0]);
}

function getConfirmationCallback() {
    setProperty(callbacks.getConfirmationCallbacks().get(0));
}

function getConsentMappingCallback() {
    setProperty(callbacks.getConsentMappingCallbacks().get(0));
}

function getDeviceProfileCallback() {
    setProperty(callbacks.getDeviceProfileCallbacks().get(0));
}

function getHiddenValueCallback() {
    var id = getString(properties.options.id);
    setProperty(callbacks.getHiddenValueCallbacks().get(id));
}

function getHttpCallback() {
    setProperty(callbacks.getHttpCallbacks().get(0));
}

function getIdPCallback() {
    setProperty(callbacks.getIdpCallbacks().get(0));
}

function getKbaCreateCallback() {
    setProperty(callbacks.getKbaCreateCallbacks().get(0));
}

function getLanguageCallback() {
    setProperty(callbacks.getLanguageCallbacks().get(0));
}

function getNameCallback() {
    setProperty(callbacks.getNameCallbacks().get(0));
}

function getNumberAttributeInputCallback() {
    setProperty(callbacks.getNumberAttributeInputCallbacks().get(0));
}

function getPasswordCallback() {
    setProperty(callbacks.getPasswordCallbacks().get(0));
}

function getSelectIdPCallback() {
    setProperty(callbacks.getSelectIdPCallbacks().get(0));
}

function getStringAttributeInputCallback() {
    setProperty(callbacks.getStringAttributeInputCallbacks().get(0));
}

function getTermsAndConditionsCallback() {
    setProperty(callbacks.getTermsAndConditionsCallbacks().get(0));
}

function getTextInputCallback() {
    setProperty(callbacks.getTextInputCallbacks().get(0));
}

function getValidatedPasswordCallback() {
    setProperty(callbacks.getValidatedPasswordCallbacks().get(0));
}

function getValidatedUsernameCallback() {
    setProperty(callbacks.getValidatedUsernameCallbacks().get(0));
}

function getX509CertificateCallback() {
    setProperty(callbacks.getX509CertificateCallbacks().get(0));
}

function main() {
    if (!callbacks.isEmpty()) {
        switch (properties.callback) {
            case CALLBACKS.BOOLEAN_ATTRIBUTE_INPUT_CALLBACK: getBooleanAttributeInputCallback(); break;
            case CALLBACKS.CHOICE_CALLBACK: getChoiceCallback(); break;
            case CALLBACKS.CONFIRMATION_CALLBACK: getConfirmationCallback(); break;
            case CALLBACKS.CONSENT_MAPPING_CALLBACK: getConsentMappingCallback(); break;
            case CALLBACKS.DEVICE_PROFILE_CALLBACK: getDeviceProfileCallback(); break;
            case CALLBACKS.HIDDEN_VALUE_CALLBACK: getHiddenValueCallback(); break;
            case CALLBACKS.HTTP_CALLBACK: getHttpCallback(); break;
            case CALLBACKS.IDP_CALLBACK: getIdPCallback(); break;
            case CALLBACKS.KBA_CREATE_CALLBACK: getKbaCreateCallback(); break;
            case CALLBACKS.LANGUAGE_CALLBACK: getLanguageCallback(); break;
            case CALLBACKS.NAME_CALLBACK: getNameCallback(); break;
            case CALLBACKS.NUMBER_ATTRIBUTE_INPUT_CALLBACK: getNumberAttributeInputCallback(); break;
            case CALLBACKS.PASSWORD_CALLBACK: getPasswordCallback(); break;
            case CALLBACKS.SELECT_IDP_CALLBACK: getSelectIdPCallback(); break;
            case CALLBACKS.STRING_ATTRIBUTE_INPUT_CALLBACK: getStringAttributeInputCallback(); break;
            case CALLBACKS.TERMS_AND_CONDITIONS_CALLBACK: getTermsAndConditionsCallback(); break;
            case CALLBACKS.TEXT_INPUT_CALLBACK: getTextInputCallback(); break;
            case CALLBACKS.VALIDATED_PASSWORD_CALLBACK: getValidatedPasswordCallback(); break;
            case CALLBACKS.VALIDATED_USERNAME_CALLBACK: getValidatedUsernameCallback(); break;
            case CALLBACKS.X509_CERTIFICATE_CALLBACK: getX509CertificateCallback(); break;
            default: break;
        }
        action.goTo(SCRIPT_OUTCOMES.OUTCOME);
        return;
    }

    switch (properties.callback) {
        case CALLBACKS.BOOLEAN_ATTRIBUTE_INPUT_CALLBACK: booleanAttributeInputCallback(); break;
        case CALLBACKS.CHOICE_CALLBACK: choiceCallback(); break;
        case CALLBACKS.CONFIRMATION_CALLBACK: confirmationCallback(); break;
        case CALLBACKS.CONSENT_MAPPING_CALLBACK: consentMappingCallback(); break;
        case CALLBACKS.DEVICE_PROFILE_CALLBACK: deviceProfileCallback(); break;
        case CALLBACKS.HIDDEN_VALUE_CALLBACK: hiddenValueCallback(); break;
        case CALLBACKS.HTTP_CALLBACK: httpCallback(); break;
        case CALLBACKS.IDP_CALLBACK: idPCallback(); break;
        case CALLBACKS.KBA_CREATE_CALLBACK: kbaCreateCallback(); break;
        case CALLBACKS.LANGUAGE_CALLBACK: languageCallback(); break;
        case CALLBACKS.METADATA_CALLBACK: metadataCallback(); break;
        case CALLBACKS.NAME_CALLBACK: nameCallback(); break;
        case CALLBACKS.NUMBER_ATTRIBUTE_INPUT_CALLBACK: numberAttributeInputCallback(); break;
        case CALLBACKS.PASSWORD_CALLBACK: passwordCallback(); break;
        case CALLBACKS.POLLING_WAIT_CALLBACK: pollingWaitCallback(); break;
        case CALLBACKS.REDIRECT_CALLBACK: redirectCallback(); break;
        case CALLBACKS.SCRIPT_TEXT_OUTPUT_CALLBACK: scriptTextOutputCallback(); break;
        case CALLBACKS.SELECT_IDP_CALLBACK: selectIdPCallback(); break;
        case CALLBACKS.STRING_ATTRIBUTE_INPUT_CALLBACK: stringAttributeInputCallback(); break;
        case CALLBACKS.SUSPENDED_TEXT_OUTPUT_CALLBACK: suspendedTextOutputCallback(); break;
        case CALLBACKS.TERMS_AND_CONDITIONS_CALLBACK: termsAndConditionsCallback(); break;
        case CALLBACKS.TEXT_INPUT_CALLBACK: textInputCallback(); break;
        case CALLBACKS.TEXT_OUTPUT_CALLBACK: textOutputCallback(); break;
        case CALLBACKS.VALIDATED_PASSWORD_CALLBACK: validatedPasswordCallback(); break;
        case CALLBACKS.VALIDATED_USERNAME_CALLBACK: validatedUsernameCallback(); break;
        case CALLBACKS.X509_CERTIFICATE_CALLBACK: x509CertificateCallback(); break;
        default: throw new Error('Unknown Callback'); // Should never reach this case
    }
}

main();
