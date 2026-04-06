var fr = JavaImporter(
    org.forgerock.openam.auth.node.api.Action,
    javax.security.auth.callback.TextOutputCallback,
);

var scriptOutcomes = {
    OUTCOME: 'outcome',
};

function main() {
    if (callbacks.isEmpty()) {
        var debugState = {
            sharedState: sharedState,
            transientState: transientState
        };
        action = fr.Action.send(new fr.TextOutputCallback(0, `<pre style="text-align: left;">${JSON.stringify(debugState, null, 2)}</pre>`)).build();
        return;
    }
    outcome = scriptOutcomes.OUTCOME;
}

main();
