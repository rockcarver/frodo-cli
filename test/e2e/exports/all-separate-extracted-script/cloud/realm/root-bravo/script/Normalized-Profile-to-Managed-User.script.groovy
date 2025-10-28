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
        field("givenName", normalizedProfile.givenName),
        field("sn", normalizedProfile.familyName),
        field("mail", normalizedProfile.email),
        field("userName", normalizedProfile.username)))

if (normalizedProfile.postalAddress.isNotNull()) managedUser.put("postalAddress", normalizedProfile.postalAddress)
if (normalizedProfile.addressLocality.isNotNull()) managedUser.put("city", normalizedProfile.addressLocality)
if (normalizedProfile.addressRegion.isNotNull()) managedUser.put("stateProvince", normalizedProfile.addressRegion)
if (normalizedProfile.postalCode.isNotNull()) managedUser.put("postalCode", normalizedProfile.postalCode)
if (normalizedProfile.country.isNotNull()) managedUser.put("country", normalizedProfile.country)
if (normalizedProfile.phone.isNotNull()) managedUser.put("telephoneNumber", normalizedProfile.phone)

// if the givenName and familyName is null or empty
// then add a boolean flag to the shared state to indicate names are not present
// this could be used elsewhere
// for eg. this could be used in a scripted decision node to by-pass patching
// the user object with blank values when givenName  and familyName is not present
boolean noGivenName = normalizedProfile.givenName.isNull() || (!normalizedProfile.givenName.asString()?.trim())
boolean noFamilyName = normalizedProfile.familyName.isNull() || (!normalizedProfile.familyName.asString()?.trim())
sharedState.put("nameEmptyOrNull", noGivenName && noFamilyName)


return managedUser
