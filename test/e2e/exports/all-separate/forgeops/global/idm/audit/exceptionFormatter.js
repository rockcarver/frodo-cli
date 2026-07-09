/*
 * Copyright 2016-2025 Ping Identity Corporation. All Rights Reserved
 *
 * This code is to be used exclusively in connection with Ping Identity
 * Corporation software or services. Ping Identity Corporation only offers
 * such software or services to legal entities who have entered into a
 * binding license agreement with Ping Identity Corporation.
 */
/*global java*/
/*global exception*/
function format() {
    var sw, pw;
    sw = new java.io.StringWriter();
    pw = new java.io.PrintWriter(sw);
    exception.printStackTrace(pw);
    return sw.toString();
}
format();
