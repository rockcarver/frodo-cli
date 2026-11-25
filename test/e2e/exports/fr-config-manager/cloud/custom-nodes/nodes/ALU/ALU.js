var SCRIPT_OUTCOMES = {
    SUCCESS: 'Success'
};

var OPERATORS = {
    ADD: "ADD",
    SUBTRACT: "SUBTRACT",
    MULTIPLY: "MULTIPLY",
    DIVIDE: "DIVIDE"
}

function main() {
    var a = Number(properties.a);
    var b = Number(properties.b);
    switch (properties.operator) {
        case OPERATORS.ADD:
            nodeState.putShared("z", a + b);
            break;
        case OPERATORS.SUBTRACT:
            nodeState.putShared("z", a - b);
            break;
        case OPERATORS.MULTIPLY:
            nodeState.putShared("z", a * b);
            break;
        case OPERATORS.DIVIDE:
            if (b == 0) throw new Error("Cannot divide by 0");
            nodeState.putShared("z", a / b);
            break;
        default: throw new Error("Unknown operator.");
    }
    action.goTo(SCRIPT_OUTCOMES.SUCCESS);
}

main();
