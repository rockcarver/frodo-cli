var SCRIPT_OUTCOMES = {
  OUTCOME: "outcome"
};

function main() {
    if (!callbacks.isEmpty()) {
        action.goTo(SCRIPT_OUTCOMES.OUTCOME);
        return;
    }
    var keySet = nodeState.keys(); // Java Set<String>
    var keys = Array.from(keySet); // Make it into JavaScript array
    debugState = {};
    for (var i in keys) {
        var k = new String(keys[i]);
        var item = nodeState.get(k);
        if (typeof item === "object") {
            debugState[k] = nodeState.getObject(k);
        } else {
            debugState[k] = nodeState.get(k);
        }
    }
    if (properties.displayFormat === "JSON") {
        callbacksBuilder.textOutputCallback(0, `<pre style="text-align: left;">${JSON.stringify(debugState, null, 2)}</pre>`);
        return;
    }
    callbacksBuilder.textOutputCallback(0, `<table><tr><td style="border: 1px solid black;">Key</td><td style="border: 1px solid black;">Value</td></tr>${Array.from(Object.keys(debugState).map(k => `<tr><td style="border: 1px solid black;"><pre style="text-align: left;">${k}</pre></td><td style="border: 1px solid black;"><pre style="text-align: left;">${debugState[k]}</pre></td></tr>`))}</table>`);
}

main();
