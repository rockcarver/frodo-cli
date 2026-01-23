var aud = properties.audience;
var iss = properties.issuer;
var validity = properties.validity;
var esv = properties.signingkey;

var signingkey = systemEnv.getProperty(esv);

var username = nodeState.get("username");

var data = {
  jwtType:"SIGNED",
  jwsAlgorithm: "HS256",
  issuer: iss,
  subject: username,
  audience: aud,
  type: "JWT",
  validityMinutes: validity,
  signingKey: signingkey
};

var jwt = jwtAssertion.generateJwt(data);

if (jwt !== null && jwt.length > 0) {
  nodeState.putShared("assertionJwt" , jwt);
  action.goTo("True");
} else {
  action.goTo("False");
}
