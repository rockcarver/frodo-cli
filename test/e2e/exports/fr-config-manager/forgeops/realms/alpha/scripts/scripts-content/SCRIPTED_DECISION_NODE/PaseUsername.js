var SCRIPT_OUTCOMES = {
    OUTCOME: 'outcome'
};

function main() {
    var username = nodeState.get('username');
    if (username.trim().toLowerCase().startsWith('fcpsedu\\')) {
        username = username.substring(username.indexOf('\\') + 1);
    }
    if (username.trim().toLowerCase().endsWith('@fcpsschools.net')) {
        username = username.substring(0, username.lastIndexOf('@'));
    }
    nodeState.putShared('username', username);
    nodeState.putShared('objectAttributes', {
        userName: username
    });
    action.goTo(SCRIPT_OUTCOMES.OUTCOME);
}

main();
