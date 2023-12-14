/*
 * Copyright 2020 ForgeRock AS. All Rights Reserved
 *
 * Use of this code requires a commercial software license with ForgeRock AS.
 * or with one of its affiliates. All use shall be exclusively subject
 * to such license between the licensee and ForgeRock AS.
 */

import static org.forgerock.json.JsonValue.field
import static org.forgerock.json.JsonValue.json
import static org.forgerock.json.JsonValue.object

return json(object(
        field("id", rawProfile.id),
        field("givenName", rawProfile.firstName.localized.get(0)),
        field("familyName", rawProfile.lastName.localized.get(0)),
        field("photoUrl", rawProfile.profilePicture.displayImage),
        field("email", rawProfile.elements.get(0).get("handle~").emailAddress),
        field("username", rawProfile.elements.get(0).get("handle~").emailAddress)))