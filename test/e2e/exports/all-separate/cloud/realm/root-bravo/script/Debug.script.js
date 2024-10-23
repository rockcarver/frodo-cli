var fr = JavaImporter(
  org.forgerock.openam.auth.node.api,
  javax.security.auth.callback.TextOutputCallback
);

outcome = "true";

with (fr) {
  if (callbacks.isEmpty()) {
    var seperatorCB = new TextOutputCallback(TextOutputCallback.INFORMATION, "================================");
    var sharedStateCB = new TextOutputCallback(TextOutputCallback.INFORMATION, "sharedState: " + sharedState.toString());
    var transientStateCB = new TextOutputCallback(TextOutputCallback.INFORMATION, "transientState: " + transientState.toString());
    var requestHeadersCB = new TextOutputCallback(TextOutputCallback.INFORMATION, "requestHeaders: " + requestHeaders.toString());
    var theCallbacks = [sharedStateCB, seperatorCB, transientStateCB, seperatorCB, requestHeadersCB];
    action = Action.send(theCallbacks).build();
  } else {
    action = Action.goTo("true").build();
  }
}
