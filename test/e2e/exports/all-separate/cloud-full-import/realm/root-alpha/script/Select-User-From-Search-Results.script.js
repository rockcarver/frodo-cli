/* Select User From Search Results
 *
 * Author: volker.scheuber@pingidentity.com
 * 
 * Perform user search using search criteria in nodeState field "userSearch" allow selection of a user.
 * 
 * This script does not need to be parametrized. It will work properly as is.
 * 
 * The Scripted Decision Node needs the following outcomes defined:
 * - selected
 * - error
 */
(function () {
  try {
    var searchUser = nodeState.get('searchUser');
    logger.error('Zugerland searchUser={}', searchUser);
    var params = {
        "_queryFilter": "/userName sw \"" + searchUser + "\" or /sn sw \"" + searchUser + "\" or /givenName sw \"" + searchUser + "\"",
        "_pageSize": 100,
        "_sortKeys": "sn"
    };
    var response = openidm.query('managed/alpha_user', params, ['_id','userName','givenName','sn']);
    var userDisplayNames = [];
    var userNames = [];
    var userIds = [];
    response.result.forEach((user) => {
      userDisplayNames.push(user.sn + ', ' + user.givenName + ' (' + user.userName + ')');
      userNames.push(user.userName);
      userIds.push(user._id);
    });
    if (userDisplayNames.length > 0 && callbacks.isEmpty()) {
      callbacksBuilder.choiceCallback('Select user', userDisplayNames, 0, false);
    }
    else {
      var idx = callbacks.getChoiceCallbacks().get(0)[0];
      nodeState.putShared('selectedUserName', userNames[idx]);
      nodeState.putShared('selectedUserId', userIds[idx]);
      nodeState.putShared('selectedUserDisplayName', userDisplayNames[idx]);
      var bcaData = {
        "objectAttributes": {
          "userName": userNames[idx],
          "_id": userIds[idx]
        },
        "username": userNames[idx],
        "_id": userIds[idx]
      };
      nodeState.putShared('bcaData', bcaData);
      
      logger.error('Zugerland selected user: {} ({})', userDisplayNames[idx], userIds[idx]);
      action.goTo('true');
    }
  } catch (error) {
    logger.error('Zugerland error: {}', error.message);
    nodeState.putShared('error', error.message);
    action.goTo('error');
  }
}());
