/*
 * Copyright 2021-2022 ForgeRock AS. All Rights Reserved
 *
 * Use of this code requires a commercial software license with ForgeRock AS.
 * or with one of its affiliates. All use shall be exclusively subject
 * to such license between the licensee and ForgeRock AS.
 *
 * In some common default configurations, the following keys are required to be not empty:
 * username, givenName, familyName, email.
 *
 * From RFC4517: A value of the Directory String syntax is a string of one or more
 * arbitrary characters from the Universal Character Set (UCS).
 * A zero-length character string is not permitted.
 */

import static org.forgerock.json.JsonValue.field
import static org.forgerock.json.JsonValue.json
import static org.forgerock.json.JsonValue.object

String email = "change@me.com"
String subjectId = rawProfile.sub
String firstName = " "
String lastName = " "
String username = subjectId
String name

if (rawProfile.isDefined("email") && rawProfile.email.isNotNull()){ // User can elect to not share their email
    email = rawProfile.email.asString()
    username = email
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
        field("id", subjectId),
        field("displayName", name),
        field("email", email),
        field("givenName", firstName),
        field("familyName", lastName),
        field("username", username)))