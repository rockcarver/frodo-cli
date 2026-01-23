var SCRIPT_OUTCOMES = {
    TRUE: 'True',
    FALSE: 'False'
}

function main() {
    action.goTo(typeof existingSession === "undefined" ? SCRIPT_OUTCOMES.FALSE : SCRIPT_OUTCOMES.TRUE);
}

main();
