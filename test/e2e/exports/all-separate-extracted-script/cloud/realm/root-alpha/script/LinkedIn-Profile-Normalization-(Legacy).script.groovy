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

return json(object(
        field("id", rawProfile.id),
        field("givenName", rawProfile.firstName.localized.get(0)),
        field("familyName", rawProfile.lastName.localized.get(0)),
        field("photoUrl", rawProfile.profilePicture.displayImage),
        field("email", rawProfile.elements.get(0).get("handle~").emailAddress),
        field("username", rawProfile.elements.get(0).get("handle~").emailAddress)))
