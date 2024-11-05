/*
 * Copyright 2024 ForgeRock AS. All Rights Reserved
 *
 * Use of this code requires a commercial software license with ForgeRock AS.
 * or with one of its affiliates. All use shall be exclusively subject
 * to such license between the licensee and ForgeRock AS.
 */

import static org.forgerock.json.JsonValue.field
import static org.forgerock.json.JsonValue.json
import static org.forgerock.json.JsonValue.object

// LINE does not return the email from the userInfo endpoint but should return it from the token endpoint and therefore
// it should be set in the shared state
var email = ""
var subjectId = rawProfile.sub
var username = subjectId
var firstName = " "
var lastName = " "

if (sharedState.get("claims_set") != null && sharedState.get("claims_set").email != null) {
    email = sharedState.get("claims_set").email
    username = email
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
        field("givenName", firstName),
        field("familyName", lastName),
        field("username", username)))
