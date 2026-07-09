/*
 * Copyright 2024-2025 Ping Identity Corporation. All Rights Reserved
 *
 * This code is to be used exclusively in connection with Ping Identity
 * Corporation software or services. Ping Identity Corporation only offers
 * such software or services to legal entities who have entered into a
 * binding license agreement with Ping Identity Corporation.
 */

/*
 * This is an example SAML2 NameID Mapper script.
 * This script should return a string value representing the SAML2 NameID identifier.
 * The example script delegates to the configured java plugin via the nameIDScriptHelper binding.
 */
nameIDScriptHelper.getNameIDValue();
