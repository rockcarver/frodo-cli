/*
 * Copyright 2024 ForgeRock AS. All Rights Reserved
 *
 * Use of this code requires a commercial software license with ForgeRock AS.
 * or with one of its affiliates. All use shall be exclusively subject
 * to such license between the licensee and ForgeRock AS.
 */

/*
 * This is an example SAML2 NameID Mapper script.
 * This script should return a string value representing the SAML2 NameID identifier.
 * The example script delegates to the configured java plugin via the nameIDScriptHelper binding.
 */
nameIDScriptHelper.getNameIDValue();
