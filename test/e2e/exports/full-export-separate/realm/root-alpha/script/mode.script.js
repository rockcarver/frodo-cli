/* mode
 *
 * Author: volker.scheuber@forgerock.com
 * 
 * Collect mode if not already set and set outcome to mode.
 * 
 * This script does not need to be parametrized. It will work properly as is.
 * 
 * The Scripted Decision Node needs the following outcomes defined:
 * - 'shared and level'
 * - 'shared only'
 * - 'level only'
 * - 'none'
 */
(function () {
  var mode = nodeState.get('mode');
  if (mode) {
    outcome = mode.asString();
    var level = nodeState.get('level').asInteger() + 1;
    logger.error('mode: mode=' + mode.asString() + ', level=' + level);
    sharedState.put('level', level);
  }
  else {
    var choices = ['shared and level', 'shared only', 'level only', 'none'];
  
    var fr = JavaImporter(
      org.forgerock.openam.auth.node.api.Action,
      javax.security.auth.callback.ChoiceCallback
    )

    if (callbacks.isEmpty()) {
      action = fr.Action.send([
        new fr.ChoiceCallback('Choose test mode', choices, 0, false)
      ]).build();
    } else {
      var choice = parseInt(callbacks.get(0).getSelectedIndexes()[0]);
      nodeState.putShared('mode', choices[choice]);
      nodeState.putShared('level', 0);
      action = fr.Action.goTo(choices[choice]).build();
    }
  }
}());
