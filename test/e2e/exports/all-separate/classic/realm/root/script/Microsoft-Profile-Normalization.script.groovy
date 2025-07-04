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
        field("displayName", rawProfile.displayName),
        field("givenName", rawProfile.givenName),
        field("familyName", rawProfile.surname),
        field("email", rawProfile.userPrincipalName),
        field("username", rawProfile.userPrincipalName)))
