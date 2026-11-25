var isGoogleEligible = true;
//var logMsg = "idmlog: ---AplhaUser2GAC (username: " + source.userName + " - userType: " + source.frIndexedInteger1 + " cn: " + source.cn + ") -";
var logMsg = "idmlog: ---AplhaUser2GAC (username: " + source.userName + " - userType: " + source.frIndexedInteger1 + ") -";

//Get Applicable userTypes (no Parent accounts)
if (source.frIndexedInteger1 !== 0 && source.frIndexedInteger1 !== 1 && source.frIndexedInteger1 !== 3 && source.frIndexedInteger1 !== 4 && source.frIndexedInteger1 !== 5) {
	isGoogleEligible = false;
	logMsg = logMsg + " Account type not eligible.";
}

//Make sure the account has a valid encrypted password.
if (source.custom_password_encrypted == undefined || source.custom_password_encrypted == null) {
	isGoogleEligible = false;
	logMsg = logMsg + " No encrypted password yet.";
}

//Check that CN exists and has no space.
if (source.cn && source.cn.includes(' ')) {
	isGoogleEligible = false;
	logMsg = logMsg + " CN with a space is not allowed.";
}

if (!isGoogleEligible) {
	logMsg = logMsg + " Not sent to Google."
	logger.info(logMsg);
} 

if (isGoogleEligible) {
	logMsg = logMsg + " Sent to Google."
	logger.info(logMsg);
}

isGoogleEligible;
