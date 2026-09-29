/* User Search Field
 * 
 * Render a search field to find users.
 * 
 * This script does not need to be parametrized. It will work properly as is.
 * 
 * The Scripted Decision Node needs the following outcomes defined:
 * - true
 *
 * Author: volker.scheuber@pingidentity.com
 */
(function () {
    outcome = 'true';
    if (callbacks.isEmpty()) {
        callbacksBuilder.nameCallback('Find User');
    }
    else {
          var searchUser = callbacks.getNameCallbacks().get(0);
          nodeState.putShared('searchUser', searchUser);
    }
    action.goTo(outcome);
}());
