/*
 * Copyright 2023-2026 Ping Identity Corporation. All Rights Reserved
 *
 * This code is to be used exclusively in connection with Ping Identity
 * Corporation software or services. Ping Identity Corporation only offers
 * such software or services to legal entities who have entered into a
 * binding license agreement with Ping Identity Corporation.
 */

var ttl = 0;
if (ttl > 0) {
  var expiresAt = Date.now() + (ttl * 60 * 1000);
  accessToken.setExpiryTime(expiresAt);
}
