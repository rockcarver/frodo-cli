logger.info("[phh] Creating User");
function generateUsername(givenName, surname) {
const usernamePrefix = (givenName[0] + surname[0]).toLowerCase();
const data = openidm.query("managed/alpha_user", {'_queryFilter': `userName sw "${usernamePrefix}"`}, ["userName"]);
const usernames = data.result.map(user => user.userName);
let i = 1;
while (i<100000 && usernames.includes(usernamePrefix + String(i).padStart(5, '0'))) {
i++;
}
return usernamePrefix + String(i).padStart(5, '0');
}
function createUser(custom) {
var startDate = new Date(custom.startDate).toISOString();
var endDate = new Date(custom.endDate).toISOString();
var payload = {
"userName": custom.userName,
"givenName": custom.givenName,
"sn": custom.sn,
"mail": custom.mail,
"password": custom.password,
"frIndexedDate5":startDate,
"frIndexedDate4":endDate
};
return openidm.create('managed/alpha_user', null, payload);
}
function process(requestObj) {
var custom = requestObj.request.custom
custom.userName = generateUsername(custom.givenName, custom.sn);
custom.password = 'Password!234';
const result = createUser(custom);
return { outcome: "provisioned" };
}
try {
const requestId = execution.getVariables().get("id");
const requestObj = openidm.action(`iga/governance/requests/${requestId}`, "GET", {}, {});
let decision = { status: "complete", "decision": "approved" };
try {
const result = process(requestObj);
Object.assign(decision, result);
} catch (error) {
Object.assign(decision, { outcome: "unknown", comment: `Error processing request ${requestId}: ${e.message}`, failure: true });
}
openidm.action(`iga/governance/requests/${requestId}`, 'POST', decision, { _action: "update"});
} catch (e) {
logger.error(`Error reading request ${requestId}: ${e}`);
}
