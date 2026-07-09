/*
 * Copyright 2021-2025 Ping Identity Corporation. All Rights Reserved
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

JsonValue identity = json(object(
        field("givenName", normalizedProfile.givenName),
        field("sn", normalizedProfile.familyName),
        field("mail", normalizedProfile.email),
        field("cn", normalizedProfile.displayName),
        field("userName", normalizedProfile.username),
        field("iplanet-am-user-alias-list", selectedIdp + '-' + normalizedProfile.id.asString())))

return identity
