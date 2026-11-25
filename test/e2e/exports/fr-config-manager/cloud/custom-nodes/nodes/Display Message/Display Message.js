var SCRIPT_OUTCOMES = {
    OUTCOME: 'outcome'
};

function main() {
    if (!callbacks.isEmpty()) return action.goTo(SCRIPT_OUTCOMES.OUTCOME);
    var messageType;
    switch (properties.messageType) {
        case "INFO": messageType = 0; break;
        case "WARN": messageType = 1; break;
        case "ERROR": messageType = 2; break;
        default: throw new Error('Unknown message type: ' + properties.messageType);
    }
    callbacksBuilder.textOutputCallback(0, properties.message);
}

main();
