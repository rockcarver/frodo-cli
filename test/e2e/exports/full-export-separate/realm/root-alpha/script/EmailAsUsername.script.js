objectAttributes = sharedState.get("objectAttributes")
userName = objectAttributes.get("userName")

if(userName){
  //Form Fill
  objectAttributes.put("mail", userName)
} else {
  //Social
  objectAttributes.put("userName", objectAttributes.get("mail"))
}


sharedState.put("objectAttributes", objectAttributes);
//sharedState.put("username", mail)

outcome = "true";
