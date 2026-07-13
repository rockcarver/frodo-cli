/*
 * Copyright 2021-2025 Ping Identity Corporation. All Rights Reserved
 *
 * This code is to be used exclusively in connection with Ping Identity
 * Corporation software or services. Ping Identity Corporation only offers
 * such software or services to legal entities who have entered into a
 * binding license agreement with Ping Identity Corporation.
 *
 * In some common default configurations, the following keys are required to be not empty:
 * username, givenName, familyName, email.
 *
 * From RFC4517: A value of the Directory String syntax is a string of one or more
 * arbitrary characters from the Universal Character Set (UCS).
 * A zero-length character string is not permitted.
 */


import static org.forgerock.json.JsonValue.field
import static org.forgerock.json.JsonValue.fieldIfNotNull
import static org.forgerock.json.JsonValue.json
import static org.forgerock.json.JsonValue.object

String email = null
String firstName = null
String lastName = null
String username = null
String name

if (rawProfile.isDefined("email") && rawProfile.email.isNotNull()){ // User can elect to not share their email
    email = rawProfile.email.asString()
    username = email
} else {
    throw new Exception("Email is required")
}
if (rawProfile.isDefined("name") && rawProfile.name.isNotNull()) {
    if (rawProfile.name.isDefined("firstName") && rawProfile.name.firstName.isNotNull()) {
        firstName = rawProfile.name.firstName.asString()
    }
    if (rawProfile.name.isDefined("lastName") && rawProfile.name.lastName.isNotNull()) {
        lastName = rawProfile.name.lastName.asString()
    }
}

name = (firstName?.trim() ? firstName : "") + (lastName?.trim() ? ((firstName?.trim() ? " " : "") + lastName) : "")
name =  (!name?.trim()) ? " " : name

return json(object(
        field("id", rawProfile.get('sub')),
        field("displayName", name),
        field("email", email),
        fieldIfNotNull("givenName", firstName),
        fieldIfNotNull("familyName", lastName),
        field("username", username)))
