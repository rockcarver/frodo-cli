/*
 * Copyright 2021 ForgeRock AS. All Rights Reserved
 *
 * Use of this code requires a commercial software license with ForgeRock AS.
 * or with one of its affiliates. All use shall be exclusively subject
 * to such license between the licensee and ForgeRock AS.
 */

import static org.forgerock.json.JsonValue.field
import static org.forgerock.json.JsonValue.json
import static org.forgerock.json.JsonValue.object

import org.forgerock.json.JsonValue

JsonValue identity = json(object(
        field("givenName", normalizedProfile.givenName),
        field("sn", normalizedProfile.familyName),
        field("mail", normalizedProfile.email),
        field("cn", normalizedProfile.displayName),
        field("userName", normalizedProfile.username),
        field("iplanet-am-user-alias-list", selectedIdp + '-' + normalizedProfile.id.asString())))

return identity
