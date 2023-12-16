/*
 * Copyright 2020-2021 ForgeRock AS. All Rights Reserved
 *
 * Use of this code requires a commercial software license with ForgeRock AS.
 * or with one of its affiliates. All use shall be exclusively subject
 * to such license between the licensee and ForgeRock AS.
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