/*
 * Copyright 2020-2025 Ping Identity Corporation. All Rights Reserved
 *
 * This code is to be used exclusively in connection with Ping Identity
 * Corporation software or services. Ping Identity Corporation only offers
 * such software or services to legal entities who have entered into a
 * binding license agreement with Ping Identity Corporation.
 */

import static org.forgerock.json.JsonValue.field
import static org.forgerock.json.JsonValue.json
import static org.forgerock.json.JsonValue.object

import org.forgerock.json.JsonValue

JsonValue managedUser = json(object(
        field("id", rawProfile.sub),
        field("displayName", rawProfile.name),
        field("givenName", rawProfile.given_name),
        field("familyName", rawProfile.family_name),
        field("username", rawProfile.email),
        field("email", rawProfile.email)))
return managedUser
