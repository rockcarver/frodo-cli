/*
 * Copyright 2024-2025 Ping Identity Corporation. All Rights Reserved
 *
 * This code is to be used exclusively in connection with Ping Identity
 * Corporation software or services. Ping Identity Corporation only offers
 * such software or services to legal entities who have entered into a
 * binding license agreement with Ping Identity Corporation.
 */


import static org.forgerock.json.JsonValue.field
import static org.forgerock.json.JsonValue.fieldIfNotNull
import static org.forgerock.json.JsonValue.json
import static org.forgerock.json.JsonValue.object

// LINE does not return the email from the userInfo endpoint but should return it from the token endpoint and therefore
// it should be set in the shared state
var email = null
var username = null
var firstName = null
var lastName = null

if (sharedState.get("claims_set") != null && sharedState.get("claims_set").email != null) {
    email = sharedState.get("claims_set").email
    username = email
} else {
    // Ensure that your LINE provider is configured to provide users' email addresses
    throw new Exception("Email is required")
}

if (rawProfile.isDefined("name") && rawProfile.name.isNotNull()) {
    var splitName = rawProfile.name.asString().split(" ")
    firstName = splitName[0]
    lastName = splitName[-1]
}

return json(object(
        field("id", rawProfile.sub),
        field("displayName", rawProfile.name),
        field("photoUrl", rawProfile.picture),
        field("email", email),
        fieldIfNotNull("givenName", firstName),
        fieldIfNotNull("familyName", lastName),
        field("username", username)))
